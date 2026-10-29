-- ─────────────────────────────────────────────────────────────────────────────
-- 022_update_requests.sql
--
-- Request queue between the SHRX console and the updater container.
-- The web app NEVER runs shell/docker commands: SHRX only inserts a row here;
-- the updater (which alone has Docker access) polls, does the work, and
-- writes status + log lines back. Purely additive; safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS update_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by  TEXT NOT NULL,                 -- 'SHRX console (ip)' — display only
  action        TEXT NOT NULL CHECK (action IN ('check', 'update', 'rollback')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'rolled_back', 'refused', 'expired')),
  log           TEXT NOT NULL DEFAULT '',
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  from_commit   TEXT,
  to_commit     TEXT,
  backup_file   TEXT,
  error         TEXT,
  needs_manual_restart BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_update_requests_requested ON update_requests (requested_at DESC);

-- At most ONE update/rollback queued or running at any time — enforced by the
-- database, so two clicks (or two browsers) can't both get in.
CREATE UNIQUE INDEX IF NOT EXISTS uq_update_requests_one_active
  ON update_requests ((TRUE))
  WHERE status IN ('pending', 'running') AND action IN ('update', 'rollback');

-- Single-row heartbeat + "what's new" report written by the updater.
CREATE TABLE IF NOT EXISTS updater_status (
  id                 INT PRIMARY KEY CHECK (id = 1),
  last_seen          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  running_commit     TEXT,
  running_subject    TEXT,
  running_date       TEXT,
  origin_commit      TEXT,
  origin_subject     TEXT,
  origin_date        TEXT,
  behind             INT,
  new_commits        TEXT,      -- one "hash<TAB>date<TAB>subject" per line
  previous_commit    TEXT,      -- commit of the image tagged :previous
  previous_available BOOLEAN NOT NULL DEFAULT FALSE,
  last_fetch_at      TIMESTAMPTZ,
  last_fetch_error   TEXT,
  disk_free_gb       NUMERIC(10,1),
  note               TEXT
);
