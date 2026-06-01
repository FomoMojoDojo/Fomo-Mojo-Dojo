#!/usr/bin/env bash
# Backup the local Supabase Postgres database to a timestamped SQL file.
#
# Usage: ./scripts/backup-local-db.sh [output-dir]
#
# Default output dir: ./local-db-backups/
# Creates: ./local-db-backups/local_db_YYYYMMDD_HHMMSS.sql
#
# IMPORTANT: Run this before any destructive operation including:
#   - supabase db reset --local
#   - supabase db push
#   - Any migration that drops or truncates tables
#
# The backup includes all public schema data (INSERT statements).
# It does NOT include auth.users — those must be recreated manually.

set -euo pipefail

CONTAINER="supabase_db_dzlgyxcvuwiulgifbmew"
OUTPUT_DIR="${1:-./local-db-backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="${OUTPUT_DIR}/local_db_${TIMESTAMP}.sql"

mkdir -p "$OUTPUT_DIR"

echo "Backing up local Supabase DB to ${OUTPUT_FILE} ..."

docker exec "$CONTAINER" pg_dump \
  -U postgres \
  --data-only \
  --schema=public \
  --column-inserts \
  --no-owner \
  --no-privileges \
  postgres > "$OUTPUT_FILE"

SIZE=$(wc -c < "$OUTPUT_FILE")
echo "Done. Backup size: ${SIZE} bytes → ${OUTPUT_FILE}"
echo ""
echo "NOTE: pg_dump warnings about circular foreign-key constraints are expected."
echo "The data is captured correctly. Restore may need --disable-triggers if FK"
echo "violations occur — see restore script for details."
echo ""
echo "To restore: ./scripts/restore-local-db.sh ${OUTPUT_FILE}"
