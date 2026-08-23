'use client'

import { useCallback, useEffect, useState } from 'react'

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
  banner: Banner
  adminPath: string
}

type Draft = Pick<Settings, 'enabled' | 'ga4MeasurementId' | 'adsConversionId' | 'adsPurchaseLabel' | 'trackPageViews' | 'loadBeforeConsent'>

function draftOf(s: Settings): Draft {
  return {
    enabled: s.enabled,
    ga4MeasurementId: s.ga4MeasurementId,
    adsConversionId: s.adsConversionId,
    adsPurchaseLabel: s.adsPurchaseLabel,
    trackPageViews: s.trackPageViews,
    loadBeforeConsent: s.loadBeforeConsent,
  }
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
      text: 'Google Ads knows which account to look at but not which conversion to count, so your orders will not show up against your adverts. Add the conversion label from the same screen in Google Ads where you found the conversion ID.',
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
      text: `Your cookie banner asks about cookies but has no ${missing.join(' or ')} switch on it, so there is nothing for a visitor to agree to and this runs for all of them regardless. Add the missing ${missing.length > 1 ? 'categories' : 'category'} on the Privacy tab - the module offers them as a one-click suggestion there.`,
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
      <p className="field-hint" style={{ marginBottom: '1.25rem' }}>
        Puts the Google tag on your site so Google Analytics and Google Ads can tell you what your
        visitors did, and tells them what an order was worth when one is placed. You will need the
        <strong> Google Tag</strong> block on your header layout for any of it to appear - it shows
        nothing on the page, it just does the counting.
      </p>

      {notes.map((note, i) => (
        <div key={i} className={`alert alert-${note.tone}`}>
          {note.text}
          {note.tone === 'danger' && (
            <>
              {' '}
              <a href={`/${saved.adminPath}/config?tab=gdpr#gdpr-banner`}>Open the Privacy settings</a>.
            </>
          )}
        </div>
      ))}

      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1.25rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
        <span>Send measurements to Google</span>
      </label>

      <div className="field">
        <label>Google Analytics measurement ID</label>
        <input
          type="text"
          value={draft.ga4MeasurementId}
          placeholder="G-XXXXXXXXXX"
          onChange={(e) => set('ga4MeasurementId', e.target.value)}
        />
        <p className="field-hint">
          In Google Analytics, under Admin, Data streams, your website. Leave it empty if you only
          want to measure adverts.
        </p>
      </div>

      <div className="field">
        <label>Google Ads conversion ID</label>
        <input
          type="text"
          value={draft.adsConversionId}
          placeholder="AW-123456789"
          onChange={(e) => set('adsConversionId', e.target.value)}
        />
        <p className="field-hint">
          In Google Ads, under Goals, Conversions, your purchase action. Paste the whole thing if it
          is easier - the two halves are pulled apart for you.
        </p>
      </div>

      <div className="field">
        <label>Google Ads conversion label</label>
        <input
          type="text"
          value={draft.adsPurchaseLabel}
          placeholder="abcDE_fgHijklMN"
          onChange={(e) => set('adsPurchaseLabel', e.target.value)}
        />
        <p className="field-hint">
          The second half of the pair, from the same screen. This is what tells Google Ads that the
          thing it is being told about is a sale.
        </p>
      </div>

      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.75rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={draft.trackPageViews} onChange={(e) => set('trackPageViews', e.target.checked)} />
        <span>Count page views as well as orders</span>
      </label>

      <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={draft.loadBeforeConsent}
          style={{ marginTop: '0.25rem' }}
          onChange={(e) => set('loadBeforeConsent', e.target.checked)}
        />
        <span>Let Google estimate the visitors who said no</span>
      </label>
      <p className="field-hint" style={{ marginBottom: '1.5rem' }}>
        Off, which is the cautious setting: a visitor who has not agreed has no contact with Google
        at all. On: Google is loaded straight away but told it may not store anything, which lets it
        estimate the visits it is not allowed to measure. Better numbers, more to explain if anyone
        ever asks.
      </p>

      {err && <div className="alert alert-error">{err}</div>}
      {msg && <div className="alert alert-success">{msg}</div>}

      <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
