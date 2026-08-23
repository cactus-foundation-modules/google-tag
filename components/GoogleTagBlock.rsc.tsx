import { connection } from 'next/server'
import { gateFromBanner, getBannerState, getGoogleTagSettings } from '@/modules/google-tag/lib/settings'
import { TagLoader } from './TagLoader'
import { googleTagBlockComponent } from './GoogleTagBlock'

async function GoogleTagRsc() {
  // Read per request, not per build: an owner who corrects a mistyped
  // measurement ID expects the next page load to use it, not the next deploy.
  await connection()

  const settings = await getGoogleTagSettings()
  // Switched off, or switched on with nothing to send to. Either way the page
  // gets no script and no queue - a tag with no account behind it is a request
  // to Google that can never become a measurement.
  if (!settings.enabled) return null
  if (!settings.ga4MeasurementId && !settings.adsConversionId) return null

  const gate = gateFromBanner(await getBannerState())

  return (
    <TagLoader
      config={{
        ga4Id: settings.ga4MeasurementId,
        adsId: settings.adsConversionId,
        adsPurchaseLabel: settings.adsPurchaseLabel,
        trackPageViews: settings.trackPageViews,
        loadBeforeConsent: settings.loadBeforeConsent,
        gate,
      }}
    />
  )
}

export const googleTagBlockRscComponent = { ...googleTagBlockComponent, render: GoogleTagRsc }
