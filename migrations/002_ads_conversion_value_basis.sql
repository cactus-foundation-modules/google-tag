-- What the Google Ads conversion value is based on.
--
-- A shop that prices ex VAT announces an order total with the tax on top, so
-- Ads has been recording a conversion worth more than the shop ever banks. On a
-- thin margin that is not a cosmetic difference: it inflates measured ROAS by
-- the whole VAT rate, and any target ROAS set from the inflated figure bids
-- looser than the owner intended without ever saying so.
--
-- 'ORDER_TOTAL' is the default and must stay the default: an existing shop
-- taking this update keeps reporting exactly what it reported yesterday, so its
-- conversion history stays comparable with itself. Changing the basis is a
-- decision the owner makes on the settings tab, knowing it is a break in the
-- series. Idempotent, like everything else run-module-migrations may re-apply.

ALTER TABLE "gt_settings"
    ADD COLUMN IF NOT EXISTS "ads_conversion_value_basis" TEXT NOT NULL DEFAULT 'ORDER_TOTAL';

-- ADD CONSTRAINT has no IF NOT EXISTS, so the existence check is done by hand.
-- The normaliser in lib/types already refuses to trust this column's contents,
-- so the constraint is a second lock on a door rather than the only one.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "pg_constraint" WHERE "conname" = 'gt_settings_ads_value_basis_check'
    ) THEN
        ALTER TABLE "gt_settings"
            ADD CONSTRAINT "gt_settings_ads_value_basis_check"
            CHECK ("ads_conversion_value_basis" IN ('ORDER_TOTAL', 'EXCLUDING_TAX', 'EXCLUDING_TAX_AND_SHIPPING'));
    END IF;
END $$;
