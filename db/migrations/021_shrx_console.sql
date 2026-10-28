-- ─────────────────────────────────────────────────────────────────────────────
-- 021_shrx_console.sql
--
-- Tables for the SHRX owner console (/shrx) and its logs. Purely additive:
-- new tables + IF NOT EXISTS everywhere, safe to re-run on every deploy.
-- ─────────────────────────────────────────────────────────────────────────────

-- Every SHRX action (login, logout, deletes, user changes, dues clears…).
CREATE TABLE IF NOT EXISTS shrx_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action      TEXT NOT NULL,
  target      TEXT,
  details     JSONB,
  ip          TEXT
);
CREATE INDEX IF NOT EXISTS idx_shrx_audit_created ON shrx_audit_log (created_at DESC);

-- Password attempts, for per-IP lockout (5 failures → 15 min) and the record
-- of failed attempts. The password itself is never stored.
CREATE TABLE IF NOT EXISTS shrx_login_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip          TEXT NOT NULL,
  success     BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shrx_attempts_ip ON shrx_login_attempts (ip, created_at DESC);

-- Every sendWhatsAppTemplate attempt (lib/whatsapp.ts). customer_id has no
-- FK on purpose: the log must survive customer/order deletes untouched.
CREATE TABLE IF NOT EXISTS whatsapp_message_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  customer_id    UUID,
  phone          TEXT,
  template_name  TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error_code     TEXT,
  error_message  TEXT,
  entity_type    TEXT,
  entity_id      UUID,
  entity_label   TEXT,
  message_id     TEXT
);
CREATE INDEX IF NOT EXISTS idx_wa_log_created  ON whatsapp_message_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_log_status   ON whatsapp_message_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_log_customer ON whatsapp_message_log (customer_id);

-- Errors that used to be swallowed in best-effort sync paths (payment ↔
-- invoice sync, tailoring invoice creation/amend). Shown in SHRX → Failed updates.
CREATE TABLE IF NOT EXISTS app_error_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  context      TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    UUID,
  message      TEXT NOT NULL,
  details      JSONB
);
CREATE INDEX IF NOT EXISTS idx_app_error_created ON app_error_log (created_at DESC);

-- users.is_active already exists on live (added with Staff Ops); kept here so
-- a fresh database matches. No-op when present.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
