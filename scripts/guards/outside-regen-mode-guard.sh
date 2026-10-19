#!/usr/bin/env bash
# ── OUTSIDE-REGEN MODE GUARD — R8 (operator ruling 2026-10-18) ────────────────────────────────────
#
# WHY THIS GUARD EXISTS. extract-outside-evidence read company_id, urls and run_id and nothing else: any
# body that passed the review gate WROTE (generated, judged, minted signals) and an unknown key was
# ignored, not refused. There was no read-only question to ask it. This guard proves the function now
# obeys no-write-by-default — the mode is named or the call is refused — and that a plan builds no
# transport and writes nothing.
#
# Checks (affirmative, no plant):
#   n1. MODULE — the classifier with the regen lists refuses {}, a mode-less body, a two-mode body and
#       an unknown key, and accepts plan alone and write alone; the handler test proves plan makes ZERO
#       transport constructions and ZERO inserts and write makes one transport and two ledger rows per
#       page (supabase/functions/_shared/outsideRegenHandler.test.ts); the generator's own body-mode test
#       still passes with its lists passed explicitly (bodyModeNamed.test.ts).
#   n2. TYPE — a call to classifyBodyMode WITHOUT the lists is a type error: `deno check` on
#       scripts/guards/fixtures/bodyMode-no-lists.ts must FAIL (TS2554). A default list would make it pass.
#   n3. SOURCE — the function imports runOutsideRegen; the handler classifies the body with
#       REGEN_MODE_FLAGS / REGEN_BODY_KEYS BEFORE it reads company_id or run_id; the transport is
#       constructed AFTER the plan branch returns (never on plan); the generator passes MODE_FLAGS and
#       KNOWN_BODY_KEYS explicitly at its call site.
#   n5. (R22) the client is always named: no prompt builder carries the literal "the client"; the function imports
#       _shared/outsideRegenPrompts.ts; the handler names the client through clientAnchorsFor (name, host, entity
#       anchors) and records anchors_used; the clientAnchors tests pass.
#   n4. BOOT — the SERVED function answers {} with 400 naming guard body_mode_unnamed (an empty body is
#       refused before company_id is even read). generate-public-read's {} answer is PRINTED: it checks
#       company_id first, so it names company_id — reported, not asserted (R8 left its order alone).
#       No write body is ever sent.
#
# Plants (each in place, confirmed to move a measured value, RED, restored md5-identical — 2026-10-18):
#   PA  classifier permissive (no-mode body accepted)   => after an edge restart the {} probe moves from
#                                                         400 body_mode_unnamed to the company_id error; n1 red too
#   PB  transport built before the plan branch          => n1's "zero transport constructions on plan" red
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
fail() { echo "FAIL step $1: $2"; exit 1; }
jq_() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
FN=supabase/functions/extract-outside-evidence/index.ts
H=supabase/functions/_shared/outsideRegenHandler.ts
GEN=supabase/functions/generate-public-read/index.ts
FIX=scripts/guards/fixtures/bodyMode-no-lists.ts

# n1 — module tests
for t in supabase/functions/_shared/outsideRegenHandler.test.ts supabase/functions/_shared/bodyModeNamed.test.ts; do
  T=$(NO_COLOR=1 deno test --allow-all --no-check "$t" 2>&1 | grep -E '^ok \||^FAILED \|' | tail -1 || true)
  echo "$T" | grep -q '^ok |' || fail n1 "$t: ${T:-no summary line} $(NO_COLOR=1 deno test --allow-all --no-check "$t" 2>&1 | grep -E 'FAILED|error:' | head -3)"
  echo "n1. $t: $T"
done

# n2 — the lists are required
if NO_COLOR=1 deno check "$FIX" >/dev/null 2>&1; then fail n2 "a call without the lists type-checks — a default list is back"; fi
FIXOUT=$(NO_COLOR=1 deno check "$FIX" 2>&1 || true)   # captured first: a grep -q on a live pipe trips pipefail
echo "$FIXOUT" | grep -q 'TS2554' || fail n2 "the fixture fails for a reason other than the missing arguments: $(echo "$FIXOUT" | head -2)"
echo "n2. a classifyBodyMode call without its lists is a type error (TS2554)"

# n3 — source
grep -q 'from "../_shared/outsideRegenHandler.ts"' "$FN" || fail n3 "function does not import the handler"
grep -q 'runOutsideRegen(' "$FN" || fail n3 "function does not call runOutsideRegen"
grep -q 'classifyBodyMode(body, REGEN_MODE_FLAGS, REGEN_BODY_KEYS)' "$H" || fail n3 "handler does not classify with its own lists"
python3 - "$H" <<'EOF' || exit 1
import sys; s=open(sys.argv[1]).read()
i_cls=s.index('classifyBodyMode(body, REGEN_MODE_FLAGS, REGEN_BODY_KEYS)')
i_co=s.index('if (!company_id) return'); i_run=s.index('requireRunId(body)')
i_plan=s.index('if (mode === "plan")'); i_tr=s.index('deps.makeTransport()')
assert i_cls < i_co and i_cls < i_run, "FAIL step n3: the mode is not classified before company_id / run_id are read"
assert i_tr > i_plan, "FAIL step n3: the transport is constructed before the plan branch"
assert s.count('deps.makeTransport()') == 1, "FAIL step n3: more than one transport construction site"
EOF
grep -q 'classifyBodyMode(body as Record<string, unknown>, MODE_FLAGS, KNOWN_BODY_KEYS)' "$GEN" || fail n3 "generate-public-read does not pass its lists explicitly"
echo "n3. source: mode classified first with the regen lists; transport built only after the plan branch; the generator passes its lists"

# n4 — boot: the served function refuses {}
KEY=$(npx supabase status --output env 2>/dev/null | grep '^SERVICE_ROLE_KEY=' | cut -d'"' -f2)
[ -n "$KEY" ] || fail n4 "no service-role key from supabase status"
R=$(curl -s -m 60 -w '\n%{http_code}' -X POST "http://127.0.0.1:54321/functions/v1/extract-outside-evidence" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{}')
CODE=$(echo "$R" | tail -1); BODY=$(echo "$R" | sed '$d')
[ "$CODE" = "400" ] || fail n4 "extract-outside-evidence {} answered $CODE: $BODY"
[ "$(echo "$BODY" | jq_ "d.get('guard')")" = "body_mode_unnamed" ] || fail n4 "extract-outside-evidence {} did not name body_mode_unnamed: $BODY"
echo "n4. extract-outside-evidence {} → 400 guard=body_mode_unnamed (keys_sent=$(echo "$BODY" | jq_ "d.get('keys_sent')"))"
G=$(curl -s -m 60 -w ' [%{http_code}]' -X POST "http://127.0.0.1:54321/functions/v1/generate-public-read" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{}' | tail -c 200)
echo "n4. generate-public-read {} → $G (company_id is checked before the mode there; reported, not asserted)"

# n5 — R22: the client is always named; no prompt builder carries the literal "the client"
PR=supabase/functions/_shared/outsideRegenPrompts.ts
[ -f "$PR" ] || fail n5 "prompts module missing"
for f in "$PR" "$FN"; do
  grep -vE '^\s*//' "$f" | grep -q '"the client"' && fail n5 "the fallback literal \"the client\" is back in $f"
  grep -vE '^\s*//' "$f" | grep -qE '`[^`]*\bthe client\b' && fail n5 "a prompt template in $f names 'the client' instead of the anchors"
done
grep -q 'from "../_shared/outsideRegenPrompts.ts"' "$FN" || fail n5 "the function does not import the shared prompts"
grep -q 'clientAnchorsFor(co' "$H" || fail n5 "the handler does not name the client through clientAnchorsFor"
grep -q 'anchors_used: anchors' "$H" || fail n5 "the integrity row / plan does not record the anchor set"
T=$(NO_COLOR=1 deno test --allow-all --no-check supabase/functions/_shared/clientAnchors.test.ts 2>&1 | grep -E '^ok \||^FAILED \|' | tail -1 || true)
echo "$T" | grep -q '^ok |' || fail n5 "clientAnchors tests: ${T:-no summary} $(NO_COLOR=1 deno test --allow-all --no-check supabase/functions/_shared/clientAnchors.test.ts 2>&1 | grep -E '\.\.\. FAILED|AssertionError' | head -3)"
A=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-anchor-probe.ts 2>&1 | tail -1)
[ "$(echo "$A" | jq_ "d.get('present_in_generator_prompt')")" = "2" ] || fail n5 "anchors present in the built generator prompt != 2: $A"
[ "$(echo "$A" | jq_ "d.get('the_client_in_prompt')")" = "False" ] || fail n5 "the built generator prompt names 'the client': $A"
echo "n5. probe (fake write, real prompts): $A"
echo "n5. R22: no 'the client' literal in any prompt builder; the function imports the shared prompts; the handler names the client through clientAnchorsFor and records anchors_used; $T"
echo "GUARD OK"
