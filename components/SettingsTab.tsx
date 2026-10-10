'use client'

import { useCallback, useEffect, useState } from 'react'
import { SettingsHeaderActions, SettingsHeaderStatus } from '@/components/admin/SettingsHeaderActions'
import { InfoTip } from '@/components/admin/InfoTip'
import {
  ADS_CONVERSION_VALUE_BASES,
  normaliseAdsConversionValueBasis,
  type AdsConversionValueBasis,
} from '@/modules/google-tag/lib/types'

const API_BASE = '/api/m/google-tag'

type Banner = {
  bannerEnabled: boolean
  hasAnalyticsCategory: boolean
  hasMarketingCategory: boolean
}

type Settings = {
  enabled: boolean
  ga4MeasurementId: string
  adsConversionId: string
  adsPurchaseLabel: string
  trackPageViews: boolean
  loadBeforeConsent: boolean
  adsConversionValueBasis: AdsConversionValueBasis
  banner: Banner
  adminPath: string
}

type Draft = Pick<Settings, 'enabled' | 'ga4MeasurementId' | 'adsConversionId' | 'adsPurchaseLabel' | 'trackPageViews' | 'loadBeforeConsent' | 'adsConversionValueBasis'>

function draftOf(s: Settings): Draft {
  return {
    enabled: s.enabled,
    ga4MeasurementId: s.ga4MeasurementId,
    adsConversionId: s.adsConversionId,
    adsPurchaseLabel: s.adsPurchaseLabel,
    trackPageViews: s.trackPageViews,
    loadBeforeConsent: s.loadBeforeConsent,
    adsConversionValueBasis: s.adsConversionValueBasis,
  }
}

// What each basis is called on the page. Written for someone who runs a shop
// rather than someone who runs an ad account: the wording says what figure ends
// up in Google, not what it is subtracted from.
const BASIS_LABELS: Record<AdsConversionValueBasis, string> = {
  ORDER_TOTAL: 'The full order total, as the customer paid it',
  EXCLUDING_TAX: 'The order total without VAT',
  EXCLUDING_TAX_AND_SHIPPING: 'The order total without VAT or delivery',
}

// Everything the owner ought to know before they trust the numbers, worked out
// from what is actually saved rather than from what they meant to save. Each
// one is a real, silent failure this module would otherwise have: a tag with no
// account behind it, a sale Google will not count, or - the one that matters -
// measurement running on visitors who were never asked.
function advice(saved: Settings): Array<{ tone: 'warning' | 'danger' | 'info'; text: string }> {
  const notes: Array<{ tone: 'warning' | 'danger' | 'info'; text: string }> = []
  const hasGa4 = !!saved.ga4MeasurementId
  const hasAds = !!saved.adsConversionId

  if (saved.enabled && !hasGa4 && !hasAds) {
    notes.push({
      tone: 'warning',
      text: 'Switched on, but there is nowhere to send anything. Add a Google Analytics measurement ID, a Google Ads conversion ID, or both.',
    })
  }

  if (saved.enabled && hasAds && !saved.adsPurchaseLabel) {
    notes.push({
      tone: 'warning',
      text: 'Google Ads knows which account to look at but not which conversion to count, so your orders will not show up against your adverts. The label is not in the tag Google shows you first - find it on the conversion action itself, under Tag setup.',
    })
  }

  if (!saved.enabled) return notes

  const { bannerEnabled, hasAnalyticsCategory, hasMarketingCategory } = saved.banner

  if (!bannerEnabled) {
    notes.push({
      tone: 'danger',
      text: 'Your cookie banner is switched off, so nobody is asked anything and measurement runs for every visitor. That is your decision to make, but in the UK and the EU it is the sort of decision that wants deliberating over rather than drifting into.',
    })
    return notes
  }

  const missing: string[] = []
  if (hasGa4 && !hasAnalyticsCategory) missing.push('Analytics')
  if (hasAds && !hasMarketingCategory) missing.push('Marketing')

  if (missing.length > 0) {
    notes.push({
      tone: 'danger',
      text: `Your cookie banner asks about cookies but has no ${missing.join(' or ')} switch on it, so there is nothing for a visitor to agree to and this runs for all of them regardless. Add the missing ${missing.length > 1 ? 'categories' : 'category'} on Settings > General > GDPR & Legal - the module offers them as a one-click suggestion there.`,
    })
  } else {
    notes.push({
      tone: 'info',
      text: 'Nothing is measured until a visitor agrees to it on your cookie banner, and a visitor who changes their mind is honoured straight away.',
    })
  }

  return notes
}

export function GoogleTagSettingsTab() {
  const [saved, setSaved] = useState<Settings | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/settings`)
      if (!res.ok) return
      const s = await res.json() as Settings
      setSaved(s)
      setDraft(draftOf(s))
    } catch { /* retry on next open */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    // Yield a microtask first so the opening setState never runs synchronously
    // inside the effect.
    void (async () => {
      await Promise.resolve()
      if (!cancelled) await load()
    })()
    return () => { cancelled = true }
  }, [load])

  const save = useCallback(async () => {
    if (!draft) return
    setBusy(true)
    setMsg('')
    setErr('')
    try {
      const res = await fetch(`${API_BASE}/admin/settings`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const body = await res.json().catch(() => null) as (Settings & { error?: string }) | null
      if (!res.ok) {
        setErr(body?.error ?? 'Could not save those settings.')
        return
      }
      if (body) {
        setSaved(body)
        // Re-seed from what was actually stored, not from what was typed: an ID
        // the server could not make sense of comes back empty, which is a good
        // deal clearer than leaving it sitting in the box looking saved.
        setDraft(draftOf(body))
      }
      setMsg('Saved.')
    } catch {
      setErr('Could not reach the site to save those settings.')
    } finally {
      setBusy(false)
    }
  }, [draft])

  if (!saved || !draft) return <p className="field-hint">Loading…</p>

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value })
  const notes = advice(saved)

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: '1rem' }}>
        Adds the Google tag so Analytics and Ads can see what visitors do and what each order was worth.
        It needs the <strong>Google Tag</strong> block on your header layout, where it shows nothing - it
        just does the counting.
      </p>

      {notes.map((note, i) => (
        <div key={i} className={`alert alert-${note.tone}`}>
          {note.text}
          {note.tone === 'danger' && (
            <>
              {' '}
              <a href={`/${saved.adminPath}/config?tab=gdpr#gdpr-banner`}>Open GDPR &amp; Legal</a>.
            </>
          )}
        </div>
      ))}

      <SettingsHeaderActions>
        <SettingsHeaderStatus message={msg} error={err} />
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </SettingsHeaderActions>

      <div className="settings-cols">
        <div className="card">
          <div className="card-title">Google Analytics and consent</div>
      <div className="field field--beside-input">
        <label className="settings-check">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span>Send measurements to Google</span>
        </label>
      </div>

      <div className="field">
        <label>Google Analytics measurement ID</label>
        <input
          type="text"
          value={draft.ga4MeasurementId}
          placeholder="G-XXXXXXXXXX"
          onChange={(e) => set('ga4MeasurementId', e.target.value)}
        />
        <p className="field-hint">
          In Analytics: Admin, Data streams, your website. Leave it empty to measure adverts only.
        </p>
      </div>

      <div className="field">
        <label className="settings-check">
          <input type="checkbox" checked={draft.trackPageViews} onChange={(e) => set('trackPageViews', e.target.checked)} />
          <span>Count page views as well as orders</span>
          <InfoTip>Untick to send orders only.</InfoTip>
        </label>
      </div>
      <div className="field">
      <label className="settings-check">
        <input
          type="checkbox"
          checked={draft.loadBeforeConsent}
          onChange={(e) => set('loadBeforeConsent', e.target.checked)}
        />
        <span>Let Google estimate the visitors who said no</span>
        <InfoTip>
          Off is the cautious setting: a visitor who has not agreed has no contact with Google at all.
          On, Google loads straight away but may not store anything, so it can estimate the visits it
          cannot measure. Better numbers, more to explain if anyone asks.
        </InfoTip>
      </label>
      </div>


        </div>
        <div className="card">
          <div className="card-title">Google Ads</div>
      <div className="field">
        <label>Google Ads conversion ID</label>
        <input
          type="text"
          value={draft.adsConversionId}
          placeholder="AW-123456789"
          onChange={(e) => set('adsConversionId', e.target.value)}
        />
        <p className="field-hint">
          In Ads: Goals, Conversions, your purchase action. Pasting the whole snippet works too.
        </p>
      </div>

      <div className="field">
        <label>
          Google Ads conversion label
          <InfoTip>
            Tells Google Ads that what it is being told about is a sale. It is not in the tag Google shows
            you first, which only carries the account: it is on the conversion action&rsquo;s own screen,
            under Tag setup - as Conversion label, or the part after the slash in the second snippet.
            Pasting that snippet works too.
          </InfoTip>
        </label>
        <input
          type="text"
          value={draft.adsPurchaseLabel}
          placeholder="abcDE_fgHijklMN"
          onChange={(e) => set('adsPurchaseLabel', e.target.value)}
        />
        <p className="field-hint">Not in the first tag Google shows you - it is under Tag setup.</p>
      </div>

      <div className="field">
        <label>
          What a sale is worth to Google Ads
          <InfoTip>
            Only affects Google Ads. If your prices exclude VAT, the full total is more than you bank, so
            return on ad spend looks better than it is and target bidding runs looser than you asked.
            Analytics always gets the full total. Changing this is a fresh start: orders already counted
            keep the figure they had.
          </InfoTip>
        </label>
        <select
          value={draft.adsConversionValueBasis}
          onChange={(e) => set('adsConversionValueBasis', normaliseAdsConversionValueBasis(e.target.value))}
        >
          {ADS_CONVERSION_VALUE_BASES.map((basis) => (
            <option key={basis} value={basis}>{BASIS_LABELS[basis]}</option>
          ))}
        </select>
        <p className="field-hint">Shops that sell without VAT usually want <strong>without VAT</strong>.</p>
      </div>

        </div>
      </div>
    </div>
  )
}
