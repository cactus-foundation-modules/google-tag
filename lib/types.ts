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

/** A Google Ads conversion ID, "AW-123456789". Owners often paste the whole
 *  snippet or the ID/label pair together, so the ID is pulled out of whatever
 *  arrives rather than rejected wholesale. */
export function normaliseAdsId(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  const match = value.match(/AW-\d{6,15}/)
  return match ? match[0] : null
}

/** The conversion label half of an Ads conversion action. Google writes the pair
 *  as "AW-123456789/abcDEF_gh12"; paste either the label alone or the whole
 *  thing and the label is what is kept. */
export function normaliseAdsLabel(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().replace(/\s+/g, '')
  const afterSlash = value.includes('/') ? value.slice(value.lastIndexOf('/') + 1) : value
  return /^[A-Za-z0-9_-]{5,40}$/.test(afterSlash) ? afterSlash : null
}
