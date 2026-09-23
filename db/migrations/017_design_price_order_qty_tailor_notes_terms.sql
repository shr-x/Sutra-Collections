-- ─────────────────────────────────────────────────────────────────────────────
-- 017_design_price_order_qty_tailor_notes_terms.sql
--
-- Four independent additions bundled together:
--  1. designs.price            — optional fixed base price per design, used to
--                                 prefill (but not lock) the New Tailoring
--                                 Order price field.
--  2. tailoring_orders.quantity — defaults to 1; total_amount is computed as
--                                 price * quantity at order creation.
--  3. tailoring_orders.notes_tailor — tailor-only notes, kept separate from
--                                 the existing customer-facing `notes` column.
--  4. settings: split the single 'terms_and_conditions' key into
--     'retail_terms_and_conditions' and 'tailoring_terms_and_conditions',
--     seeded from the existing value so nothing is lost.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING throughout.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE designs ADD COLUMN IF NOT EXISTS price NUMERIC(12,2);

ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE tailoring_orders ADD COLUMN IF NOT EXISTS notes_tailor TEXT;

INSERT INTO settings (key, value)
SELECT 'retail_terms_and_conditions', value FROM settings WHERE key = 'terms_and_conditions'
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value)
SELECT 'tailoring_terms_and_conditions', value FROM settings WHERE key = 'terms_and_conditions'
ON CONFLICT (key) DO NOTHING;
