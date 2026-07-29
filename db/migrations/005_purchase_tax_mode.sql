-- ─────────────────────────────────────────────────────────────────────────────
-- 005_purchase_tax_mode.sql
-- Adds a tax-inclusive/exclusive toggle to purchase invoices, stored on the
-- header (not per line item). Defaults to TRUE (tax-inclusive) because that's
-- what lib/gst.ts's calcLine() has always done by default for purchases
-- (isScheme was never passed, so it always took the inclusive branch) — this
-- preserves existing invoices' calculated totals exactly as they already are.
-- Purely additive — safe on a populated database.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE purchase_invoices
  ADD COLUMN IF NOT EXISTS is_tax_inclusive BOOLEAN NOT NULL DEFAULT TRUE;
