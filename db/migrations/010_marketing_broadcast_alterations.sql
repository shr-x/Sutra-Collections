-- ─────────────────────────────────────────────────────────────────────────────
-- 010_marketing_broadcast_alterations.sql
--
-- Supports four features:
--   1. Tailor-facing alteration document — tailoring_alterations.tailor_notified_at
--      is a duplicate-send guard (set once the assigned tailor has been sent the
--      alteration document, so requestAlteration and assignTailor never both fire).
--   2. Discount scheme broadcast offer — discount_schemes.offer_image_path (banner)
--      + broadcast_sent_at (guard against re-broadcasting the same scheme on every
--      re-save); offer_broadcast_log records per-customer send outcomes.
--   3. Customer marketing opt-out — customers.marketing_opt_in (default TRUE) gates
--      ALL non-transactional sends (birthday, anniversary, offer broadcast).
--
-- All statements additive/idempotent; no rows deleted or updated, so no inbound
-- foreign keys are affected. Tailors already store a WhatsApp-capable phone
-- (tailors.phone, already used for sutra_tailor_assignment sends), so no new
-- tailor contact column is needed.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Item 3: marketing opt-out (default opted-in, matching existing behaviour) ──
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Item 1: tailor-notified guard on alterations ─────────────────────────────
ALTER TABLE tailoring_alterations ADD COLUMN IF NOT EXISTS tailor_notified_at TIMESTAMPTZ;

-- ── Item 2: broadcast offer fields on discount schemes ───────────────────────
ALTER TABLE discount_schemes ADD COLUMN IF NOT EXISTS offer_image_path TEXT;
ALTER TABLE discount_schemes ADD COLUMN IF NOT EXISTS broadcast_sent_at TIMESTAMPTZ;

-- ── Item 2: per-customer broadcast send log (mirrors greeting_log) ───────────
CREATE TABLE IF NOT EXISTS offer_broadcast_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id   UUID NOT NULL REFERENCES discount_schemes(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status      VARCHAR(10) NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error       TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_offer_broadcast_log_scheme ON offer_broadcast_log(scheme_id);
CREATE INDEX IF NOT EXISTS idx_offer_broadcast_log_customer ON offer_broadcast_log(customer_id);
