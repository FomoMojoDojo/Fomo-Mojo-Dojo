#!/usr/bin/env bash
# THE NETWORK BOUNDARY — rulings N1, N1b, N4, N6 (2026-09-30). Needs no database login.
#
# WHY THIS GUARD EXISTS. The exposure census found every local service answering on every interface,
# reachable from the Wi-Fi LAN and from five Tailscale peers, with Supabase Studio running arbitrary SQL
# as postgres with no authentication at all. Port bindings alone cannot fix it: Docker Desktop publishes
# on 0.0.0.0 whatever the daemon default says (its host proxy re-publishes what dockerd bound to
# 127.0.0.1 inside the VM), and the Supabase CLI has no bind option. So the boundary is the packet
# filter, and the things that can silently undo it are a new container, a re-bound dev server, a stray
# listener from a guard, or a macOS update that rewrites /etc/pf.conf. Each has a check below.
#
# PARTNERS ARE NOT AFFECTED BY ANY OF THIS, and n5 proves it every run. Taylor and Jim reach MojoMap
# through `tailscale serve`, which listens on no host port — nothing binds 443 or 8443 (verified with
# lsof); the Tailscale system extension terminates TLS in its own process and dials the service over
# loopback. That is why blocking inbound TCP to 8080 on utun4 cannot break them, and why 443 and 8443
# are absent from the pf anchor.
#
# Checks:
#   (n1) every TCP listener on a NON-loopback address is either on the allowlist below or on a port the
#        pf anchor blocks. Anything else is a new hole and fails.
#   (n2) Vite (8080), the local parser (8789) and launch-site (3010) listen on 127.0.0.1 ONLY (N1b).
#   (n3) zero `nc` listeners. 60 orphans from a superseded guard design once sat on all interfaces for
#        four days; a guard never leaves a listener running.
#   (n4) pf is enabled AND the loaded rules in our anchor match scripts/network/pf.anchor exactly.
#        Read through `sudo -n` using the read-only drop-in (N6). If that entry is missing this check
#        FAILS and names it — it never skips.
#   (n5) both Tailscale serve URLs answer: the app 200 with the app's HTML, the API a Kong response.
#
# ALLOWLIST for (n1) — non-loopback listeners that are NOT ours to close, each with its reason:
#   ControlCenter      AirPlay Receiver (5000, 7000). Apple's, toggled in System Settings, not by pf.
#   rapportd           Continuity / Handoff / Sidecar (49158, 57568-57569). Apple's; breaking it breaks
#                      AirDrop and Universal Control.
#   remoted, sharingd, AirPlayXPCHelper, identityservicesd — other Apple system services, same reason.
#   Tailscale / tailscaled / io.tailscale.* — the mesh itself and the serve listeners. Filtering these
#                      is what would actually cut the partners off.
# Everything else on a non-loopback address must be a pf-blocked port, or (n1) fails.
#
# Plants. n1, n2, n3 and n5 each have one, shown red then green. n4's plants belong to the operator:
# its red run is before `install-pf.sh`, its green run after (see scripts/network/RUNBOOK.md step 7).
#   PLANT=straylistener   a throwaway `nc -l` on 0.0.0.0 at a port the anchor does NOT block  => (n1) red
#   PLANT=viteallif       Vite restarted bound to 0.0.0.0                                     => (n2) red
#   PLANT=ncleft          a throwaway `nc -l` left listening                                  => (n3) red
#   PLANT=servedown       the Vite server stopped, so the serve URL has nothing to proxy to   => (n5) red
# Every plant is undone by the EXIT trap, which then re-verifies the listener set. The trap runs even on
# an interrupt, so no plant can outlive the run — the failure this guard exists to prevent.
#
# Run:  set -a; source backups/fr-login.env; source backups/fr-nonadmin.env; source backups/fr-member.env; set +a
#       bash scripts/guards/network-guard.sh
#       PLANT=strayListener bash scripts/guards/network-guard.sh
set -uo pipefail
HERE="$(cd "$(dirname "$0")/../.." && pwd)"
ANCHOR_FILE="$HERE/scripts/network/pf.anchor"
SERVE_APP=${SERVE_APP:-https://mojomap.tail7b863b.ts.net}
SERVE_API=${SERVE_API:-https://mojomap.tail7b863b.ts.net:8443}
ANCHOR_NAME=mojomap
SUDOERS_PATH=/etc/sudoers.d/mojomap-pf-readonly

[ -f "$ANCHOR_FILE" ] || { echo "guard: FAIL missing $ANCHOR_FILE"; exit 1; }

# Ports the anchor blocks, read FROM the anchor so the guard and the boundary cannot drift apart.
BLOCKED=$(sed -n 's/^mojomap_ports[^"]*"{\([^}]*\)}".*/\1/p' "$ANCHOR_FILE" | tr -d ' ' | tr ',' '\n' | grep -E '^[0-9]+$' | sort -un)
[ -n "$BLOCKED" ] || { echo "guard: FAIL could not read the port list out of $ANCHOR_FILE"; exit 1; }
blocked_has() { printf '%s\n' "$BLOCKED" | grep -qx "$1"; }

# ── (n4) rule-set comparison, as a pure function so it can be proven without pf ───────────────────
# Reads the output of `pfctl -a mojomap -s rules` on stdin. Every line must be EXACTLY our rule for a
# single port; the set of ports must equal what pf.anchor declares. Anything else — a different
# interface, missing flags, an extra rule, a missing or extra port — is a failure with a reason.
# Amendment A2: the old version compared only the sorted port numbers scraped with `grep -oE '[0-9]+'`,
# so a hand-edit that changed `! lo0` to `en0`, or dropped `flags S/SA`, passed while the boundary was
# wrong. It now matches each line whole.
# Prints "OK" or "MISMATCH: <reason>" on stdout; returns 0 only on OK.
n4_compare_rules() {  # $1 = expected port list, newline-separated
  local expected="$1" line got_ports="" n
  local want_re='^block return in quick on ! lo0 proto tcp from any to any port = ([0-9]+) flags S/SA$'
  local saw_any=0
  while IFS= read -r line; do
    line="$(printf '%s' "$line" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//; s/[[:space:]]+/ /g')"
    [ -z "$line" ] && continue
    saw_any=1
    if [[ "$line" =~ $want_re ]]; then
      got_ports="$got_ports${BASH_REMATCH[1]}
"
    else
      printf 'MISMATCH: unexpected rule line: %s\n' "$line"; return 1
    fi
  done
  [ "$saw_any" = "1" ] || { printf 'MISMATCH: no rules loaded in the anchor\n'; return 1; }
  local want_sorted got_sorted
  want_sorted="$(printf '%s\n' "$expected" | grep -E '^[0-9]+$' | sort -un)"
  got_sorted="$(printf '%s' "$got_ports" | grep -E '^[0-9]+$' | sort -un)"
  if [ "$want_sorted" != "$got_sorted" ]; then
    local extra missing
    # comm compares LEXICALLY, so both sides must be sorted lexically here. Sorting them numerically
    # (as above, for the human-readable list) and handing that to comm made it report the same port as
    # both extra and missing — "9999" sorts after "54321" numerically but before it lexically.
    extra="$(comm -13 <(printf '%s\n' "$want_sorted" | sort) <(printf '%s\n' "$got_sorted" | sort) | tr '\n' ' ')"
    missing="$(comm -23 <(printf '%s\n' "$want_sorted" | sort) <(printf '%s\n' "$got_sorted" | sort) | tr '\n' ' ')"
    printf 'MISMATCH: port set differs —%s%s\n' \
      "$([ -n "${extra// /}" ] && printf ' extra: %s' "$extra")" \
      "$([ -n "${missing// /}" ] && printf ' missing: %s' "$missing")"
    return 1
  fi
  n="$(printf '%s\n' "$got_sorted" | grep -c .)"
  printf 'OK %s\n' "$n"; return 0
}

# Self-test entry point: `network-guard.sh --selftest-n4` proves the parser with canned text, no sudo
# and no pf. Used by the A2 proof and safe to run any time.
if [ "${1:-}" = "--selftest-n4" ]; then
  EXPECT="$BLOCKED"
  good="$(printf '%s\n' "$EXPECT" | while IFS= read -r q; do [ -n "$q" ] && printf 'block return in quick on ! lo0 proto tcp from any to any port = %s flags S/SA\n' "$q"; done)"
  run() { printf '%s\n' "$2" | n4_compare_rules "$EXPECT"; printf '   -> rc=%s  [%s]\n' "$?" "$1"; }
  echo "(i)   interface en0 instead of ! lo0"
  run "want red" "$(printf '%s\n' "$good" | sed '1s/! lo0/en0/')"
  echo "(ii)  flags missing"
  run "want red" "$(printf '%s\n' "$good" | sed '1s/ flags S\/SA//')"
  echo "(iii) one extra port"
  run "want red" "$(printf '%s\nblock return in quick on ! lo0 proto tcp from any to any port = 9999 flags S/SA\n' "$good")"
  echo "(iv)  one missing port"
  run "want red" "$(printf '%s\n' "$good" | sed '1d')"
  echo "(v)   an extra unrelated rule line"
  run "want red" "$(printf '%s\npass in quick on en0 proto tcp from any to any port = 22 flags S/SA\n' "$good")"
  echo "(vi)  the exact expected text"
  run "want GREEN" "$good"
  exit 0
fi

ALLOW_PROCS='ControlCe|rapportd|remoted|sharingd|AirPlayXPCHelper|identityservicesd|Tailscale|tailscaled|io.tailscale'

# ── the plant ─────────────────────────────────────────────────────────────────────────────────────
STRAY_PORT=45911
PLANT_NC_PID=""
VITE_REPLANTED=0
SERVE_PLANTED=0

restore_plant() {
  launchctl unsetenv HOST_BIND 2>/dev/null || true
  if [ -n "$PLANT_NC_PID" ]; then kill "$PLANT_NC_PID" 2>/dev/null || true; PLANT_NC_PID=""; fi
  pkill -f "nc -l $STRAY_PORT" 2>/dev/null || true
  if [ "$VITE_REPLANTED" = "1" ] || [ "$SERVE_PLANTED" = "1" ]; then
    launchctl unsetenv HOST_BIND 2>/dev/null || true
    launchctl kickstart -k "gui/$(id -u)/com.happyfilehugger.local-app" >/dev/null 2>&1 || true
    i=0; while [ "$i" -lt 60 ]; do
      [ "$(lsof -nP -iTCP:8080 -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $9}' | head -1)" = "127.0.0.1:8080" ] && break
      sleep 1; i=$((i+1))
    done
  fi
}
restore_report() {
  local bad=0
  pgrep -x nc >/dev/null 2>&1 && { echo "  RESTORE-FAIL an nc listener is still running"; bad=1; }
  lsof -nP -iTCP:$STRAY_PORT -sTCP:LISTEN >/dev/null 2>&1 && { echo "  RESTORE-FAIL port $STRAY_PORT is still listening"; bad=1; }
  local v; v=$(lsof -nP -iTCP:8080 -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $9}' | head -1)
  [ "$v" = "127.0.0.1:8080" ] || { echo "  RESTORE-FAIL Vite is on '${v:-nothing}', expected 127.0.0.1:8080"; bad=1; }
  [ "$bad" = 0 ] && echo "  ok   (restore) no plant left behind: zero nc listeners, port $STRAY_PORT closed, Vite back on 127.0.0.1:8080"
  return $bad
}
trap 'restore_plant' EXIT

case "${PLANT:-}" in
  straylistener) nc -l $STRAY_PORT >/dev/null 2>&1 & PLANT_NC_PID=$!;;
  ncleft)        nc -l $STRAY_PORT >/dev/null 2>&1 & PLANT_NC_PID=$!;;
  viteallif)     VITE_REPLANTED=1
                 # start-local-app.sh honours HOST_BIND; launchctl setenv makes it visible to the job.
                 # The EXIT trap unsets it again, so the plant cannot outlive the run.
                 launchctl setenv HOST_BIND 0.0.0.0 2>/dev/null || true
                 launchctl kickstart -k "gui/$(id -u)/com.happyfilehugger.local-app" >/dev/null 2>&1 || true;;
  servedown)     SERVE_PLANTED=1
                 for p in $(lsof -nP -iTCP:8080 -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $2}' | sort -u); do kill "$p" 2>/dev/null || true; done;;
  "")            ;;
  *)             echo "guard: FAIL unknown PLANT ${PLANT:-}"; exit 1;;
esac
# Wait for a port to be listening again, bounded. Restarting the dev server is not instantaneous, and
# a check that races the restart reports "nothing listening" instead of the bind it meant to test.
wait_for_port() {  # $1 port, $2 max seconds
  local i=0
  while [ "$i" -lt "${2:-30}" ]; do
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1 && return 0
    sleep 1; i=$((i+1))
  done
  return 1
}
case "${PLANT:-}" in
  viteallif) wait_for_port 8080 45 || echo "  note: Vite did not come back within 45s under the plant";;
  servedown) ;;                       # this plant WANTS 8080 down
  straylistener|ncleft) wait_for_port $STRAY_PORT 10 || true;;
esac

fail=0

# ══ (n1) every non-loopback listener is allowlisted or pf-blocked ═════════════════════════════════
n1_bad=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  proc=$(printf '%s' "$line" | awk '{print $1}')
  addr=$(printf '%s' "$line" | awk '{print $9}')
  case "$addr" in 127.0.0.1:*|\[::1\]:*) continue;; esac
  case "$addr" in *:*) port="${addr##*:}";; *) continue;; esac
  printf '%s' "$proc" | grep -qE "$ALLOW_PROCS" && continue
  blocked_has "$port" && continue
  n1_bad="$n1_bad ${proc}@${addr}"
done <<< "$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1')"
if [ -n "$n1_bad" ]; then
  echo "  FAIL (n1) non-loopback listener that is neither allowlisted nor a pf-blocked port:$n1_bad"; fail=1
else
  echo "  ok   (n1) every non-loopback TCP listener is an allowlisted Apple/Tailscale service or a port the pf anchor blocks"
fi

# ══ (n2) our three servers are loopback only ═════════════════════════════════════════════════════
n2_bad=""
for pair in "8080:Vite" "8789:local parser" "3010:launch-site"; do
  port="${pair%%:*}"; name="${pair##*:}"
  addrs=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1{print $9}' | sort -u)
  [ -z "$addrs" ] && { n2_bad="$n2_bad ${name}(nothing listening)"; continue; }
  while IFS= read -r a; do
    [ "$a" = "127.0.0.1:$port" ] || n2_bad="$n2_bad ${name}@${a}"
  done <<< "$addrs"
done
if [ -n "$n2_bad" ]; then
  echo "  FAIL (n2) not bound to 127.0.0.1 only:$n2_bad"; fail=1
else
  echo "  ok   (n2) Vite, the local parser and launch-site each listen on 127.0.0.1 only"
fi

# ══ (n3) no stray nc listeners ═══════════════════════════════════════════════════════════════════
nc_n=$(lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk '$1=="nc"' | wc -l | tr -d ' ')
if [ "$nc_n" != "0" ]; then
  echo "  FAIL (n3) $nc_n nc listener(s) present — a guard must never leave one running"; fail=1
else
  echo "  ok   (n3) zero nc listeners"
fi

# ══ (n4) pf is enabled and our anchor's loaded rules match the file ══════════════════════════════
# Amendment A2: drop any cached sudo credential FIRST. sudo remembers a password for ~5 minutes, so a
# `sudo -n` moments after the operator typed one succeeds whether or not the read-only drop-in exists —
# which would let this check pass on a machine where it cannot actually read pf unattended.
sudo -k 2>/dev/null || true
if ! sudo -n /sbin/pfctl -s info >/dev/null 2>&1; then
  echo "  FAIL (n4) cannot read pf state without a password. Install the read-only sudo entry:"
  echo "            sudo install -m 0440 -o root -g wheel scripts/network/sudoers.mojomap-pf-readonly $SUDOERS_PATH"
  echo "            (ruling N6. This check never skips — an unreadable boundary is a failed boundary.)"
  fail=1
else
  if sudo -n /sbin/pfctl -s info 2>/dev/null | grep -qE '^Status: Enabled'; then
    got=$(sudo -n /sbin/pfctl -a "$ANCHOR_NAME" -s rules 2>/dev/null)
    verdict=$(printf '%s\n' "$got" | n4_compare_rules "$BLOCKED")
    if [ "${verdict%% *}" = "OK" ]; then
      echo "  ok   (n4) pf is enabled and anchor '$ANCHOR_NAME' holds exactly our rule for all ${verdict##* } ports in pf.anchor (interface, action and flags matched line by line)"
    elif [ -z "$(printf '%s' "$got" | tr -d '[:space:]')" ]; then
      echo "  FAIL (n4) pf is enabled but anchor '$ANCHOR_NAME' has NO loaded rules — the anchor line in /etc/pf.conf is gone (a macOS update can do this). Re-run: sudo bash scripts/network/install-pf.sh"; fail=1
    else
      echo "  FAIL (n4) the loaded anchor does not match $ANCHOR_FILE — $verdict"; fail=1
    fi
  else
    echo "  FAIL (n4) pf is NOT enabled. Run: sudo bash scripts/network/install-pf.sh"; fail=1
  fi
fi

# ══ (n5) the partners' path still works ══════════════════════════════════════════════════════════
app_body=$(curl -s -m 25 "$SERVE_APP/" 2>/dev/null)
app_code=$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$SERVE_APP/" 2>/dev/null)
api_code=$(curl -s -m 25 -o /dev/null -w '%{http_code}' "$SERVE_API/rest/v1/" 2>/dev/null)
api_hdr=$(curl -s -m 25 -D - -o /dev/null "$SERVE_API/rest/v1/" 2>/dev/null | tr -d '\r')
n5_bad=""
[ "$app_code" = "200" ] || n5_bad="$n5_bad app_status=$app_code"
printf '%s' "$app_body" | grep -qiE '<html|<!doctype html' || n5_bad="$n5_bad app_body_not_html"
printf '%s' "$api_hdr" | grep -qiE 'kong|postgrest|server:' || [ "$api_code" = "200" ] || n5_bad="$n5_bad api_no_kong_response(status=$api_code)"
if [ -n "$n5_bad" ]; then
  echo "  FAIL (n5) a Tailscale serve URL is not answering:$n5_bad — PARTNERS MAY BE LOCKED OUT; undo with: sudo bash scripts/network/uninstall-pf.sh"; fail=1
else
  echo "  ok   (n5) both serve URLs answer — the app returns 200 with HTML, the API returns a Kong response ($api_code)"
fi

trap - EXIT
restore_plant
restore_report || fail=1
[ "$fail" = 0 ] || { echo "guard: FAIL"; exit 1; }
echo "guard: PASS"
