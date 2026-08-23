import { describe, it, expect } from 'vitest'
import { normaliseAdsId, normaliseAdsLabel, normaliseGa4Id } from './types'

// Google hands an owner two different snippets on two different screens and
// calls both of them "the tag". Whatever they paste, these three decide what
// actually reaches the page - and a value that quietly fails to parse saves as
// empty, which is a miserable way to discover a mistake.

const BASE_TAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-18406636221"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'AW-18406636221');
</script>`

const EVENT_SNIPPET = `<script>
  gtag('event', 'conversion', {
      'send_to': 'AW-18406636221/AbC-D_efG-h12_34',
      'value': 1.0,
      'currency': 'GBP',
      'transaction_id': ''
  });
</script>`

describe('normaliseAdsId', () => {
  it('takes the ID on its own', () => {
    expect(normaliseAdsId('AW-18406636221')).toBe('AW-18406636221')
  })

  it('finds it in the whole base tag, which is what Google offers to copy', () => {
    expect(normaliseAdsId(BASE_TAG)).toBe('AW-18406636221')
  })

  it('finds it in the event snippet too', () => {
    expect(normaliseAdsId(EVENT_SNIPPET)).toBe('AW-18406636221')
  })

  it('forgives the case and the stray spaces of a hurried paste', () => {
    expect(normaliseAdsId('  aw-18406636221 ')).toBe('AW-18406636221')
  })

  it('answers null rather than guessing', () => {
    expect(normaliseAdsId('')).toBeNull()
    expect(normaliseAdsId('G-ABCDE12345')).toBeNull()
    expect(normaliseAdsId(null)).toBeNull()
  })
})

describe('normaliseAdsLabel', () => {
  it('takes the label on its own', () => {
    expect(normaliseAdsLabel('AbC-D_efG-h12_34')).toBe('AbC-D_efG-h12_34')
  })

  it('takes the ID/label pair and keeps the half that is the label', () => {
    expect(normaliseAdsLabel('AW-18406636221/AbC-D_efG-h12_34')).toBe('AbC-D_efG-h12_34')
  })

  it('takes the entire event snippet', () => {
    expect(normaliseAdsLabel(EVENT_SNIPPET)).toBe('AbC-D_efG-h12_34')
  })

  it('survives the punctuation a copy and paste drags along', () => {
    expect(normaliseAdsLabel(`'AbC-D_efG-h12_34',`)).toBe('AbC-D_efG-h12_34')
    expect(normaliseAdsLabel('"AbC-D_efG-h12_34"')).toBe('AbC-D_efG-h12_34')
  })

  it('never changes the case, because Google compares the label exactly', () => {
    expect(normaliseAdsLabel('AbC-D_efG-h12_34')).not.toBe('ABC-D_EFG-H12_34')
  })

  it('rejects the base tag, which carries no label at all', () => {
    // The snippet an owner reaches for first. Reporting "not set" is the only
    // honest answer - there is nothing in it to find.
    expect(normaliseAdsLabel(BASE_TAG)).toBeNull()
  })

  it('answers null rather than guessing', () => {
    expect(normaliseAdsLabel('')).toBeNull()
    expect(normaliseAdsLabel('shrt')).toBeNull()
    expect(normaliseAdsLabel(null)).toBeNull()
  })
})

describe('normaliseGa4Id', () => {
  it('takes a measurement ID, tidying case and spaces', () => {
    expect(normaliseGa4Id(' g-abcde12345 ')).toBe('G-ABCDE12345')
  })

  it('rejects an Ads ID in the Analytics box', () => {
    expect(normaliseGa4Id('AW-18406636221')).toBeNull()
  })
})
