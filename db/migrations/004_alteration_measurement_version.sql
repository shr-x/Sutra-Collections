-- ─────────────────────────────────────────────────────────────────────────────
-- 004_alteration_measurement_version.sql
-- Links each alteration to the new measurement_versions row created when it
-- was requested, so staff can see exactly which measurement set an alteration
-- introduced. Purely additive — safe on a populated database.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE tailoring_alterations
  ADD COLUMN IF NOT EXISTS measurement_version_id UUID REFERENCES measurement_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tailoring_alterations_measurement_version
  ON tailoring_alterations(measurement_version_id);
