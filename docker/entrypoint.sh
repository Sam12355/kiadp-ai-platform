#!/bin/sh
# Applies pending Prisma migrations before handing off to the server.
#
# `migrate deploy` only replays committed migration files — it never generates new ones
# and never drops data, so it is safe to run on every boot. The pgvector extension and
# the document_chunks.embedding column are handled separately by ensurePgVector() in
# server.ts, because Prisma cannot manage the Unsupported("vector") type itself.
set -e

cd /app/packages/backend

echo "[entrypoint] Applying database migrations..."
./node_modules/.bin/prisma migrate deploy
echo "[entrypoint] Migrations up to date."

exec "$@"
