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
#   l4. (R27) the copying rule and the DOT demonstration are present in the generator prompt source (PRESENCE, not
#       behaviour); the candidates probe (fake transport: one exact span, one paraphrase) measures admitted 1,
#       e4_not_verbatim 1, stored candidates 2 with both reasons, nearest span indexing the raw page.
#   l5. (R31) the stored excerpt is the raw page slice at the e4 match (asserted at the mint); the shared splitter does
#       not end a sentence after Dr./Mr./Inc./…; a bare attribution clause is refused e2_bare_attribution before the judge.
#   l6. (R32) every speaker-judge call writes a model_calls row (ollama shape, usd null) before parse: on the fixtures,
#       speaker rows = attribution-bearing candidates; judgeSpeaker ledgers before it parses.
#   l7. (R36) sanitized at parse (NUL never reaches the integrity row); the row is opened running before the first mint
#       and finished at the end — a refused finish leaves it failed with the error; excerpt_offset (UTF-16) + _cp (points).
#   l8. (R41/R43) the page budget: 8 per write call, continuation under the same run_id; a URL is done when any integrity
#       row for the run names it processed (processed_urls) or a signal carries the run_id — an empty page is never re-run.
#   l9. (R42) the speaker context reaches past the paragraph (every sentence naming the speaker, capped).
#   l10. (R38) the syndication band judge is ledgered the same way (role syndication, before parse).
#   l11. (R53) the AUTHORSHIP judge obeys R4 on every path that calls it: the ledger is a REQUIRED argument (type and
#       runtime), written before parse; extract-outside-evidence (role authorship, on the run's tally), public-baseline
#       (call_site public-baseline-authorship, run_id the long_runner_runs row, tally on run_ledger) and the restamp dry
#       run (call_site restamp-aggregator-self-voice, keyed to the row's company, tally in the body) each wire it. Probe
#       scripts/guards/regen-authorship-ledger-probe.ts: on every seam ledger rows == judge calls (and == the regen
#       tally); an unparseable answer still writes its row; no ledger => throws with zero transport calls. Data: every
#       r3_outside_regen row whose tally names authorship calls has at least that many rows (less ledger_failed) at
#       extract-outside-evidence:authorship in its window - "no runs" until then, NOT counted as a pass.
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
#   (R8, 2026-10-18: the handler moved to _shared/outsideRegenHandler.ts; l1 reads both files)
#   P5  judgeAggregatorAuthorship's success-path ledger write commented out (R53, 2026-10-20)
#                                                                               => l11 regen ledger_rows 1 -> 0 (calls 1)
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

# l1 — source (R8: the handler lives in _shared/outsideRegenHandler.ts; the function keeps the two seams)
H=supabase/functions/_shared/outsideRegenHandler.ts
[ -f "$MOD" ] || fail l1 "module $MOD missing"
[ -f "$H" ] || fail l1 "handler $H missing"
grep -q 'from "./outsideRegenModel.ts"' "$H" || fail l1 "handler does not import the module"
grep -q 'regenGenerate(' "$H" || fail l1 "generator does not go through regenGenerate"
grep -q 'regenJudge(' "$H" || fail l1 "judge does not go through regenJudge"
grep -q 'from "../_shared/outsideRegenHandler.ts"' "$FN" || fail l1 "function does not import the handler"
grep -q 'callOpenAIJson' "$FN" || fail l1 "transport is not the shared callOpenAIJson"
grep -q 'recordModelCall(' "$FN" || fail l1 "ledger is not recordModelCall"
grep -q 'api.openai.com' "$FN" "$H" && fail l1 "a raw fetch to api.openai.com is back"
grep -q 'model_calls: tally' "$H" || fail l1 "integrity row does not carry the per-run tally"
grep -q 'site: "extract-outside-evidence".*captured: true' "$REG" || fail l1 "registry line is not captured: true"
echo "l1. source: both roles through outsideRegenModel.ts (in the handler), callOpenAIJson transport, recordModelCall ledger (in the function), no raw fetch, tally on the integrity row, registry captured"

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
  # R36 (b): a row OPENED before its first call (payload carries opened_at, or it was written after the running-status
  #      migration of 2026-10-20 01:00 UTC — the first finished rows dropped opened_at from the payload) has its calls AFTER
  #      ran_at — a forward window;
  # an older row was written after its calls — the backward window. R37: a ledger_lost row is a BACKFILL whose calls sit
  # in the original run's window, so it is checked against the tally it was backfilled from, and named.
  BAD=$(psql "select count(*) from integrity_runs r where r.component='r3_outside_regen' and r.ran_at >= '$FIX_LANDED' and coalesce(r.excluded_by_rule->>'ledger_lost','false') <> 'true' and coalesce((r.excluded_by_rule->>'pages')::int,0) > (select count(*) from model_calls m where m.company_id=r.company_id and m.call_site='extract-outside-evidence:generator' and m.created_at between (case when r.excluded_by_rule ? 'opened_at' or r.ran_at >= '2026-10-20 01:00:00+00' then r.ran_at - interval '5 seconds' else r.ran_at - interval '150 seconds' end) and (case when r.excluded_by_rule ? 'opened_at' or r.ran_at >= '2026-10-20 01:00:00+00' then r.ran_at + interval '400 seconds' else r.ran_at + interval '5 seconds' end))")
  [ "$BAD" = "0" ] || fail l3 "$BAD run(s) since the fix processed more pages than they ledgered generator calls"
  LOST=$(psql "select count(*) from integrity_runs r where r.component='r3_outside_regen' and r.excluded_by_rule->>'ledger_lost'='true'")
  LOSTBAD=$(psql "select count(*) from integrity_runs r where r.component='r3_outside_regen' and r.excluded_by_rule->>'ledger_lost'='true' and coalesce((r.excluded_by_rule->>'pages')::int,0) > coalesce((r.excluded_by_rule->'model_calls'->>'generator')::int,0)")
  [ "$LOSTBAD" = "0" ] || fail l3 "$LOSTBAD ledger_lost backfill row(s) carry fewer generator calls than pages"
  echo "l3. data: $RUNS run(s) since the fix, every one ledgered at least one generator row per page (ledger_lost backfills: $LOST, each consistent with its backfilled tally); standing regen ledger rows: $STANDING"
fi

# l4 — R27: the copying rule is PRESENT in the generator prompt (presence, not behaviour — behaviour is proven on a
#      pilot by the e4_not_verbatim count); every candidate is recorded on the integrity row with both reasons and,
#      for an e4 refusal, its nearest page span. Probe: scripts/guards/regen-candidates-probe.ts (fake transport).
PR=supabase/functions/_shared/outsideRegenPrompts.ts
H=supabase/functions/_shared/outsideRegenHandler.ts
grep -q 'ONE CONTIGUOUS SPAN copied character for character from PAGE TEXT' "$PR" || fail l4 "the copying rule is not in the generator prompt source"
grep -q 'WRONG: "The company has maintained an active DOT status' "$PR" || fail l4 "the demonstration's one-word counterexample is not in the prompt source"
grep -q '\${COPYING_RULE} ' "$PR" && grep -q '\${COPYING_DEMONSTRATION} ' "$PR" || fail l4 "genSystem does not include the rule and the demonstration"
grep -q 'candidates: candidateRecords' "$H" || fail l4 "the handler does not store the candidates on the integrity row"
grep -q 'generator_reason: cand.reason, judge_reason:' "$H" || fail l4 "the minted row's raw_payload does not carry the reasons"
C=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-candidates-probe.ts 2>&1 | tail -1)
[ "$(echo "$C" | jq_ "d.get('admitted')")" = "1" ] || fail l4 "admitted != 1: $C"
[ "$(echo "$C" | jq_ "d.get('e4_not_verbatim')")" = "1" ] || fail l4 "e4_not_verbatim != 1: $C"
[ "$(echo "$C" | jq_ "d.get('stored_candidates')")" = "2" ] || fail l4 "stored candidates != 2: $C"
[ "$(echo "$C" | jq_ "d.get('with_both_reasons')")" = "2" ] || fail l4 "candidates with both reasons != 2: $C"
[ "$(echo "$C" | jq_ "d.get('stored_in_full')")" = "True" ] || fail l4 "a stored candidate is truncated: $C"
[ "$(echo "$C" | jq_ "(d.get('paraphrase_nearest_span') or {}).get('indexes_raw_page')")" = "True" ] || fail l4 "the paraphrase's nearest span does not index the raw page: $C"
echo "l4. R27 probe (fake transport): $C"
echo "l4. R27 source: copying rule + DOT demonstration present in the generator prompt (presence only); candidates stored on the integrity row; reasons on the minted row"

# l5 — R31: the stored excerpt is the raw page slice; abbreviations do not end sentences; a bare attribution is refused.
#      Probe: scripts/guards/regen-slice-probe.ts (deterministic, no model, no db).
grep -q 'excerpt: slice.text, offset: slice.offset, length: slice.length, model_text: shaped' supabase/functions/_shared/outsideEvidenceRegen.ts || fail l5 "admitOutsideEvidence does not store the page slice"
grep -q 'clean_text.slice(verdictA.offset, verdictA.offset + verdictA.length) !== verdictA.excerpt' supabase/functions/_shared/outsideRegenHandler.ts || fail l5 "the mint does not assert the slice"
grep -q 'export const NON_TERMINAL_ABBREVIATIONS' src/lib/evidenceMappers.ts || fail l5 "the abbreviation list is missing"
SL=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-slice-probe.ts 2>&1 | tail -1)
[ "$(echo "$SL" | jq_ "d.get('newline_bytes_equal')")" = "True" ] || fail l5 "newline fixture: stored bytes != page slice: $SL"
[ "$(echo "$SL" | jq_ "d.get('nbsp_bytes_equal')")" = "True" ] || fail l5 "no-break-space fixture: stored bytes != page slice: $SL"
[ "$(echo "$SL" | jq_ "d.get('founders_sentences')")" = "1" ] || fail l5 "the founders fixture splits at Dr.: $SL"
[ "$(echo "$SL" | jq_ "d.get('bare_code')")" = "e2_bare_attribution" ] || fail l5 "the bare attribution is not refused: $SL"
echo "l5. R31 probe: $SL"

# l6 — R32: every speaker-judge call is ledgered (role speaker, call_site extract-outside-evidence:speaker, provider ollama,
#      usd null): on the fake-transport fixtures the speaker rows equal the attribution-bearing candidates.
SP=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-speaker-probe.ts 2>&1 | tail -1)
[ "$(echo "$SP" | jq_ "d.get('speaker_ledger_rows')")" = "$(echo "$SP" | jq_ "d.get('attribution_bearing')")" ] || fail l6 "speaker ledger rows != attribution-bearing candidates: $SP"
[ "$(echo "$SP" | jq_ "d.get('speaker_calls')")" = "$(echo "$SP" | jq_ "d.get('attribution_bearing')")" ] || fail l6 "speaker calls != attribution-bearing candidates: $SP"
grep -q 'callSite: regenCallSite("speaker")' supabase/functions/_shared/outsideRegenHandler.ts || fail l6 "the handler does not ledger the speaker judge"
# l10 — R38 (R51): the syndication band judge is ledgered the same way — role "syndication", BEFORE parse, usd null (ollama)
grep -q 'callSite: regenCallSite("syndication")' supabase/functions/_shared/outsideRegenHandler.ts || fail l10 "the handler does not ledger the syndication band judge"
grep -q '"generator" | "judge" | "speaker" | "syndication"' supabase/functions/_shared/outsideRegenModel.ts || fail l10 "the ledger roles do not name syndication"
python3 - supabase/functions/_shared/syndication.ts <<'PY' || exit 1
import sys; s=open(sys.argv[1]).read()
i=s.index('export async function judgeSyndicationBand'); body=s[i:i+2200]
assert body.index('await opts.ledger({ usage: { provider: "ollama", model, prompt_tokens: r.prompt_tokens') < body.index('const answer = raw.trim().toUpperCase()'), "FAIL step l10: the band judge parses before it ledgers"
PY
SY=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-syndication-probe.ts 2>&1 | tail -1)
[ "$(echo "$SY" | jq_ "d.get('band_judge_calls')==d.get('syndication_ledger_rows')==d.get('tally_syndication')==1")" = "True" ] || fail l10 "band judge calls, syndication ledger rows and the tally disagree: $SY"
echo "l10. R38 syndication ledger: $SY"
# R53: the speaker ledger is required now — the call is unconditional, still before parse
python3 - supabase/functions/_shared/aggregatorAuthorship.ts <<'PYL6' || exit 1
import sys; s=open(sys.argv[1]).read()
i=s.index('export async function judgeSpeaker('); body=s[i:i+2400]
assert 'ledger: SpeakerLedger;' in body, "FAIL step l6: the speaker ledger is optional again"
assert body.index('await opts.ledger({ usage: { provider: "ollama", model, prompt_tokens: r.prompt_tokens') < body.index('JSON.parse('), "FAIL step l6: judgeSpeaker parses before it ledgers"
PYL6
T=$(NO_COLOR=1 deno test --allow-all --no-check supabase/functions/_shared/speakerJudge.test.ts 2>&1 | grep -E '^ok \||^FAILED \|' | tail -1 || true)
echo "$T" | grep -q '^ok |' || fail l6 "speakerJudge tests: ${T:-no summary}"
echo "l6. R32 speaker ledger: $SP · $T"

# l7 — R36: model output sanitized at the parse boundary; the integrity row opened before the first mint and finished at
#      the end (a refused finish leaves it failed with the error); both offsets stored. Probe: scripts/guards/regen-integrity-probe.ts.
grep -q 'from "./sanitizeForStore.ts"' supabase/functions/_shared/outsideRegenHandler.ts || fail l7 "the handler does not import the one sanitizer"
grep -q 'openIntegrityRun(supabase, {' supabase/functions/_shared/outsideRegenHandler.ts || fail l7 "the handler does not open the integrity row"
grep -q 'excerpt_offset_cp: Array.from(clean_text.slice(0, verdictA.offset)).length' supabase/functions/_shared/outsideRegenHandler.ts || fail l7 "excerpt_offset_cp is not stored"
IP=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-integrity-probe.ts 2>&1 | tail -1)
[ "$(echo "$IP" | jq_ "d.get('nul_finish_ok')")" = "True" ] || fail l7 "a NUL in a candidate still breaks the finish: $IP"
[ "$(echo "$IP" | jq_ "d.get('nul_sanitized')")" = "True" ] || fail l7 "the sanitized flag is missing: $IP"
[ "$(echo "$IP" | jq_ "d.get('refused_open_mints')")" = "0" ] || fail l7 "a refused open did not refuse before the first mint: $IP"
[ "$(echo "$IP" | jq_ "str(d.get('finish_fail_status'))+'|'+str(d.get('finish_fail_mints_kept'))")" = "failed|1" ] || fail l7 "a refused finish did not leave a failed row with the mint kept: $IP"
[ "$(echo "$IP" | jq_ "str(d.get('emoji_units_minus_cp'))+'|'+str(d.get('both_resolve'))")" = "2|True" ] || fail l7 "the two offsets do not both resolve past an emoji: $IP"
echo "l7. R36 probe: $IP"

# l8 — R41: the page budget. 10 approved URLs on fake fixtures: a write processes 8 (remaining 2), the continuation 2,
#      a third call 0; generator calls equal unprocessed pages (8, 2, 0) — a minted URL is never re-run.
BP=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-budget-probe.ts 2>&1 | tail -1)
[ "$(echo "$BP" | jq_ "[c['generator_calls_this_call'] for c in d['calls']]")" = "[8, 2, 0]" ] || fail l8 "generator calls per call != [8, 2, 0]: $BP"
[ "$(echo "$BP" | jq_ "[c['remaining'] for c in d['calls']]")" = "[2, 0, 0]" ] || fail l8 "remaining per call != [2, 0, 0]: $BP"
grep -q 'export const REGEN_PAGE_BUDGET = 8;' supabase/functions/_shared/outsideRegenHandler.ts || fail l8 "the budget is not 8"
# R43: a page processed with no candidate is done — the continuation after an 8-page call where page 3 yielded nothing makes 2 calls
[ "$(echo "$BP" | jq_ "str(d['r43_empty_page']['plan_done_after_first'])+'|'+str(d['r43_empty_page']['continuation_generator_calls'])")" = "8|2" ] || fail l8 "R43: an empty page was re-run (plan done / continuation calls): $BP"
grep -q 'processed_urls: processedUrls' supabase/functions/_shared/outsideRegenHandler.ts || fail l8 "the finish does not name processed_urls"
echo "l8. R41/R43 probe: $BP"
# l9 — R42: the speaker judge's context carries every page sentence naming the speaker; the Brierley fixture resolves.
SC=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-speaker-context-probe.ts 2>&1 | tail -1)
[ "$(echo "$SC" | jq_ "str(d.get('context_has_affiliation'))+'|'+str(d.get('speaker_class'))+'|'+str(d.get('voice_class'))")" = "True|subject_company_officer|client_voice" ] || fail l9 "the Brierley fixture did not resolve: $SC"
echo "l9. R42 probe: $SC"

# l11 — R53: the authorship judge is ledgered on every path (required ledger, before parse), proven on all three seams.
A=supabase/functions/_shared/aggregatorAuthorship.ts
python3 - "$A" <<'PYL11' || exit 1
import re, sys; s=open(sys.argv[1]).read()
i=s.index('export async function judgeAggregatorAuthorship('); body=s[i:s.index('\n}\n', i)]
# R53 fix: match LIVE code only — block comments and // comments are stripped first, so a commented-out ledger write
# is absent here (Living Memory, Oct 16: a source guard asserts a live call, not the presence of text)
body=re.sub(r'/\*.*?\*/', '', body, flags=re.S)
body='\n'.join(re.sub(r'(^|\s)//.*$', '', l) for l in body.split('\n'))
assert 'ledger: AuthorshipLedger;' in body[:400], "FAIL step l11: the authorship ledger is not a required argument"
assert 'if (typeof opts?.ledger !== "function") throw' in body, "FAIL step l11: no runtime refusal of a missing ledger"
LIVE='await opts.ledger({ usage: { provider: "ollama", model, prompt_tokens: r.prompt_tokens'
assert LIVE in body, "FAIL step l11: the success-path ledger write is not live code (missing or commented out)"
t=body.index('await opts.transport('); l=body.index(LIVE); p=body.index('JSON.parse(')
assert t < l < p, "FAIL step l11: execution order is not transport -> ledger -> parse"
assert 'callClassifier(' not in body, "FAIL step l11: the judge calls the unledgered classifier directly"
PYL11
grep -q 'callSite: regenCallSite("authorship")' "$H" || fail l11 "the handler does not ledger the authorship judge"
grep -q '"generator" | "judge" | "speaker" | "syndication" | "authorship"' "$MOD" || fail l11 "the ledger roles do not name authorship"
grep -q 'judgeAggregatorAuthorship(input, { transport, ledger,' "$FN" || fail l11 "extract-outside-evidence does not pass the run ledger to the authorship judge"
PB=supabase/functions/public-baseline/index.ts
grep -q 'judgeAggregatorAuthorship(input, { transport: authorshipTransport, ledger: authorshipLedger,' "$PB" || fail l11 "public-baseline does not pass a ledger to the authorship judge"
grep -q 'callSite: "public-baseline-authorship"' "$PB" || fail l11 "public-baseline's authorship ledger is not recordModelCall at public-baseline-authorship"
grep -q 'runLedger.authorship_model_calls = authorshipTally' "$PB" || fail l11 "public-baseline does not carry the authorship tally on its run ledger"
RS=supabase/functions/restamp-aggregator-self-voice/index.ts
grep -q 'callSite: "restamp-aggregator-self-voice"' "$RS" || fail l11 "the restamp dry run's authorship ledger is not recordModelCall"
grep -q 'model_calls: tally' "$RS" || fail l11 "the restamp dry run does not return its tally"
N=$(grep -rn 'judgeAggregatorAuthorship(' supabase/functions --include=index.ts | wc -l | tr -d ' ')
[ "$N" = "3" ] || fail l11 "served callers of the authorship judge != 3 ($N) — a new caller must be wired and named here"
{ grep -q 'site: "public-baseline-authorship".*captured: true' "$REG" && grep -q 'site: "restamp-aggregator-self-voice".*captured: true' "$REG"; } || fail l11 "registry lines for the authorship sites are not captured: true"
AP=$(NO_COLOR=1 deno run --allow-all --no-check scripts/guards/regen-authorship-ledger-probe.ts 2>/dev/null | tail -1)
[ -n "$AP" ] || fail l11 "probe printed nothing"
[ "$(echo "$AP" | jq_ "d['regen']['judge_calls']>=1 and d['regen']['judge_calls']==d['regen']['ledger_rows']==d['regen']['tally_authorship']")" = "True" ] || fail l11 "regen: authorship calls, ledger rows and the tally disagree: $AP"
[ "$(echo "$AP" | jq_ "d['regen']['call_site_ok'] and d['regen']['provider']=='ollama' and d['regen']['usd'] is None and d['regen']['sha_hex64']")" = "True" ] || fail l11 "regen: row shape (call site / ollama / usd null / sha): $AP"
[ "$(echo "$AP" | jq_ "d['baseline']['judge_calls']>=1 and d['baseline']['judge_calls']==d['baseline']['ledger_rows']")" = "True" ] || fail l11 "baseline seam: authorship calls != ledger rows: $AP"
[ "$(echo "$AP" | jq_ "d['restamp']['judge_calls']>=1 and d['restamp']['judge_calls']==d['restamp']['ledger_rows'] and d['restamp']['keyed_to_company']")" = "True" ] || fail l11 "restamp plan: authorship calls != ledger rows (or not keyed to the company): $AP"
[ "$(echo "$AP" | jq_ "d['unparseable']['verdict']=='judge_failed' and d['unparseable']['ledger_rows']==1")" = "True" ] || fail l11 "an unparseable answer did not write its row (ledger before parse): $AP"
[ "$(echo "$AP" | jq_ "d['no_ledger']['threw'] and d['no_ledger']['transport_calls']==0")" = "True" ] || fail l11 "a call with no ledger reached the model: $AP"
echo "l11. R53 authorship ledger probe: $AP"
# l11 data — never a silent pass (l3's window rule)
ASTAND=$(psql "select count(*) from model_calls where call_site in ('extract-outside-evidence:authorship','public-baseline-authorship','restamp-aggregator-self-voice')")
ARUNS=$(psql "select count(*) from integrity_runs where component='r3_outside_regen' and coalesce((excluded_by_rule->'model_calls'->>'authorship')::int,0) > 0")
if [ "$ARUNS" = "0" ]; then
  echo "l11. data: no regen run has made an authorship call since R53 — nothing to compare, NOT a pass. standing authorship ledger rows: $ASTAND"
else
  ABAD=$(psql "select count(*) from integrity_runs r where r.component='r3_outside_regen' and coalesce((r.excluded_by_rule->'model_calls'->>'authorship')::int,0) > 0 and (r.excluded_by_rule->'model_calls'->>'authorship')::int - coalesce((r.excluded_by_rule->'model_calls'->>'ledger_failed')::int,0) > (select count(*) from model_calls m where m.company_id=r.company_id and m.call_site='extract-outside-evidence:authorship' and m.created_at between r.ran_at - interval '5 seconds' and r.ran_at + interval '400 seconds')")
  [ "$ABAD" = "0" ] || fail l11 "$ABAD regen run(s) tallied more authorship calls than model_calls rows at extract-outside-evidence:authorship"
  echo "l11. data: $ARUNS regen run(s) with authorship calls, every call has its model_calls row; standing authorship ledger rows: $ASTAND"
fi
echo "GUARD OK"
