#!/bin/bash
# ── DELTA RULES GUARD — gap-quality rules R1–R3 + record page words on the page (operator ruling 2026-10-22) ──────────────
#
#   d1  rules + render (deltaRuleChecks.test.ts, pure): R1 a specific is disputed only by a competing specific of the same
#       unit; R2 no shared content word is absence; R3 employer-review hosts removed (disputed and raised); a web_search-lane
#       record renders its verified page words; the markup strip keeps every word character
#   d2  source: the render has no substring-of-claim_text test and reads recordWordsForRender; the finalize calls
#       applyDeltaRuleChecks; isPairAdmissible reads ruleRefusal; neither the rules module nor the data act writes claim_deltas
#   d3  table: claim_delta_rule_refusals / _audit refuse UPDATE and DELETE (rolled back); RLS on; anon holds nothing
#   d5  ruling 9 (2026-10-22): the generator's pool excludes an ACTIVE refusal — selectDeltas drops it (rule_refusal:<rule>),
#       a reverted one is admitted, the shared pool loads claim_delta_rule_refusals_active (publicReadSelection.test.ts SP*)
#   d4  data act: plan → revert-probe (apply + revert in ONE rolled-back transaction) on the first company that has judged
#       divergent public pairs; claim_deltas md5 unchanged; nothing survives the rollback
# Ends by proving claim_delta_rule_refusals / _audit / claim_deltas / model_calls counts are what they were.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql_() { docker exec -i "$DB" psql -U postgres -d postgres -XAt -v ON_ERROR_STOP=1 "$@"; }
FAILS=0
fail() { echo "  FAIL ($1) $2"; FAILS=$((FAILS+1)); }
ok() { echo "  ok   ($1) $2"; }
COUNTS="select (select count(*) from claim_delta_rule_refusals)||'|'||(select count(*) from claim_delta_rule_refusal_audit)||'|'||(select md5(coalesce(string_agg(t::text,'|' order by t.id),'')) from claim_deltas t)||'|'||(select count(*) from model_calls)"
BEFORE=$(psql_ -c "$COUNTS")

# d1
T=$(cd supabase/functions/_shared && NO_COLOR=1 deno test -A --no-check deltaRuleChecks.test.ts 2>&1)
if echo "$T" | grep -qE '^ok \| [0-9]+ passed \| 0 failed'; then ok d1 "$(echo "$T" | grep -E '^ok \|')"; else fail d1 "$(echo "$T" | grep -E 'FAILED|AssertionError|error:' | head -4 | tr '\n' ' ')"; fi

# d2
H=src/views/client/firstReadPreview/useFirstReadPreviewData.ts
VR=$(awk '/^function verbatimRecord/,/^}/' "$H")
echo "$VR" | grep -q "recordWordsForRender" || fail d2 "verbatimRecord does not read recordWordsForRender"
echo "$VR" | grep -qE "claim_text|normalizeForHash|includes\(" && fail d2 "verbatimRecord carries a substring-of-claim_text test again"
grep -q "applyDeltaRuleChecks(args.supabase" supabase/functions/_shared/claimDeltaSynthesis.ts || fail d2 "the public finalize does not call applyDeltaRuleChecks"
grep -q "!p.ruleRefusal" supabase/functions/_shared/relevanceActive.ts || fail d2 "isPairAdmissible does not read ruleRefusal"
for f in supabase/functions/_shared/deltaRuleChecks.ts supabase/functions/_shared/recordPageWords.ts scripts/delta-rule-refusals.ts; do
  grep -vE '^\s*//' "$f" | grep -qiE 'from\("claim_deltas"\)\s*\.(insert|update|upsert|delete)|(update|delete from|insert into)\s+public\.claim_deltas\b' && fail d2 "$f writes claim_deltas"
done
[ $FAILS -eq 0 ] && ok d2 "render reads verified page words; finalize wired; one gate; no claim_deltas writer"

# d3
R=$(psql_ 2>&1 <<'SQL'
begin;
insert into claim_delta_rule_refusals (company_id, delta_id, content_identity, delta_type, rule, outcome, action, reason, rules_version, actor, run_ref)
  select id, gen_random_uuid(), 'guard', 'divergent', 'R2', 'not_echoed', 'refuse', 'guard', 1, 'guard', 'guard' from companies where not coalesce(frozen,false) order by id limit 1;
savepoint s;
update claim_delta_rule_refusals set reason = 'x' where run_ref = 'guard';
rollback to savepoint s;
select 'upd_refused_never';
rollback;
SQL
)
echo "$R" | grep -q "append-only: UPDATE refused" && ok d3 "UPDATE refused" || fail d3 "UPDATE not refused: $(echo "$R" | tail -2 | tr '\n' ' ')"
R=$(psql_ 2>&1 <<'SQL'
begin;
insert into claim_delta_rule_refusals (company_id, delta_id, content_identity, delta_type, rule, outcome, action, reason, rules_version, actor, run_ref)
  select id, gen_random_uuid(), 'guard', 'divergent', 'R2', 'not_echoed', 'refuse', 'guard', 1, 'guard', 'guard' from companies where not coalesce(frozen,false) order by id limit 1;
delete from claim_delta_rule_refusals where run_ref = 'guard';
rollback;
SQL
)
echo "$R" | grep -q "append-only: DELETE refused" && ok d3 "DELETE refused without the purge setting" || fail d3 "DELETE not refused"
for CASE in "|operator:guard" "   |operator:guard" "guard reason|claim-delta-finalize"; do
  RSN="${CASE%%|*}"; ACT="${CASE##*|}"
  R=$(psql_ 2>&1 <<SQL
begin;
insert into claim_delta_rule_refusals (company_id, delta_id, content_identity, delta_type, rule, outcome, action, reason, rules_version, actor, run_ref, kind)
  select id, gen_random_uuid(), 'guard', 'divergent', 'operator', 'not_echoed', 'refuse', '$RSN', 1, '$ACT', 'guard', 'operator' from companies where not coalesce(frozen,false) order by id limit 1;
rollback;
SQL
)
  echo "$R" | grep -qi "violates check constraint" && ok d3 "operator row refused (reason='$RSN', actor='$ACT')" || fail d3 "operator row admitted (reason='$RSN', actor='$ACT')"
done
RLS=$(psql_ -c "select string_agg(relname||'='||relrowsecurity, ',' order by relname) from pg_class where relname in ('claim_delta_rule_refusals','claim_delta_rule_refusal_audit')")
[ "$RLS" = "claim_delta_rule_refusal_audit=true,claim_delta_rule_refusals=true" ] && ok d3 "RLS on both" || fail d3 "RLS: $RLS"
ANON=$(psql_ -c "select count(*) from information_schema.role_table_grants where grantee='anon' and table_name in ('claim_delta_rule_refusals','claim_delta_rule_refusal_audit','claim_delta_rule_refusals_active')")
[ "$ANON" = "0" ] && ok d3 "anon holds nothing" || fail d3 "anon grants: $ANON"

# d4
CO=$(psql_ -c "select company_id from claim_deltas d join companies c on c.id=d.company_id where d.pairing_kind='public_vs_public' and d.delta_type='divergent' and not coalesce(c.frozen,false) and c.fixture_hold is null group by company_id order by company_id limit 1")
if [ -z "$CO" ]; then fail d4 "no company with judged divergent public pairs"; else
  eval "$(npx supabase status --output env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
  export SUPABASE_URL=$API_URL SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY NO_COLOR=1
  TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
  P=$(deno run --allow-all --no-check scripts/delta-rule-refusals.ts --mode=plan --company="$CO" --out="$TMP/plan.json" 2>&1 | head -1)
  N=$(echo "$P" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["refusals"])' 2>/dev/null)
  RP=$(deno run --allow-all --no-check scripts/delta-rule-refusals.ts --mode=revert-probe --plan="$TMP/plan.json" 2>&1)
  if echo "$RP" | grep -q "revert-probe: PASS" && echo "$RP" | grep -q "claim_deltas_md5_unchanged=true" && echo "$RP" | grep -q "after_rollback_rows=0"; then
    ok d4 "company ${CO:0:8}: plan $N refusal(s); apply + revert rolled back; claim_deltas md5 unchanged"
  else fail d4 "revert-probe: $(echo "$RP" | grep -iE 'error|FAIL|md5|active' | head -3 | tr '\n' ' ')"; fi
fi

# d5
R9=$( (cd supabase/functions/_shared && NO_COLOR=1 deno test -A --no-check publicReadSelection.test.ts --filter "/^SP/" 2>&1 | grep -E '^(ok|FAILED) \|' || true) )
echo "$R9" | grep -qE '^ok \| 3 passed \| 0 failed' && ok d5 "selection excludes active refusals; reverted admitted; pool wired ($R9)" || fail d5 "selection: $R9"

AFTER=$(psql_ -c "$COUNTS")
[ "$BEFORE" = "$AFTER" ] && ok end "refusals / audit / claim_deltas md5 / model_calls unchanged (${AFTER%%|*}|…)" || fail end "changed: $BEFORE → $AFTER"
if [ $FAILS -eq 0 ]; then echo "GUARD OK"; else echo "guard: FAIL ($FAILS)"; exit 1; fi
