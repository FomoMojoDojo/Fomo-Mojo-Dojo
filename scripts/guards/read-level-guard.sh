#!/bin/bash
# ── READ-LEVEL GUARD — the level rule (operator ruling 14) and the positioning alternative (ruling 15), 2026-10-22 ──────
#
# probe: supabase/functions/_shared/readLevel.test.ts over fixtures/readLevel/reads-20261022.json — copied text of eight
# companies' current reads; pure, no DB write, no network, no model. Ends by proving model_calls and public_reads unchanged.
#
#   v1  L1 offering echo (LOG ONLY): Spectrum's nine lines flag; every cited row must be an offering row (SIAA, Lumio clean)
#   v2  L2 strategy names an offering (multi-word label names): Spectrum aspiration + how_to_win refuse, cap[1] logs;
#       where_to_play ("TV service") and Gotham ("New York" inside a label) clean; Corestar how_to_win refuses
#   v3  L3 promise product subject: Spectrum refuses; SIAA / Riverlane / Edgewood / Gotham (label after the verb) clean
#   v4  L4 best fit names no need: Spectrum refuses; BlueSkyAI's residue ["growth"] clean; no offering read ⇒ fail open
#   v5  wiring: GUARD 5b after S1 and before the judge; the level re-ask spends the ONE shared budget; promote re-checks
#       before the flip; the withheld set unions the level keys; carries and the strategy feed read it; prompt + judge (g)
#   v6  coupling: a level-flagged predecessor line is licensed by continuity, never demanded (Spectrum ua[3])
#   v7  ruling 15: an alternative uncited (A1), not named in its cited rows' page words (A2), or named only by our read (A3)
#       refuses; an empty field records an alternative gap, never a guess
#
# Plants (each injected live, the guard RED with the measured value moved, restored md5-identical, GREEN):
#   P1  L1 coverage threshold dropped to 0                       => v1 every cited line flags (RED)
#   P2  L1's every-cited-row-is-an-offering-row condition removed => v1 SIAA promise / Lumio value flag (RED)
#   P3  L2's name-shaped filter removed (any namesIn token)       => v2 Gotham "New York" / single-word names flag (RED)
#   P4  L2's label matching disabled                              => v2 the aspiration hit disappears (RED)
#   P5  L3's subject split at end of line                         => v3 SIAA / Riverlane / Edgewood flag (RED)
#   P6  L4's offering words not stripped                          => v4 Spectrum's best fit passes (RED)
#   P7  the level keys dropped from the withheld set              => v6 continuity demands Spectrum ua[3] (RED)
#   PA1 an uncited alternative admitted                           => v7 A1 (RED)
#   PA2 the name-in-page-words check removed                      => v7 A2 (RED)
#   PA3 our read admitted as the naming row (the empty field filled by the model) => v7 A3 (RED)
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql_() { docker exec -i "$DB" psql -U postgres -d postgres -XAt -v ON_ERROR_STOP=1 "$@"; }
FAILS=0
fail() { echo "  FAIL ($1) $2"; FAILS=$((FAILS+1)); }
ok() { echo "  ok   ($1) $2"; }
COUNTS="select (select count(*) from model_calls)||'|'||(select md5(coalesce(string_agg(id::text||is_current::text||coalesce(superseded_by::text,''), ',' order by id),'')) from public_reads)"
BEFORE=$(psql_ -c "$COUNTS")

T=$(cd supabase/functions/_shared && NO_COLOR=1 deno test -A --no-check readLevel.test.ts 2>&1)
check() { # $1 step  $2 test-name prefix  $3 what
  if echo "$T" | grep -F -- "$2" | grep -qE '\.\.\. ok'; then ok "$1" "$3"; else fail "$1" "$3 — $(echo "$T" | grep -F -- "$2" | head -1)"; fi
}
check v1 "L1 offering echo" "L1: Spectrum's nine lines flag, log only"
check v1 "L1 needs EVERY cited row" "L1: every cited row must be an offering row (SIAA, Lumio clean)"
check v2 "L2 a strategy rung" "L2: aspiration + how_to_win refuse on 'Anytime Upgrade', cap[1] logs, TV service / New York clean, Corestar refuses"
check v3 "L3 the promise's subject" "L3: Spectrum's product subject refuses; a label after the verb is clean"
check v4 "L4 best fit names no need" "L4: Spectrum refuses; BlueSkyAI's 'growth' clean"
check v4 "no offering read" "no offering read ⇒ nothing flags (fail open)"
check v4 "the refusal detail names" "the refusal detail names L2–L4 only"
check v5 "L5 wiring" "S1 → level → judge; one shared re-ask budget; promote S1 → level → flip; withheld / carries / strategy feed; prompt + (g)"
check v6 "C7 coupling" "a level-flagged predecessor line (Spectrum ua[3]) is licensed, never demanded"
check v7 "A1 an alternative" "A1: uncited alternative refused"
check v7 "A2 an alternative" "A2: name absent from the cited rows' page words refused"
check v7 "A3 an alternative" "A3: an alternative named only by our read refused"
check v7 "A ok:" "a record- or company-named, cited alternative passes"
check v7 "G an empty field" "an empty field records an alternative gap, never a guess"
N=$(echo "$T" | grep -E '^ok \|' | head -1)
[ -n "$N" ] && ok all "$N" || fail all "$(echo "$T" | grep -E 'FAILED|error:' | head -3 | tr '\n' ' ')"

AFTER=$(psql_ -c "$COUNTS")
[ "$BEFORE" = "$AFTER" ] && ok end "model_calls and public_reads unchanged (${AFTER%%|*}|…)" || fail end "changed: $BEFORE → $AFTER"
if [ $FAILS -eq 0 ]; then echo "GUARD OK"; else echo "guard: FAIL ($FAILS)"; exit 1; fi
