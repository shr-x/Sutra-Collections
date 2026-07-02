#!/bin/sh
set -e

echo "=== Sutra Collections ==="

# Ensure upload directories exist inside the app_uploads Docker volume.
# Runs after the volume is mounted so dirs are created in the volume
# (not the container layer) and survive container rebuilds.
#   uploads/           ← logo.ext saved here directly
#   uploads/designs/   ← design photos
#   uploads/items/     ← item photos
mkdir -p /app/public/uploads \
         /app/public/uploads/designs \
         /app/public/uploads/items

echo "Running database migrations..."
npx tsx db/migrate.ts

echo "Seeding initial data (skipped if already seeded)..."
npx tsx db/seed.ts

echo "Starting Next.js..."
exec npx next start -p 3000
