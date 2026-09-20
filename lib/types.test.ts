import { describe, it, expect } from 'vitest'
import {
  adsConversionValue,
  normaliseAdsConversionValueBasis,
  normaliseAdsId,
  normaliseAdsLabel,
  normaliseGa4Id,
} from './types'

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

// ---------------------------------------------------------------------------
// The Ads conversion value.
//
// Deskwell, 19 September 2026: order DW000192 was GBP 2,300.00 ex VAT and Ads
// recorded GBP 2,760.00. On a 5.66% margin the account was measuring break-even
// ROAS as 21.2x when the real figure is 17.7x, so a target set from it bid 20%
// looser than intended. Nothing anywhere said so. These tests are the guard.
// ---------------------------------------------------------------------------

describe('normaliseAdsConversionValueBasis', () => {
  it('keeps each of the three bases', () => {
    expect(normaliseAdsConversionValueBasis('ORDER_TOTAL')).toBe('ORDER_TOTAL')
    expect(normaliseAdsConversionValueBasis('EXCLUDING_TAX')).toBe('EXCLUDING_TAX')
    expect(normaliseAdsConversionValueBasis('EXCLUDING_TAX_AND_SHIPPING')).toBe('EXCLUDING_TAX_AND_SHIPPING')
  })

  it('tidies case and stray whitespace, which is what a hand-edited row looks like', () => {
    expect(normaliseAdsConversionValueBasis('  excluding_tax  ')).toBe('EXCLUDING_TAX')
  })

  it('falls back to the order total for anything it does not recognise', () => {
    expect(normaliseAdsConversionValueBasis('EX_VAT')).toBe('ORDER_TOTAL')
    expect(normaliseAdsConversionValueBasis('')).toBe('ORDER_TOTAL')
    expect(normaliseAdsConversionValueBasis(null)).toBe('ORDER_TOTAL')
    expect(normaliseAdsConversionValueBasis(undefined)).toBe('ORDER_TOTAL')
  })
})

describe('adsConversionValue', () => {
  // The real order, at 20% VAT with delivery inside the total.
  const ORDER = { value: 2760, tax: 460, shipping: 120 }

  it('sends the total untouched on the default, which is what an existing shop keeps doing', () => {
    expect(adsConversionValue(ORDER, 'ORDER_TOTAL')).toBe(2760)
  })

  it('takes the tax off', () => {
    expect(adsConversionValue(ORDER, 'EXCLUDING_TAX')).toBe(2300)
  })

  it('takes the tax and the delivery off', () => {
    expect(adsConversionValue(ORDER, 'EXCLUDING_TAX_AND_SHIPPING')).toBe(2180)
  })

  it('treats a missing tax as no tax rather than as nothing at all', () => {
    expect(adsConversionValue({ value: 99.99 }, 'EXCLUDING_TAX')).toBe(99.99)
    expect(adsConversionValue({ value: 99.99, shipping: 9.99 }, 'EXCLUDING_TAX')).toBe(99.99)
  })

  it('treats a missing shipping the same way', () => {
    expect(adsConversionValue({ value: 120, tax: 20 }, 'EXCLUDING_TAX_AND_SHIPPING')).toBe(100)
  })

  it('rounds the float error out of the subtraction', () => {
    // 2760.35 - 460.06 is 2300.2899999999995 in binary floating point, and that
    // is not a price anybody should be sending anywhere.
    expect(adsConversionValue({ value: 2760.35, tax: 460.06 }, 'EXCLUDING_TAX')).toBe(2300.29)
  })

  it('clamps at zero, because Google rejects a negative and the sale would be lost', () => {
    // A fully discounted order where the delivery is all that is left.
    expect(adsConversionValue({ value: 24, tax: 4, shipping: 40 }, 'EXCLUDING_TAX_AND_SHIPPING')).toBe(0)
  })

  it('never produces NaN from a conversion with no money on it', () => {
    expect(adsConversionValue({}, 'EXCLUDING_TAX')).toBeUndefined()
    expect(adsConversionValue({ tax: 10 }, 'EXCLUDING_TAX_AND_SHIPPING')).toBeUndefined()
    expect(adsConversionValue({ value: Number.NaN, tax: 10 }, 'EXCLUDING_TAX')).toBeUndefined()
  })

  it('sends a genuine zero as zero', () => {
    expect(adsConversionValue({ value: 0 }, 'ORDER_TOTAL')).toBe(0)
    expect(adsConversionValue({ value: 0 }, 'EXCLUDING_TAX')).toBe(0)
  })
})
