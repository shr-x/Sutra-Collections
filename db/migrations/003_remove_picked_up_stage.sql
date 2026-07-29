-- ─────────────────────────────────────────────────────────────────────────────
-- 003_remove_picked_up_stage.sql
-- Client feedback: the picked_up status added zero real-world value between
-- ready_for_pickup and delivered — staff never used it as a distinct step.
-- Removes it from the tailoring_orders.status enum. The production board's
-- "Unassigned" vs "In Production" split is a DISPLAY concern only (based on
-- tailor_id), not a new status value, so no other status column changes here.
--
-- Safe on a populated database: any existing 'picked_up' rows are moved to
-- 'ready_for_pickup' (they haven't been marked fully delivered, so this is the
-- correct, safe default — nothing is skipped or lost). No columns or tables
-- are dropped. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE tailoring_orders SET status = 'ready_for_pickup' WHERE status = 'picked_up';

-- Postgres has no ALTER CHECK — drop and recreate. This is naturally idempotent
-- (unlike a NOT EXISTS/pg_get_constraintdef guard, which is fragile: Postgres
-- rewrites "IN (...)" checks into "= ANY (ARRAY[...])" internally, so a text-based
-- existence guard can silently never match — see 002's fix for that exact bug).
ALTER TABLE tailoring_orders DROP CONSTRAINT IF EXISTS tailoring_orders_status_check;
ALTER TABLE tailoring_orders ADD CONSTRAINT tailoring_orders_status_check
  CHECK (status IN ('in_progress', 'ready_for_pickup', 'delivered'));
