#!/bin/bash
# Fleet deno check — every edge function entrypoint, one at a time (deno check stops at the first
# failing entrypoint when given several, so a single call hides the rest). Standing acceptance from
# Gate 6c: a SyntaxError here is a function that cannot BOOT (every call 503s); "Type checking failed"
# entries are the pre-existing type debt, listed so the count can only go down.
cd "$(dirname "$0")/../supabase/functions" || exit 1
fails=0; total=0
for f in $(ls -d */ | grep -v "^_shared/" | sed 's#/$#/index.ts#'); do
  [ -f "$f" ] || continue; total=$((total+1))
  out=$(NO_COLOR=1 deno check "$f" 2>&1)
  if echo "$out" | grep -qE "^error"; then fails=$((fails+1)); echo "FAIL $f :: $(echo "$out" | grep -E '^error' | head -1 | cut -c1-120)"; fi
done
echo "functions checked=$total failing=$fails"
