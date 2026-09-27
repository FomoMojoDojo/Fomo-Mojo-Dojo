#!/usr/bin/env bash
#
# B3 (R23) — remove the client-sync launchd job.
#
# Boots the job out and deletes the plist. Leaves the log, the status marker and the lock alone: they
# are evidence, and a lock left behind is judged by R17 (dead AND older than 30 min) on the next run
# rather than deleted blindly here.
#
#   bash scripts/launchd/uninstall.sh
set -euo pipefail

LABEL="com.fomomojodojo.mojomap-client-sync"
TARGET="$HOME/Library/LaunchAgents/$LABEL.plist"

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/$LABEL"
  echo "booted out $LABEL"
else
  echo "$LABEL was not loaded"
fi

if [ -f "$TARGET" ]; then
  rm -f "$TARGET"
  echo "removed $TARGET"
else
  echo "no plist at $TARGET"
fi

echo
echo "Left in place on purpose: local-db-backups/client-sync.log, .client-sync_status, and any"
echo ".client-sync.lock (R17 judges a stale lock on the next run; it is not deleted blindly here)."
