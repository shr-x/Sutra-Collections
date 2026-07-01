#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="${BACKUP_DIR}/sutra_${DATE}.sql"

echo "=== [$(date)] Starting backup ==="

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# Dump
pg_dump "$DATABASE_URL" > "$FILENAME"
echo "Backup saved: $FILENAME ($(du -sh "$FILENAME" | cut -f1))"

# Prune backups older than RETAIN_DAYS
DELETED=$(find "$BACKUP_DIR" -name "sutra_*.sql" -mtime +"$RETAIN_DAYS" -print -delete | wc -l)
echo "Pruned ${DELETED} backup(s) older than ${RETAIN_DAYS} days"

echo "=== [$(date)] Backup complete ==="
