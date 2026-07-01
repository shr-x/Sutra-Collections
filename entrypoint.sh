#!/bin/sh
set -e

echo "=== Sutra Collections ==="
echo "Running database migrations..."
npx tsx db/migrate.ts

echo "Seeding initial data (skipped if already seeded)..."
npx tsx db/seed.ts

echo "Starting Next.js..."
exec npx next start -p 3000
