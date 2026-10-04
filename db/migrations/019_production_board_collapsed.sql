-- ─────────────────────────────────────────────────────────────────────────────
-- 019_production_board_collapsed.sql
--
-- Persists which customer groups are collapsed on the Production Board, per
-- user and per column. A row means "collapsed"; no row means expanded (the
-- default). Keyed by (user, column, customer) so a customer's collapsed state
-- in one column never carries over to another column.
--
-- Purely additive; IF NOT EXISTS keeps it idempotent (migrate.ts re-runs every
-- file on each deploy).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS production_board_collapsed (
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  column_key    VARCHAR(20) NOT NULL
                CHECK (column_key IN ('unassigned', 'in_production', 'ready_for_pickup', 'delivered')),
  customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  collapsed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, column_key, customer_id)
);
