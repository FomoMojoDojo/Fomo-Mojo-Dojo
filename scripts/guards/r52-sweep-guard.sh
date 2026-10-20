#!/usr/bin/env bash
# ── R52 SWEEP GUARD — the runner trio (scripts/r52/plan.ts · apply.ts · revert.ts) obeys the signed sweep rules ──────────
#
# Every probe runs on a throwaway company SEEDED INSIDE its own transaction and ROLLED BACK, with fake local transports:
# no model is reachable, nothing is committed, no live company is written. The guard ends by proving the four tables and
# the signals md5 are byte-identical to before it started.
#
#   s0  SOURCE  the decision is the shipped authority (voiceClassForMintedExcerpt) under keep_label; the three judges are
#               the shipped ones with REQUIRED ledgers; the only transports are local; no OpenAI anywhere in scripts/r52;
#               each entry point names its mode through classifyBodyMode (namedMode).
#   m0  MODES   each entry point with no mode flag is refused (mode_unnamed), exit 3.
#   p1  an un-mint attempt (a superseded_at write) is refused unmint_refused; the row stays live, its class kept.
#   p2  an undecidable row (speaker "unknown") keeps its class; the reason is recorded as raw_payload.r52_unknown.
#   p3  a class change with no audit row is refused unaudited_class_change; the class stands, zero audit rows.
#   p4  a fixture_hold company is refused fixture_held before any integrity row or judge call; CB1 refused by value.
#   p5  a row not in the reviewed plan is refused not_in_plan (and stays unstamped); a reviewed row whose judges differ
#       from the shipped re-derivation is refused plan_mismatch; zero integrity rows, zero judge calls.
#   p6  every judge call writes its model_calls row: ledger rows == transport calls == the tally; ledger_failed 0;
#       the integrity row was opened and finished with the counts; revert restores the company md5 exactly.
#   p7  plan mode writes nothing: it runs in a READ ONLY transaction, no transaction id is assigned, and the four
#       tables are unchanged after it; it reaches every reviewed row.
#
# Plants (each injected live in the runner, guard RED with the measured value moved, restored md5-identical, GREEN):
#   P1  psqlSweepStore.writeSignal's key whitelist removed        => p1 refused true → false (row_live true → false)
#   P2  apply's unknown branch drops r52_unknown                  => p2 unknown_reason "speaker unknown: …" → None
#   P3  writeSignal's exists(audit row) clause removed            => p3 refused true → false, class_after → client_voice
#   P4  assertCompanyWritable's fixture_hold check removed        => p4 refused true → false (code fixture_held → …)
#   P5  applyCompany's assertInPlan call removed                  => p5 not_in_plan.refused true → false
#   P6  ledgeredJudges' model_calls insert replaced by `true`     => p6 ledger_rows 2 → 0 (transport calls 2)
#   P7  plan.ts writes one integrity row before its reads         => p7 plan exit 0 → 1 (read-only transaction refuses)
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; exit 1; }
jq_() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }
R52=scripts/r52
# The reviewed plan (ruling 2026-10-20): the runner's own plan under the judge + question + prompt-sha replay key, in
# backups/r52/ (gitignored, local). The two pre-runner files and the pre-key runner plan sit beside it as history.
REVIEWED="${R52_REVIEWED:-backups/r52/r52run-plan.tsv}"
REVIEWED_MD5="${R52_REVIEWED_MD5:-fac94fab768366564e5d913a295b3560}"
[ -f "${REVIEWED%%,*}" ] || fail s0 "reviewed plan ${REVIEWED%%,*} is missing"
counts() { psql "select (select count(*) from model_calls)||'|'||(select count(*) from integrity_runs)||'|'||(select count(*) from signal_voice_restamps)||'|'||(select count(*) from signals)||'|'||(select md5(coalesce(string_agg(id::text||coalesce(voice_class,'')||coalesce(raw_payload::text,''),',' order by id),'')) from signals)"; }
C0=$(counts)
probe() { NO_COLOR=1 deno run --allow-all --no-check $R52/apply.ts --probe --name="$1" 2>/dev/null | tail -1; }

# s0 — source
CORE=$R52/sweepCore.ts; STORE=$R52/psqlSweepStore.ts
grep -q 'const decision = await voiceClassForMintedExcerpt(input);' "$CORE" || fail s0 "the decision is not the shipped authority"
grep -q 'export const R52_POLICY = "keep_label" as const;' "$CORE" || fail s0 "the policy is not keep_label"
[ "$(grep -c 'onJudgeFailure: R52_POLICY' "$CORE")" = 2 ] || fail s0 "a row kind is decided under another policy"
grep -q 'judgeSyndicationBand(i, { transport: t.band, ledger: ledgerFor("band")' "$CORE" || fail s0 "band judge without its ledger"
grep -q 'judgeSpeaker(i, { transport: t.speaker, ledger: ledgerFor("speaker")' "$CORE" || fail s0 "speaker judge without its ledger"
grep -q 'judgeAggregatorAuthorship(i, { transport: t.authorship, ledger: ledgerFor("authorship")' "$CORE" || fail s0 "authorship judge without its ledger"
grep -q 'if (!isLocalOllamaUrl(base)) throw' "$CORE" || fail s0 "the transports are not local-only"
grep -rqi 'openai' $R52 && fail s0 "scripts/r52 names openai"
for f in plan apply revert; do grep -q 'namedMode(Deno.args' $R52/$f.ts || fail s0 "$f.ts does not name its mode through classifyBodyMode"; done
echo "s0. source: shipped authority under keep_label (both row kinds); band/speaker/authorship judges each with its ledger; local transports only; no openai; every entry point names its mode"

# m0 — modes are named or refused
for f in plan apply revert; do
  set +e; J=$(NO_COLOR=1 deno run --allow-all --no-check $R52/$f.ts 2>/dev/null | tail -1); rc=$?; set -e
  [ "$(echo "$J" | jq_ "d.get('code')")" = "mode_unnamed" ] || fail m0 "$f.ts with no mode: $J"
done
echo "m0. modes: plan.ts, apply.ts and revert.ts with no mode flag are each refused mode_unnamed"

# p1
J=$(probe p1); [ "$(echo "$J" | jq_ "str(d['refused'])+'|'+str(d['code'])+'|'+str(d['row_live'])+'|'+str(d['class_kept'])+'|'+str(d['rolled_back'])")" = "True|unmint_refused|True|True|True" ] || fail p1 "un-mint attempt: $J"
echo "p1. un-mint refused (unmint_refused); row live, class kept; rolled back"
# p2 + p6 (one apply on the seed)
J=$(probe apply-revert)
[ "$(echo "$J" | jq_ "d['B']['class']=='outside_voice_about_client' and (d['B']['unknown_reason'] or '').startswith('speaker unknown') and d['applied']['unknown']==1")" = True ] || fail p2 "unknown row: $(echo "$J" | jq_ "d['B'],d['applied']")"
echo "p2. unknown: class kept (outside_voice_about_client), reason recorded: $(echo "$J" | jq_ "d['B']['unknown_reason']")"
# p3
J3=$(probe p3); [ "$(echo "$J3" | jq_ "str(d['refused'])+'|'+str(d['code'])+'|'+str(d['class_after'])+'|'+str(d['audit_rows'])")" = "True|unaudited_class_change|outside_voice_about_client|0" ] || fail p3 "unaudited class change: $J3"
echo "p3. class change without its audit row refused (unaudited_class_change); class stands, 0 audit rows"
# p4
J4=$(probe p4); [ "$(echo "$J4" | jq_ "str(d['refused'])+'|'+str(d['code'])+'|'+str(d['integrity_rows_written'])+'|'+str(d['judge_calls'])+'|'+str(d['held_row_r52'])+'|'+str(d['cb1_code'])")" = "True|fixture_held|0|0|False|frozen_company" ] || fail p4 "held company: $J4"
echo "p4. fixture_hold company refused (fixture_held) with 0 integrity rows and 0 judge calls; CB1 refused by value (frozen_company)"
# p5
J5=$(probe p5); [ "$(echo "$J5" | jq_ "str(d['not_in_plan']['refused'])+'|'+str(d['not_in_plan']['code'])+'|'+str(d['extra_row_stamped'])+'|'+str(d['plan_mismatch']['code'])+'|'+str(d['judge_calls'])+'|'+str(d['integrity_rows_written'])")" = "True|not_in_plan|False|plan_mismatch|0|0" ] || fail p5 "not in plan: $J5"
echo "p5. a row not in the plan refused (not_in_plan, left unstamped); a drifted reviewed row refused (plan_mismatch); 0 judge calls, 0 integrity rows"
# p6
[ "$(echo "$J" | jq_ "d['transport_calls']>=2 and d['transport_calls']==d['ledger_rows']==d['applied']['model_calls']['speaker']+d['applied']['model_calls']['authorship']+d['applied']['model_calls']['band'] and d['applied']['ledger_failed']==0")" = True ] || fail p6 "judge calls vs model_calls rows: transport $(echo "$J" | jq_ "d['transport_calls']") ledger_rows $(echo "$J" | jq_ "d['ledger_rows']") tally $(echo "$J" | jq_ "d['applied']['model_calls']")"
[ "$(echo "$J" | jq_ "d['integrity'][0]['status']=='completed' and d['integrity'][0]['opened_at'] and d['integrity'][0]['finished_at'] and d['integrity'][0]['changed']==d['audit_rows']==1")" = True ] || fail p6 "integrity row: $(echo "$J" | jq_ "d['integrity']")"
[ "$(echo "$J" | jq_ "d['md5_after_apply_differs'] and d['md5_after_revert_equal'] and d['revert']['restored']==d['audit_rows'] and d['rolled_back']")" = True ] || fail p6 "revert: $(echo "$J" | jq_ "d['revert'],d['md5_after_revert_equal']")"
echo "p6. ledger: $(echo "$J" | jq_ "d['transport_calls']") judge calls = $(echo "$J" | jq_ "d['ledger_rows']") model_calls rows = tally $(echo "$J" | jq_ "d['applied']['model_calls']"); integrity row opened+finished (changed 1 = audit rows 1); revert restored the company md5 exactly"

# p7 — plan mode writes nothing
set +e; P=$(NO_COLOR=1 deno run --allow-all --no-check $R52/plan.ts --plan --reviewed="$REVIEWED" --reviewed-md5="$REVIEWED_MD5" 2>/dev/null | tail -1); rc=$?; set -e
[ "$rc" = 0 ] || fail p7 "plan exited $rc: $P"
[ "$(echo "$P" | jq_ "str(d['read_only'])+'|'+str(d['xid_assigned'])")" = "True|None" ] || fail p7 "plan ran outside a read-only transaction or was assigned a transaction id: $P"
[ "$(counts)" = "$C0" ] || fail p7 "a table or the signals md5 changed across plan mode"
echo "p7. plan: read-only, no transaction id, tables unchanged; $(echo "$P" | jq_ "d['rows']") rows, calls $(echo "$P" | jq_ "d['calls']"), plan-equals-reviewed $(echo "$P" | jq_ "sum(1 for p in d['per_company'] if p['plan_equals_reviewed']=='PASS')")/$(echo "$P" | jq_ "len(d['per_company'])") companies (reported, not asserted)"

[ "$(counts)" = "$C0" ] || fail end "model_calls / integrity_runs / signal_voice_restamps / signals changed across the guard"
echo "end. the four tables and the signals md5 are byte-identical to before the guard"
echo "GUARD OK"
