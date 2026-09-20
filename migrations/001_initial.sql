-- Google Tag module: one settings row, nothing else. The tag itself stores
-- nothing here - Google keeps the measurements, this table only remembers which
-- accounts to send them to and how the site has chosen to ask permission first.
-- All DDL is idempotent so run-module-migrations can safely re-apply it.

CREATE TABLE IF NOT EXISTS "gt_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    -- Nothing is sent to Google until the owner switches it on, whatever else
    -- is filled in and whatever blocks are on the page.
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    -- Google Analytics 4 measurement ID, "G-XXXXXXX". Null means no analytics.
    "ga4_measurement_id" TEXT,
    -- Google Ads conversion ID, "AW-123456789", and the conversion label for a
    -- completed order ("abcDEF_gh12"). Ads needs BOTH to count a sale: the ID
    -- names the account, the label names which conversion action this is.
    "ads_conversion_id" TEXT,
    "ads_purchase_label" TEXT,
    -- Whether to count ordinary page views, as opposed to only counting orders.
    "track_page_views" BOOLEAN NOT NULL DEFAULT true,
    -- Google's Consent Mode has two honest readings. false (the default): load
    -- nothing at all until a visitor grants the cookie, so a visitor who has not
    -- answered the banner has no contact with Google whatsoever. true: load the
    -- tag straight away in its denied state, where it sends cookieless pings
    -- that let Google model the visits it is not allowed to measure. The second
    -- gives better numbers; the first is the one that needs no explaining to a
    -- regulator. The owner chooses.
    "load_before_consent" BOOLEAN NOT NULL DEFAULT false,
    -- What figure the Google Ads conversion is worth: the order total as the
    -- shopper paid it, or that total with the tax (and optionally the delivery)
    -- taken back off. A shop quoting prices ex VAT wants one of the latter two,
    -- or every ROAS figure in the account is overstated by the VAT rate. The
    -- default reports the total, which is what this module has always done.
    "ads_conversion_value_basis" TEXT NOT NULL DEFAULT 'ORDER_TOTAL',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gt_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gt_settings_singleton_check" CHECK ("id" = 'singleton'),
    CONSTRAINT "gt_settings_ads_value_basis_check"
        CHECK ("ads_conversion_value_basis" IN ('ORDER_TOTAL', 'EXCLUDING_TAX', 'EXCLUDING_TAX_AND_SHIPPING'))
);
INSERT INTO "gt_settings" ("id") VALUES ('singleton') ON CONFLICT DO NOTHING;
