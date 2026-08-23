<p align="center">
  <img src="module-art.webp" alt="Google Tag" width="640" />
</p>

# Google Tag

Puts the Google tag on a Cactus site so Google Analytics and Google Ads can tell
the owner what their visitors did, and tells Google what an order was worth when
one is placed.

## What it does

- Loads `gtag.js` once, site-wide, from a placement block on the header layout.
- Supports Google Analytics 4 (`G-…`), Google Ads (`AW-…`), or both together.
- Implements Google Consent Mode v2 on top of Cactus's own cookie banner.
- Reports a `purchase` to Analytics and a `conversion` to Ads when the shop
  announces a completed order.

## How it is wired

The module never talks to the shop and the shop never talks to the module. Both
talk to core's conversion seam (`lib/analytics/conversion.ts`): the shop calls
`announceConversion()` from its order-confirmation page, this module calls
`onConversion()`. A site with no shop still measures page views; a site with a
shop and no tag module still announces its sales to nobody in particular.

Core dedupes an announced conversion by its transaction id, in this visit and in
later ones, so a refreshed or bookmarked confirmation page cannot count a sale
twice.

## Consent

Two of core's stock cookie categories, `analytics` and `marketing`, map onto
Google's four consent signals:

| Category    | Consent signals                                   |
| ----------- | ------------------------------------------------- |
| `analytics` | `analytics_storage`                               |
| `marketing` | `ad_storage`, `ad_user_data`, `ad_personalization` |

The manifest suggests both to the owner on the admin's Privacy tab. Nothing is
added to their banner without them clicking it.

A category that is not on the banner is not a category a visitor can grant, so
the matching half of the tag runs ungated rather than waiting for ever on a
switch that does not exist. The settings tab says so, in as many words, whenever
that is what is happening.

`load_before_consent` chooses between Consent Mode's two honest readings: off,
a visitor who has not agreed has no contact with Google at all; on, the tag loads
in its denied state and sends the cookieless pings Google models from. Off by
default.

## Settings

`Settings → Google Tag`, permission `googletag.manage`.

## Tables

`gt_settings` - one row. Nothing else; Google keeps the measurements.
