#!/usr/bin/env bash
# Remove the MojoMap pf boundary — the one-step undo. RUN WITH sudo, BY THE OPERATOR.
#
# This is what you run if a partner loses access, or anything else goes wrong. It removes our rules and
# nothing else. Apple's own anchor stays, and pf is LEFT ENABLED with Apple's rules only — which block
# nothing, so every port answers again. No Tailscale, Docker, firewall or database setting is touched.
#
# Idempotent: safe to run twice, and safe to run when nothing was ever installed.
set -uo pipefail

[ "$(id -u)" = "0" ] || { echo "uninstall-pf: must run as root (use sudo)"; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
ANCHOR_DST="/etc/pf.anchors/mojomap"
PLIST_DST="/Library/LaunchDaemons/com.fomomojodojo.mojomap-pf.plist"
PFCONF="/etc/pf.conf"

# ── 1. stop the daemon so it cannot re-enable after we are done ───────────────────────────────────
if [ -f "$PLIST_DST" ]; then
  launchctl bootout system "$PLIST_DST" 2>/dev/null || true
  cp -p "$PLIST_DST" "$PLIST_DST.removed.$STAMP" 2>/dev/null || true
  rm -f "$PLIST_DST"
  echo "  daemon      booted out and removed (a copy is at $PLIST_DST.removed.$STAMP)"
else
  echo "  daemon      not present — nothing to remove"
fi

# ── 2. flush just our anchor, so the ports open again immediately ─────────────────────────────────
if pfctl -a mojomap -s rules >/dev/null 2>&1; then
  pfctl -a mojomap -F rules 2>&1 | sed 's/^/  pfctl       /'
  echo "  anchor      rules flushed — the blocked ports answer again from this moment"
else
  echo "  anchor      no loaded rules to flush"
fi

# ── 3. take our whole appended block back out of /etc/pf.conf ─────────────────────────────────────
if grep -qE '^[[:space:]]*(anchor|load anchor)[[:space:]]+"mojomap"' "$PFCONF"; then
  cp -p "$PFCONF" "$PFCONF.bak.$STAMP"
  echo "  pf.conf     backed up to $PFCONF.bak.$STAMP"
  # Remove the WHOLE block install-pf.sh appends, exactly: the blank line, the bare "#", the MojoMap
  # comment line, the second bare "#", then `anchor "mojomap"` and `load anchor "mojomap" ...`.
  # Amendment A3: the previous version left the leading blank line and one "#" behind, so an
  # install/uninstall cycle grew /etc/pf.conf by two lines each time. Matching the block as a unit —
  # anchored on the MojoMap comment and walking outward — makes the round trip byte-identical.
  awk '
    # ORDER MATTERS. The in-block rules come FIRST: while we are inside our block, its bare "#" must be
    # dropped, not buffered. With the generic buffering rule first, that "#" was buffered and re-emitted
    # at END, leaving one stray line behind on every cycle.
    inblock && /^#$/                                           { next }
    inblock && /^[[:space:]]*anchor[[:space:]]+"mojomap"/       { next }
    inblock && /^[[:space:]]*load anchor[[:space:]]+"mojomap"/  { inblock = 0; next }
    # The block header. Discard the buffered blank + "#" that precede it; they are ours too.
    /^# MojoMap boundary \(ruling N1/                          { pend = ""; inblock = 1; next }
    # Buffer a run of blank / bare-# lines: they are emitted only once a real line follows, so a run
    # that turns out to be our block header is discarded instead of printed.
    /^$/                                                       { pend = pend $0 ORS; next }
    /^#$/                                                      { pend = pend $0 ORS; next }
    # A stray anchor line outside the block (hand-added) still goes.
    /^[[:space:]]*anchor[[:space:]]+"mojomap"/                  { next }
    /^[[:space:]]*load anchor[[:space:]]+"mojomap"/             { next }
    { printf "%s", pend; pend = ""; inblock = 0; print }
    END { printf "%s", pend }
  ' "$PFCONF" > "$PFCONF.new" && mv "$PFCONF.new" "$PFCONF"
  chmod 644 "$PFCONF"; chown root:wheel "$PFCONF"
  echo "  pf.conf     appended block removed"
else
  echo "  pf.conf     no anchor lines present — left alone"
fi

# ── 4. reload the cleaned ruleset (pf stays enabled, carrying Apple's anchor only) ────────────────
if pfctl -vnf "$PFCONF" >/dev/null 2>&1; then
  pfctl -f "$PFCONF" 2>&1 | sed 's/^/  pfctl       /'
  echo "  ruleset     reloaded without our anchor"
else
  echo "  WARNING     $PFCONF does not parse; restore $PFCONF.bak.$STAMP by hand before rebooting"
fi
# NOT disabling pf. `pfctl -X` on macOS requires the token that -E printed, which this script does not
# have, and disabling pf outright would also switch off whatever Apple or another component is using it
# for. pf is left ENABLED carrying Apple's anchor only — which blocks nothing — so the ports are open
# again the moment the flush above lands. That is the correct end state, not a compromise.

# ── 5. the anchor file itself ─────────────────────────────────────────────────────────────────────
if [ -f "$ANCHOR_DST" ]; then
  mv "$ANCHOR_DST" "$ANCHOR_DST.removed.$STAMP"
  echo "  anchor      moved to $ANCHOR_DST.removed.$STAMP"
fi

echo
echo "  ── state now ──"
pfctl -s info 2>/dev/null | head -2 | sed 's/^/  /'
echo "  mojomap anchor rules: $(pfctl -a mojomap -s rules 2>/dev/null | grep -c . ) (0 means gone)"
echo
echo "  pf is still ENABLED, and that is expected: it now carries Apple's anchor only, which blocks"
echo "  nothing. Every port that was closed answers again from the flush above — you do not need to"
echo "  reboot or disable pf. Partners were never affected by this boundary either way, so their"
echo "  Tailscale access is unchanged. Nothing else on this Mac was altered."
