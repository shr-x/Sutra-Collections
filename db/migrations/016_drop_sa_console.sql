-- ─────────────────────────────────────────────────────────────────────────────
-- 016_drop_sa_console.sql
--
-- Drops the tables created exclusively for the (now fully removed) Super
-- Admin console (app/sa-console-x7k2, lib/sa-auth.ts): its own auth table,
-- its "Update System" deploy-log table, and its manual stock-adjustment
-- log. Confirmed via full-repo grep that nothing outside the removed SA
-- console code ever referenced these three tables.
--
-- Deliberately NOT dropped: whatsapp_incoming_messages — the SA console's
-- WhatsApp Inbox viewer read from it, but the table is written by the main
-- app's own webhook (app/api/webhooks/whatsapp/route.ts) and stays fully
-- functional; it just has no in-app viewer anymore.
--
-- Idempotent: DROP TABLE IF EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS sa_update_log;
DROP TABLE IF EXISTS sa_stock_adjustments;
DROP TABLE IF EXISTS super_admins;
