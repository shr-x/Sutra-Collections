#!/bin/bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/repo}"
COMPOSE_FILE="${COMPOSE_FILE:-${REPO_DIR}/docker-compose.yml}"
POLL_INTERVAL="${POLL_INTERVAL:-180}"   # 3 minutes

echo "[updater] Starting. Polling every ${POLL_INTERVAL}s for changes on origin/main."
echo "[updater] Repo: ${REPO_DIR}"

cd "$REPO_DIR"

FAIL_COUNT=0
MAX_BACKOFF=3600  # cap at 1 hour between retries on repeated failures

while true; do
  echo "[updater] $(date '+%Y-%m-%d %H:%M:%S') — checking for updates..."

  # Fetch without modifying working tree
  if ! git fetch origin main 2>/dev/null; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
    # Exponential backoff: 3m, 6m, 12m, 24m, 48m, capped at 60m
    BACKOFF=$(( POLL_INTERVAL * (1 << (FAIL_COUNT - 1)) ))
    [ "$BACKOFF" -gt "$MAX_BACKOFF" ] && BACKOFF="$MAX_BACKOFF"
    echo "[updater] WARNING: git fetch failed (attempt ${FAIL_COUNT}). Retrying in ${BACKOFF}s."
    sleep "$BACKOFF"
    continue
  fi

  FAIL_COUNT=0  # reset on success

  LOCAL=$(git rev-parse HEAD 2>/dev/null || echo "")
  REMOTE=$(git rev-parse origin/main 2>/dev/null || echo "")

  if [ -z "$REMOTE" ]; then
    echo "[updater] WARNING: could not resolve origin/main."
    sleep "$POLL_INTERVAL"
    continue
  fi

  if [ "$LOCAL" = "$REMOTE" ]; then
    echo "[updater] Already up to date (${LOCAL:0:8})."
  else
    echo "[updater] New commit detected: ${LOCAL:0:8} → ${REMOTE:0:8}"
    echo "[updater] Pulling changes..."
    git pull origin main

    echo "[updater] Rebuilding and restarting containers..."
    docker compose -f "$COMPOSE_FILE" up -d --build

    echo "[updater] ✓ Update complete at $(date '+%Y-%m-%d %H:%M:%S')"
  fi

  sleep "$POLL_INTERVAL"
done
