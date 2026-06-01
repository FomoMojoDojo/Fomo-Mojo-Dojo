#!/usr/bin/env bash
# ============================================================================
# SAFE LOCAL DB RESET — wraps `supabase db reset --local` with guardrails.
#
# DO NOT RUN `supabase db reset --local` DIRECTLY.
# Use this script instead: npm run db:reset:safe
#
# This script:
#   1. Prints a large warning
#   2. Shows current local DB table counts
#   3. Creates a timestamped pg_dump backup
#   4. Verifies the backup is non-zero
#   5. Requires exact typed confirmation before proceeding
#   6. Runs the reset
#   7. Prints restore instructions
# ============================================================================

set -euo pipefail

CONTAINER="supabase_db_dzlgyxcvuwiulgifbmew"
BACKUP_DIR="./local-db-backups"

# ── 1. Big warning ──────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║          ⚠  DESTRUCTIVE DATABASE OPERATION WARNING  ⚠               ║"
echo "║                                                                      ║"
echo "║  supabase db reset --local WILL DESTROY ALL LOCAL DATA:             ║"
echo "║                                                                      ║"
echo "║  • All company records                                               ║"
echo "║  • All routes, needs, job steps                                      ║"
echo "║  • All positioning, strategy, inputs                                 ║"
echo "║  • All uploaded file metadata                                        ║"
echo "║  • All auth.users (login accounts will stop working)                 ║"
echo "║                                                                      ║"
echo "║  AFTER RESET you must re-run seeds and recreate user accounts.       ║"
echo "║                                                                      ║"
echo "║  This incident has happened before. The workspace had to be          ║"
echo "║  manually reconstructed from screenshots (Phase 77).                ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo ""

# ── 2. Show current DB state ────────────────────────────────────────────────

echo "Current local DB state:"
docker exec "$CONTAINER" psql -U postgres -c "
  SELECT
    (SELECT COUNT(*) FROM public.companies)              AS companies,
    (SELECT COUNT(*) FROM public.routes)                 AS routes,
    (SELECT COUNT(*) FROM public.odi_needs)              AS odi_needs,
    (SELECT COUNT(*) FROM public.job_steps)              AS job_steps,
    (SELECT COUNT(*) FROM public.odi_market_definitions) AS market_defs,
    (SELECT COUNT(*) FROM public.positioning_canvases)   AS positioning,
    (SELECT COUNT(*) FROM public.strategy_cascades)      AS strategy,
    (SELECT COUNT(*) FROM public.input_files)            AS input_files;
" 2>/dev/null || echo "(Could not query DB — is Supabase running?)"

echo ""

# ── 3. Create backup ────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/pre_reset_${TIMESTAMP}.sql"

echo "Creating backup before reset..."
docker exec "$CONTAINER" pg_dump \
  -U postgres \
  --data-only \
  --schema=public \
  --column-inserts \
  --no-owner \
  --no-privileges \
  postgres > "$BACKUP_FILE"

# ── 4. Verify backup ────────────────────────────────────────────────────────

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: Backup file was not created. Aborting."
  exit 1
fi

BACKUP_SIZE=$(wc -c < "$BACKUP_FILE")
if [[ "$BACKUP_SIZE" -lt 1000 ]]; then
  echo "ERROR: Backup file is suspiciously small (${BACKUP_SIZE} bytes). Aborting."
  echo "Check that the local Supabase container is running and has data."
  exit 1
fi

echo "Backup created: ${BACKUP_FILE} (${BACKUP_SIZE} bytes)"
echo ""

# ── 5. Require exact typed confirmation ────────────────────────────────────

echo "To proceed with reset, type EXACTLY (no copy-paste shortcuts):"
echo ""
echo "  RESET LOCAL DB AND DELETE WORKSPACE DATA"
echo ""
echo -n "Your input: "
read -r CONFIRM

if [[ "$CONFIRM" != "RESET LOCAL DB AND DELETE WORKSPACE DATA" ]]; then
  echo ""
  echo "Confirmation did not match. Aborting. No reset was performed."
  echo "Backup is safe at: ${BACKUP_FILE}"
  exit 1
fi

echo ""
echo "Confirmation accepted. Running reset in 3 seconds..."
sleep 3

# ── 6. Run reset ────────────────────────────────────────────────────────────

npx supabase db reset --local

# ── 7. Print restore and recovery instructions ──────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║  Reset complete. Your data is GONE from the local DB.               ║"
echo "║                                                                      ║"
echo "║  To restore from backup:                                            ║"
echo "║    ./scripts/restore-local-db.sh ${BACKUP_FILE}"
echo "║                                                                      ║"
echo "║  To restore auth users (login accounts):                            ║"
echo "║    Re-create via Supabase Dashboard → Authentication → Users        ║"
echo "║    or re-run the auth seed script.                                  ║"
echo "║                                                                      ║"
echo "║  To restore workspace data from seeds:                              ║"
echo "║    See: docs/DATA_SAFETY.md → Recovery procedure                   ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
