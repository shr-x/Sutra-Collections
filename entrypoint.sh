#!/bin/sh
set -e

echo "=== Sutra Collections ==="

# Ensure upload directories exist inside the app_uploads Docker volume.
# This runs after the volume is mounted, so subdirs are created in the volume
# (not in the container layer) and survive container rebuilds.
mkdir -p /app/public/uploads/designs \
         /app/public/uploads/items \
         /app/public/uploads/logo

echo "Running database migrations..."
npx tsx db/migrate.ts

echo "Seeding initial data (skipped if already seeded)..."
npx tsx db/seed.ts

echo "Starting Next.js..."
exec npx next start -p 3000
