-- ─────────────────────────────────────────────────────────────────────────────
-- 002_tailoring_lifecycle.sql
-- Tailoring order lifecycle + payment tracking overhaul.
--
-- Replaces the old 4-value `stage` ('placed','production','ready','delivered')
-- with a new `status` enum: in_progress -> ready_for_pickup -> picked_up -> delivered.
-- `stage` and `price` columns are left in place (unused by new code) rather than
-- dropped, so this migration is purely additive and safe to run against an
-- existing populated database — nothing here can lose data.
-- All statements are idempotent (IF NOT EXISTS / guarded DO blocks).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New status column (replaces `stage` going forward) ────────────────────
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS status VARCHAR(20);

-- Guard by constraint NAME, not pg_get_constraintdef() text — Postgres rewrites
-- "IN (...)" checks into "= ANY (ARRAY[...])" internally, so a LIKE '%IN%' text
-- match never fires and this would otherwise try to re-add the constraint (and
-- fail) on every subsequent migration run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tailoring_orders_status_check'
  ) THEN
    ALTER TABLE tailoring_orders ADD CONSTRAINT tailoring_orders_status_check
      CHECK (status IN ('in_progress', 'ready_for_pickup', 'picked_up', 'delivered'));
  END IF;
END $$;

-- Backfill status from the old stage column (one-time, safe to re-run —
-- only touches rows where status hasn't been set yet).
UPDATE tailoring_orders
SET status = CASE stage
  WHEN 'placed'     THEN 'in_progress'
  WHEN 'production'  THEN 'in_progress'
  WHEN 'ready'       THEN 'ready_for_pickup'
  WHEN 'delivered'   THEN 'delivered'
  ELSE 'in_progress'
END
WHERE status IS NULL;

ALTER TABLE tailoring_orders ALTER COLUMN status SET DEFAULT 'in_progress';
ALTER TABLE tailoring_orders ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tailoring_orders_status ON tailoring_orders(status);

-- ── 2. Payment tracking columns ───────────────────────────────────────────────
-- total_amount replaces `price` conceptually (editable, alterations adjust it).
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2);
UPDATE tailoring_orders SET total_amount = price WHERE total_amount IS NULL;
ALTER TABLE tailoring_orders ALTER COLUMN total_amount SET DEFAULT 0;
ALTER TABLE tailoring_orders ALTER COLUMN total_amount SET NOT NULL;

-- amount_paid is always recomputed as SUM(tailoring_payments.amount) — never
-- edited directly by any form. Column exists so list/detail views don't need a
-- live join on every read.
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0;

-- credit_amount = cumulative total ever pushed to customer dues via
-- "Mark Delivered (On Credit)" for this order. Additive across possible
-- multiple deliver-alter-redeliver cycles — never overwritten/reset, so the
-- original credit event is never silently lost.
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS credited_at TIMESTAMPTZ;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

-- ── 3. tailoring_payments — append-only advance/partial payment ledger ───────
CREATE TABLE IF NOT EXISTS tailoring_payments (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tailoring_order_id  UUID          NOT NULL REFERENCES tailoring_orders(id) ON DELETE CASCADE,
  amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_mode        VARCHAR(10)   NOT NULL CHECK (payment_mode IN ('cash', 'upi', 'card')),
  recorded_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  recorded_by         UUID          REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tailoring_payments_order ON tailoring_payments(tailoring_order_id);

-- ── 4. tailoring_alterations — full history of post-stitching change requests ─
CREATE TABLE IF NOT EXISTS tailoring_alterations (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tailoring_order_id  UUID          NOT NULL REFERENCES tailoring_orders(id) ON DELETE CASCADE,
  description         TEXT          NOT NULL,
  price_adjustment    NUMERIC(12,2) NOT NULL DEFAULT 0,
  requested_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  requested_by        UUID          REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tailoring_alterations_order ON tailoring_alterations(tailoring_order_id);

-- ── 5. Backfill amount_paid for any existing orders with an advance recorded
--       via the old system (none existed before this migration, so this is a
--       no-op today — kept for correctness/idempotency if re-run later).
UPDATE tailoring_orders o
SET amount_paid = COALESCE((
  SELECT SUM(p.amount) FROM tailoring_payments p WHERE p.tailoring_order_id = o.id
), 0);
