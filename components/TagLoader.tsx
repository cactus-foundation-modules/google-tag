'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { onConversion, type Conversion } from '@/lib/analytics/conversion'
import {
  ANALYTICS_CATEGORY,
  CONSENT_CHANGE_EVENT,
  MARKETING_CATEGORY,
  type TagConfig,
} from '@/modules/google-tag/lib/types'

// ---------------------------------------------------------------------------
// The browser half of the Google tag.
//
// Order of events, which is the whole job:
//   1. The command queue and the consent defaults are installed immediately.
//      Both are plain array pushes - nothing leaves the browser - and Google is
//      quite firm that the defaults must be in the queue before the tag script
//      is fetched, or the first hit goes out under the wrong permissions.
//   2. The tag script is fetched only once it is allowed to be: either the
//      owner opted into Consent Mode's cookieless pings, or a category this
//      module gates on has actually been granted.
//   3. Everything measured in the meantime sits in the queue. If the visitor
//      grants consent later - including on the confirmation page, after their
//      order has already been announced - the script loads, the queue drains,
//      and nothing is lost.
//
// Every step is claimed on `window` rather than in component state. The block
// can legitimately be placed in the header layout AND the footer layout, and two
// copies each counting the same sale would overstate a shop's revenue silently,
// which is the one kind of wrong number nobody catches.
// ---------------------------------------------------------------------------

type GtagCommand = (...args: unknown[]) => void

type TagWindow = {
  dataLayer?: unknown[]
  gtag?: GtagCommand
  __cactusConsent?: Record<string, boolean>
  /** Set once the queue, consent defaults and account config are in place. */
  __cactusGtagReady?: boolean
  /** Set once the tag script has been appended. */
  __cactusGtagScript?: boolean
  /** The last path counted as a page view, so two copies count it once. */
  __cactusGtagPath?: string
  /** Held by whichever copy is listening for conversions. */
  __cactusGtagConversions?: boolean
}

function tagWindow(): TagWindow {
  return window as unknown as TagWindow
}

function ensureGtag(): GtagCommand {
  const w = tagWindow()
  w.dataLayer ??= []
  if (!w.gtag) {
    // gtag.js reads the arguments object back out of dataLayer, so the shim has
    // to push exactly that. An array holding the same values is NOT a drop-in
    // replacement - this is Google's own snippet, kept verbatim in behaviour.
    const shim = function (this: unknown) {
      // `arguments`, deliberately: it is the payload, not a stand-in for one.
      w.dataLayer!.push(arguments)
    }
    w.gtag = shim as unknown as GtagCommand
  }
  return w.gtag
}

// Consent is read as an external store: core announces every decision on a
// window event, so there is no state of our own to fall out of step, and a
// visitor changing their mind mid-visit is picked up without a reload.
function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange)
}

// A two-character string rather than an object, because useSyncExternalStore
// compares snapshots by identity and a fresh object every call is an infinite
// render.
function consentSnapshot(): string {
  const map = tagWindow().__cactusConsent
  return `${map?.[ANALYTICS_CATEGORY] === true ? '1' : '0'}${map?.[MARKETING_CATEGORY] === true ? '1' : '0'}`
}

function serverSnapshot(): string {
  return '00'
}

function grant(ok: boolean): 'granted' | 'denied' {
  return ok ? 'granted' : 'denied'
}

function consentPayload(analyticsOk: boolean, adsOk: boolean): Record<string, string> {
  return {
    analytics_storage: grant(analyticsOk),
    ad_storage: grant(adsOk),
    ad_user_data: grant(adsOk),
    ad_personalization: grant(adsOk),
  }
}

export function TagLoader({ config }: { config: TagConfig }) {
  const { ga4Id, adsId, adsPurchaseLabel, trackPageViews, loadBeforeConsent, gate } = config

  const snapshot = useSyncExternalStore(subscribeConsent, consentSnapshot, serverSnapshot)
  // 'allowed' means the site's banner has no switch for this, so there is
  // nothing to wait for. See gateFromBanner in lib/settings.
  const analyticsOk = gate.analytics === 'allowed' || snapshot[0] === '1'
  const adsOk = gate.ads === 'allowed' || snapshot[1] === '1'

  // The consent state as it stood when the page loaded. The defaults below
  // describe that moment; every change after it is an update, not a default.
  const firstConsentRef = useRef({ analyticsOk, adsOk })

  // Step 1: the queue, the defaults and the account configuration, all before
  // any network request. Written before the loading effect below, which is what
  // guarantees it has run by the time the script is asked for - effects fire in
  // the order they appear.
  useEffect(() => {
    const w = tagWindow()
    if (w.__cactusGtagReady) return
    w.__cactusGtagReady = true
    const { analyticsOk: firstAnalytics, adsOk: firstAds } = firstConsentRef.current
    const gtag = ensureGtag()
    gtag('consent', 'default', {
      ...consentPayload(firstAnalytics, firstAds),
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      // Never optional and never gated: this is the storage that keeps a
      // request safe rather than the storage that watches anybody.
      security_storage: 'granted',
      // Give a visitor half a second to answer the banner before the first hit
      // goes out, so an immediate "accept all" is not recorded as a refusal.
      wait_for_update: 500,
    })
    // Strips ad identifiers from requests made while advertising consent is
    // denied, and carries a click ID through the URL instead of a cookie, so a
    // click can still be joined to a sale without storing anything.
    gtag('set', 'ads_data_redaction', true)
    gtag('set', 'url_passthrough', true)
    gtag('js', new Date())
    if (ga4Id) gtag('config', ga4Id, { send_page_view: trackPageViews })
    // Ads counts conversions, not visits, so it never wants a page view.
    if (adsId) gtag('config', adsId, { send_page_view: false })
    // The landing page has now been counted by the config command above, so the
    // navigation effect must not count it again.
    w.__cactusGtagPath = window.location.pathname
  }, [ga4Id, adsId, trackPageViews])

  // Step 2: re-state consent whenever the visitor's answer changes. Pushing it
  // once more than strictly needed is harmless; missing one is not.
  useEffect(() => {
    ensureGtag()('consent', 'update', consentPayload(analyticsOk, adsOk))
  }, [analyticsOk, adsOk])

  // Step 3: fetch the tag itself, once, as soon as it is allowed to be.
  useEffect(() => {
    const w = tagWindow()
    if (w.__cactusGtagScript) return
    if (!loadBeforeConsent && !analyticsOk && !adsOk) return
    // The script's own id parameter can be either account; whichever is named
    // here, the config commands already queued bring the other one along.
    const primary = ga4Id ?? adsId
    if (!primary) return
    w.__cactusGtagScript = true
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(primary)}`
    document.head.appendChild(script)
  }, [loadBeforeConsent, analyticsOk, adsOk, ga4Id, adsId])

  // Page views on in-site navigation. The landing page was counted by the config
  // command, so this only ever counts a path it has not seen.
  const pathname = usePathname()
  useEffect(() => {
    if (!ga4Id || !trackPageViews) return
    const w = tagWindow()
    if (w.__cactusGtagPath === pathname) return
    w.__cactusGtagPath = pathname
    ensureGtag()('event', 'page_view', {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    })
  }, [pathname, ga4Id, trackPageViews])

  // Conversions. One copy of the block listens; core replays anything announced
  // before the listener existed, so a second subscriber would replay the same
  // sale and count it twice. The commands go into the queue whatever the consent
  // state - Consent Mode decides how they are allowed to travel, and a grant
  // that arrives later drains the queue rather than losing it.
  const ga4Ref = useRef(ga4Id)
  const adsRef = useRef(adsId)
  const labelRef = useRef(adsPurchaseLabel)
  useEffect(() => {
    ga4Ref.current = ga4Id
    adsRef.current = adsId
    labelRef.current = adsPurchaseLabel
  }, [ga4Id, adsId, adsPurchaseLabel])

  useEffect(() => {
    const w = tagWindow()
    if (w.__cactusGtagConversions) return
    w.__cactusGtagConversions = true
    const unsubscribe = onConversion((c: Conversion) => {
      // v1 measures the one conversion with money attached. Leads, quotes and
      // sign-ups arrive on the same event and are ignored here rather than
      // guessed at - each needs its own conversion action set up in Ads first.
      if (c.type !== 'purchase') return
      const gtag = ensureGtag()

      if (ga4Ref.current) {
        gtag('event', 'purchase', {
          transaction_id: c.transactionId,
          value: c.value,
          currency: c.currency,
          tax: c.tax,
          shipping: c.shipping,
          coupon: c.coupon,
          items: (c.items ?? []).map((item) => ({
            item_id: item.id,
            item_name: item.name,
            item_variant: item.variant,
            item_category: item.category,
            quantity: item.quantity,
            price: item.price,
          })),
        })
      }

      // Ads needs the account and the conversion action together. Without the
      // label there is nothing to count the sale against, so nothing is sent -
      // an unlabelled conversion is discarded at Google's end anyway.
      if (adsRef.current && labelRef.current) {
        gtag('event', 'conversion', {
          send_to: `${adsRef.current}/${labelRef.current}`,
          transaction_id: c.transactionId,
          value: c.value,
          currency: c.currency,
        })
      }
    })
    return () => {
      unsubscribe()
      w.__cactusGtagConversions = false
    }
  }, [])

  return null
}
