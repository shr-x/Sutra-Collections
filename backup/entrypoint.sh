#!/bin/bash
# Run backup.sh once at startup (so the first run isn't 24h away),
# then sleep until 02:00 IST each day and run again.
set -euo pipefail

log() { echo "[backup-scheduler] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

log "Scheduler started (TZ=${TZ:-UTC}). Daily backup at 02:00."

# Run immediately on first start so we have a fresh backup after deploy
log "Running initial backup..."
/backup.sh >> /var/log/backup.log 2>&1 || log "Initial backup failed — check /var/log/backup.log"

while true; do
  # Seconds until next 02:00
  NOW_SEC=$(date +%s)
  NEXT_2AM=$(date -d 'tomorrow 02:00' +%s 2>/dev/null \
    || date -v+1d -v2H -v0M -v0S +%s 2>/dev/null \
    || echo $((NOW_SEC + 86400)))
  SLEEP_SEC=$((NEXT_2AM - NOW_SEC))
  [ "$SLEEP_SEC" -le 0 ] && SLEEP_SEC=86400

  log "Next backup in ${SLEEP_SEC}s (at $(date -d "@${NEXT_2AM}" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo '02:00 tomorrow'))."
  sleep "$SLEEP_SEC"

  log "Running scheduled backup..."
  /backup.sh >> /var/log/backup.log 2>&1 || log "Backup failed — check /var/log/backup.log"
done
