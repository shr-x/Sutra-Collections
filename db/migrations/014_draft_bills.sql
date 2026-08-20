-- ─────────────────────────────────────────────────────────────────────────────
-- 014_draft_bills.sql
--
-- "Save as Draft" on the billing screen: a scratch space for an in-progress
-- bill that must NEVER be treated as a real transaction. Deliberately its own
-- table, not a row in `invoices` — draft_bills is never joined into reports,
-- GST filing, or stock, so there's no risk of a half-finished cart leaking
-- into financial data.
--
-- The full builder state (cart lines, discount, payment prefs, customer) is
-- stored as one JSONB payload and reloaded verbatim into the billing screen
-- on recall — mirrors the shape InvoiceBuilder already POSTs to
-- createInvoiceAction, so recall is just "load this JSON back into state".
--
-- label/customer_id/warehouse_id/item_count/total_amount are denormalized out
-- of the payload purely so the Drafts list can render without unpacking JSONB
-- per row.
--
-- No expiry/cleanup job yet (not required), but created_at is indexed so a
-- future "delete drafts older than N days" job can add on cheaply.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS draft_bills (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label         VARCHAR(120) NOT NULL,
  warehouse_id  UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  item_count    INTEGER NOT NULL DEFAULT 0,
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  payload       JSONB NOT NULL,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_draft_bills_created_at ON draft_bills(created_at);
