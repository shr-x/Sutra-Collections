-- ─────────────────────────────────────────────────────────────────────────────
-- 013_customer_source.sql
--
-- Adds a `source` column to customers so the new "Add Walk-in Customer" entry
-- point (Customers page) can be told apart from every other way a customer
-- record gets created. This is what createWalkInCustomerAction checks before
-- firing the one-time "thanks for visiting" WhatsApp template — the send must
-- never fire from the regular Add Customer / quick-create / import flows.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, existing rows default to 'standard'.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE customers ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'standard';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_source_check'
  ) THEN
    ALTER TABLE customers ADD CONSTRAINT customers_source_check
      CHECK (source IN ('standard', 'walk_in'));
  END IF;
END $$;
