-- ─────────────────────────────────────────────────────────────────────────────
-- 009_design_gst_rate.sql
--
-- Adds a per-design GST rate so staff can set the correct rate (5/12/18/28%)
-- per tailoring design in the catalog, instead of every new tailoring order
-- silently defaulting to tailoring_orders.gst_rate's DB default of 0 (no
-- code path ever set it explicitly before this). New orders now copy their
-- design's gst_rate at creation time (app/(auth)/tailoring/actions.ts).
--
-- Default of 5% matches the existing hardcoded rate used for the
-- "Tailoring Services" system item (lib/tailoring-invoice.ts) — chosen so
-- existing designs get a sensible non-zero rate rather than silently
-- inheriting the old 0% behavior. Additive/idempotent — safe to run against
-- a populated database. Does NOT touch existing tailoring_orders rows —
-- their gst_rate (whatever it already is) is a locked-in historical value
-- for orders already created/invoiced and is left untouched.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE designs ADD COLUMN IF NOT EXISTS gst_rate NUMERIC(5,2) NOT NULL DEFAULT 5;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'designs_gst_rate_check'
  ) THEN
    ALTER TABLE designs ADD CONSTRAINT designs_gst_rate_check
      CHECK (gst_rate IN (0, 5, 12, 18, 28));
  END IF;
END $$;
