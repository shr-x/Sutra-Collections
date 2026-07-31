-- ─────────────────────────────────────────────────────────────────────────────
-- 007_tailoring_supplementary_invoice.sql
--
-- Supports supplementary invoices for tailoring alterations that increase
-- total_amount AFTER the order's original GST invoice is locked (>1hr old).
-- Rather than touching the locked invoice, a new, normal invoice is created
-- for just the price DIFFERENCE and linked back to the original via this
-- column — so a running "already invoiced" total can be computed as
-- original.grand_total + SUM(supplementary invoices pointing at it), which
-- lets a THIRD alteration bill only the further delta instead of re-billing
-- amounts already covered by an earlier supplementary invoice.
--
-- Additive/idempotent — safe to run against a populated database.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS supplementary_of_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_supplementary_of ON invoices(supplementary_of_invoice_id) WHERE supplementary_of_invoice_id IS NOT NULL;
