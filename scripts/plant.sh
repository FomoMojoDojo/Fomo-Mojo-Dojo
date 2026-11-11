#!/usr/bin/env bash
# PLANT AND RESTORE, SAFELY (U6-80 hygiene ruling, 2026-11-11).
#
# WHY THIS EXISTS. A plant run on 2026-11-11 restored its file with `git checkout -- <file>`. That
# file carried UNCOMMITTED work, so the checkout did not undo the plant — it undid the commit's own
# changes, silently, and the "restored md5" check then compared against the wrong thing. The work was
# recovered because the md5 was recorded BEFORE the plant and did not match after.
#
# THE RULE: a plant restores from a COPY taken before the plant, never from git. git knows the last
# commit; a plant is a temporary edit on top of whatever is in the tree, committed or not.
#
#   bash scripts/plant.sh save    <file>            → copy it aside, print the md5
#   bash scripts/plant.sh restore <file>            → put the copy back, verify the md5, remove the copy
#
# `restore` FAILS LOUDLY if the md5 does not match, because a plant that cannot be proven undone is
# indistinguishable from a change nobody signed.
set -euo pipefail

DIR="${PLANT_DIR:-${TMPDIR:-/tmp}/mojomap-plants}"
mkdir -p "$DIR"

action="${1:-}"; file="${2:-}"
[ -n "$action" ] && [ -n "$file" ] || { echo "usage: $0 save|restore <file>" >&2; exit 2; }
[ -f "$file" ] || { echo "no such file: $file" >&2; exit 2; }

key=$(printf '%s' "$file" | tr '/' '_')
copy="$DIR/$key"
sum="$DIR/$key.md5"

md5of() { md5 -q "$1" 2>/dev/null || md5sum "$1" | cut -d' ' -f1; }

case "$action" in
  save)
    cp -p "$file" "$copy"
    md5of "$file" > "$sum"
    echo "saved $file  md5 $(cat "$sum")"
    ;;
  restore)
    # NOTE: no backticks in this message. Backticks inside a double-quoted string are command
    # substitution, so the shell ran the word as a command and printed "save: command not found".
    [ -f "$copy" ] || { echo "no saved copy for $file - run 'save' first" >&2; exit 1; }
    cp -p "$copy" "$file"
    now=$(md5of "$file")
    want=$(cat "$sum")
    if [ "$now" != "$want" ]; then
      echo "RESTORE FAILED for $file: md5 $now, expected $want" >&2
      exit 1
    fi
    rm -f "$copy" "$sum"
    echo "restored $file  md5 $now  (identical)"
    ;;
  *) echo "usage: $0 save|restore <file>" >&2; exit 2;;
esac
