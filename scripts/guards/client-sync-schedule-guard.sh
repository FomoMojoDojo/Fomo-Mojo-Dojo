#!/usr/bin/env bash
#
# B3 — the scheduled client sync (R16–R24, 2026-09-26). Guards run-scheduled.sh against INJECTED
# failures: SYNC_CMD is a recorder, so "did it try to write?" is an assertion on a file, and the ping
# URL points at a local recorder, so no real healthchecks.io ping is ever sent. NOTHING here touches
# Notion or writes to the database.
#
# Every run works inside its own throwaway sandbox ($WORK): its own env file, log, marker and lock. The
# real backups/client-sync.env and local-db-backups/ are never written.
#
# Checks:
#   (a) a healthy run invokes the sync exactly once, exits 0, writes an OK marker, and pings start+0
#   (b) R22: a second LIVE run the same day does NOT invoke the sync, exits 0, and sends NO ping
#   (b3) R25: a DRY run writes a mode=dry marker, sends NO /0 ping, and does NOT suppress a later live run
#   (c) R17: a lock held by a LIVE pid → no sync, exit 0, no ping
#   (d) R17: a lock whose holder is dead is left for sync.ts to judge — the wrapper still runs
#   (e) R19: the DB container down → exit 4, no sync, /fail pinged
#   (f) R19: pg_isready failing → exit 4, no sync
#   (g) R19: PostgREST not answering (200 on the root) → exit 5, no sync
#   (h) R19: Notion not answering 200 → exit 6, no sync
#   (i) the env file missing → exit 3, no sync
#   (j) the env file at mode 644 → exit 3, no sync
#   (k) the env file missing a key → exit 3, no sync
#   (l) R16: no HEALTHCHECK_URL → the sync still runs and the log says "pings skipped"
#   (m) R20: a log over 5 MB is rotated to .1, keeping one generation
#   (n) R20: NO secret value appears in the log
#   (o) the sync exiting non-zero → exit 7 and /fail
#
# Plants (each must make the guard FAIL):
#   PLANT=marker      the R22 already-ran-today check removed   ⇒ (b) a second run invokes the sync
#   PLANT=drymarker   the mode=live requirement dropped from R22 ⇒ (b3) a DRY marker dated today
#                     suppresses a real run — the defect R25 fixes
#   PLANT=lock        the advisory lock pre-check removed       ⇒ (c) a held lock invokes the sync
#   PLANT=db          the container check removed               ⇒ (e) a down stack invokes the sync
#   PLANT=pgready     the pg_isready check removed              ⇒ (f)
#   PLANT=rest        the PostgREST check removed               ⇒ (g)
#   PLANT=notion      the Notion check removed                  ⇒ (h)
#   PLANT=envexists   the env-file present-and-readable rule removed (BOTH lines: an absent file is
#                     also unreadable, so removing one leaves the other catching it) ⇒ (i)
#   PLANT=envmode     the mode-600 check removed                ⇒ (j)
#   PLANT=envkeys     the required-keys check removed           ⇒ (k)
#   PLANT=norotate    the rotation removed                      ⇒ (m)
#   PLANT=leak        the wrapper made to echo a secret value   ⇒ (n) a secret reaches the log
#
# Run:  bash scripts/guards/client-sync-schedule-guard.sh
#       PLANT=marker bash scripts/guards/client-sync-schedule-guard.sh
set -uo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WRAPPER_SRC="$REPO/scripts/notion-client-sync/run-scheduled.sh"
WORK="$(mktemp -d /tmp/b3guard.XXXXXX)"
WRAPPER="$WORK/run-scheduled.sh"
FAILED=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; FAILED=1; }
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

SRC_MD5_BEFORE="$(md5 -q "$WRAPPER_SRC")"

# ── the ping recorder. NO network listener, by design. ────────────────────────────────────────────
# A first version listened on a port with `nc -l` in a loop. That made the guard FLAKY: nc serves one
# connection at a time, so the back-to-back /start and /0 raced and a ping was sometimes lost — the
# no-plant run failed roughly one time in three, and a plant once went red at the wrong check. A guard
# that sometimes fails on a healthy tree is worse than a missing check, so the pings are now recorded by
# the fake curl itself. The host below is deliberately unroutable: if anything ever tried to contact it
# for real, the run would fail loudly rather than quietly reaching the network.
PING_LOG="$WORK/pings.txt"
: > "$PING_LOG"
PING_URL="http://guard.invalid/hc"
pings() { tr '\n' ' ' < "$PING_LOG" 2>/dev/null; }

# ── the wrapper under test, copied so plants never touch the committed file ───────────────────────
cp "$WRAPPER_SRC" "$WRAPPER"
python3 - "$WRAPPER" "$WORK" <<'PY'
import sys
p, work = sys.argv[1], sys.argv[2]
s = open(p, encoding="utf-8").read()
# point every path at the sandbox; keep the real logic intact
s = s.replace('REPO_DIR="/Users/fomomojodojo/dev/happy-file-hugger-main"', f'REPO_DIR="{work}/repo"')
s = s.replace('ENV_FILE="$REPO_DIR/backups/client-sync.env"', f'ENV_FILE="${{GUARD_ENV_FILE:-{work}/repo/backups/client-sync.env}}"')
# The wrapper hardens PATH by PREPENDING the standard bin dirs (that is the point — launchd gives it
# almost nothing), which would put the real docker and curl ahead of the guard's fakes. In the sandbox
# copy the fake bin goes first, so the health checks are steerable and nothing real is contacted.
s = s.replace('export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"',
              f'export PATH="{work}/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"')
open(p, "w", encoding="utf-8").write(s)
PY
mkdir -p "$WORK/repo/backups" "$WORK/repo/local-db-backups"

# a realistic env file with DISTINCTIVE secret values, so (n) can grep for them
TOK="ntn_GUARDSECRETTOKEN0000000000000000000000000000000000"
KEY="sb_secret_GUARDSECRETSERVICEKEY_0000000000"
write_env() {  # write_env [mode] [omit-key]
  local mode="${1:-600}" omit="${2:-}"
  : > "$WORK/repo/backups/client-sync.env"
  [ "$omit" != "NOTION_TOKEN" ]             && echo "NOTION_TOKEN=$TOK" >> "$WORK/repo/backups/client-sync.env"
  [ "$omit" != "SUPABASE_URL" ]             && echo "SUPABASE_URL=http://127.0.0.1:54321" >> "$WORK/repo/backups/client-sync.env"
  [ "$omit" != "SUPABASE_SERVICE_ROLE_KEY" ] && echo "SUPABASE_SERVICE_ROLE_KEY=$KEY" >> "$WORK/repo/backups/client-sync.env"
  [ "$omit" != "HEALTHCHECK_URL" ]          && echo "HEALTHCHECK_URL=$PING_URL" >> "$WORK/repo/backups/client-sync.env"
  chmod "$mode" "$WORK/repo/backups/client-sync.env"
}

# ── fake docker and curl on PATH, so health checks are steerable and nothing real is contacted ────
FAKEBIN="$WORK/bin"; mkdir -p "$FAKEBIN"
cat > "$FAKEBIN/docker" <<'EOS'
#!/usr/bin/env bash
case "$1" in
  ps)   [ "${GUARD_DB_UP:-1}" = "1" ] && echo "supabase_db_dzlgyxcvuwiulgifbmew"; exit 0;;
  exec) [ "${GUARD_PG_READY:-1}" = "1" ] && exit 0; exit 1;;
esac
exit 0
EOS
cat > "$FAKEBIN/curl" <<EOS
#!/usr/bin/env bash
# Records pings and answers health checks from env vars. NOTHING here reaches the network.
url="\${!#}"
case "\$url" in
  *guard.invalid/hc*)
      # record just the path, e.g. /hc/start — deterministic, no listener, no race
      printf '%s\\n' "\${url#http://guard.invalid}" >> "$PING_LOG"
      exit 0;;
  */rest/v1/no_such_table_b3_probe*) echo -n "\${GUARD_REST_404:-404}"; exit 0;;
  */rest/v1/*)       echo -n "\${GUARD_REST_CODE:-200}"; exit 0;;
  *api.notion.com*)  echo -n "\${GUARD_NOTION_CODE:-200}"; exit 0;;
esac
echo "GUARD: the fake curl was asked for an unexpected URL: \$url" >&2
exit 1
EOS
chmod +x "$FAKEBIN/docker" "$FAKEBIN/curl"

# ── the recorder that stands in for the sync ──────────────────────────────────────────────────────
RECORDER="$WORK/recorder.sh"
cat > "$RECORDER" <<EOS
#!/usr/bin/env bash
echo "RECORDER INVOKED \$*" >> "$WORK/invoked.txt"
exit \${GUARD_SYNC_RC:-0}
EOS
chmod +x "$RECORDER"

run_wrapper() {  # run_wrapper  → sets RC; env vars steer the fakes
  : > "$WORK/invoked.txt"
  PATH="$FAKEBIN:$PATH" LOG_FILE="$WORK/repo/local-db-backups/client-sync.log" \
    SYNC_CMD="$RECORDER --live" bash "$WRAPPER" >/dev/null 2>&1
  RC=$?
}
invoked() { [ -s "$WORK/invoked.txt" ] && echo yes || echo no; }
LOGF="$WORK/repo/local-db-backups/client-sync.log"
reset_state() { rm -rf "$WORK/repo/local-db-backups"; mkdir -p "$WORK/repo/local-db-backups"; : > "$PING_LOG"; }

# ── the plant, applied to the COPY ────────────────────────────────────────────────────────────────
# Each plant is a literal (old, new) pair passed as ARGV to a tiny python helper — no nested quoting,
# and the helper ASSERTS the old text was found, so a plant that silently fails to apply is itself a
# failure rather than a false GREEN.
PATCH="$WORK/patch.py"
cat > "$PATCH" <<'PYEOF'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
s = open(path, encoding="utf-8").read()
if old not in s:
    sys.stderr.write("PLANT DID NOT APPLY: pattern not found\n")
    sys.exit(3)
open(path, "w", encoding="utf-8").write(s.replace(old, new, 1))
PYEOF

plant() { python3 "$PATCH" "$WRAPPER" "$1" "$2" || { echo "guard: FAIL the plant could not be applied"; exit 1; }; }

case "${PLANT:-}" in
  marker)    plant 'if [ -f "$MARKER" ] && LC_ALL=C grep -q "^OK $TODAY .*mode=live" "$MARKER"; then' 'if false; then';;
  # R25's defect, as a plant: drop the mode=live requirement and a DRY marker dated today suppresses a
  # real run — which is exactly how a dry run before 06:00 used to silently cost the day.
  drymarker) plant 'LC_ALL=C grep -q "^OK $TODAY .*mode=live" "$MARKER"' 'LC_ALL=C grep -q "^OK $TODAY" "$MARKER"';;
  lock)      plant 'if [ -d "$LOCK_DIR" ]; then' 'if false; then';;
  db)        plant '  || finish 4 "the Postgres container $CONTAINER is not running"' '  || true';;
  pgready)   plant '  || finish 4 "pg_isready failed inside $CONTAINER"' '  || true';;
  rest)      plant '[ "$REST_CODE" = "200" ] || finish 5' '[ -n "$REST_CODE" ] || finish 5';;
  notion)    plant '[ "$NOTION_CODE" = "200" ] || finish 6' '[ -n "$NOTION_CODE" ] || finish 6';;
  envexists) plant '[ -f "$ENV_FILE" ] || finish 3 "$ENV_FILE does not exist"' 'true';;
  envmode)   plant '[ "$MODE" = "600" ] || finish 3' '[ -n "$MODE" ] || finish 3';;
  envkeys)   plant '  LC_ALL=C grep -q "^$k=." "$ENV_FILE" || finish 3' '  true || finish 3';;
  norotate)  plant '    mv -f "$LOG" "$LOG.1"' '    true';;
  leak)      plant 'say "env file present, mode 600, three required keys"' 'say "env file present; token=$(LC_ALL=C sed -n "s/^NOTION_TOKEN=//p" "$ENV_FILE" | head -1)"';;
  "")        ;;
  *)         echo "guard: FAIL unknown PLANT '${PLANT:-}'"; exit 1;;
esac

# ══ (a) the healthy run ═══════════════════════════════════════════════════════════════════════════
reset_state; write_env 600; run_wrapper
[ "$RC" -eq 0 ] && [ "$(invoked)" = yes ] && ok "(a1) a healthy run invokes the sync once and exits 0" \
  || bad "(a1) healthy run: rc=$RC invoked=$(invoked)"
[ "$(LC_ALL=C grep -c 'RECORDER INVOKED' "$WORK/invoked.txt")" = "1" ] && ok "(a2) exactly once" || bad "(a2) not exactly once"
LC_ALL=C grep -q "^OK $(date '+%Y-%m-%d')" "$WORK/repo/local-db-backups/.client-sync_status" \
  && ok "(a3) an OK marker carrying today's local date" || bad "(a3) no OK marker for today"
P="$(pings)"
case "$P" in *"/hc/start"*) case "$P" in *"/hc/0"*) ok "(a4) pinged /start then /0";; *) bad "(a4) no /0 ping: $P";; esac;; *) bad "(a4) no /start ping: $P";; esac

# ══ (b) R22 — a second LIVE run the same day ══════════════════════════════════════════════════════
# (a) above ran with SYNC_CMD carrying --live, so it left a mode=live marker for today.
: > "$PING_LOG"; run_wrapper
[ "$RC" -eq 0 ] && [ "$(invoked)" = no ] && ok "(b1) R22 — a second run after a LIVE success today does NOT invoke the sync and exits 0" \
  || bad "(b1) R22: rc=$RC invoked=$(invoked)"
[ -z "$(pings)" ] && ok "(b2) and sends NO ping — a skipped run must not report a success it did not perform" \
  || bad "(b2) a skipped run pinged: $(pings)"
LC_ALL=C grep -q "mode=live" "$WORK/repo/local-db-backups/.client-sync_status" \
  && ok "(b2b) the marker records mode=live" || bad "(b2b) the marker does not record its mode"

# ══ (b3) R25 — a DRY run must not count as the day's run ══════════════════════════════════════════
# The defect: the marker used to be written by any successful run, so a dry run before 06:00 wrote
# "OK <today>" and R22 then skipped the real runs. A dry run must write a dry marker, send no /0, and
# leave a later live run free to proceed.
reset_state; write_env 600
: > "$WORK/invoked.txt"; : > "$PING_LOG"
PATH="$FAKEBIN:$PATH" LOG_FILE="$LOGF" SYNC_CMD="$RECORDER" bash "$WRAPPER" >/dev/null 2>&1   # no --live
RC=$?
DRYMARK="$(cat "$WORK/repo/local-db-backups/.client-sync_status" 2>/dev/null)"
if [ "$RC" -eq 0 ] && [ "$(invoked)" = yes ] && printf '%s' "$DRYMARK" | LC_ALL=C grep -q "mode=dry"; then
  ok "(b3a) a dry run succeeds and records mode=dry"
else
  bad "(b3a) rc=$RC invoked=$(invoked) marker=$DRYMARK"
fi
P="$(pings)"
case "$P" in
  *"/hc/0"*) bad "(b3b) a dry run sent a /0 success ping — the dead-man's switch would think the day was handled: $P";;
  *)         ok "(b3b) a dry run sends NO /0 ping (a /start is fine — the run did begin)";;
esac
# ...and the dry marker must NOT suppress a live run afterwards
: > "$WORK/invoked.txt"; : > "$PING_LOG"; run_wrapper
if [ "$RC" -eq 0 ] && [ "$(invoked)" = yes ]; then
  ok "(b3c) a LIVE run after today's dry marker still proceeds — R25's whole point"
else
  bad "(b3c) the dry marker suppressed a live run: rc=$RC invoked=$(invoked)"
fi

# ══ (c) R17 — a lock held by a LIVE pid ═══════════════════════════════════════════════════════════
reset_state; write_env 600
mkdir -p "$WORK/repo/local-db-backups/.client-sync.lock"
sleep 600 >/dev/null 2>&1 & LIVEPID=$!
disown 2>/dev/null || true
printf '{"pid":%d,"startedAt":"%s"}' "$LIVEPID" "$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')" > "$WORK/repo/local-db-backups/.client-sync.lock/info.json"
: > "$PING_LOG"; run_wrapper
[ "$RC" -eq 0 ] && [ "$(invoked)" = no ] && [ -z "$(pings)" ] \
  && ok "(c) R17 — a lock held by a live pid: no sync, exit 0, no ping" \
  || bad "(c) held lock: rc=$RC invoked=$(invoked) pings=$(pings)"
kill "$LIVEPID" 2>/dev/null; wait "$LIVEPID" 2>/dev/null || true

# ══ (d) a lock whose holder is DEAD is left for sync.ts to judge ══════════════════════════════════
reset_state; write_env 600
mkdir -p "$WORK/repo/local-db-backups/.client-sync.lock"
printf '{"pid":%d,"startedAt":"%s"}' 999999 "$(date -u '+%Y-%m-%dT%H:%M:%S.000Z')" > "$WORK/repo/local-db-backups/.client-sync.lock/info.json"
run_wrapper
[ "$RC" -eq 0 ] && [ "$(invoked)" = yes ] \
  && ok "(d) a dead holder does not stop the wrapper — R17's judgement belongs to sync.ts" \
  || bad "(d) dead holder: rc=$RC invoked=$(invoked)"

# ══ (e-h) R19 — stack health, each must refuse WITHOUT invoking the sync ══════════════════════════
check_down() {  # check_down <label> <expected-rc> <env assignment>
  reset_state; write_env 600
  : > "$WORK/invoked.txt"; : > "$PING_LOG"
  env $3 PATH="$FAKEBIN:$PATH" LOG_FILE="$LOGF" SYNC_CMD="$RECORDER --live" bash "$WRAPPER" >/dev/null 2>&1
  local rc=$?
  if [ "$rc" -eq "$2" ] && [ "$(invoked)" = no ]; then ok "$1"; else bad "$1 (rc=$rc expected $2, invoked=$(invoked))"; fi
}
check_down "(e) the DB container down → exit 4, no sync"        4 "GUARD_DB_UP=0"
check_down "(f) pg_isready failing → exit 4, no sync"           4 "GUARD_PG_READY=0"
check_down "(g) PostgREST not answering → exit 5, no sync"       5 "GUARD_REST_CODE=000"
check_down "(h) Notion not answering 200 → exit 6, no sync"     6 "GUARD_NOTION_CODE=500"
LC_ALL=C grep -q "/hc/fail" "$PING_LOG" && ok "(e-h) a stack-down failure pings /fail" || bad "(e-h) no /fail ping on failure"

# ══ (i-k) the env file ════════════════════════════════════════════════════════════════════════════
reset_state; write_env 600; rm -f "$WORK/repo/backups/client-sync.env"; run_wrapper
# A missing file is caught by THREE redundant gates (exists, readable, mode — stat fails so MODE is
# empty), so rc=3 alone cannot tell them apart and no single plant could make it fail. What the
# existence check uniquely contributes is the DIAGNOSIS, and that is what is asserted: the operator
# must be told the file is absent, not that it "has mode , expected 600".
if [ "$RC" -eq 3 ] && [ "$(invoked)" = no ] && LC_ALL=C grep -q "does not exist" "$LOGF"; then
  ok "(i) a missing env file → exit 3, no sync, and the log says it does not exist"
else
  bad "(i) rc=$RC invoked=$(invoked) diagnosed=$(LC_ALL=C grep -c 'does not exist' "$LOGF")"
fi
reset_state; write_env 644; run_wrapper
[ "$RC" -eq 3 ] && [ "$(invoked)" = no ] && ok "(j) an env file at mode 644 → exit 3, no sync" || bad "(j) rc=$RC invoked=$(invoked)"
reset_state; write_env 600 SUPABASE_SERVICE_ROLE_KEY; run_wrapper
[ "$RC" -eq 3 ] && [ "$(invoked)" = no ] && ok "(k) an env file missing a key → exit 3, no sync" || bad "(k) rc=$RC invoked=$(invoked)"

# ══ (l) R16 — no HEALTHCHECK_URL: the sync still runs ═════════════════════════════════════════════
reset_state; write_env 600 HEALTHCHECK_URL; : > "$PING_LOG"; run_wrapper
if [ "$RC" -eq 0 ] && [ "$(invoked)" = yes ] && LC_ALL=C grep -q "pings skipped" "$LOGF" && [ -z "$(pings)" ]; then
  ok "(l) R16 — no HEALTHCHECK_URL: the sync runs, the log says 'pings skipped', no ping is sent"
else
  bad "(l) rc=$RC invoked=$(invoked) skipped=$(LC_ALL=C grep -c 'pings skipped' "$LOGF") pings=$(pings)"
fi

# ══ (m) R20 — rotation at 5 MB, one generation ════════════════════════════════════════════════════
reset_state; write_env 600
/usr/bin/mkfile -n 6m "$LOGF" 2>/dev/null || dd if=/dev/zero of="$LOGF" bs=1m count=6 2>/dev/null
run_wrapper
if [ -f "$LOGF.1" ] && [ "$(wc -c < "$LOGF" | tr -d ' ')" -lt 1000000 ]; then
  ok "(m) R20 — a log over 5 MB is rotated to .1 and the live log starts small"
else
  bad "(m) rotation did not happen (.1 exists: $([ -f "$LOGF.1" ] && echo yes || echo no), size $(wc -c < "$LOGF" | tr -d ' '))"
fi

# ══ (n) R20 — NO secret value in the log ══════════════════════════════════════════════════════════
reset_state; write_env 600; run_wrapper
LEAKS=0
LC_ALL=C grep -qF "$TOK" "$LOGF" && LEAKS=$((LEAKS+1))
LC_ALL=C grep -qF "$KEY" "$LOGF" && LEAKS=$((LEAKS+1))
[ "$LEAKS" -eq 0 ] && ok "(n) R20 — neither secret value appears anywhere in the log" \
  || bad "(n) a secret value reached the log ($LEAKS of 2)"

# ══ (o) the sync failing ══════════════════════════════════════════════════════════════════════════
reset_state; write_env 600; : > "$WORK/invoked.txt"; : > "$PING_LOG"
PATH="$FAKEBIN:$PATH" LOG_FILE="$LOGF" SYNC_CMD="$RECORDER --live" GUARD_SYNC_RC=9 bash "$WRAPPER" >/dev/null 2>&1
RC=$?
[ "$RC" -eq 7 ] && LC_ALL=C grep -q "/hc/fail" "$PING_LOG" \
  && ok "(o) the sync exiting non-zero → exit 7 and a /fail ping" || bad "(o) rc=$RC pings=$(pings)"

# ── the committed wrapper was never touched ───────────────────────────────────────────────────────
[ "$SRC_MD5_BEFORE" = "$(md5 -q "$WRAPPER_SRC")" ] \
  && ok "(z) the committed run-scheduled.sh is byte-identical — every plant hit the sandbox copy" \
  || bad "(z) the committed wrapper changed"

[ "$FAILED" -eq 0 ] && { echo "guard: PASS"; exit 0; }
echo "guard: FAIL"; exit 1
