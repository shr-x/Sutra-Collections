#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Sutra Collections — updater (runs INSIDE its own container, never on the host)
#
# Deploys ONLY when the SHRX console queues a request in update_requests.
# A push to main no longer deploys by itself; this loop only `git fetch`es to
# report what's new.
#
# Safety rules:
#   - No value from the database is ever put into a shell command. The only
#     fields read from a request are its id (a UUID, validated) and action
#     (checked against a fixed list). Everything else is a constant below.
#   - Log/status text goes back to Postgres through psql variables (:'var'),
#     which psql quotes — never by string-building SQL.
#   - One request at a time (single loop + a DB unique index on active rows).
#
# Host-side requirements (see UPDATER.md): the project directory is mounted
# at DAEMON_PROJECT_DIR — the SAME path the Docker daemon uses for it — so the
# relative bind mounts in docker-compose.prod.yml resolve to real host paths.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# ── Fixed constants ──────────────────────────────────────────────────────────
BRANCH="main"
COMPOSE_FILE_NAME="docker-compose.prod.yml"
APP_SERVICE="app"
NGINX_SERVICE="nginx"
DB_SERVICE="db"
ALLOWED_ORIGIN="https://github.com/shr-x/Sutra-Collections.git"
HEALTH_TIMEOUT=180          # seconds
KEEP_PRE_UPDATE_BACKUPS=5
POLL_SECONDS=10
FETCH_EVERY_SECONDS=300

# ── Install-time configuration (set once in .env by the operator, never by SHRX) ─
REPO_DIR="${DAEMON_PROJECT_DIR:?DAEMON_PROJECT_DIR must be set (see UPDATER.md)}"
PROJECT="${COMPOSE_PROJECT:?COMPOSE_PROJECT must be set (see UPDATER.md)}"
MIN_FREE_GB="${UPDATER_MIN_FREE_GB:-5}"
# Test rigs point origin at a local bare repo; production uses ALLOWED_ORIGIN.
ORIGIN_URL="${UPDATER_ORIGIN_URL:-$ALLOWED_ORIGIN}"
: "${DATABASE_URL:?DATABASE_URL must be set}"

COMPOSE_FILE="$REPO_DIR/$COMPOSE_FILE_NAME"
APP_IMAGE="${PROJECT}-${APP_SERVICE}"
BACKUP_DIR="$REPO_DIR/backups"

[[ "$PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo "COMPOSE_PROJECT has invalid characters"; exit 1; }
[[ "$MIN_FREE_GB" =~ ^[0-9]+$ ]] || { echo "UPDATER_MIN_FREE_GB must be a whole number"; exit 1; }

# git inside a Linux container over a Windows (NTFS) bind mount: ignore file
# mode bits and never rewrite line endings, so a clean checkout stays clean.
git_() { git -C "$REPO_DIR" -c core.fileMode=false -c core.autocrlf=false "$@"; }
git config --global --add safe.directory "$REPO_DIR" >/dev/null 2>&1 || true

compose() { docker compose -p "$PROJECT" -f "$COMPOSE_FILE" --project-directory "$REPO_DIR" "$@"; }

# ── Database helpers ─────────────────────────────────────────────────────────
# SQL text comes from this script only; values are passed as psql variables.
sql() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qtAX "$@"; }

REQ=""            # id of the request being processed
log() {
  local line
  line="[$(date '+%Y-%m-%d %H:%M:%S')] $*"
  echo "$line"
  if [ -n "$REQ" ]; then
    printf '%s\n' "UPDATE update_requests SET log = log || :'line' || E'\n' WHERE id = :'id';" \
      | sql -v id="$REQ" -v line="$line" >/dev/null 2>&1 || true
  fi
}

set_req() {  # set_req column value   (column is a constant from this script)
  local col="$1" val="$2"
  case "$col" in from_commit|to_commit|backup_file|error|status) ;; *) return 1 ;; esac
  printf '%s\n' "UPDATE update_requests SET ${col} = :'v' WHERE id = :'id';" \
    | sql -v id="$REQ" -v v="$val" >/dev/null
}

finish() {  # finish status [error]
  local status="$1" err="${2:-}"
  printf '%s\n' "UPDATE update_requests SET status = :'s', error = NULLIF(:'e',''), finished_at = NOW() WHERE id = :'id';" \
    | sql -v id="$REQ" -v s="$status" -v e="$err" >/dev/null
  log "=== Finished: ${status}${err:+ — $err} ==="
}

heartbeat() {
  printf '%s\n' "INSERT INTO updater_status (id, last_seen) VALUES (1, NOW())
                 ON CONFLICT (id) DO UPDATE SET last_seen = NOW();" | sql >/dev/null 2>&1
}

free_gb() {  # free space (GB, 1 decimal) on the filesystem holding $1
  df -Pk "$1" 2>/dev/null | awk 'NR==2 { printf "%.1f", $4/1048576 }'
}

# ── Status report ("what's new") ─────────────────────────────────────────────
refresh_status() {
  local fetch_err="" ;
  if ! out=$(git_ fetch --quiet origin "$BRANCH" 2>&1); then fetch_err="git fetch failed: ${out:0:300}"; fi
  local head_c head_s head_d orig_c orig_s orig_d behind new prev_c prev_avail disk
  head_c=$(git_ rev-parse HEAD 2>/dev/null)
  head_s=$(git_ log -1 --format=%s HEAD 2>/dev/null)
  head_d=$(git_ log -1 --format=%cI HEAD 2>/dev/null)
  orig_c=$(git_ rev-parse "origin/$BRANCH" 2>/dev/null)
  orig_s=$(git_ log -1 --format=%s "origin/$BRANCH" 2>/dev/null)
  orig_d=$(git_ log -1 --format=%cI "origin/$BRANCH" 2>/dev/null)
  behind=$(git_ rev-list --count "HEAD..origin/$BRANCH" 2>/dev/null || echo 0)
  new=$(git_ log --format='%h%x09%cI%x09%s' "HEAD..origin/$BRANCH" 2>/dev/null | head -50)
  prev_c=$(docker image inspect -f '{{ index .Config.Labels "sutra.commit" }}' "$APP_IMAGE:previous" 2>/dev/null || true)
  if docker image inspect "$APP_IMAGE:previous" >/dev/null 2>&1; then prev_avail=true; else prev_avail=false; fi
  disk=$(free_gb /)
  printf '%s\n' "INSERT INTO updater_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
    UPDATE updater_status SET last_seen = NOW(),
      running_commit = :'hc', running_subject = :'hs', running_date = :'hd',
      origin_commit = NULLIF(:'oc',''), origin_subject = NULLIF(:'os',''), origin_date = NULLIF(:'od',''),
      behind = NULLIF(:'b','')::int, new_commits = :'n',
      previous_commit = NULLIF(:'pc',''), previous_available = :'pa'::boolean,
      last_fetch_at = NOW(), last_fetch_error = NULLIF(:'fe',''), disk_free_gb = NULLIF(:'df','')::numeric
    WHERE id = 1;" \
    | sql -v hc="$head_c" -v hs="$head_s" -v hd="$head_d" -v oc="$orig_c" -v os="$orig_s" -v od="$orig_d" \
          -v b="$behind" -v n="$new" -v pc="$prev_c" -v pa="$prev_avail" -v fe="$fetch_err" -v df="$disk" >/dev/null 2>&1
}

# ── Preflight ────────────────────────────────────────────────────────────────
app_container() { compose ps -q "$APP_SERVICE" 2>/dev/null | head -1; }

preflight() {
  local disk_root disk_repo
  disk_root=$(free_gb /); disk_repo=$(free_gb "$REPO_DIR")
  log "Free disk: Docker storage ${disk_root} GB, project drive ${disk_repo} GB (minimum ${MIN_FREE_GB} GB)."
  if awk -v a="$disk_root" -v b="$disk_repo" -v m="$MIN_FREE_GB" 'BEGIN { exit !(a < m || b < m) }'; then
    REFUSE="Not enough free disk space: need at least ${MIN_FREE_GB} GB (Docker storage ${disk_root} GB, project drive ${disk_repo} GB). Free some space and try again."
    return 1
  fi
  local origin; origin=$(git_ remote get-url origin 2>/dev/null)
  if [ "$origin" != "$ORIGIN_URL" ]; then REFUSE="Repository origin is '$origin', expected '$ORIGIN_URL'."; return 1; fi
  local branch; branch=$(git_ rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ "$branch" != "$BRANCH" ]; then REFUSE="Checked-out branch is '$branch', expected '$BRANCH'."; return 1; fi
  local dirty; dirty=$(git_ status --porcelain --untracked-files=no 2>&1)
  if [ -n "$dirty" ]; then REFUSE="The project folder has local changes to tracked files — refusing to update over them: $(echo "$dirty" | head -5 | tr '\n' ' ')"; return 1; fi
  # Right stack? The running db must belong to $PROJECT (a wrong project name
  # would make compose start a brand-new, empty database).
  if [ -z "$(compose ps -q "$DB_SERVICE" 2>/dev/null)" ]; then REFUSE="No running '$DB_SERVICE' container in compose project '$PROJECT' — check COMPOSE_PROJECT."; return 1; fi
  local cid; cid=$(app_container)
  if [ -z "$cid" ]; then REFUSE="No '$APP_SERVICE' container in compose project '$PROJECT'."; return 1; fi
  # Right path? The app's backups bind mount must come from $REPO_DIR/backups.
  local src; src=$(docker inspect -f '{{ range .Mounts }}{{ if eq .Destination "/app/backups" }}{{ .Source }}{{ end }}{{ end }}' "$cid")
  if [ -n "$src" ] && [ "${src%/}" != "${REPO_DIR%/}/backups" ]; then
    REFUSE="DAEMON_PROJECT_DIR is '$REPO_DIR' but the running app mounts backups from '$src'. Set DAEMON_PROJECT_DIR to '${src%/backups}' in .env and restart the updater."
    return 1
  fi
  return 0
}

# ── Steps ────────────────────────────────────────────────────────────────────
backup_db() {   # sets BACKUP_FILE
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/pre-update_$(date '+%Y%m%d_%H%M%S')_$(git_ rev-parse --short HEAD).sql"
  log "Backing up the database to backups/$(basename "$BACKUP_FILE") …"
  if ! pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>"$BACKUP_FILE.err"; then
    log "pg_dump failed: $(head -c 500 "$BACKUP_FILE.err")"; rm -f "$BACKUP_FILE" "$BACKUP_FILE.err"; return 1
  fi
  rm -f "$BACKUP_FILE.err"
  if [ ! -s "$BACKUP_FILE" ] || ! tail -n 5 "$BACKUP_FILE" | grep -q "PostgreSQL database dump complete"; then
    log "Backup is empty or incomplete."; return 1
  fi
  log "Backup OK ($(du -h "$BACKUP_FILE" | cut -f1))."
  # Keep only the newest $KEEP_PRE_UPDATE_BACKUPS pre-update dumps (daily backups untouched).
  ls -1t "$BACKUP_DIR"/pre-update_*.sql 2>/dev/null | tail -n +$((KEEP_PRE_UPDATE_BACKUPS + 1)) | while read -r f; do rm -f -- "$f"; done
  set_req backup_file "backups/$(basename "$BACKUP_FILE")"
  return 0
}

tag_previous() {  # tag the image the app is running right now as :previous
  local cid img commit
  cid=$(app_container); img=$(docker inspect -f '{{ .Image }}' "$cid")
  commit=$(git_ rev-parse HEAD)
  # Labels can't be added to an existing image, so the commit is recorded by
  # building a 1-line image FROM it — cheap, layers are shared.
  printf 'FROM %s\nLABEL sutra.commit=%s\n' "$img" "$commit" | docker build -q -t "$APP_IMAGE:previous" - >/dev/null \
    || { log "Could not tag the running image as previous."; return 1; }
  log "Current version ${commit:0:8} saved as $APP_IMAGE:previous."
}

wait_healthy() {  # wait_healthy <since-timestamp>
  local since="$1" deadline=$(( $(date +%s) + HEALTH_TIMEOUT )) cid logs
  log "Waiting up to ${HEALTH_TIMEOUT}s for the app to start and finish migrations…"
  while [ "$(date +%s)" -lt "$deadline" ]; do
    cid=$(app_container)
    if [ -n "$cid" ]; then
      logs=$(docker logs --since "$since" "$cid" 2>&1)
      if echo "$logs" | grep -q "Migration failed"; then
        log "App log shows 'Migration failed':"; echo "$logs" | grep -A3 "Migration failed" | head -8 | while read -r l; do log "  $l"; done
        return 1
      fi
      if echo "$logs" | grep -q "All migrations applied" && curl -fsS -o /dev/null --max-time 5 "http://${APP_SERVICE}:3000/login"; then
        log "App is healthy (migrations applied, /login responds)."
        return 0
      fi
    fi
    sleep 5
  done
  log "App did not become healthy within ${HEALTH_TIMEOUT}s. Last log lines:"
  docker logs --tail 15 "$(app_container)" 2>&1 | while read -r l; do log "  $l"; done
  return 1
}

recreate_app() {
  local since; since=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  log "Recreating '$APP_SERVICE' (db and updater are not touched)…"
  compose up -d --no-deps --no-build "$APP_SERVICE" 2>&1 | while read -r l; do log "  $l"; done
  log "Restarting '$NGINX_SERVICE'…"
  compose restart "$NGINX_SERVICE" 2>&1 | while read -r l; do log "  $l"; done
  wait_healthy "$since"
}

rollback_to_previous() {  # rollback_to_previous <commit>
  local prev="$1"
  log "Rolling back to the previous version ${prev:0:8}…"
  docker tag "$APP_IMAGE:previous" "$APP_IMAGE:latest" || { log "No previous image to roll back to."; return 1; }
  if [ -n "$prev" ] && [ "$(git_ rev-parse HEAD)" != "$prev" ]; then
    git_ reset --quiet --hard "$prev" && log "Code reset to ${prev:0:8}."
  fi
  recreate_app
}

do_update() {
  REFUSE=""
  preflight || { finish refused "$REFUSE"; return; }
  local from to changed_updater
  from=$(git_ rev-parse HEAD); set_req from_commit "$from"
  log "Running version: ${from:0:8} $(git_ log -1 --format=%s HEAD)"
  log "Fetching origin/$BRANCH…"
  git_ fetch --quiet origin "$BRANCH" || { finish failed "git fetch failed"; return; }
  to=$(git_ rev-parse "origin/$BRANCH"); set_req to_commit "$to"
  if [ "$from" = "$to" ]; then finish succeeded "Already up to date — nothing to do."; return; fi
  if ! git_ merge-base --is-ancestor "$from" "$to"; then
    finish refused "origin/$BRANCH is not a fast-forward of the running commit (history was rewritten or local commits exist). Nothing changed."; return
  fi
  git_ log --format='  %h %s' "$from..$to" | while read -r l; do log "New: $l"; done
  changed_updater=$(git_ diff --name-only "$from" "$to" -- updater/ | head -20)

  tag_previous || { finish failed "could not save the current version for rollback"; return; }
  backup_db || { finish refused "database backup failed — nothing changed"; return; }

  log "Fast-forwarding to ${to:0:8}…"
  git_ merge --ff-only --quiet "$to" || { finish refused "fast-forward failed — nothing changed"; return; }

  log "Building the new app image (this takes a few minutes; the shop keeps running)…"
  local rc
  compose build "$APP_SERVICE" > /tmp/build.log 2>&1; rc=$?
  tail -n 25 /tmp/build.log | while read -r l; do log "  $l"; done
  if [ "$rc" -ne 0 ]; then
    log "Build failed — restoring the previous code (the running app was never stopped)."
    git_ reset --quiet --hard "$from"
    finish failed "build failed; the old version is still running"; return
  fi

  if recreate_app; then
    log "Pruning unused images and build cache (volumes are never touched; :previous is kept)…"
    docker image prune -f 2>&1 | tail -1 | while read -r l; do log "  $l"; done
    docker builder prune -f --filter until=72h 2>&1 | tail -1 | while read -r l; do log "  $l"; done
    if [ -n "$changed_updater" ]; then
      printf '%s\n' "UPDATE update_requests SET needs_manual_restart = TRUE WHERE id = :'id';" | sql -v id="$REQ" >/dev/null
      log "NOTE: updater files changed in this update ($changed_updater). The updater was NOT replaced mid-run — restart it manually (see UPDATER.md)."
    fi
    finish succeeded
  else
    if rollback_to_previous "$from"; then
      finish rolled_back "the new version failed its health check; the previous version ${from:0:8} is running again. The database was NOT restored — pre-update backup: $(basename "${BACKUP_FILE:-?}")"
    else
      finish failed "the new version failed AND the automatic rollback did not come up healthy — manual attention needed. Pre-update backup: $(basename "${BACKUP_FILE:-?}")"
    fi
  fi
}

do_rollback() {
  REFUSE=""
  preflight || { finish refused "$REFUSE"; return; }
  if ! docker image inspect "$APP_IMAGE:previous" >/dev/null 2>&1; then finish refused "No previous version is available."; return; fi
  local prev
  prev=$(docker image inspect -f '{{ index .Config.Labels "sutra.commit" }}' "$APP_IMAGE:previous")
  set_req from_commit "$(git_ rev-parse HEAD)"; set_req to_commit "$prev"
  if [ "$(git_ rev-parse HEAD)" = "$prev" ]; then finish refused "Already running the previous version (${prev:0:8})."; return; fi
  backup_db || { finish refused "database backup failed — nothing changed"; return; }
  if rollback_to_previous "$prev"; then finish succeeded; else finish failed "rollback did not come up healthy — manual attention needed"; fi
}

# ── Main loop ────────────────────────────────────────────────────────────────
echo "[updater] Started. Project '$PROJECT', repo $REPO_DIR, branch $BRANCH. Deploys ONLY on SHRX requests."
until sql -c "SELECT 1 FROM update_requests LIMIT 1" >/dev/null 2>&1; do
  echo "[updater] Waiting for the database / migration 022…"; sleep 10
done
LAST_FETCH=0
while true; do
  heartbeat
  # Requests left 'running' by a crash/restart of the updater can't be resumed.
  sql -c "UPDATE update_requests SET status='failed', error='updater restarted mid-run', finished_at=NOW()
          WHERE status='running' AND started_at < NOW() - INTERVAL '1 hour'" >/dev/null 2>&1
  if [ $(( $(date +%s) - LAST_FETCH )) -ge $FETCH_EVERY_SECONDS ]; then refresh_status; LAST_FETCH=$(date +%s); fi

  row=$(sql -F '|' -c "UPDATE update_requests SET status='running', started_at=NOW()
                       WHERE id = (SELECT id FROM update_requests WHERE status='pending'
                                   ORDER BY requested_at LIMIT 1 FOR UPDATE SKIP LOCKED)
                       RETURNING id, action" 2>/dev/null | head -1)
  if [ -n "$row" ]; then
    REQ="${row%%|*}"; ACTION="${row#*|}"
    if ! [[ "$REQ" =~ ^[0-9a-f-]{36}$ ]]; then REQ=""; sleep "$POLL_SECONDS"; continue; fi
    log "=== ${ACTION} request started ==="
    case "$ACTION" in
      check)    refresh_status; log "Checked origin/$BRANCH."; finish succeeded ;;
      update)   do_update; refresh_status ;;
      rollback) do_rollback; refresh_status ;;
      *)        finish refused "unknown action" ;;
    esac
    LAST_FETCH=$(date +%s); REQ=""
  fi
  sleep "$POLL_SECONDS"
done
