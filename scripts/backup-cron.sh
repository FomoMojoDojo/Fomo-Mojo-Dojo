#!/usr/bin/env bash
#
# Hardened cron/launchd backup for the local Supabase Postgres DB (MojoMap).
#
# Fixes the three defects that silently broke the prior launchd backup:
#   1. `docker: command not found` — launchd runs with a minimal PATH that lacks
#      /usr/local/bin. We set an explicit PATH and resolve docker absolutely.
#   2. Silent 0-byte "success" — the old script wrote an empty file and reported
#      "Backup written" regardless. We validate size + content and FAIL loudly.
#   3. Wrong directory + no alerting. We write to the repo's local-db-backups/
#      and post a macOS notification (and a FAILED marker) on any failure.
#
# Schedule: launchd com.fomomojodojo.mojomap-backup (hourly). Safe to run anytime.

export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

REPO_DIR="/Users/fomomojodojo/dev/happy-file-hugger-main"
BACKUP_DIR="$REPO_DIR/local-db-backups"
CONTAINER="supabase_db_dzlgyxcvuwiulgifbmew"
KEEP=30
MIN_BYTES=10000          # a real dump is ~700KB+; anything tiny is a failure
STALE_HOURS=3            # alert if the newest prior backup is older than this
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUT="$BACKUP_DIR/local_db_${TIMESTAMP}.sql"
MARKER="$BACKUP_DIR/.backup_status"

mkdir -p "$BACKUP_DIR"

notify() {  # notify "title" "message"
  /usr/bin/osascript -e "display notification \"$2\" with title \"$1\"" 2>/dev/null || true
  echo "[$(date '+%F %T')] $1 — $2"
}

fail() {
  echo "FAILED $(date '+%F %T'): $1" > "$MARKER"
  notify "MojoMap backup FAILED" "$1"
  # Do NOT rotate on failure — never prune good backups because of a bad run.
  rm -f "$OUT" 2>/dev/null
  exit 1
}

# --- alert-on-miss: if the previous good backup is too old, a prior run was skipped ---
PREV=$(ls -t "$BACKUP_DIR"/local_db_*.sql 2>/dev/null | head -1)
if [ -n "$PREV" ]; then
  PREV_AGE_H=$(( ( $(date +%s) - $(stat -f %m "$PREV") ) / 3600 ))
  if [ "$PREV_AGE_H" -ge "$STALE_HOURS" ]; then
    notify "MojoMap backup gap" "Last backup was ${PREV_AGE_H}h ago (>${STALE_HOURS}h) — a scheduled run was missed."
  fi
fi

# --- resolve docker ---
DOCKER_BIN="$(command -v docker || true)"
[ -z "$DOCKER_BIN" ] && fail "docker not found on PATH ($PATH)"

# --- container must be up ---
"$DOCKER_BIN" ps --format '{{.Names}}' | grep -q "^${CONTAINER}$" || fail "DB container $CONTAINER not running"

# --- dump (data-only public schema, column-inserts — matches scripts/backup-local-db.sh) ---
"$DOCKER_BIN" exec "$CONTAINER" pg_dump \
  -U postgres --data-only --schema=public --column-inserts \
  --no-owner --no-privileges postgres > "$OUT" 2>/dev/null

# --- validate ---
[ -f "$OUT" ] || fail "dump file not created"
SIZE=$(wc -c < "$OUT" | tr -d ' ')
[ "$SIZE" -lt "$MIN_BYTES" ] && fail "dump too small (${SIZE} bytes < ${MIN_BYTES}) — likely empty/failed"
grep -q "INSERT INTO public.signals" "$OUT" || fail "dump missing expected signals INSERTs (schema/data problem)"

# --- success: record + rotate (keep newest $KEEP good backups) ---
echo "OK $(date '+%F %T'): $OUT (${SIZE} bytes)" > "$MARKER"
echo "Backup OK: $OUT (${SIZE} bytes)"
ls -t "$BACKUP_DIR"/local_db_*.sql 2>/dev/null | tail -n +$((KEEP+1)) | xargs rm -f 2>/dev/null
echo "Total backups: $(ls "$BACKUP_DIR"/local_db_*.sql 2>/dev/null | wc -l | tr -d ' ')"
exit 0
