import { prisma } from '@/lib/db/prisma'
import {
  ANALYTICS_CATEGORY,
  MARKETING_CATEGORY,
  normaliseAdsId,
  normaliseAdsLabel,
  normaliseGa4Id,
  type BannerState,
  type ConsentGate,
  type GoogleTagSettings,
} from '@/modules/google-tag/lib/types'

type SettingsRow = {
  enabled: boolean
  ga4_measurement_id: string | null
  ads_conversion_id: string | null
  ads_purchase_label: string | null
  track_page_views: boolean
  load_before_consent: boolean
}

const BLANK: GoogleTagSettings = {
  enabled: false,
  ga4MeasurementId: null,
  adsConversionId: null,
  adsPurchaseLabel: null,
  trackPageViews: true,
  loadBeforeConsent: false,
}

export async function getGoogleTagSettings(): Promise<GoogleTagSettings> {
  const rows = await prisma.$queryRaw<SettingsRow[]>`
    SELECT "enabled", "ga4_measurement_id", "ads_conversion_id", "ads_purchase_label",
           "track_page_views", "load_before_consent"
    FROM "gt_settings" WHERE "id" = 'singleton'
  `.catch(() => [] as SettingsRow[])
  const row = rows[0]
  // The migration seeds the singleton; no row means it has not run yet, and a
  // half-installed module must send nothing rather than guess.
  if (!row) return BLANK
  return {
    enabled: row.enabled,
    // Normalised on the way out as well as on the way in: a row written by an
    // older version of this module, or edited in the database by hand, must not
    // put a malformed ID into every page on the site.
    ga4MeasurementId: normaliseGa4Id(row.ga4_measurement_id),
    adsConversionId: normaliseAdsId(row.ads_conversion_id),
    adsPurchaseLabel: normaliseAdsLabel(row.ads_purchase_label),
    trackPageViews: row.track_page_views,
    loadBeforeConsent: row.load_before_consent,
  }
}

export async function updateGoogleTagSettings(patch: {
  enabled?: boolean
  ga4MeasurementId?: string
  adsConversionId?: string
  adsPurchaseLabel?: string
  trackPageViews?: boolean
  loadBeforeConsent?: boolean
}): Promise<void> {
  if (patch.enabled !== undefined) {
    await prisma.$executeRaw`UPDATE "gt_settings" SET "enabled" = ${patch.enabled}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'singleton'`
  }
  if (patch.ga4MeasurementId !== undefined) {
    const value = normaliseGa4Id(patch.ga4MeasurementId)
    await prisma.$executeRaw`UPDATE "gt_settings" SET "ga4_measurement_id" = ${value}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'singleton'`
  }
  if (patch.adsConversionId !== undefined) {
    const value = normaliseAdsId(patch.adsConversionId)
    await prisma.$executeRaw`UPDATE "gt_settings" SET "ads_conversion_id" = ${value}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'singleton'`
  }
  if (patch.adsPurchaseLabel !== undefined) {
    const value = normaliseAdsLabel(patch.adsPurchaseLabel)
    await prisma.$executeRaw`UPDATE "gt_settings" SET "ads_purchase_label" = ${value}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'singleton'`
  }
  if (patch.trackPageViews !== undefined) {
    await prisma.$executeRaw`UPDATE "gt_settings" SET "track_page_views" = ${patch.trackPageViews}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'singleton'`
  }
  if (patch.loadBeforeConsent !== undefined) {
    await prisma.$executeRaw`UPDATE "gt_settings" SET "load_before_consent" = ${patch.loadBeforeConsent}, "updated_at" = CURRENT_TIMESTAMP WHERE "id" = 'singleton'`
  }
}

// ---------------------------------------------------------------------------
// Consent
// ---------------------------------------------------------------------------

type StoredBanner = {
  enabled?: boolean
  categories?: Array<{ key?: string }>
} | null

/**
 * What the site's cookie banner currently offers. Read from core's own config
 * rather than assumed, because a category can be renamed, removed, or never
 * added, and every one of those changes what this module is allowed to do.
 */
export async function getBannerState(): Promise<BannerState> {
  const config = await prisma.siteConfig
    .findUnique({ where: { id: 'singleton' }, select: { consentBannerConfig: true } })
    .catch(() => null)
  const banner = config?.consentBannerConfig as StoredBanner
  const keys = new Set((banner?.categories ?? []).map((c) => c?.key).filter(Boolean) as string[])
  return {
    bannerEnabled: banner?.enabled === true,
    hasAnalyticsCategory: keys.has(ANALYTICS_CATEGORY),
    hasMarketingCategory: keys.has(MARKETING_CATEGORY),
  }
}

/**
 * Which halves of the tag have a cookie category to wait for.
 *
 * You can only gate on a switch that exists. A banner that is switched off, or
 * one carrying no analytics category, leaves nothing for a visitor to grant -
 * so waiting for a grant would mean waiting for ever, and the tag would quietly
 * measure nothing at all while appearing to be switched on. It runs instead, and
 * the settings tab says loudly that it is running unasked. Same rule live chat
 * follows, for the same reason: the owner decides what to ask, and silence is
 * the one answer a module must never invent on their behalf.
 */
export function gateFromBanner(banner: BannerState): ConsentGate {
  if (!banner.bannerEnabled) return { analytics: 'allowed', ads: 'allowed' }
  return {
    analytics: banner.hasAnalyticsCategory ? 'category' : 'allowed',
    ads: banner.hasMarketingCategory ? 'category' : 'allowed',
  }
}
