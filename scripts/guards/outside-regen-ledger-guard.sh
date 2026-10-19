#!/usr/bin/env bash
# ── OUTSIDE-REGEN LEDGER GUARD — R4 (operator ruling 2026-10-18) ──────────────────────────────────
#
# WHY THIS GUARD EXISTS. extract-outside-evidence made two gpt-4.1-mini calls per page through a raw
# fetch that never read data.usage: eight r3 runs (36 admitted rows) left ZERO model_calls rows, and the
# registry carried the gap as `captured: false`. b3 regenerates ~293 URLs (~586 calls). The ledger is
# b3's first step, so this guard proves every call on that path writes a row — and fails if it stops.
#
# Checks (affirmative, no plant):
#   l1. SOURCE — the function imports _shared/outsideRegenModel.ts, routes the generator AND the judge
#       through it, builds its transport on the shared callOpenAIJson, its ledger on recordModelCall,
#       keeps no raw fetch to api.openai.com, writes the per-run tally into its integrity row; the
#       registry line for the site reads captured: true.
#   l2. MODULE — the probe (scripts/guards/outside-regen-ledger-probe.ts: fake transport, fake ledger,
#       no network) runs one page and prints the measured values: rows_per_page == 2, every priced row
#       carries a non-null usd, sha is 64 hex, the nano-fallback case ledgers attempt 1 (usd NULL) and
#       attempt 2 (priced), two un-parseable answers still ledger two rows (ledger BEFORE parse). The
#       module's own Deno test file must pass too.
#   l3. DATA — for every integrity_runs row of component r3_outside_regen ran AFTER the fix landed, the
#       model_calls rows at call_site extract-outside-evidence:* for that company inside the run's window
#       must number at least the pages processed. UNTIL b3 RUNS there are no such rows: this prints
#       "no runs since the fix" and is NOT counted as a pass. It also prints the standing count of
#       regen ledger rows (0 until b3).
#
# Plants (each in place, confirmed to move a measured value, RED, restored md5-identical — 2026-10-18):
#   P1  regenJudge passes a no-op ledger (the judge-role ledger call is gone)   => l2 rows_per_page 2 → 1
#   P2  the module records openaiRecord(model, null) — usage dropped            => l2 usd_all_nonnull true → false
#   P2b the function carries a raw fetch to api.openai.com again                => l1 red
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
FIX_LANDED="2026-10-19"   # the day the ledger reached the served function (R4)
psql() { docker exec -i "$DB" psql -U postgres -d postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; exit 1; }
jq_() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
FN=supabase/functions/extract-outside-evidence/index.ts
MOD=supabase/functions/_shared/outsideRegenModel.ts
REG=supabase/functions/_shared/modelCallSites.ts

# l1 — source
[ -f "$MOD" ] || fail l1 "module $MOD missing"
grep -q 'from "../_shared/outsideRegenModel.ts"' "$FN" || fail l1 "function does not import the module"
grep -q 'regenGenerate(' "$FN" || fail l1 "generator does not go through regenGenerate"
grep -q 'regenJudge(' "$FN" || fail l1 "judge does not go through regenJudge"
grep -q 'callOpenAIJson' "$FN" || fail l1 "transport is not the shared callOpenAIJson"
grep -q 'recordModelCall(' "$FN" || fail l1 "ledger is not recordModelCall"
grep -q 'api.openai.com' "$FN" && fail l1 "a raw fetch to api.openai.com is back in the function"
grep -q 'model_calls: tally' "$FN" || fail l1 "integrity row does not carry the per-run tally"
grep -q 'site: "extract-outside-evidence".*captured: true' "$REG" || fail l1 "registry line is not captured: true"
echo "l1. source: both roles through outsideRegenModel.ts, callOpenAIJson transport, recordModelCall ledger, no raw fetch, tally on the integrity row, registry captured"

# l2 — module (fake transport, no network)
P=$(deno run --allow-all scripts/guards/outside-regen-ledger-probe.ts 2>/dev/null | tail -1)
[ -n "$P" ] || fail l2 "probe printed nothing"
[ "$(echo "$P" | jq_ "d['rows_per_page']")" = "2" ] || fail l2 "rows per page ≠ 2: $P"
[ "$(echo "$P" | jq_ "d['roles']")" = "['generator', 'judge']" ] || fail l2 "roles ≠ [generator, judge]: $P"
[ "$(echo "$P" | jq_ "d['call_sites']")" = "['extract-outside-evidence:generator', 'extract-outside-evidence:judge']" ] || fail l2 "call sites: $P"
[ "$(echo "$P" | jq_ "d['usd_all_nonnull']")" = "True" ] || fail l2 "a priced row carries a null usd: $P"
[ "$(echo "$P" | jq_ "d['sha_hex64']")" = "True" ] || fail l2 "prompt sha is not 64 hex: $P"
[ "$(echo "$P" | jq_ "d['attempts']")" = "[1, 1]" ] || fail l2 "attempts: $P"
[ "$(echo "$P" | jq_ "str(d['fallback_rows'])+'|'+str(d['fallback_attempt1_usd_null'])+'|'+str(d['fallback_attempt2_usd_set'])")" = "2|True|True" ] || fail l2 "nano fallback: $P"
[ "$(echo "$P" | jq_ "str(d['unparseable_rows'])+'|'+str(d['unparseable_threw'])")" = "2|True" ] || fail l2 "ledger-before-parse: $P"
echo "l2. module: rows_per_page=2 (generator, judge), usd non-null, sha 64-hex, attempts [1,1]; nano fallback 2 rows (attempt 1 usd NULL, attempt 2 priced); un-parseable answers still ledger 2 rows"
T=$(NO_COLOR=1 deno test --allow-all --no-check supabase/functions/_shared/outsideRegenModel.test.ts 2>&1 | grep -E '^ok \||^FAILED \|' | tail -1 || true)
echo "$T" | grep -q '^ok |' || fail l2 "module tests: ${T:-no summary line}"
echo "l2. module tests: $T"

# l3 — data (never a silent pass)
STANDING=$(psql "select count(*) from model_calls where call_site like 'extract-outside-evidence:%'")
RUNS=$(psql "select count(*) from integrity_runs where component='r3_outside_regen' and ran_at >= '$FIX_LANDED'")
if [ "$RUNS" = "0" ]; then
  echo "l3. no runs since the fix ($FIX_LANDED): nothing to compare — NOT a pass. standing regen ledger rows: $STANDING"
else
  BAD=$(psql "select count(*) from integrity_runs r where r.component='r3_outside_regen' and r.ran_at >= '$FIX_LANDED' and coalesce((r.excluded_by_rule->>'pages')::int,0) > (select count(*) from model_calls m where m.company_id=r.company_id and m.call_site='extract-outside-evidence:generator' and m.created_at between r.ran_at - interval '150 seconds' and r.ran_at + interval '5 seconds')")
  [ "$BAD" = "0" ] || fail l3 "$BAD run(s) since the fix processed more pages than they ledgered generator calls"
  echo "l3. data: $RUNS run(s) since the fix, every one ledgered at least one generator row per page; standing regen ledger rows: $STANDING"
fi
echo "GUARD OK"
