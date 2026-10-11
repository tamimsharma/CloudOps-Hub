#!/bin/sh
# CloudOps Hub container entrypoint:
#   1. wait for PostgreSQL and push the Prisma schema (idempotent)
#   2. seed demo data + demo role accounts on a brand-new database
#   3. start the API, which also serves the built web UI
set -e

echo "[entrypoint] Waiting for PostgreSQL and syncing the schema..."
attempt=1
until npx prisma db push --skip-generate --schema=apps/api/prisma/schema.prisma; do
  attempt=$((attempt + 1))
  if [ "$attempt" -gt 15 ]; then
    echo "[entrypoint] Could not reach the database after 15 attempts." >&2
    exit 1
  fi
  echo "[entrypoint] Database not ready (attempt $attempt/15) - retrying in 3s..."
  sleep 3
done

echo "[entrypoint] Checking whether demo data needs seeding..."
node scripts/bootstrap.mjs

echo "[entrypoint] Starting CloudOps Hub on port ${PORT:-4000}..."
exec node apps/api/dist/src/main.js
