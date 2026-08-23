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

export type GoogleTagSettings = {
  enabled: boolean
  ga4MeasurementId: string | null
  adsConversionId: string | null
  adsPurchaseLabel: string | null
  trackPageViews: boolean
  loadBeforeConsent: boolean
}

/** Everything the browser half needs, handed down as props by the RSC block. */
export type TagConfig = {
  ga4Id: string | null
  adsId: string | null
  adsPurchaseLabel: string | null
  trackPageViews: boolean
  loadBeforeConsent: boolean
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
