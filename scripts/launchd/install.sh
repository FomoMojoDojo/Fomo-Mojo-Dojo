#!/usr/bin/env bash
#
# B3 (R23) — install the client-sync launchd job for the CURRENT user.
#
# Substitutes __REPO__ in the committed template from `git rev-parse --show-toplevel`, writes the plist
# to ~/Library/LaunchAgents, loads it, and prints the loaded state so the operator can see it without
# running it. RunAtLoad is false in the template (R21), so THIS SCRIPT DOES NOT RUN THE SYNC — loading
# the job schedules it and nothing more.
#
#   bash scripts/launchd/install.sh
set -euo pipefail

LABEL="com.fomomojodojo.mojomap-client-sync"
REPO="$(git rev-parse --show-toplevel)"
TEMPLATE="$REPO/scripts/launchd/$LABEL.plist.template"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -f "$TEMPLATE" ] || { echo "FATAL: template not found at $TEMPLATE"; exit 1; }
[ -x "$REPO/scripts/notion-client-sync/run-scheduled.sh" ] || {
  echo "FATAL: $REPO/scripts/notion-client-sync/run-scheduled.sh is missing or not executable"; exit 1; }

mkdir -p "$HOME/Library/LaunchAgents" "$REPO/local-db-backups"

# Substitute, then REFUSE if any placeholder survived — an unsubstituted plist would point launchd at a
# path that does not exist and fail silently every morning.
sed "s|__REPO__|$REPO|g" "$TEMPLATE" > "$TARGET.tmp"
if LC_ALL=C grep -q "__REPO__" "$TARGET.tmp"; then
  rm -f "$TARGET.tmp"
  echo "FATAL: __REPO__ did not substitute — refusing to install"; exit 1
fi
/usr/bin/plutil -lint "$TARGET.tmp" >/dev/null || { rm -f "$TARGET.tmp"; echo "FATAL: the generated plist is not valid"; exit 1; }
mv -f "$TARGET.tmp" "$TARGET"
echo "wrote $TARGET"

# Replace any previous registration, then load. bootout of a job that is not loaded is not an error here.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$TARGET"
echo "loaded $LABEL"
echo
echo "── loaded state (the job has NOT run: RunAtLoad is false) ──"
launchctl print "gui/$(id -u)/$LABEL" | LC_ALL=C grep -E 'state|path =|runs =|last exit code' || true
echo
echo "Schedule: 06:00 and 12:00 local (America/Los_Angeles). The 12:00 firing is the power-off catch-up"
echo "and exits immediately when 06:00 already succeeded today."
echo "Log: $REPO/local-db-backups/client-sync.log"
if ! LC_ALL=C grep -q '^HEALTHCHECK_URL=.' "$REPO/backups/client-sync.env" 2>/dev/null; then
  echo
  echo "NOTE: backups/client-sync.env has no HEALTHCHECK_URL — the sync will run and log 'pings skipped',"
  echo "      so a run that never happens will NOT raise an alarm (R16)."
fi
