#!/usr/bin/env bash
#
# B3 — the launchd wrapper for the MojoMap ↔ Notion client sync (R16–R24, 2026-09-26).
#
#   launchd:  com.fomomojodojo.mojomap-client-sync   06:00 and 12:00 local
#   by hand:  bash scripts/notion-client-sync/run-scheduled.sh --manual
#
# THE MANUAL FORM IS THE DOCUMENTED WAY TO RUN THE SYNC BY HAND. A bare
# `npx vite-node scripts/notion-client-sync/sync.ts -- --live` still works and is still locked (R18 puts
# the lock inside sync.ts), but it skips this script's health checks, its marker and its pings — so the
# dead-man's switch would not learn the run happened.
#
# THE THREE LAUNCHD TRAPS, and what each costs here:
#   1. minimal PATH — launchd gives a job almost nothing, so npx/node/docker are not found. PATH is set
#      explicitly below and npx is resolved with `command -v` and checked, as scripts/backup-cron.sh:15
#      and :52-53 do.
#   2. no shell profile — nothing from .zshrc exists. Everything this script needs is either set here or
#      read from backups/client-sync.env.
#   3. relative working directory — launchd runs with cwd = "/". THIS ONE IS LOAD-BEARING: vite-node
#      resolves the "@/…" alias from vite.config.ts relative to the CWD, so from anywhere but the repo
#      root every @/ import fails ("Failed to load url @/lib/notionClientSync/readOnlyFetch") — verified
#      from "/" and from scripts/. sync.ts's ENV_PATH is now absolute too, but that fixes only the
#      secrets path; the cd below is what makes the imports resolve.
#
# EXIT CODES — distinct so `launchctl print … | grep 'last exit code'` is diagnostic on its own:
#   0  success, or politely skipped (a LIVE run already succeeded today / another run holds the lock)
#   2  a stale lock was reclaimed but the run then failed
#   3  the env file is missing, unreadable, wrong mode, or missing a key
#   4  stack down: the Postgres container is not ready
#   5  stack down: PostgREST is not answering
#   6  Notion is unreachable or the token is rejected
#   7  the sync itself exited non-zero
set -uo pipefail

REPO_DIR="/Users/fomomojodojo/dev/happy-file-hugger-main"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "$REPO_DIR" || { echo "FATAL: cannot cd to $REPO_DIR"; exit 1; }

ENV_FILE="$REPO_DIR/backups/client-sync.env"
LOG="${LOG_FILE:-$REPO_DIR/local-db-backups/client-sync.log}"
MARKER="$REPO_DIR/local-db-backups/.client-sync_status"
LOCK_DIR="$REPO_DIR/local-db-backups/.client-sync.lock"
CONTAINER="${PG_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
SUPABASE_BASE="${SUPABASE_BASE:-http://127.0.0.1:54321}"
LOG_MAX_BYTES=$((5 * 1024 * 1024))
MANUAL=0
[ "${1:-}" = "--manual" ] && MANUAL=1

# ── R25: a run only "counts" when it was a LIVE run. ───────────────────────────────────────────────
# The defect this fixes: the marker used to be written by ANY successful wrapper run, so a dry run
# before 06:00 wrote "OK <today>" and the R22 check then suppressed that day's real runs — the schedule
# silently skipped a day because someone had looked at it. The marker now records its mode, R22 skips
# only on a LIVE marker dated today, and a dry run sends no /0 success ping (pinging /0 for a run that
# wrote nothing would tell the dead-man's switch the day was handled when it was not).
#
# The mode is read from the command that will actually run, not from a flag of our own, so the marker
# cannot disagree with what happened: the default command carries --live, and an injected SYNC_CMD is
# live only if it does too.
if [ -n "${SYNC_CMD:-}" ]; then
  case " $SYNC_CMD " in *" --live "*) RUN_MODE=live;; *) RUN_MODE=dry;; esac
else
  RUN_MODE=live   # the default command is `sync.ts -- --live`
fi

mkdir -p "$(dirname "$LOG")"

# ── R20: rotate in the wrapper, keeping ONE generation. launchd never rotates and nothing else in this
# repo does either — /tmp/happy-file-hugger-file-mirror.stdout.log is 15 MB for exactly that reason.
if [ -f "$LOG" ]; then
  SZ=$(wc -c < "$LOG" | tr -d ' ')
  if [ "$SZ" -gt "$LOG_MAX_BYTES" ]; then
    mv -f "$LOG" "$LOG.1"
    echo "[$(date '+%F %T')] rotated log at ${SZ} bytes (kept one generation as $(basename "$LOG").1)" > "$LOG"
  fi
fi

# A manual run should see its output; a scheduled one goes to the log launchd also points at.
if [ "$MANUAL" -eq 1 ]; then exec > >(tee -a "$LOG") 2>&1; else exec >> "$LOG" 2>&1; fi

say() { echo "[$(date '+%F %T')] $*"; }
notify() {  # R16's local echo. || true so a failed notification never fails the job.
  /usr/bin/osascript -e "display notification \"$2\" with title \"$1\"" 2>/dev/null || true
}

say "── client sync starting ($([ "$MANUAL" -eq 1 ] && echo manual || echo scheduled), pid $$) ──"

# ── R16: the ping URL is optional. Absent → the sync still runs, and we say the pings were skipped. ──
HEALTHCHECK_URL=""
if [ -r "$ENV_FILE" ]; then
  HEALTHCHECK_URL="$(LC_ALL=C sed -n 's/^HEALTHCHECK_URL=//p' "$ENV_FILE" | head -1)"
fi
PING_BASE="$HEALTHCHECK_URL"
[ -z "$PING_BASE" ] && say "no HEALTHCHECK_URL in $(basename "$ENV_FILE") — pings skipped"

ping_hc() {  # ping_hc <suffix> [body]
  [ -z "$PING_BASE" ] && return 0
  local url="$PING_BASE$1"
  if [ -n "${2:-}" ]; then
    curl -fsS -m 15 --data-binary "$2" "$url" >/dev/null 2>&1 || say "ping $1 failed (ignored)"
  else
    curl -fsS -m 15 "$url" >/dev/null 2>&1 || say "ping $1 failed (ignored)"
  fi
}

STARTED_PING=0
finish() {  # finish <exit-code> <message>
  local code="$1" msg="$2"
  if [ "$code" -eq 0 ]; then
    # R25: the mode is part of the record. Only a live marker satisfies R22 tomorrow.
    echo "OK $(date '+%F %T') mode=$RUN_MODE: $msg" > "$MARKER"
    say "DONE ($RUN_MODE): $msg"
    if [ "$RUN_MODE" = live ]; then
      [ "$STARTED_PING" -eq 1 ] && ping_hc "/0"
    else
      say "dry run — no /0 ping sent, and this marker does not count as today's live run (R25)"
    fi
  else
    echo "FAILED $(date '+%F %T') mode=$RUN_MODE (exit $code): $msg" > "$MARKER"
    say "FAILED (exit $code): $msg"
    notify "MojoMap client sync FAILED" "$msg"
    # R16: /fail carries the last 10 log lines, so the alert arrives with its own evidence.
    ping_hc "/fail" "$(tail -10 "$LOG" 2>/dev/null)"
  fi
  exit "$code"
}

# ── R22: has today already succeeded? Checked FIRST, before any ping, so the 12:00 catch-up slot is a
# no-op on a normal day. launchd fires 06:00 and 12:00 independently ("StartInterval and
# StartCalendarInterval are not aware of each other"), so the wrapper must be idempotent about the day.
TODAY="$(date '+%Y-%m-%d')"
if [ -f "$MARKER" ] && LC_ALL=C grep -q "^OK $TODAY .*mode=live" "$MARKER"; then
  say "a LIVE run already succeeded today ($TODAY) — nothing to do. Exiting 0 without writing and without pinging."
  exit 0
fi
if [ -f "$MARKER" ] && LC_ALL=C grep -q "^OK $TODAY" "$MARKER"; then
  say "today's marker is from a DRY run — it does not count (R25); continuing."
fi

# ── R17: an ADVISORY lock pre-check. The authoritative lock is sync.ts's (R18); this one exists only so
# a skipped run sends no ping at all, as R17 requires. The window between this check and sync.ts's
# acquire is real: if another run takes the lock in between, sync.ts exits 0 and we ping /0 for a run
# that did nothing. That is the benign direction — it cannot cause a write or a false alarm.
if [ -d "$LOCK_DIR" ]; then
  HOLDER_PID="$(LC_ALL=C sed -n 's/.*"pid":[[:space:]]*\([0-9]*\).*/\1/p' "$LOCK_DIR/info.json" 2>/dev/null | head -1)"
  if [ -n "$HOLDER_PID" ] && kill -0 "$HOLDER_PID" 2>/dev/null; then
    say "another --live run holds the lock (pid $HOLDER_PID) — exiting 0 without writing and without pinging."
    exit 0
  fi
  say "a lock directory exists but its holder is not alive; sync.ts will judge it under R17 (dead AND older than 30 min)."
fi

ping_hc "/start"; STARTED_PING=1

# ── the env file: present, mode 600, and carrying the three required key NAMES. Never printed. ──
[ -f "$ENV_FILE" ] || finish 3 "$ENV_FILE does not exist"
[ -r "$ENV_FILE" ] || finish 3 "$ENV_FILE is not readable"
MODE="$(stat -f '%Lp' "$ENV_FILE")"
[ "$MODE" = "600" ] || finish 3 "$ENV_FILE has mode $MODE, expected 600"
for k in NOTION_TOKEN SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
  LC_ALL=C grep -q "^$k=." "$ENV_FILE" || finish 3 "$ENV_FILE has no $k"   # names the KEY, never a value
done
say "env file present, mode 600, three required keys"

# ── binaries ──
NPX_BIN="$(command -v npx || true)"
[ -n "$NPX_BIN" ] || finish 3 "npx not found on PATH ($PATH)"
DOCKER_BIN="$(command -v docker || true)"
[ -n "$DOCKER_BIN" ] || finish 4 "docker not found on PATH ($PATH)"

# ── R19: stack health. Three read-only checks, all BEFORE anything that could write. ──
"$DOCKER_BIN" ps --format '{{.Names}}' | LC_ALL=C grep -q "^${CONTAINER}$" \
  || finish 4 "the Postgres container $CONTAINER is not running"
"$DOCKER_BIN" exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 \
  || finish 4 "pg_isready failed inside $CONTAINER"
say "DB ready"

# PostgREST, not the edge runtime (R19 amends the Sep 25 wording): the sync talks to PostgREST and to
# Notion, never to an edge function, so an edge-runtime check would pass or fail for unrelated reasons.
#
# CORRECTED 2026-09-26, measured rather than assumed: the B3 proposal said an unauthenticated GET would
# be REFUSED with 401. It is not. /rest/v1/ serves the OpenAPI document and answers 200, and even
# /rest/v1/client_portal_links answers 200 with an empty array — PostgREST applies RLS by FILTERING, it
# does not refuse. (Verified: the unauthenticated body is exactly "[]", zero rows, so R7's admin-only
# policy holds; this check is liveness, not an authorization proof.) So 200 is the healthy answer, and
# 000 — nothing listening — is the failure this catches. A nonexistent table answering 404 is what
# tells us it is really PostgREST behind the port.
REST_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$SUPABASE_BASE/rest/v1/" 2>/dev/null || echo 000)"
[ "$REST_CODE" = "200" ] || finish 5 "PostgREST at $SUPABASE_BASE/rest/v1/ answered $REST_CODE, expected 200"
REST_404="$(curl -s -o /dev/null -w '%{http_code}' -m 15 "$SUPABASE_BASE/rest/v1/no_such_table_b3_probe" 2>/dev/null || echo 000)"
[ "$REST_404" = "404" ] || finish 5 "$SUPABASE_BASE/rest/v1/<unknown table> answered $REST_404, expected 404 — that port may not be PostgREST"
say "PostgREST answering (200 on the root, 404 on an unknown table)"

# Notion: the cheapest authenticated read there is. The token goes in a header, never a URL.
NOTION_TOKEN_VALUE="$(LC_ALL=C sed -n 's/^NOTION_TOKEN=//p' "$ENV_FILE" | head -1)"
NOTION_CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 \
  -H "Authorization: Bearer $NOTION_TOKEN_VALUE" -H 'Notion-Version: 2026-03-11' \
  https://api.notion.com/v1/users/me 2>/dev/null || echo 000)"
NOTION_TOKEN_VALUE=""; unset NOTION_TOKEN_VALUE
[ "$NOTION_CODE" = "200" ] || finish 6 "Notion /v1/users/me answered $NOTION_CODE, expected 200"
say "Notion reachable and the token accepted"

# ── the run. SYNC_CMD is injectable so the guard can substitute a recorder and assert on what WOULD
# have been invoked, without a real Notion write. Default is the real live sync.
if [ -n "${SYNC_CMD:-}" ]; then
  say "running (injected SYNC_CMD)"
  # shellcheck disable=SC2086
  eval $SYNC_CMD
else
  say "running: npx vite-node scripts/notion-client-sync/sync.ts -- --live"
  "$NPX_BIN" vite-node scripts/notion-client-sync/sync.ts -- --live
fi
RC=$?
[ "$RC" -eq 0 ] || finish 7 "the sync exited $RC"

finish 0 "sync completed"
