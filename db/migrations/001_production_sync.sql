-- ─────────────────────────────────────────────────────────────────────────────
-- production-sync.sql
-- Run this on any production DB that was initialized from schema.sql but is
-- missing columns / tables added during local development.
-- All statements are idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Safe to re-run as many times as needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 0. item_categories: item_type column ─────────────────────────────────────
-- item_categories was created without item_type; the API and item form both need it.
ALTER TABLE item_categories ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) NOT NULL DEFAULT 'finished';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'item_categories'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%item_type%'
  ) THEN
    ALTER TABLE item_categories ADD CONSTRAINT item_categories_item_type_check
      CHECK (item_type IN ('finished', 'raw_material'));
  END IF;
END $$;

-- ── 0b. item_units table ──────────────────────────────────────────────────────
-- Managed dropdown for item units (pcs, meters, kg, etc.).
CREATE TABLE IF NOT EXISTS item_units (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- Seed common units (idempotent)
INSERT INTO item_units (name) VALUES
  ('pcs'), ('meters'), ('kg'), ('grams'), ('liters'), ('pairs'), ('sets'), ('yards')
ON CONFLICT (name) DO NOTHING;

-- ── 1. Customer snapshot columns on invoices ──────────────────────────────────
-- Captured at invoice creation so reports survive customer edits / deletions.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name_snapshot  TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_gstin_snapshot TEXT;

-- ── 2. Customer snapshot columns on tailoring_orders ─────────────────────────
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS customer_name_snapshot  TEXT;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS customer_phone_snapshot TEXT;

-- ── 3. Low-stock alert dedup timestamp on items ───────────────────────────────
-- Prevents sending the same alert more than once per 24-hour window.
ALTER TABLE items ADD COLUMN IF NOT EXISTS last_low_stock_alert TIMESTAMPTZ;

-- ── 4. audit_log table ────────────────────────────────────────────────────────
-- Append-only trail of create/update/delete events across all entities.
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        REFERENCES users(id) ON DELETE SET NULL,
  action       VARCHAR(30) NOT NULL,
  entity_type  VARCHAR(50) NOT NULL,
  entity_id    UUID        NOT NULL,
  entity_label TEXT,
  old_value    TEXT,
  new_value    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created  ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity   ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user     ON audit_log(user_id);

-- ── 5. attendance table ───────────────────────────────────────────────────────
-- One row per (user, date) — upserted on every mark/unmark action.
CREATE TABLE IF NOT EXISTS attendance (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE        NOT NULL,
  status     VARCHAR(20) NOT NULL CHECK (status IN ('present','absent','half_day','leave')),
  marked_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

-- ── 6. payroll_runs table ─────────────────────────────────────────────────────
-- One row per (user, month, year) — upserted when admin runs payroll.
CREATE TABLE IF NOT EXISTS payroll_runs (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month            INT          NOT NULL CHECK (month BETWEEN 1 AND 12),
  year             INT          NOT NULL,
  base_salary      NUMERIC(12,2) NOT NULL DEFAULT 0,
  days_present     NUMERIC(5,1)  NOT NULL DEFAULT 0,
  half_days        NUMERIC(5,1)  NOT NULL DEFAULT 0,
  total_days       INT           NOT NULL DEFAULT 0,
  amount_paid      NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_entry_id UUID          REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, month, year)
);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_user  ON payroll_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_month ON payroll_runs(year, month);

-- ── 7. shop_anniversary_date settings key ────────────────────────────────────
-- Used by the daily cron to send shop anniversary WhatsApp greetings.
INSERT INTO settings (key, value)
VALUES ('shop_anniversary_date', '')
ON CONFLICT (key) DO NOTHING;

-- ── 8a. item_sizes / item_colors: sort_order column ─────────────────────────
ALTER TABLE item_sizes  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE item_colors ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ── 8b. suppliers.deleted_at ──────────────────────────────────────────────────
-- Soft-delete support for suppliers (mirrors customers.deleted_at pattern).
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── 9. Guard: columns already added in schema.sql — kept here for reference ──
-- (These are already idempotent in schema.sql; listed here so this file is a
--  complete single source of truth for what production needed.)
ALTER TABLE customers         ADD COLUMN IF NOT EXISTS date_of_birth      DATE;
ALTER TABLE customers         ADD COLUMN IF NOT EXISTS anniversary_date   DATE;
ALTER TABLE customers         ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMPTZ;
ALTER TABLE users             ADD COLUMN IF NOT EXISTS is_active          BOOLEAN       NOT NULL DEFAULT TRUE;
ALTER TABLE users             ADD COLUMN IF NOT EXISTS base_salary        NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tailoring_orders  ADD COLUMN IF NOT EXISTS batch_id           UUID;
ALTER TABLE invoices          ADD COLUMN IF NOT EXISTS last_reminder_sent DATE;
ALTER TABLE invoices          ADD COLUMN IF NOT EXISTS store_credit_used  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices          ADD COLUMN IF NOT EXISTS loyalty_points_redeemed INT   NOT NULL DEFAULT 0;
ALTER TABLE invoices          ADD COLUMN IF NOT EXISTS scheme_discount_amount  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices          ADD COLUMN IF NOT EXISTS loyalty_discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE items             ADD COLUMN IF NOT EXISTS last_low_stock_alert    TIMESTAMPTZ;

-- ── 10. tailoring_orders: group_number + suffix (grouped order display) ───────
-- group_number = the base TO/YYYY-YY/NNNN number shared by all items in a booking session
-- suffix = A, B, C... appended to form the full order_number (e.g. "TO/2026-27/0029-A")
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS group_number TEXT;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS suffix TEXT;
CREATE INDEX IF NOT EXISTS idx_tailoring_orders_group ON tailoring_orders(group_number);

-- ── 10b. Fix bad records where group_number was stored as a plain integer ─────
-- Earlier code used a separate TG counter (1, 2, 3...) instead of the TO number.
-- Step 1: Set group_number = first order's TO number for each bad integer group
UPDATE tailoring_orders AS t
SET group_number = subq.canonical_gn
FROM (
  SELECT DISTINCT ON (group_number)
    group_number AS bad_gn,
    order_number AS canonical_gn
  FROM tailoring_orders
  WHERE group_number ~ '^\d+$' AND group_number IS NOT NULL
  ORDER BY group_number, created_at ASC
) AS subq
WHERE t.group_number = subq.bad_gn
  AND t.group_number ~ '^\d+$';

-- Step 2: Append suffix to order_number for any order that doesn't already have it
-- (safe to re-run: the NOT SIMILAR TO guard prevents double-suffixing)
UPDATE tailoring_orders
SET order_number = group_number || '-' || suffix
WHERE group_number IS NOT NULL
  AND suffix IS NOT NULL
  AND group_number LIKE 'TO/%'
  AND order_number NOT SIMILAR TO '%-[A-Z]';

-- ── 11. Normalize absolute image URLs to root-relative paths ─────────────────
-- Earlier uploads may have stored absolute URLs (e.g. http://34.180.49.56:3000/uploads/...)
-- instead of root-relative paths (/uploads/...). Strip the scheme+host prefix so
-- images load correctly regardless of domain (incl. Cloudflare Tunnel HTTPS).

UPDATE items
SET photo_url = REGEXP_REPLACE(photo_url, '^https?://[^/]+', '')
WHERE photo_url LIKE 'http://%' OR photo_url LIKE 'https://%';

UPDATE designs
SET photo_path = REGEXP_REPLACE(
    REGEXP_REPLACE(photo_path, '^https?://[^/]+/', ''),
    '^/', ''
)
WHERE photo_path LIKE 'http://%' OR photo_path LIKE 'https://%';

UPDATE settings
SET value = REGEXP_REPLACE(value, '^https?://[^/]+', '')
WHERE key = 'company_logo_path'
  AND (value LIKE 'http://%' OR value LIKE 'https://%');

-- ── 12. Backfill default size/color for items that have none ─────────────────
-- Any item with 0 sizes gets "Regular"; any item with 0 colors gets "Default".
-- These are the implicit defaults every non-variant product should show (1S / 1C).

INSERT INTO item_sizes (item_id, size_name, is_default, sort_order)
SELECT i.id, 'Regular', true, 0
FROM items i
WHERE NOT EXISTS (SELECT 1 FROM item_sizes s WHERE s.item_id = i.id);

INSERT INTO item_colors (item_id, color_name, is_default, sort_order)
SELECT i.id, 'Default', true, 0
FROM items i
WHERE NOT EXISTS (SELECT 1 FROM item_colors c WHERE c.item_id = i.id);

-- ── 13. One-time cleanup: merge duplicate items (same name, case-insensitive) ──
-- Keeps the earliest-created row per name, moves variants/stock/invoice refs onto
-- it, then deletes the duplicates. RAISE NOTICE lines report what got merged.
DO $$
DECLARE
  norm_name  TEXT;
  canonical_id UUID;
  dup_id     UUID;
  next_sort  INT;
BEGIN
  FOR norm_name IN
    SELECT LOWER(TRIM(name))
    FROM items
    GROUP BY LOWER(TRIM(name))
    HAVING COUNT(*) > 1
    ORDER BY 1
  LOOP
    SELECT id INTO canonical_id FROM items
    WHERE LOWER(TRIM(name)) = norm_name
    ORDER BY id ASC LIMIT 1;

    FOR dup_id IN
      SELECT id FROM items
      WHERE LOWER(TRIM(name)) = norm_name AND id <> canonical_id
    LOOP
      RAISE NOTICE 'Merging duplicate "%" (id=%) into canonical (id=%)',
        norm_name, dup_id, canonical_id;

      -- item_variants (legacy system)
      UPDATE item_variants SET item_id = canonical_id WHERE item_id = dup_id;

      -- item_sizes: insert missing sizes onto canonical, then delete from dup
      SELECT COALESCE(MAX(sort_order), -1) + 1 INTO next_sort
      FROM item_sizes WHERE item_id = canonical_id;

      INSERT INTO item_sizes (item_id, size_name, is_default, sort_order)
      SELECT canonical_id, s.size_name, FALSE,
             next_sort + (ROW_NUMBER() OVER (ORDER BY s.sort_order))::int - 1
      FROM item_sizes s
      WHERE s.item_id = dup_id
        AND NOT EXISTS (
          SELECT 1 FROM item_sizes e
          WHERE e.item_id = canonical_id
            AND LOWER(TRIM(e.size_name)) = LOWER(TRIM(s.size_name))
        );

      DELETE FROM item_sizes WHERE item_id = dup_id;

      -- item_colors: same pattern
      SELECT COALESCE(MAX(sort_order), -1) + 1 INTO next_sort
      FROM item_colors WHERE item_id = canonical_id;

      INSERT INTO item_colors (item_id, color_name, is_default, sort_order)
      SELECT canonical_id, c.color_name, FALSE,
             next_sort + (ROW_NUMBER() OVER (ORDER BY c.sort_order))::int - 1
      FROM item_colors c
      WHERE c.item_id = dup_id
        AND NOT EXISTS (
          SELECT 1 FROM item_colors e
          WHERE e.item_id = canonical_id
            AND LOWER(TRIM(e.color_name)) = LOWER(TRIM(c.color_name))
        );

      DELETE FROM item_colors WHERE item_id = dup_id;

      -- stock rows are independent transactions — just reroute
      UPDATE stock SET item_id = canonical_id WHERE item_id = dup_id;

      -- invoice references
      UPDATE invoice_items SET item_id = canonical_id WHERE item_id = dup_id;
      UPDATE purchase_invoice_items SET item_id = canonical_id WHERE item_id = dup_id;
      UPDATE stock_movements SET item_id = canonical_id WHERE item_id = dup_id;
      UPDATE sticker_codes SET item_id = canonical_id WHERE item_id = dup_id;
      UPDATE quotation_items SET item_id = canonical_id WHERE item_id = dup_id;
      UPDATE credit_note_items SET item_id = canonical_id WHERE item_id = dup_id;
      UPDATE debit_note_items SET item_id = canonical_id WHERE item_id = dup_id;
      UPDATE discount_schemes SET buy_item_id = canonical_id WHERE buy_item_id = dup_id;
      UPDATE discount_schemes SET get_item_id = canonical_id WHERE get_item_id = dup_id;
      UPDATE sa_stock_adjustments SET item_id = canonical_id WHERE item_id = dup_id;

      DELETE FROM items WHERE id = dup_id;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'Duplicate item cleanup complete.';
END $$;

-- ── 14b. tailoring_orders: gst_rate column ───────────────────────────────────
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0;

-- ── 15. Sticker codes — per-unit labels generated on purchase invoice save ────
CREATE SEQUENCE IF NOT EXISTS sticker_code_seq;

CREATE TABLE IF NOT EXISTS sticker_codes (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT         NOT NULL UNIQUE,
  item_id             UUID         NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  purchase_invoice_id UUID         NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  size_id             UUID         REFERENCES item_sizes(id) ON DELETE SET NULL,
  color_id            UUID         REFERENCES item_colors(id) ON DELETE SET NULL,
  price               NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sticker_codes_purchase ON sticker_codes(purchase_invoice_id);
CREATE INDEX IF NOT EXISTS idx_sticker_codes_item     ON sticker_codes(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sticker_codes_code ON sticker_codes(code);

-- ── 14. Fix design records where name = company name (data bug) ───────────────
-- If a design's name matches the company name setting and the category has the
-- actual design name, use the category as the canonical name.
DO $$
DECLARE
  co_name TEXT;
  fixed_count INT;
BEGIN
  SELECT value INTO co_name FROM settings WHERE key = 'company_name';
  IF co_name IS NOT NULL AND TRIM(co_name) != '' THEN
    UPDATE designs
    SET name = category
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(co_name))
      AND category IS NOT NULL
      AND TRIM(category) != ''
      AND LOWER(TRIM(category)) <> LOWER(TRIM(co_name));
    GET DIAGNOSTICS fixed_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % design record(s) whose name was mistakenly set to company name.', fixed_count;
  END IF;
END $$;
