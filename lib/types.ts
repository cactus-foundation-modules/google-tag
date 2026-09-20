// Shared shapes and constants. Deliberately free of imports so both the server
// half (settings, the RSC block) and the browser half (the loader, the settings
// tab) can read it without dragging Prisma into a client bundle.

/** The cookie consent categories this module asks a site to carry. Both are
 *  core's own stock categories rather than anything invented here: Google's
 *  consent signals divide exactly along the same line, and a site that already
 *  has a cookie banner already has these two switches. */
export const ANALYTICS_CATEGORY = 'analytics'
export const MARKETING_CATEGORY = 'marketing'

/** Core announces every consent decision on this event. */
export const CONSENT_CHANGE_EVENT = 'cactus:consent-change'

/**
 * Whether a given side of the tag has a cookie category to wait for.
 *
 * 'category' - the site's banner carries the category, so nothing runs until
 *              the visitor grants it.
 * 'allowed'  - there is no category to wait for, either because the banner is
 *              switched off or because it does not offer this one. The tag runs.
 *              The settings tab says so in plain words rather than leaving the
 *              owner to discover it, because it is the owner's decision to make
 *              and their exposure if they make it carelessly.
 */
export type GateMode = 'allowed' | 'category'

export type ConsentGate = {
  analytics: GateMode
  ads: GateMode
}

/** What the banner actually looks like right now, for the settings tab's advice. */
export type BannerState = {
  bannerEnabled: boolean
  hasAnalyticsCategory: boolean
  hasMarketingCategory: boolean
}

/**
 * What the Google Ads conversion value is based on.
 *
 * A shop that quotes its prices ex VAT still charges the tax, so the order
 * total announced on the confirmation page includes it. Sending that total to
 * Ads as the conversion value reports revenue the shop never keeps: every ROAS
 * figure in the account comes out high by the VAT rate, and a target ROAS set
 * from it bids by exactly that much more than the owner meant to. Nothing
 * warns them, because the number looks entirely plausible.
 *
 * 'ORDER_TOTAL'                - the total the shopper paid. The default, and
 *                                what this module has always sent.
 * 'EXCLUDING_TAX'              - the total less tax. What a shop trading ex VAT
 *                                usually wants: the revenue it actually books.
 * 'EXCLUDING_TAX_AND_SHIPPING' - less tax and delivery, for an owner who counts
 *                                delivery as a cost passed on rather than sales.
 *
 * Google Analytics is deliberately left out of this. GA4 is handed tax and
 * shipping as their own parameters and its reports expect a tax-inclusive
 * value; subtracting there would not correct a number, it would break the
 * ecommerce reports that already do this arithmetic themselves.
 */
export const ADS_CONVERSION_VALUE_BASES = [
  'ORDER_TOTAL',
  'EXCLUDING_TAX',
  'EXCLUDING_TAX_AND_SHIPPING',
] as const

export type AdsConversionValueBasis = (typeof ADS_CONVERSION_VALUE_BASES)[number]

/** Whatever is in the column, a basis this module recognises. An unknown value -
 *  a row from a newer version, an edit made by hand - falls back to the total
 *  rather than throwing: a settings page that will not load, or a tag that stops
 *  reporting sales, is a worse outcome than reporting the figure it always did. */
export function normaliseAdsConversionValueBasis(
  raw: string | null | undefined,
): AdsConversionValueBasis {
  const value = (raw ?? '').trim().toUpperCase()
  return (ADS_CONVERSION_VALUE_BASES as readonly string[]).includes(value)
    ? (value as AdsConversionValueBasis)
    : 'ORDER_TOTAL'
}

/** The money fields of a conversion, structurally. Named here rather than
 *  imported so this file stays free of imports and can be read by both halves. */
type ConversionMoney = {
  value?: number
  tax?: number
  shipping?: number
}

/** A figure that can be subtracted. tax and shipping are both optional on the
 *  seam, and an announcer that omits one means there was none of it. */
function amount(raw: number | undefined): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
}

/**
 * What to send Google Ads as the value of this conversion.
 *
 * Returns undefined when the conversion carries no usable total, which is
 * exactly what was sent before: a conversion with no money attached should not
 * acquire a value of zero on the way through here.
 *
 * ORDER_TOTAL returns the total untouched, deliberately. It is the default, and
 * the promise of the default is that taking this update changes nothing about
 * what a shop reports - not even by a rounding step, which is arithmetic there
 * is no reason to perform on a figure nothing has been subtracted from.
 */
export function adsConversionValue(
  conversion: ConversionMoney,
  basis: AdsConversionValueBasis,
): number | undefined {
  const total = conversion.value
  if (typeof total !== 'number' || !Number.isFinite(total)) return undefined
  if (basis === 'ORDER_TOTAL') return total

  const deducted =
    basis === 'EXCLUDING_TAX_AND_SHIPPING'
      ? amount(conversion.tax) + amount(conversion.shipping)
      : amount(conversion.tax)

  // Clamped, because a fully discounted order can subtract its way below nothing
  // and Google rejects a negative value outright - which would lose the whole
  // conversion rather than record a small one. Rounded, because subtracting
  // floats produces 2300.0000000000005 and that is not a price.
  return Math.max(0, Math.round((total - deducted) * 100) / 100)
}

export type GoogleTagSettings = {
  enabled: boolean
  ga4MeasurementId: string | null
  adsConversionId: string | null
  adsPurchaseLabel: string | null
  trackPageViews: boolean
  loadBeforeConsent: boolean
  adsConversionValueBasis: AdsConversionValueBasis
}

/** Everything the browser half needs, handed down as props by the RSC block. */
export type TagConfig = {
  ga4Id: string | null
  adsId: string | null
  adsPurchaseLabel: string | null
  trackPageViews: boolean
  loadBeforeConsent: boolean
  adsConversionValueBasis: AdsConversionValueBasis
  gate: ConsentGate
}

/** A GA4 measurement ID. Owners paste them with stray spaces and the odd
 *  lowercase g; anything that is not recognisable is treated as not set rather
 *  than sent to Google to be ignored. */
export function normaliseGa4Id(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  return /^G-[A-Z0-9]{4,20}$/.test(value) ? value : null
}

/** A Google Ads conversion ID, "AW-123456789". Found anywhere in whatever was
 *  pasted, because what Google actually hands an owner is a block of JavaScript
 *  and telling them to pick the right eleven characters out of it is a poor use
 *  of anybody's afternoon. */
export function normaliseAdsId(raw: string | null | undefined): string | null {
  const match = (raw ?? '').toUpperCase().match(/AW-\d{6,15}/)
  return match ? match[0] : null
}

// A conversion label as Google writes it: letters, digits, hyphens and
// underscores. Case matters - the label is not an identifier to be tidied up,
// it is a key Google compares exactly, so nothing here changes its case.
const LABEL = '[A-Za-z0-9_-]{5,40}'

/**
 * The conversion label half of an Ads conversion action.
 *
 * Google gives an owner two separate things on two separate screens and calls
 * both of them "the tag", so what arrives in this box could be any of: the
 * label on its own, the `AW-123456789/abcDEF_gh12` pair, or - most likely,
 * because it is what the Ads screen offers as copyable text - the entire event
 * snippet, quotes, commas, line breaks and all. All three are accepted. The
 * base tag, which carries no label at all, is correctly rejected: that is the
 * snippet an owner reaches for first, and reporting it as "not set" is the only
 * honest answer.
 */
export function normaliseAdsLabel(raw: string | null | undefined): string | null {
  const text = raw ?? ''
  // A pasted snippet: take the label out of send_to's ID/label pair, which is
  // the one place in it that a label is unambiguously a label.
  const fromSendTo = text.match(new RegExp(`AW-\\d{6,15}/(${LABEL})`, 'i'))
  if (fromSendTo?.[1]) return fromSendTo[1]

  // Otherwise treat it as the label itself, give or take the punctuation a copy
  // and paste drags along with it.
  const value = text.trim().replace(/\s+/g, '')
  const tail = value.includes('/') ? value.slice(value.lastIndexOf('/') + 1) : value
  const cleaned = tail.replace(/^['"`]+/, '').replace(/['"`,;]+$/, '')
  return new RegExp(`^${LABEL}$`).test(cleaned) ? cleaned : null
}
