-- ─────────────────────────────────────────────────────────────────────────────
-- 018_sidebar_order.sql
--
-- Per-user custom ordering of the sidebar's top-level menu items (drag-to-
-- reorder). NULL means "use the default order" — nothing to backfill.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS sidebar_order JSONB;
