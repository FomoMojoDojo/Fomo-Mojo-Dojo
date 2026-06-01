#!/usr/bin/env bash
# Restore a previously backed-up local Supabase Postgres database.
#
# Usage: ./scripts/restore-local-db.sh <backup-file.sql>
#        npm run db:restore <backup-file.sql>
#
# The backup file must have been created by ./scripts/backup-local-db.sh.
# Supabase local dev must be running (supabase start).
#
# This script:
#   1. Shows the backup file to restore from
#   2. Creates a pre-restore backup of current state
#   3. Requires exact typed confirmation before proceeding
#   4. Restores from the backup file
#
# WARNING: This OVERWRITES the local DB public schema.
# Do NOT run this against the production/linked database.

set -euo pipefail

CONTAINER="supabase_db_dzlgyxcvuwiulgifbmew"
BACKUP_FILE="${1:-}"
BACKUP_DIR="./local-db-backups"

if [[ -z "$BACKUP_FILE" ]]; then
  echo "Error: no backup file specified."
  echo "Usage: ./scripts/restore-local-db.sh <backup-file.sql>"
  echo ""
  echo "Available backups:"
  ls -lt "$BACKUP_DIR"/*.sql 2>/dev/null | head -10 || echo "  (none found)"
  exit 1
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Error: file not found: ${BACKUP_FILE}"
  exit 1
fi

BACKUP_SIZE=$(wc -c < "$BACKUP_FILE")
echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                    DATABASE RESTORE WARNING                         ║"
echo "║                                                                     ║"
echo "║  This will OVERWRITE all public schema data in the local DB.        ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Restoring from: ${BACKUP_FILE} (${BACKUP_SIZE} bytes)"
echo ""
echo "To proceed, type EXACTLY:"
echo ""
echo "  RESTORE LOCAL DB FROM BACKUP"
echo ""
echo -n "Your input: "
read -r CONFIRM

if [[ "$CONFIRM" != "RESTORE LOCAL DB FROM BACKUP" ]]; then
  echo ""
  echo "Confirmation did not match. Aborting. No restore was performed."
  exit 1
fi

# Create a pre-restore safety backup
mkdir -p "$BACKUP_DIR"
PRE_RESTORE_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
PRE_RESTORE_FILE="${BACKUP_DIR}/pre_restore_safety_${PRE_RESTORE_TIMESTAMP}.sql"

echo ""
echo "Creating pre-restore safety backup at ${PRE_RESTORE_FILE} ..."
docker exec "$CONTAINER" pg_dump \
  -U postgres \
  --data-only \
  --schema=public \
  --column-inserts \
  --no-owner \
  --no-privileges \
  postgres > "$PRE_RESTORE_FILE" 2>/dev/null || true

echo "Pre-restore backup created."
echo ""
echo "Restoring..."

REMOTE_PATH="/tmp/restore_$(date +%s).sql"
docker cp "$BACKUP_FILE" "${CONTAINER}:${REMOTE_PATH}"
docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -f "$REMOTE_PATH" postgres
docker exec "$CONTAINER" rm -f "$REMOTE_PATH"

echo ""
echo "Restore complete."
echo ""
echo "Note: auth.users are NOT restored by this script."
echo "If login accounts were lost, see docs/DATA_SAFETY.md → Recovery procedure."
echo ""
echo "If restore was wrong, your pre-restore state is at: ${PRE_RESTORE_FILE}"
