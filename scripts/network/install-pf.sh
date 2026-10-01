#!/usr/bin/env bash
# Install the MojoMap pf boundary — ruling N1 (2026-09-30). RUN WITH sudo, BY THE OPERATOR.
#
# Idempotent: safe to run twice. Backs up every system file it changes, with a timestamp. Prints what
# it did and what it left alone. Makes no change to Tailscale, to the application firewall, to Docker,
# or to any database role.
#
# Undo: sudo bash scripts/network/uninstall-pf.sh
set -uo pipefail

[ "$(id -u)" = "0" ] || { echo "install-pf: must run as root (use sudo)"; exit 1; }
HERE="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
ANCHOR_SRC="$HERE/pf.anchor"
ANCHOR_DST="/etc/pf.anchors/mojomap"
PLIST_SRC="$HERE/com.fomomojodojo.mojomap-pf.plist"
PLIST_DST="/Library/LaunchDaemons/com.fomomojodojo.mojomap-pf.plist"
PFCONF="/etc/pf.conf"
did=0

[ -f "$ANCHOR_SRC" ] || { echo "install-pf: missing $ANCHOR_SRC"; exit 1; }
[ -f "$PLIST_SRC" ]  || { echo "install-pf: missing $PLIST_SRC"; exit 1; }

# ── 1. the anchor file ────────────────────────────────────────────────────────────────────────────
if [ -f "$ANCHOR_DST" ] && cmp -s "$ANCHOR_SRC" "$ANCHOR_DST"; then
  echo "  anchor      already current at $ANCHOR_DST — left alone"
else
  [ -f "$ANCHOR_DST" ] && { cp -p "$ANCHOR_DST" "$ANCHOR_DST.bak.$STAMP"; echo "  anchor      backed up existing to $ANCHOR_DST.bak.$STAMP"; }
  install -d -m 755 /etc/pf.anchors
  install -m 644 "$ANCHOR_SRC" "$ANCHOR_DST"
  echo "  anchor      installed $ANCHOR_DST"; did=1
fi

# Parse the anchor BEFORE touching pf.conf, so a syntax error cannot leave a half-installed boundary.
if ! pfctl -vnf "$ANCHOR_DST" >/dev/null 2>&1; then
  echo "  FAIL        $ANCHOR_DST does not parse; nothing further changed. Output:"
  pfctl -vnf "$ANCHOR_DST" 2>&1 | sed 's/^/                /'
  exit 1
fi
echo "  anchor      parses clean"

# ── 2. the two lines in /etc/pf.conf ──────────────────────────────────────────────────────────────
if grep -qE '^[[:space:]]*anchor[[:space:]]+"mojomap"' "$PFCONF" \
   && grep -qE '^[[:space:]]*load anchor[[:space:]]+"mojomap"' "$PFCONF"; then
  echo "  pf.conf     anchor lines already present — left alone"
else
  cp -p "$PFCONF" "$PFCONF.bak.$STAMP"
  echo "  pf.conf     backed up to $PFCONF.bak.$STAMP"
  {
    printf '\n#\n# MojoMap boundary (ruling N1, 2026-09-30) — see /etc/pf.anchors/mojomap\n#\n'
    printf 'anchor "mojomap"\n'
    printf 'load anchor "mojomap" from "%s"\n' "$ANCHOR_DST"
  } >> "$PFCONF"
  echo "  pf.conf     appended the anchor and load lines"; did=1
fi

# ── 3. the whole ruleset must parse before anything is enabled ────────────────────────────────────
if ! pfctl -vnf "$PFCONF" >/dev/null 2>&1; then
  echo "  FAIL        $PFCONF does not parse after the change. Restoring the backup."
  [ -f "$PFCONF.bak.$STAMP" ] && cp -p "$PFCONF.bak.$STAMP" "$PFCONF"
  pfctl -vnf "$PFCONF" 2>&1 | sed 's/^/                /'
  exit 1
fi
echo "  ruleset     $PFCONF parses clean"

# ── 4. the LaunchDaemon ───────────────────────────────────────────────────────────────────────────
if [ -f "$PLIST_DST" ] && cmp -s "$PLIST_SRC" "$PLIST_DST"; then
  echo "  daemon      already current at $PLIST_DST — left alone"
else
  [ -f "$PLIST_DST" ] && { cp -p "$PLIST_DST" "$PLIST_DST.bak.$STAMP"; echo "  daemon      backed up existing to $PLIST_DST.bak.$STAMP"; }
  install -m 644 -o root -g wheel "$PLIST_SRC" "$PLIST_DST"
  echo "  daemon      installed $PLIST_DST"; did=1
fi
launchctl bootout system "$PLIST_DST" 2>/dev/null || true
launchctl bootstrap system "$PLIST_DST" 2>/dev/null \
  && echo "  daemon      bootstrapped (and will run at every boot)" \
  || echo "  daemon      bootstrap reported an error — check: launchctl print system/com.fomomojodojo.mojomap-pf"

# ── 5. load and enable now, so the operator does not have to reboot ───────────────────────────────
pfctl -E -f "$PFCONF" 2>&1 | sed 's/^/  pfctl       /'

echo
echo "  ── state now ──"
pfctl -s info 2>/dev/null | head -2 | sed 's/^/  /'
echo "  anchor rules loaded:"
pfctl -a mojomap -s rules 2>/dev/null | sed 's/^/    /'
[ "$did" = "1" ] && echo "  (changes were made)" || echo "  (nothing needed changing)"
echo
echo "  NEXT, in scripts/network/RUNBOOK.md: step 5 (check from this Mac), step 6 (the AFTER test from"
echo "  your phone, against the same addresses you tried in step 2), step 7 (prove the undo works), then"
echo "  step 8 (a partner signs in). Do not call this done before step 8."
