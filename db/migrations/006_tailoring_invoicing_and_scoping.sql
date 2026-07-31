-- ─────────────────────────────────────────────────────────────────────────────
-- 006_tailoring_invoicing_and_scoping.sql
--
-- Bundles the schema changes needed for:
--   1. Proforma invoice (on tailoring order creation) + real GST invoice
--      (on first "ready for pickup") for tailoring orders.
--   2. Unique purchase invoice number per supplier.
--   3. One-time defensive fix for a hardcoded/absolute company_logo_path value.
--   4. Discount scheme item/category scoping.
--   5. Store Terms & Conditions is added as a plain `settings` key (same
--      key-value pattern as every other business setting) — NOT a new column,
--      since `settings` is an EAV table (key/value rows), not one-column-per-field.
--
-- All statements are additive/idempotent and safe to run against a populated
-- database — nothing here can lose data.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1a. items.item_type: allow 'service' (for the tailoring system item) ─────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'items_item_type_check'
  ) THEN
    ALTER TABLE items DROP CONSTRAINT items_item_type_check;
  END IF;
  ALTER TABLE items ADD CONSTRAINT items_item_type_check
    CHECK (item_type IN ('finished', 'raw_material', 'service'));
END $$;

-- ── 1b. Seed the "Tailoring Services" system item used as the invoice_items
--       FK target for tailoring-order-derived invoices. is_active = FALSE so
--       it never appears in the item picker / inventory / stock screens.
INSERT INTO items (name, unit, item_type, gst_rate, hsn_code, is_active)
SELECT 'Tailoring Services', 'pcs', 'service', 5, '9988', FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM items WHERE name = 'Tailoring Services' AND item_type = 'service'
);

-- ── 1c. invoice_items.description_override — lets a tailoring-order-derived
--       invoice line show the actual design name instead of the generic
--       "Tailoring Services" system item name. NULL for every normal invoice.
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS description_override TEXT;

-- ── 1d. tailoring_orders.warehouse_id — invoices.warehouse_id is NOT NULL, but
--       tailoring_orders never had a warehouse concept (raw materials aren't
--       auto-deducted, so it was never needed). Add it nullable, backfill any
--       existing rows to the first active warehouse.
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
UPDATE tailoring_orders
SET warehouse_id = (SELECT id FROM warehouses WHERE is_active = TRUE ORDER BY name ASC LIMIT 1)
WHERE warehouse_id IS NULL;

-- ── 2. Purchase invoice number unique per supplier ────────────────────────────
-- Guarded: if duplicate (supplier_id, supplier_invoice_number) pairs already
-- exist on this database, the constraint is skipped (not silently forced) and
-- a NOTICE lists them — re-run this migration after cleaning up the data.
DO $$
DECLARE
  dupe RECORD;
  dupe_count INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_invoices_supplier_invnum_uniq'
  ) THEN
    FOR dupe IN
      SELECT supplier_id, supplier_invoice_number, COUNT(*) AS cnt
      FROM purchase_invoices
      WHERE supplier_invoice_number IS NOT NULL AND supplier_invoice_number <> ''
      GROUP BY supplier_id, supplier_invoice_number
      HAVING COUNT(*) > 1
    LOOP
      dupe_count := dupe_count + 1;
      RAISE NOTICE 'Duplicate purchase invoice number: supplier_id=%, supplier_invoice_number=%, count=%',
        dupe.supplier_id, dupe.supplier_invoice_number, dupe.cnt;
    END LOOP;

    IF dupe_count = 0 THEN
      ALTER TABLE purchase_invoices ADD CONSTRAINT purchase_invoices_supplier_invnum_uniq
        UNIQUE (supplier_id, supplier_invoice_number);
    ELSE
      RAISE NOTICE 'Skipped adding purchase_invoices_supplier_invnum_uniq — % duplicate pair(s) found above. Clean up data and re-run this migration.', dupe_count;
    END IF;
  END IF;
END $$;

-- ── 3. One-time data fix: sanitize an absolute-URL company_logo_path down to
--      a relative path (defensive — the code has always stored/rendered this
--      as relative, but a stale value from a prior deployment or manual DB
--      edit could still contain a hardcoded host).
UPDATE settings
SET value = regexp_replace(value, '^https?://[^/]+/', '')
WHERE key = 'company_logo_path' AND value ~ '^https?://';

-- ── 4. Discount scheme item/category scoping ──────────────────────────────────
-- No rows for a scheme in either table = applies to ALL items (backward
-- compatible default — every existing scheme has no rows here today).
CREATE TABLE IF NOT EXISTS discount_scheme_items (
  scheme_id  UUID NOT NULL REFERENCES discount_schemes(id) ON DELETE CASCADE,
  item_id    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  PRIMARY KEY (scheme_id, item_id)
);

CREATE TABLE IF NOT EXISTS discount_scheme_categories (
  scheme_id   UUID NOT NULL REFERENCES discount_schemes(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES item_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (scheme_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_discount_scheme_items_scheme ON discount_scheme_items(scheme_id);
CREATE INDEX IF NOT EXISTS idx_discount_scheme_categories_scheme ON discount_scheme_categories(scheme_id);
