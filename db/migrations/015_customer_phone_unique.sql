-- ─────────────────────────────────────────────────────────────────────────────
-- 015_customer_phone_unique.sql
--
-- Enforces one active customer per phone number. Partial index: excludes
-- soft-deleted rows (deleted_at IS NOT NULL) — a phone frees up once its
-- customer is deleted — and NULL/empty phones (walk-ins with no number on
-- file are allowed to share "no phone").
--
-- Safe to apply: the one pre-existing production duplicate (7 rows sharing a
-- phone, all test data) was resolved manually before this migration was
-- written — 5 were already soft-deleted, and the more recently created of
-- the 2 remaining active duplicates was soft-deleted (not hard-deleted; its
-- invoice history is preserved via the customer FK). If this migration ever
-- fails with a unique-violation in the future, that means a NEW active
-- duplicate has appeared — find it with:
--   SELECT phone, COUNT(*) FROM customers
--   WHERE phone IS NOT NULL AND phone <> '' AND deleted_at IS NULL
--   GROUP BY phone HAVING COUNT(*) > 1;
-- and resolve it manually (do not auto-merge/delete) before re-running.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_unique
  ON customers (phone)
  WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone <> '';
