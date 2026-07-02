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
