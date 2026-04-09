#!/bin/sh
# Install and enable pgvector for PostgreSQL 16
# This runs only on first container initialization (when data volume is empty)
set -e

# Update apk and install build dependencies
apk update
apk add --no-cache git make gcc musl-dev postgresql16-dev

# Clone and build pgvector for pg16
cd /tmp
git clone --depth 1 --branch v0.8.0 https://github.com/pgvector/pgvector.git
cd pgvector
PG_CONFIG=/usr/local/bin/pg_config make
PG_CONFIG=/usr/local/bin/pg_config make install || true

# Cleanup
cd /
rm -rf /tmp/pgvector

echo "pgvector installed successfully"
