#!/usr/bin/env bash
# ── NO TEST READS EDGEWOOD (D4b, 2026-11-16) ─────────────────────────────────────────────────────────
#
# Edgewood (3dd2cfbb) is a real client. Its tests moved to the Edgewood TEST TWIN (ed9e7000…d4b1, built by
# scripts/twin/build-edgewood-twin.mjs), and scripts/edgewood-unchanged.sh is the ONE reader left — it
# only compares a snapshot. scripts/edgewood-unchanged.sh proves no run WRITES Edgewood; this guard proves
# no test code names it, so none can READ it:
#   (r1) the Edgewood id appears nowhere in the code that reaches the database in a test: the Playwright
#        config, tests/, scripts/guards/, and every Deno test that opens a live client
#   (r2) no exact-name lookup of it there either (name = 'Edgewood', .eq("name", "Edgewood"))
#   (r3) the twin exists, is held, and is the Playwright default
# The allow-list is one file: scripts/edgewood-unchanged.sh. Unit tests that use the id only as an
# in-memory literal (no client, no psql) are not test code that reaches the database and are not scanned.
# Plant: point a repointed spec back at Edgewood → (r1) RED.
set -uo pipefail
cd "$(dirname "$0")/../.."
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
EDGEWOOD=3dd2cfbb-0792-4bf1-9cd4-15db9646874b
TWIN=ed9e7000-0000-4000-8000-00000000d4b1
fails=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fails=$((fails+1)); }
SELF=scripts/guards/edgewood-reference-guard.sh

# the files: config, specs, guards, and the Deno tests that open a live database client
FILES=$( { echo playwright.config.ts; find tests scripts/guards -type f \( -name '*.ts' -o -name '*.mjs' -o -name '*.js' -o -name '*.sh' -o -name '*.sql' \);
           grep -rlE 'createClient\(|execFileSync|docker exec|psql ' supabase/functions --include='*.test.ts' 2>/dev/null; } | grep -v "^$SELF$" | sort -u)
N=$(printf '%s\n' "$FILES" | grep -c .)

HITS=$(printf '%s\n' "$FILES" | xargs grep -ln "$EDGEWOOD" 2>/dev/null)
[ -z "$HITS" ] && ok "(r1) $N file(s) scanned; the Edgewood id appears in none" \
  || bad "(r1) the Edgewood id is named in: $(echo $HITS)"
NAMED=$(printf '%s\n' "$FILES" | xargs grep -lnE "name ?= ?'Edgewood'|\(\"name\", ?\"Edgewood\"\)|ilike '%?[Ee]dgewood%?'" 2>/dev/null)
[ -z "$NAMED" ] && ok "(r2) no exact-name lookup of Edgewood" || bad "(r2) an Edgewood name lookup in: $(echo $NAMED)"

HELD=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select coalesce(fixture_hold,'') from public.companies where id='$TWIN';" </dev/null)
[ -n "$HELD" ] && ok "(r3) the twin $TWIN exists and is held ('$HELD')" || bad "(r3) the twin $TWIN is missing or not held"
grep -q "process.env.FR_COMPANY_ID || \"$TWIN\"" playwright.config.ts \
  && ok "(r3) the twin is the Playwright default company" || bad "(r3) the Playwright default is not the twin"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s))"; exit 1; fi
