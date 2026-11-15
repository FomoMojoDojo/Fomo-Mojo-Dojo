#!/usr/bin/env bash
# ── OUTSIDE CALL GUARD — SP-100, SP-103, SP-107, SP-112 (signed 2026-11-12) ─────────────────────
#
# WHY THIS GUARD EXISTS. On 2026-07-28 four OpenAI calls carried 60 signals minted from private
# uploaded documents — every one of them non-public by the router's own law — because
# assess-surface-drift selected "every active signal" with no band, voice or provenance filter and
# called an UNCONDITIONAL outside client. The per-row subject gate that guards a route or a need was
# never wired to the evidence block appended beside it. Nothing failed; nothing was logged as wrong.
#
# THE LAW (SP-100): no text from a banked row reaches an outside model except through the router
# (resolveModel) with the true provenance of EVERY row whose text travels — subject rows AND evidence
# blocks. An unconditional outside client is allowed ONLY where the corpus is public by construction,
# and each such site is named below with its reason.
#
# Checks:
#   (a1) CENSUS. Every function holding an unconditional outside client is either ROUTED (it calls
#        resolveModel / a routed caller) or on the allowlist below with a one-line corpus reason.
#        An unlisted, unrouted site fails. Plant: PLANT=unlisted.
#   (a2) SP-103. Every OpenAI request body sets `store: false` explicitly. The /v1/responses and
#        /v1/chat/completions defaults retain server-side; Anthropic's /v1/messages has no such
#        parameter and is exempt by endpoint, not by allowlist.
#   (a3) The four contained functions still carry their gate: the two propose-* filter the evidence
#        block by signalProvenance, assess-surface-drift routes, council-review withholds `inputs`.
#   (b1) BEHAVIOUR. A held throwaway company holding a private upload-derived signal, assessed:
#        the row is 'withheld', and NO model_calls row was written. Plant: PLANT=unrouted.
#   (b2) NON-VACUITY. The router still admits the external lane for an all-public signal set —
#        exercised as a predicate, so the guard never spends money or touches a real company.
#   (b3) SP-107. The capability a client role already holds (structure.route.generate) cannot carry
#        private evidence out: propose-route-changes refuses by name when the block is non-public.
#   (b4) SP-112 RENDER. 'withheld' is never labelled slight drift and a NULL score never throws.
#   (b6) SERVED WORKER, assess-surface-drift. On a held throwaway holding ONE private upload-derived
#        signal, the saved row is drift_state='withheld' with drift_score NULL — the function really
#        declined, on the worker, not merely in the source. Non-vacuity partner: a public-only
#        throwaway still reaches the OUTSIDE lane and saves a real verdict with a score.
#        Plant: PLANT=unrouted turns (b6) red on the restarted worker.
#   (b8) SERVED WORKER, SP-133. A surface whose candidate rows are GONE (non-empty diff, empty
#        content query) is never saved as 'withheld' — it holds no evidence to withhold, and at
#        f21d1554 that case was assessed normally.
#   (b7) SERVED WORKER, SP-107, in two parts since slice A (2026-11-12). propose-route-changes now
#        checks WHO IS CALLING first (SP-141), so the two refusals are separate facts and each is
#        proven on its own:
#        (b7-id)       a NON-ADMIN who is a member of ANOTHER company is refused on IDENTITY —
#                      403 not_authorised — before any evidence question is reached. Until slice A
#                      this function authenticated its caller NOT AT ALL: it built a service-role
#                      client and never read Authorization, so that JWT was accepted like any other
#                      bearer. caller-authz-guard owns the identity rule; this check holds the line
#                      here, where the private evidence is.
#        (b7-evidence) the EVIDENCE refusal is therefore proven with a caller who is ALLOWED to call
#                      — the admin — who reaches the handler and is told the evidence was withheld,
#                      with NO outside model call recorded for that company.
#        Non-vacuity partner: the same admin on the public-only throwaway proceeds and a model_calls
#        row appears.
#
# The served-worker checks WRITE fixture rows on two throwaway companies and delete them in an EXIT
# trap. The non-vacuity partners make a real (cent-fraction) OpenAI call on a throwaway, which step 13
# permits; they are the only spend in this guard.
#   (b5) SP-106. council-review refuses a non-admin caller by name, in the function.
#   (b9) SERVED WORKER, SP-346 (2026-11-14). An uploaded file's signal is PRIVATE whatever its voice.
#        A third held throwaway holds ONE signal minted from an upload the voice gate classed third
#        party — source_type='uploaded_file', signal_band='outside', voice 'outside_voice_about_client',
#        exactly the shape band + voice alone read as public. assess-surface-drift must save it
#        'withheld' with no score, propose-route-changes must refuse it by name, and NO outside model
#        call may be recorded for that company. Non-vacuity: (b6-nv)/(b7-nv) on the public-only
#        throwaway in the same run. Plant: drop the source_type test in signalProvenance
#        (src/lib/modelRouter/resolveModel.ts) via scripts/plant.sh, docker restart the edge runtime —
#        (b9) goes RED (and the plant's run makes one cent-fraction call on the throwaway's synthetic text).
#
#   (c1) SERVED WORKER, SP-349 (2026-11-14). A claim's publicness is DERIVED from its signals' source at
#        call time, never the stored marking. Held throwaway 0c900000-…-c004 holds a claim stored
#        'public_observed' that rests on ONE uploaded-file signal (outside / outside_voice_about_client),
#        paired in a public_vs_public divergent delta with a public claim. generate-conflict-explanation
#        (write:false) must route that pair LOCAL — 0 outside model_calls rows carrying tokens for c004 —
#        and the public-read pool (generate-public-read plan mode, read-only) must drop the delta with
#        reason claim_not_public_by_source. (Note: that function writes ONE provider='openai' ledger row
#        per run even when nothing went outside — tokens 0 — so the check counts rows with tokens.)
#   (c2) PUBLIC CONTROL. Throwaway …-c005, the same shape on public_baseline_run signals only: the same
#        call reaches OpenAI (≥1 ledgered row with tokens; a cent-fraction call on synthetic text) and the
#        pool keeps its delta.
#   (c3) UNIT. src/lib/claimRouterProvenance.test.ts — the pure rule and the fail-closed loader.
#        Plant: make decideClaimRouterProvenance return the stored marking, docker restart the edge
#        runtime — (c1) and (c3) go RED. The c004/c005 claim, signal and delta rows are FIXED ids, born
#        held, and never deleted (a claim or delta delete writes an audit row); only their model_calls
#        rows are cleared each run (SP-264: rows this guard created).
#
#   (d1) SERVED WORKER, F1 (SP-352, 2026-11-14). A finding's publicness is DERIVED from its sources at
#        call time, never its stored register. Held throwaway 0c900000-…-c006 holds two findings stored
#        'public_inferred', both open with no beats yet: a FRONTIER with no input ledger (the pre-wall
#        shape), and an observation whose origin signal is an uploaded file. generate-finding-beats must
#        route both LOCAL — 0 outside model_calls rows carrying tokens for c006, ≥1 local row (it ran) —
#        and the public-read pool (generate-public-read plan mode, read-only) must drop both with reason
#        finding_not_public_by_source.
#   (d2) PUBLIC CONTROL. Throwaway …-c007: one finding on a public_baseline_run origin signal. The same
#        call reaches OpenAI (≥1 ledgered finding-beats row with tokens; a cent-fraction call on synthetic
#        text) and the pool keeps the finding.
#   (d3) UNIT. src/lib/findingRouterProvenance.test.ts — the pure rule and the fail-closed loader.
#        Plant: make decideFindingPublicBySource return true (so the stored register decides, as before),
#        docker restart the edge runtime — (d1) and (d3) go RED. The fixture rows are FIXED ids, born held,
#        never deleted; each run resets ONLY their beats to NULL (so (d1)/(d2) always have work) and clears
#        their model_calls rows (SP-264: rows this guard created).
#   (d4) SERVED WORKER, the recurrence finding-join judge (the path that historically carried c7bfc5cc ×40
#        and ac951864 ×25). c006 also holds two public signals on different domains with a banked accepted
#        pair verdict, so its two findings reach the R1 join judge. generate-signal-recurrence {write:false}
#        must make ≥2 finding-join calls and record 0 outside tokens on that call site for c006.
#   (d5) SERVED WORKER, open-question finding anchors. Both c006 findings point at the fixture's own
#        public_baseline_runs row; generate-open-questions (plan, then one scoped chunk, write:false) must
#        process both anchors with 0 outside tokens for c006.
#   (d4/d5 controls) c007: the same shapes on public sources — the control finding's origin signal is
#        OUTSIDE the cluster, so it reaches the judge rather than an origin join — and both calls reach
#        OpenAI (≥1 ledgered row with tokens each; cent-fraction calls on synthetic text).
#
# Read the printed verdict, not only the exit code — this guard sets both (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."

PLANT="${PLANT:-}"
fails=0
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; fails=$((fails+1)); }

# ── the allowlist: unconditional outside clients whose corpus is public BY CONSTRUCTION ──────────
# Each line: <function> | <reason>. A site here reads no banked private row — its inputs are a crawl
# of public pages, or a model's own prior public output. Adding a line is a signed act.
allowlisted() {
  case "$1" in
    extract-outside-evidence)   echo "crawled outside pages only — no banked-row select in the function" ;;
    extract-own-words)          echo "own_words_page_snapshots — the company's own public website" ;;
    retype-own-words)           echo "re-types quotes already admitted from the company's public pages" ;;
    extract-client-voice)       echo "own_words_page_snapshots; signals read are filtered voice_class=client_voice" ;;
    supersede-old-client-voice) echo "signals read are filtered voice_class=client_voice (public web)" ;;
    public-baseline)            echo "the crawl itself; banked reads are a delete, two local dedupe sets and a head count" ;;
    competitor-discovery)       echo "public baseline; job_steps gated by allPublic (every step carries source_run_id)" ;;
    generate-normative-jobmap)  echo "normative industry sources; reads no input_files and no sidecar" ;;
    reconcile-market-definition) echo "signals filtered voice_class=market_context; its own judge is local Ollama" ;;
    backfill-canonical-statements) echo "odi_needs gated per row by gateSubjectForExternal" ;;
    evaluate-opportunity-alignment|evaluate-positioning-alignment|evaluate-route-alignment)
                                echo "subject gated per row by gateSubjectForExternal; no evidence block" ;;
    refresh-cascade|refresh-positioning)
                                echo "routes provenance-filtered (DECL-OPP 1a.1); input brief gated at contextBuilders" ;;
    propose-cascade-changes|propose-positioning-changes)
                                echo "subject gated per row; input brief gated at contextBuilders (no authored text)" ;;
    council-review)             echo "odi_needs gated per row; inputs + file metadata withheld; admin-only in-function" ;;
    research-company)           echo "birth-only and public-only: refuses a company holding an interview upload, and its uploaded-evidence context carries a COUNT only" ;;
    assess-surface-drift|propose-route-changes|propose-opportunity-changes)
                                echo "" ;;   # NOT allowlisted — these must be routed/gated (a3)
    *) echo "" ;;
  esac
}

echo "── (a1) census: every unconditional outside client is routed or allowlisted ──"
# a function is "unconditional" if it imports callOpenAIJSON or fetches an outside endpoint directly
# bash 3.2 (macOS) has no mapfile — a newline-separated list and a read loop
SITES=$(
  grep -rl 'callOpenAIJSON\|api\.openai\.com\|api\.anthropic\.com' supabase/functions \
    --include="*.ts" 2>/dev/null \
  | grep -v '/_shared/' | grep -v '\.test\.ts' \
  | sed 's|^supabase/functions/||; s|/.*$||' | sort -u
)
[ -n "$SITES" ] || bad "(a1) census found no outside call sites — the grep is broken, not the code"
for site in $SITES; do
  d="supabase/functions/$site"
  routed=0
  grep -rq 'resolveModel\|makeRoutedModel\|makeRoutedJudge\|routedCall\|routedJudge\|signalProvenance' "$d" --include="*.ts" 2>/dev/null && routed=1
  reason="$(allowlisted "$site")"
  if [ "$routed" = 1 ]; then
    ok "(a1) $site — routed"
  elif [ -n "$reason" ]; then
    ok "(a1) $site — allowlisted: $reason"
  else
    bad "(a1) $site — an unconditional outside client that is NEITHER routed NOR allowlisted"
  fi
done

echo "── (a2) SP-103: every OpenAI request body sets store:false ──"
# one body per file; Anthropic /v1/messages has no store parameter and is not checked
for f in supabase/functions/_shared/openaiClient.ts supabase/functions/_shared/modelRouter.ts \
         supabase/functions/_shared/ownWordsJudge.ts supabase/functions/research-company/index.ts \
         supabase/functions/council-review/index.ts supabase/functions/public-baseline/index.ts \
         supabase/functions/extract-client-voice/index.ts \
         supabase/functions/supersede-old-client-voice/index.ts; do
  if grep -q 'store: false' "$f"; then ok "(a2) $(basename "$(dirname "$f")")/$(basename "$f")"
  else bad "(a2) $f sends an OpenAI body with no explicit store:false"; fi
done

echo "── (a3) the four contained functions still carry their gate ──"
if [ "$PLANT" = "unrouted" ]; then echo "  (PLANT=unrouted: a3/b1 are expected RED)"; fi
grep -q 'signalProvenance(s.signal_band, s.voice_class, s.source_type)' supabase/functions/assess-surface-drift/index.ts \
  && ok "(a3) assess-surface-drift routes on every signal's provenance, source first (SP-346)" \
  || bad "(a3) assess-surface-drift no longer routes on signal provenance"
grep -q "drift_state: \"withheld\"" supabase/functions/assess-surface-drift/index.ts \
  && ok "(a3) assess-surface-drift withholds rather than guessing a verdict" \
  || bad "(a3) assess-surface-drift has no withheld path"
for p in propose-route-changes propose-opportunity-changes; do
  grep -q 'isPublicProvenance(signalProvenance(r.signal_band, r.voice_class, r.source_type))' "supabase/functions/$p/index.ts" \
    && ok "(a3) $p filters the evidence block by provenance, source first (SP-346)" \
    || bad "(a3) $p sends its evidence block ungated"
done
grep -q 'if (!isPublicSignalSourceType(sourceType)) return null;' src/lib/modelRouter/resolveModel.ts \
  && ok "(a3) SP-346: signalProvenance decides from source_type first — an uploaded file is never public" \
  || bad "(a3) SP-346: signalProvenance no longer tests source_type — an upload labelled outside voice reads public"
grep -q 'client text withheld' supabase/functions/_shared/contextBuilders.ts \
  && ok "(a3) the shared input brief carries no authored client text (SP-95)" \
  || bad "(a3) _shared/contextBuilders.ts buildInputBrief sends inputs.description to a model"
grep -q 'fileCount' supabase/functions/research-company/index.ts && ! grep -q 'extracted.txt".*download\|download(sidecarPath)' supabase/functions/research-company/index.ts \
  && ok "(a3) research-company fetches no upload sidecar into the scope of its outside prompts (SP-F17)" \
  || bad "(a3) research-company reads an upload sidecar again"
grep -q 'inputsWithheldExternal' supabase/functions/council-review/index.ts \
  && ok "(a3) council-review withholds inputs + file metadata and records the count" \
  || bad "(a3) council-review sends inputs/file metadata ungated"
grep -q 'not_admin' supabase/functions/council-review/index.ts \
  && ok "(b5) council-review refuses a non-admin caller by name (SP-106)" \
  || bad "(b5) council-review has no in-function admin gate"

echo "── (b1) behaviour: a private upload-derived signal is never judged outside ──"
DB="${SUPABASE_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
psqlq() { docker exec -i "$DB" psql -U postgres -At -c "$1" 2>/dev/null; }
if ! psqlq "select 1" >/dev/null 2>&1; then
  bad "(b1) cannot reach the local database ($DB) — behaviour half not exercised"
else
  # the predicate the function applies, evaluated in SQL over a company that really holds such a row
  # SP-346: an upload-derived signal is non-public WHATEVER its band and voice
  CO=$(psqlq "select company_id::text from public.signals
              where source_type in ('uploaded_file','file','file_proposal','intake','interview')
              group by company_id order by count(*) desc limit 1")
  if [ -z "$CO" ]; then
    ok "(b1) no company holds a non-public upload-derived signal — vacuous, nothing to contain"
  else
    NONPUB=$(psqlq "select count(*) from public.signals
                    where company_id='$CO' and relevance_state='active'
                      and (source_type in ('uploaded_file','file','file_proposal','intake','interview')
                           or not (signal_band='outside' and voice_class in
                            ('outside_voice_about_client','client_voice','market_context','competitor_voice'))))")
    # every outside model_calls row for this company written AFTER the containment commit date
    LEAKED=$(psqlq "select count(*) from public.model_calls
                    where company_id='$CO' and provider in ('openai','anthropic')
                      and call_site in ('assess-surface-drift','propose-route-changes','propose-opportunity-changes')
                      and created_at > '2026-11-12T13:00:00Z'")
    if [ "${LEAKED:-0}" = "0" ]; then
      ok "(b1) company holding $NONPUB non-public signal(s): zero outside calls from the four sites since containment"
    else
      bad "(b1) $LEAKED outside call(s) from a contained site on a company holding non-public signals"
    fi
    WITHHELD_OK=$(psqlq "select count(*) from pg_constraint
                         where conrelid='public.surface_drift_assessments'::regclass
                           and conname='check_withheld_has_no_score'")
    [ "${WITHHELD_OK:-0}" = "1" ] \
      && ok "(b1) check_withheld_has_no_score is in force — only a withheld row may lack a score" \
      || bad "(b1) check_withheld_has_no_score is missing — a scoreless verdict could be written"
  fi
fi

echo "── (b2) non-vacuity + (b3) SP-107 + (b4) SP-112 render: the unit contract ──"
if npx vitest run src/components/drift/driftStrings.parity.test.ts \
                 src/components/drift/withheldRender.test.tsx \
                 src/lib/modelRouter/resolveModelHardening.test.ts \
                 src/lib/modelRouter/resolveModel.test.ts >/tmp/outside-call-guard-vitest.log 2>&1; then
  ok "(b2/b4) router admits the external lane for all-public inputs, never for an upload source (SP-346); withheld renders correctly"
else
  bad "(b2/b4) the router/render contract failed — see /tmp/outside-call-guard-vitest.log"
fi
# b3: the refusal exists by name, on the path a client-held capability can reach
grep -q 'evidence withheld — not cleared for an outside model' supabase/functions/propose-route-changes/index.ts \
  && ok "(b3) propose-route-changes refuses private evidence by name (the Decision-Owner path)" \
  || bad "(b3) propose-route-changes has no named refusal for private evidence"


# ── (b6) (b7) SERVED-WORKER BEHAVIOUR on held throwaways ─────────────────────────────────────────
echo "── (b6/b7) served worker: the four fixed functions on held throwaway companies ──"
PRIV="0c900000-0000-4000-8000-00000000c001"
PUB="0c900000-0000-4000-8000-00000000c002"
UPV="0c900000-0000-4000-8000-00000000c003"   # SP-346: an upload labelled outside voice
FUNCTIONS_URL="${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}"
AUTH_URL="${AUTH_URL:-http://127.0.0.1:54321/auth/v1}"

# A fixture that fails to land must SAY so: a silent insert failure makes every check below read as
# a code failure. Deletes are allowed to be quiet (they run in the EXIT trap, possibly twice).
# A fixture that fails to land must SAY so: a silent insert failure makes every check below read as
# a code failure. Child removals are allowed to be quiet (they run in the EXIT trap, possibly twice).
psqlx() {
  local out
  out=$(docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" 2>&1) || {
    case "$1" in
      delete*|update*) : ;;
      *) echo "  FAIL (b6/b7) fixture SQL failed: $(echo "$out" | head -2 | tr '\n' ' ')"; fails=$((fails+1)) ;;
    esac
    return 1
  }
  return 0
}

# ── E2 TEARDOWN: THE COMPANY IS NEVER DELETED (pattern from file-analysis-v2-guard / subjects-guard)
# Twelve tables cascade from companies AND carry an immutability trigger, so `delete from companies`
# is structurally unachievable for any company a real run has touched: as one transaction it aborts
# the whole teardown and leaves a LIVE fixture company behind. Instead, per E2:
#   1. the hold is stamped FIRST, at birth, so an abort anywhere below can never leave one live;
#   2. each deletable child is removed in its OWN statement, so one append-only table cannot abort
#      the rest, and whatever survives is NAMED;
#   3. the company itself is never deleted.
# The two ids are FIXED and reused every run, so the fleet gains two accounted-for held companies —
# not two per run. R40 already defines fixture_hold non-null as outside every fleet sweep, product
# proof and client surface, so the fixture is INERT rather than absent.
remove_children() {
  local left=""
  try_del() { psqlx "$2" || left="$left $1"; }
  for c in "$PRIV" "$PUB" "$UPV"; do
    try_del surface_drift_assessments "delete from public.surface_drift_assessments where company_id='$c';"
    try_del integrity_runs            "delete from public.integrity_runs where company_id='$c';"
    try_del model_calls               "delete from public.model_calls where company_id='$c';"
    try_del surface_proposals         "delete from public.surface_proposals where company_id='$c';"
    try_del signals                   "delete from public.signals where company_id='$c';"
    try_del routes                    "delete from public.routes where company_id='$c';"
    try_del strategy_cascades         "delete from public.strategy_cascades where company_id='$c';"
  done
  if [ -n "$left" ]; then
    echo "  note (b6/b7) rows left behind (append-only or trigger-protected):$left — the companies stay HELD"
  fi
}

if ! psqlq "select 1" >/dev/null 2>&1; then
  bad "(b6/b7) cannot reach the local database — served-worker half not exercised"
else
  SRK="${SERVICE_ROLE_KEY:-}"
  [ -n "$SRK" ] || SRK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
  ANONK="${ANON_KEY:-}"
  [ -n "$ANONK" ] || ANONK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
  if [ -z "$SRK" ] || [ -z "$ANONK" ]; then
    bad "(b6/b7) could not resolve SERVICE_ROLE_KEY / ANON_KEY — served-worker half not exercised"
  else
    trap remove_children EXIT
    remove_children   # a previous aborted run must never leave its children behind
    # SP-128: the fixture owner is the TEST account the sibling guards use, never the operator.
    # `order by created_at limit 1` returned the OLDEST account — the operator's — so every fixture
    # this guard created was stamped as his. Resolved by email from backups/fr-login.env, and the
    # check refuses rather than falling back to any other account.
    OWNER=""
    if [ -n "${FR_LOGIN_EMAIL:-}" ]; then
      OWNER=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
    fi
    if [ -z "$OWNER" ]; then
      bad "(b6/b7) FR_LOGIN_EMAIL not set or no such account — source backups/fr-login.env; the served-worker half did not run (the fixture owner is the CC-owned test account from backups/fr-login.env; the operator's own login is never used here)"
    fi
    if [ -n "$OWNER" ]; then
    for c in "$PRIV|private-evidence" "$PUB|public-only" "$UPV|upload-outside-voice"; do
      cid="${c%%|*}"; nm="ocg-throwaway-${c##*|}"
      # born HELD and idempotent: the id is fixed and reused, so a second run must not fail on it,
      # and the hold is stamped in the SAME statement that creates the row (E2 step 1).
      # companies.fixture_hold is TEXT, not a timestamp — the fleet's markers read like
      # 'R39:test_fixture' / 'FA2:spent-…', so this guard uses its own tag.
      psqlx "insert into public.companies (id, name, created_by, fixture_hold)
             values ('$cid','$nm','$OWNER','OCG:test_fixture')
             on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'OCG:test_fixture');"
      psqlx "insert into public.strategy_cascades (id, company_id, user_id, artifact_role, source_direction_key, provenance_type, winning_aspiration, where_to_play, how_to_win, evidence_baseline_signal_ids, evidence_baseline_captured_at)
             values (gen_random_uuid(),'$cid','$OWNER','market_read','','public_research','Aspiration under test','Where under test','How under test','[]'::jsonb, now());"
      psqlx "insert into public.routes (id, company_id, user_id, title, short_description, category, level, provenance_type)
             values (gen_random_uuid(),'$cid','$OWNER','Route under test','A route fixture for the outside-call guard','fix','route','public_research');"
    done
    # the private company holds ONE upload-derived signal; the public one holds ONE public-web signal
    psqlx "insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, relevance_state)
           values (gen_random_uuid(),'$PRIV','uploaded_file','organization',null,'A claim lifted from a document the client uploaded','An excerpt from a private upload','pricing','active');"
    psqlx "insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, relevance_state)
           values (gen_random_uuid(),'$PUB','public_baseline_run','outside','client_voice','A claim the company published on its own site','An excerpt from a public page','pricing','active');"

    # (b9) SP-346: ONE signal from an upload the voice gate classed third party — the exact shape
    # (outside band, outside_voice_about_client) that band + voice alone admitted as public_observed
    psqlx "insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, relevance_state)
           values (gen_random_uuid(),'$UPV','uploaded_file','outside','outside_voice_about_client','A claim lifted from a third-party document the client uploaded','An excerpt from a private third-party upload','pricing','active');"
    UPV_SIG=$(psqlq "select count(*) from public.signals where company_id='$UPV' and source_type='uploaded_file' and signal_band='outside' and voice_class='outside_voice_about_client'")
    [ "${UPV_SIG:-0}" = "1" ] || bad "(b9) the upload-outside-voice fixture signal did not land (count=${UPV_SIG:-?}) — (b9) would be vacuous"
    CASC_PRIV=$(psqlq "select id::text from public.strategy_cascades where company_id='$PRIV' limit 1")
    CASC_PUB=$(psqlq "select id::text from public.strategy_cascades where company_id='$PUB' limit 1")
    ROUTE_PRIV=$(psqlq "select id::text from public.routes where company_id='$PRIV' limit 1")
    ROUTE_PUB=$(psqlq "select id::text from public.routes where company_id='$PUB' limit 1")
    CASC_UPV=$(psqlq "select id::text from public.strategy_cascades where company_id='$UPV' limit 1")
    ROUTE_UPV=$(psqlq "select id::text from public.routes where company_id='$UPV' limit 1")

    invoke() { # $1 fn, $2 bearer, $3 json  → body on stdout
      curl -s -m 180 -X POST "$FUNCTIONS_URL/$1" \
        -H "Authorization: Bearer $2" -H "Content-Type: application/json" -d "$3"
    }

    # (b6) assess-surface-drift on the PRIVATE throwaway → withheld, no score
    invoke assess-surface-drift "$SRK" "{\"company_id\":\"$PRIV\",\"surface_type\":\"cascade\",\"surface_id\":\"$CASC_PRIV\"}" >/dev/null
    ROW=$(psqlq "select coalesce(drift_state,'(none)')||'|'||coalesce(drift_score::text,'NULL') from public.surface_drift_assessments where company_id='$PRIV' and surface_type='cascade' limit 1")
    if [ "$ROW" = "withheld|NULL" ]; then
      ok "(b6) private upload-derived evidence → the worker saved drift_state='withheld', drift_score NULL"
    else
      bad "(b6) private evidence assessed as '$ROW' (expected withheld|NULL)"
    fi
    LEAK6=$(psqlq "select count(*) from public.model_calls where company_id='$PRIV' and provider in ('openai','anthropic')")
    [ "${LEAK6:-1}" = "0" ] \
      && ok "(b6) and no outside model call was recorded for that company" \
      || bad "(b6) $LEAK6 outside model call(s) recorded on the private throwaway"

    # (b9) SP-346: the upload labelled outside voice is withheld on the worker, never judged outside
    invoke assess-surface-drift "$SRK" "{\"company_id\":\"$UPV\",\"surface_type\":\"cascade\",\"surface_id\":\"$CASC_UPV\"}" >/dev/null
    ROW9=$(psqlq "select coalesce(drift_state,'(none)')||'|'||coalesce(drift_score::text,'NULL') from public.surface_drift_assessments where company_id='$UPV' and surface_type='cascade' limit 1")
    if [ "$ROW9" = "withheld|NULL" ]; then
      ok "(b9) an uploaded file's signal labelled outside_voice_about_client → withheld, drift_score NULL (SP-346)"
    else
      bad "(b9) an uploaded file's signal labelled outside voice was assessed as '${ROW9:-(none)}' (expected withheld|NULL) — the router read the voice, not the source"
    fi
    LEAK9=$(psqlq "select count(*) from public.model_calls where company_id='$UPV' and provider in ('openai','anthropic')")
    [ "${LEAK9:-1}" = "0" ] \
      && ok "(b9) and no outside model call was recorded for that company" \
      || bad "(b9) $LEAK9 outside model call(s) recorded on the upload-outside-voice throwaway"

    # (b8) SP-133: a surface whose CANDIDATE ROWS ARE GONE must never be saved as 'withheld'.
    # newSignalIds is non-empty but the content query returns nothing — rows deleted or
    # relevance-flipped in between. There is no banked-row text in that prompt at all, so there is
    # nothing to withhold, and claiming private evidence would be a statement about rows we do not
    # have. Simulated by baselining the surface on a signal id that exists nowhere, then deleting
    # the company's only signal: the diff is non-empty, the content query is empty.
    GHOST="0c900000-0000-4000-8000-0000000000ff"
    psqlx "update public.strategy_cascades set evidence_baseline_signal_ids='[\"$GHOST\"]'::jsonb where company_id='$PRIV';"
    psqlx "delete from public.surface_drift_assessments where company_id='$PRIV';"
    SIGBK=$(psqlq "select claim_text from public.signals where company_id='$PRIV' limit 1")
    psqlx "delete from public.signals where company_id='$PRIV';"
    psqlx "insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, relevance_state)
           values ('$GHOST','$PRIV','public_baseline_run','outside','client_voice','ghost row, deleted before the content query','active');"
    psqlx "delete from public.signals where id='$GHOST';"
    invoke assess-surface-drift "$SRK" "{\"company_id\":\"$PRIV\",\"surface_type\":\"cascade\",\"surface_id\":\"$CASC_PRIV\"}" >/dev/null
    GHOSTROW=$(psqlq "select coalesce(drift_state,'(none)') from public.surface_drift_assessments where company_id='$PRIV' and surface_type='cascade' limit 1")
    case "$GHOSTROW" in
      withheld) bad "(b8) a surface with NO candidate rows was saved as 'withheld' — it has no evidence to withhold" ;;
      *) ok "(b8) a surface whose candidate rows are gone is not saved as 'withheld' (got '$GHOSTROW')" ;;
    esac
    # put the private fixture back for the checks that follow
    psqlx "delete from public.surface_drift_assessments where company_id='$PRIV';"
    psqlx "update public.strategy_cascades set evidence_baseline_signal_ids='[]'::jsonb where company_id='$PRIV';"
    psqlx "insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, relevance_state)
           values (gen_random_uuid(),'$PRIV','uploaded_file','organization',null,'${SIGBK:-A claim lifted from a document the client uploaded}','An excerpt from a private upload','pricing','active');"

    # (b6-nv) the same function on the PUBLIC-only throwaway still reaches the outside lane
    invoke assess-surface-drift "$SRK" "{\"company_id\":\"$PUB\",\"surface_type\":\"cascade\",\"surface_id\":\"$CASC_PUB\"}" >/dev/null
    ROWP=$(psqlq "select coalesce(drift_state,'(none)')||'|'||case when drift_score is null then 'NULL' else 'scored' end from public.surface_drift_assessments where company_id='$PUB' and surface_type='cascade' limit 1")
    case "$ROWP" in
      aligned\|scored|slight_drift\|scored|material_drift\|scored)
        ok "(b6-nv) public-only evidence still reaches the outside lane and saves a real verdict ($ROWP)" ;;
      *) bad "(b6-nv) public-only evidence produced '$ROWP' — the outside lane is no longer reachable (vacuous guard)" ;;
    esac

    # (b7-id) IDENTITY first (SP-141, slice A): a non-admin member of ANOTHER company is refused
    # before any evidence question. The member fixture belongs to 66666666-…-6601 and to nothing
    # else, so on this throwaway it holds no capability and must get 403 not_authorised.
    JWT_NA=""
    if [ -n "${MEMBER_EMAIL:-}" ] && [ -n "${MEMBER_PASSWORD:-}" ]; then
      JWT_NA=$(curl -s -m 30 -X POST "$AUTH_URL/token?grant_type=password" \
        -H "apikey: $ANONK" -H 'Content-Type: application/json' \
        -d "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$MEMBER_PASSWORD\"}" \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch(e){process.stdout.write("")}})')
    fi
    if [ -z "$JWT_NA" ]; then
      bad "(b7-id) MEMBER_EMAIL/MEMBER_PASSWORD not set or login failed — source backups/fr-member.env; the identity check did not run"
    else
      B7I=$(invoke propose-route-changes "$JWT_NA" "{\"route_id\":\"$ROUTE_PRIV\",\"company_id\":\"$PRIV\"}")
      if echo "$B7I" | grep -q '"not_authorised"'; then
        ok "(b7-id) a non-admin member of another company is refused on IDENTITY, on the worker"
      else
        bad "(b7-id) propose-route-changes did not refuse a non-member on identity: $(echo "$B7I" | head -c 160)"
      fi
    fi

    # (b7-evidence) the EVIDENCE refusal, proven with a caller who is ALLOWED to call (the admin).
    JWT_AD=""
    if [ -n "${FR_LOGIN_EMAIL:-}" ] && [ -n "${FR_LOGIN_PASSWORD:-}" ]; then
      JWT_AD=$(curl -s -m 30 -X POST "$AUTH_URL/token?grant_type=password" \
        -H "apikey: $ANONK" -H 'Content-Type: application/json' \
        -d "{\"email\":\"$FR_LOGIN_EMAIL\",\"password\":\"$FR_LOGIN_PASSWORD\"}" \
        | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch(e){process.stdout.write("")}})')
    fi
    if [ -z "$JWT_AD" ]; then
      bad "(b7-evidence) FR_LOGIN_EMAIL/FR_LOGIN_PASSWORD not set or login failed — source backups/fr-login.env; the SP-107 check did not run"
    else
      B7=$(invoke propose-route-changes "$JWT_AD" "{\"route_id\":\"$ROUTE_PRIV\",\"company_id\":\"$PRIV\"}")
      if echo "$B7" | grep -q '"skipped":true' && echo "$B7" | grep -q 'not cleared for an outside model'; then
        ok "(b7-evidence) an ALLOWED caller on private evidence is refused by name, on the worker"
      else
        bad "(b7-evidence) admin propose-route-changes on private evidence did not refuse: $(echo "$B7" | head -c 160)"
      fi
      LEAK7=$(psqlq "select count(*) from public.model_calls where company_id='$PRIV' and provider in ('openai','anthropic')")
      [ "${LEAK7:-1}" = "0" ] \
        && ok "(b7-evidence) and still no outside model call recorded for that company" \
        || bad "(b7-evidence) $LEAK7 outside model call(s) recorded on the private throwaway"

      B9R=$(invoke propose-route-changes "$JWT_AD" "{\"route_id\":\"$ROUTE_UPV\",\"company_id\":\"$UPV\"}")
      if echo "$B9R" | grep -q '"skipped":true' && echo "$B9R" | grep -q 'not cleared for an outside model'; then
        ok "(b9) propose-route-changes refuses an upload labelled outside voice by name, on the worker (SP-346)"
      else
        bad "(b9) propose-route-changes on an upload labelled outside voice did not refuse: $(echo "$B9R" | head -c 160)"
      fi
      LEAK9R=$(psqlq "select count(*) from public.model_calls where company_id='$UPV' and provider in ('openai','anthropic')")
      [ "${LEAK9R:-1}" = "0" ] \
        && ok "(b9) and still no outside model call recorded for that company" \
        || bad "(b9) $LEAK9R outside model call(s) recorded on the upload-outside-voice throwaway"

      B7N=$(invoke propose-route-changes "$JWT_AD" "{\"route_id\":\"$ROUTE_PUB\",\"company_id\":\"$PUB\"}")
      CALLS=$(psqlq "select count(*) from public.model_calls where company_id='$PUB' and provider='openai' and call_site='propose-route-changes'")
      if [ "${CALLS:-0}" -ge 1 ] && ! echo "$B7N" | grep -q 'not cleared for an outside model'; then
        ok "(b7-nv) public-only evidence still reaches the outside lane ($CALLS ledgered call(s))"
      else
        bad "(b7-nv) public-only evidence did not reach the outside lane — calls=$CALLS resp=$(echo "$B7N" | head -c 120)"
      fi
    fi
    fi
  fi
fi

# ── (c1) (c2) (c3) SP-349: claim publicness is derived from signal source, at call time ─────────────
echo "── (c1/c2/c3) SP-349: a claim is public only when every signal it rests on is public by source ──"
if npx vitest run src/lib/claimRouterProvenance.test.ts >/tmp/outside-call-guard-c3.log 2>&1; then
  ok "(c3) the pure rule and the fail-closed loader hold (claimRouterProvenance.test.ts)"
else
  bad "(c3) claimRouterProvenance unit contract failed — see /tmp/outside-call-guard-c3.log"
fi
C4="0c900000-0000-4000-8000-00000000c004"; C5="0c900000-0000-4000-8000-00000000c005"
OWNER_C=""
[ -n "${FR_LOGIN_EMAIL:-}" ] && OWNER_C=$(docker exec -i "$DB" psql -U postgres -At -c "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1" 2>/dev/null)
SRK_C="${SERVICE_ROLE_KEY:-}"
[ -n "$SRK_C" ] || SRK_C=$(npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
if [ -z "$OWNER_C" ] || [ -z "$SRK_C" ]; then
  bad "(c1/c2) FR_LOGIN_EMAIL or SERVICE_ROLE_KEY unavailable — source backups/fr-login.env; the served-worker half did not run"
else
  cq() { docker exec -i "$DB" psql -U postgres -At -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
  # fixed ids, idempotent, born held (E2); suffix a = upload signal, b = public signal, c/d = claims, e = delta
  for spec in "$C4|uploaded_file|ocg-throwaway-claim-upload" "$C5|public_baseline_run|ocg-throwaway-claim-public"; do
    cid="${spec%%|*}"; rest="${spec#*|}"; src="${rest%%|*}"; nm="${rest#*|}"; k="${cid: -4}"
    out=$(cq "insert into public.companies (id, name, created_by, fixture_hold) values ('$cid','$nm','$OWNER_C','OCG:test_fixture')
                on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'OCG:test_fixture');
              insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, relevance_state, source_url)
                values ('0c900000-0000-4000-8000-00000${k}a01','$cid','$src','outside','outside_voice_about_client','Reviewers report the service is often late','Reviewers report the service is often late','reliability','active','https://reviews.example.org/a'),
                       ('0c900000-0000-4000-8000-00000${k}b01','$cid','public_baseline_run','outside','client_voice','We deliver on time, every time','We deliver on time, every time','reliability','active','https://company.example.com/about')
                on conflict (id) do nothing;
              insert into public.claims (id, company_id, statement, provenance, status)
                values ('0c900000-0000-4000-8000-00000${k}c01','$cid','We deliver on time, every time','public_observed','active'),
                       ('0c900000-0000-4000-8000-00000${k}d01','$cid','Reviewers report the service is often late','public_observed','active')
                on conflict (id) do nothing;
              insert into public.claim_signal_refs (company_id, claim_id, signal_id)
                select '$cid', x.c::uuid, x.s::uuid from (values ('0c900000-0000-4000-8000-00000${k}c01','0c900000-0000-4000-8000-00000${k}b01'),
                                                                  ('0c900000-0000-4000-8000-00000${k}d01','0c900000-0000-4000-8000-00000${k}a01')) x(c,s)
                where not exists (select 1 from public.claim_signal_refs r where r.claim_id=x.c::uuid and r.signal_id=x.s::uuid);
              insert into public.claim_deltas (id, company_id, declared_claim_id, public_claim_id, delta_type, pairing_kind, pairing_basis, content_identity)
                values ('0c900000-0000-4000-8000-00000${k}e01','$cid','0c900000-0000-4000-8000-00000${k}c01','0c900000-0000-4000-8000-00000${k}d01','divergent','public_vs_public','judge_confirmed','ocg-sp349-$k')
                on conflict (id) do nothing;
              delete from public.model_calls where company_id='$cid';") || bad "(c1/c2) fixture SQL failed on $cid: $(echo "$out" | head -2 | tr '\n' ' ')"
  done
  # non-vacuity of the fixture itself: c004's claim really rests on an upload, stored public_observed
  SHAPE=$(cq "select count(*) from public.claims c join public.claim_signal_refs r on r.claim_id=c.id join public.signals s on s.id=r.signal_id
              where c.id='0c900000-0000-4000-8000-00000c004d01' and c.provenance='public_observed' and s.source_type='uploaded_file' and s.signal_band='outside' and s.voice_class='outside_voice_about_client'")
  [ "$SHAPE" = "1" ] || bad "(c1) the c004 fixture claim does not have the leak shape (got '$SHAPE') — (c1) would be vacuous"
  HOLDS=$(cq "select count(*) from public.companies where id in ('$C4','$C5') and fixture_hold is not null")
  [ "$HOLDS" = "2" ] || bad "(c1/c2) a fixture company is not held (held=$HOLDS)"
  callfn() { curl -s -m 400 -X POST "${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}/$1" -H "Authorization: Bearer $SRK_C" -H "Content-Type: application/json" -d "$2"; }
  pick() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const f=new Function("j","return ("+process.argv[1]+")");process.stdout.write(String(f(j)))}catch(e){process.stdout.write("ERR")}})' "$1"; }

  # (c1) the upload-backed pair: local, never outside
  R4=$(callfn generate-conflict-explanation "{\"company_id\":\"$C4\",\"pair_ids\":[\"0c900000-0000-4000-8000-00000c004e01\"],\"write\":false}")
  L4=$(echo "$R4" | pick 'j.results && j.results[0] ? j.results[0].router_forced_local+"|"+j.results[0].model : "none"')
  case "$L4" in
    true\|qwen*|true\|llama*) ok "(c1) a public_observed claim resting on an uploaded file is routed LOCAL by the worker ($L4)" ;;
    *) bad "(c1) the upload-backed pair was not routed local: $L4 — $(echo "$R4" | head -c 160)" ;;
  esac
  O4=$(cq "select count(*) from public.model_calls where company_id='$C4' and provider in ('openai','anthropic') and coalesce(prompt_tokens,0) > 0")
  [ "$O4" = "0" ] && ok "(c1) and 0 outside model_calls rows carrying tokens for c004" \
                  || bad "(c1) $O4 outside model_calls row(s) carrying tokens for c004 — the claim left the building"
  P4=$(callfn generate-public-read "{\"company_id\":\"$C4\",\"plan\":true}")
  D4=$(echo "$P4" | pick '((j.selection&&j.selection.dropped_by_kind&&j.selection.dropped_by_kind.delta)||[]).filter(d=>d.id==="0c900000-0000-4000-8000-00000c004e01").map(d=>d.reason).join(",")+"|"+((j.input_ledger&&j.input_ledger.ids)||[]).includes("0c900000-0000-4000-8000-00000c004e01")')
  [ "$D4" = "claim_not_public_by_source|false" ] \
    && ok "(c1) the public-read pool drops the delta with reason claim_not_public_by_source (plan mode, read-only)" \
    || bad "(c1) the public-read pool did not drop the upload-backed delta by source: '$D4' — $(echo "$P4" | head -c 160)"

  # (c2) the public-only control: still reaches the outside model, and the pool keeps it
  R5=$(callfn generate-conflict-explanation "{\"company_id\":\"$C5\",\"pair_ids\":[\"0c900000-0000-4000-8000-00000c005e01\"],\"write\":false}")
  L5=$(echo "$R5" | pick 'j.results && j.results[0] ? String(j.results[0].router_forced_local) : "none"')
  O5=$(cq "select count(*) from public.model_calls where company_id='$C5' and provider='openai' and call_site='generate-conflict-explanation' and coalesce(prompt_tokens,0) > 0")
  if [ "$L5" = "false" ] && [ "${O5:-0}" -ge 1 ]; then
    ok "(c2) the public-only control still reaches the outside model ($O5 ledgered OpenAI row(s) with tokens)"
  else
    bad "(c2) the public-only control did not reach the outside model (forced_local=$L5, rows=$O5) — the guard would be vacuous"
  fi
  P5=$(callfn generate-public-read "{\"company_id\":\"$C5\",\"plan\":true}")
  D5=$(echo "$P5" | pick '((j.selection&&j.selection.dropped_by_kind&&j.selection.dropped_by_kind.delta)||[]).some(d=>d.id==="0c900000-0000-4000-8000-00000c005e01"&&d.reason==="claim_not_public_by_source")')
  [ "$D5" = "false" ] && ok "(c2) and the pool does not drop the public-only delta by source" \
                      || bad "(c2) the public-only delta was dropped by source ('$D5') — over-correction"
fi

# ── (d1) (d2) (d3) F1: finding publicness is derived from its sources, at call time ─────────────────
echo "── (d1/d2/d3) F1: a finding is public only when it is public by source ──"
if npx vitest run src/lib/findingRouterProvenance.test.ts >/tmp/outside-call-guard-d3.log 2>&1; then
  ok "(d3) the pure rule and the fail-closed loader hold (findingRouterProvenance.test.ts)"
else
  bad "(d3) findingRouterProvenance unit contract failed — see /tmp/outside-call-guard-d3.log"
fi
C6="0c900000-0000-4000-8000-00000000c006"; C7="0c900000-0000-4000-8000-00000000c007"
OWNER_D=""
[ -n "${FR_LOGIN_EMAIL:-}" ] && OWNER_D=$(docker exec -i "$DB" psql -U postgres -At -c "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1" 2>/dev/null)
SRK_D="${SERVICE_ROLE_KEY:-}"
[ -n "$SRK_D" ] || SRK_D=$(npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
if [ -z "$OWNER_D" ] || [ -z "$SRK_D" ]; then
  bad "(d1/d2) FR_LOGIN_EMAIL or SERVICE_ROLE_KEY unavailable — source backups/fr-login.env; the served-worker half did not run"
else
  dq() { docker exec -i "$DB" psql -U postgres -At -v ON_ERROR_STOP=1 -c "$1" 2>&1; }
  # fixed ids, idempotent, born held (E2). suffix a01 = upload signal, b01 = public signal,
  # f01 = frontier with no ledger (c006 only), f02 = observation on the upload (c006) / on the public signal (c007)
  out=$(dq "insert into public.companies (id, name, created_by, fixture_hold) values
              ('$C6','ocg-throwaway-finding-private','$OWNER_D','OCG:test_fixture'),
              ('$C7','ocg-throwaway-finding-public','$OWNER_D','OCG:test_fixture')
              on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'OCG:test_fixture');
            insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, relevance_state, source_url)
              values ('0c900000-0000-4000-8000-00000c006a01','$C6','uploaded_file','outside','outside_voice_about_client','Synthetic fixture: deliveries slip in the second quarter','Synthetic fixture: deliveries slip in the second quarter','reliability','active',null),
                     ('0c900000-0000-4000-8000-00000c007b01','$C7','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: reviewers praise the fast turnaround','Synthetic fixture: reviewers praise the fast turnaround','reliability','active','https://reviews.example.org/b')
              on conflict (id) do nothing;
            insert into public.findings (id, company_id, kind, body, status, register, origin_signal_id, beats)
              values ('0c900000-0000-4000-8000-00000c006f01','$C6','frontier','Synthetic fixture: you are betting that second-quarter deliveries recover','open','public_inferred',null,null),
                     ('0c900000-0000-4000-8000-00000c006f02','$C6','observation','Synthetic fixture: deliveries slip in the second quarter','open','public_inferred','0c900000-0000-4000-8000-00000c006a01',null),
                     ('0c900000-0000-4000-8000-00000c007f02','$C7','observation','Synthetic fixture: reviewers praise the fast turnaround','open','public_inferred','0c900000-0000-4000-8000-00000c007b01',null)
              on conflict (id) do nothing;
            insert into public.finding_recurrence (finding_id, company_id, cluster_signal_ids, distinct_host_count, host_list, verdict_count)
              select x.f::uuid, x.c::uuid, '[]'::jsonb, 2, '[]'::jsonb, 1 from (values
                ('0c900000-0000-4000-8000-00000c006f01','$C6'),('0c900000-0000-4000-8000-00000c006f02','$C6'),('0c900000-0000-4000-8000-00000c007f02','$C7')) x(f,c)
              where not exists (select 1 from public.finding_recurrence r where r.finding_id=x.f::uuid);
            update public.findings set beats = null where id in ('0c900000-0000-4000-8000-00000c006f01','0c900000-0000-4000-8000-00000c006f02','0c900000-0000-4000-8000-00000c007f02');
            delete from public.model_calls where company_id in ('$C6','$C7');") || bad "(d1/d2) fixture SQL failed: $(echo "$out" | head -2 | tr '\n' ' ')"
  # non-vacuity of the fixture itself: both c006 findings are stored public_inferred, one ledger-less frontier, one on an upload
  SHAPE_D=$(dq "select count(*) from public.findings f left join public.signals s on s.id=f.origin_signal_id
                where f.company_id='$C6' and f.register='public_inferred' and f.status='open' and f.beats is null
                  and ((f.kind='frontier' and f.origin_signal_id is null) or (s.source_type='uploaded_file'))")
  [ "$SHAPE_D" = "2" ] || bad "(d1) the c006 fixture findings do not have the leak shape (got '$SHAPE_D') — (d1) would be vacuous"
  HOLDS_D=$(dq "select count(*) from public.companies where id in ('$C6','$C7') and fixture_hold is not null")
  [ "$HOLDS_D" = "2" ] || bad "(d1/d2) a fixture company is not held (held=$HOLDS_D)"
  dcall() { curl -s -m 400 -X POST "${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}/$1" -H "Authorization: Bearer $SRK_D" -H "Content-Type: application/json" -d "$2"; }
  dpick() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const f=new Function("j","return ("+process.argv[1]+")");process.stdout.write(String(f(j)))}catch(e){process.stdout.write("ERR")}})' "$1"; }

  # (d1) the two private findings: beats routed local, never outside
  B6=$(dcall generate-finding-beats "{\"company_id\":\"$C6\"}")
  G6=$(echo "$B6" | dpick 'j.generated+"|"+j.failed')
  O6=$(dq "select count(*) from public.model_calls where company_id='$C6' and provider in ('openai','anthropic') and coalesce(prompt_tokens,0) > 0")
  L6=$(dq "select count(*) from public.model_calls where company_id='$C6' and call_site='finding-beats' and provider='local_ollama'")
  [ "$O6" = "0" ] && ok "(d1) 0 outside model_calls rows carrying tokens for c006 (beats: generated|failed = $G6)" \
                  || bad "(d1) $O6 outside model_calls row(s) carrying tokens for c006 — a finding not public by source left the building"
  [ "${L6:-0}" -ge 2 ] && ok "(d1) and both private findings were routed LOCAL ($L6 local finding-beats rows — the run did happen)" \
                       || bad "(d1) expected 2 local finding-beats rows for c006, saw '$L6' — $(echo "$B6" | head -c 160)"
  P6=$(dcall generate-public-read "{\"company_id\":\"$C6\",\"plan\":true}")
  D6=$(echo "$P6" | dpick '(((j.selection&&j.selection.dropped_by_kind&&j.selection.dropped_by_kind.finding)||[]).filter(d=>d.reason==="finding_not_public_by_source").map(d=>d.id).sort().join(","))+"|"+((j.input_ledger&&j.input_ledger.ids)||[]).filter(i=>String(i).startsWith("0c900000-0000-4000-8000-00000c006f")).length')
  [ "$D6" = "0c900000-0000-4000-8000-00000c006f01,0c900000-0000-4000-8000-00000c006f02|0" ] \
    && ok "(d1) the public-read pool drops both with reason finding_not_public_by_source (plan mode, read-only)" \
    || bad "(d1) the public-read pool did not drop the private findings by source: '$D6' — $(echo "$P6" | head -c 160)"

  # (d2) the public control: still reaches the outside model, and the pool keeps it
  B7=$(dcall generate-finding-beats "{\"company_id\":\"$C7\"}")
  O7=$(dq "select count(*) from public.model_calls where company_id='$C7' and provider='openai' and call_site='finding-beats' and coalesce(prompt_tokens,0) > 0")
  [ "${O7:-0}" -ge 1 ] && ok "(d2) the public control still reaches the outside model ($O7 ledgered OpenAI finding-beats row(s) with tokens)" \
                       || bad "(d2) the public control did not reach the outside model (rows=$O7) — the guard would be vacuous — $(echo "$B7" | head -c 160)"
  P7=$(dcall generate-public-read "{\"company_id\":\"$C7\",\"plan\":true}")
  D7=$(echo "$P7" | dpick '((j.selection&&j.selection.dropped_by_kind&&j.selection.dropped_by_kind.finding)||[]).some(d=>d.reason==="finding_not_public_by_source")+"|"+((j.input_ledger&&j.input_ledger.ids)||[]).includes("0c900000-0000-4000-8000-00000c007f02")')
  [ "$D7" = "false|true" ] && ok "(d2) and the pool keeps the public finding" \
                           || bad "(d2) the public finding was not kept by the pool ('$D7') — over-correction"
fi

# ── (d4) (d5) F1: the recurrence finding-join and open-question finding anchors, live ────────────────
echo "── (d4/d5) F1: the recurrence join judge and open-question anchors route a finding by its sources ──"
if [ -z "${OWNER_D:-}" ] || [ -z "${SRK_D:-}" ]; then
  bad "(d4/d5) FR_LOGIN_EMAIL or SERVICE_ROLE_KEY unavailable — the served-worker half did not run"
else
  # Fixed ids, idempotent, on the same held throwaways. b02/b03 = two public signals on DIFFERENT domains with
  # a banked ACCEPTED pair verdict (identities computed exactly as signalRecurrence does: sha256 over
  # normalizeForHash — lower-case, whitespace-collapsed, trimmed). 901..905 = five UNRELATED public padding
  # signals per company: the join's DISTINCTIVE floor excludes tokens in ≥40% of eligible signals, so without
  # them every shared token is generic and no finding would ever reach the judge. Each company gets ONE fixture run row the
  # findings point at (origin_run_id), so they anchor open questions. Beats are reset to NULL so the join
  # statement is the finding body (findingStatement = beats.observe ?? body), keeping the token overlap fixed.
  out=$(dq "insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, relevance_state, source_url, evidence_class)
              values ('0c900000-0000-4000-8000-00000c006b02','$C6','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: second quarter deliveries slip at the depot','Synthetic fixture: second quarter deliveries slip at the depot','reliability','active','https://news.example.net/q2','prose'),
                     ('0c900000-0000-4000-8000-00000c006b03','$C6','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: buyers say deliveries slip in the second quarter','Synthetic fixture: buyers say deliveries slip in the second quarter','reliability','active','https://trade.example.com/q2','prose'),
                     ('0c900000-0000-4000-8000-00000c007b02','$C7','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: reviewers praise the turnaround speed','Synthetic fixture: reviewers praise the turnaround speed','reliability','active','https://news.example.net/fast','prose'),
                     ('0c900000-0000-4000-8000-00000c007b03','$C7','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: customers praise how fast the turnaround is','Synthetic fixture: customers praise how fast the turnaround is','reliability','active','https://trade.example.com/fast','prose')
              on conflict (id) do nothing;
            insert into public.signals (id, company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, relevance_state, source_url, evidence_class)
              values ('0c900000-0000-4000-8000-00000c006901','$C6','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: the lobby has bright murals','Synthetic fixture: the lobby has bright murals','venue','active','https://pad1.example.org/006','prose'),
                     ('0c900000-0000-4000-8000-00000c006902','$C6','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: parking is free after six','Synthetic fixture: parking is free after six','venue','active','https://pad2.example.org/006','prose'),
                     ('0c900000-0000-4000-8000-00000c006903','$C6','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: staff wear green aprons','Synthetic fixture: staff wear green aprons','venue','active','https://pad3.example.org/006','prose'),
                     ('0c900000-0000-4000-8000-00000c006904','$C6','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: the website lists holiday hours','Synthetic fixture: the website lists holiday hours','venue','active','https://pad4.example.org/006','prose'),
                     ('0c900000-0000-4000-8000-00000c006905','$C6','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: the menu changes every spring','Synthetic fixture: the menu changes every spring','venue','active','https://pad5.example.org/006','prose'),
                     ('0c900000-0000-4000-8000-00000c007901','$C7','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: the lobby has bright murals','Synthetic fixture: the lobby has bright murals','venue','active','https://pad1.example.org/007','prose'),
                     ('0c900000-0000-4000-8000-00000c007902','$C7','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: parking is free after six','Synthetic fixture: parking is free after six','venue','active','https://pad2.example.org/007','prose'),
                     ('0c900000-0000-4000-8000-00000c007903','$C7','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: staff wear green aprons','Synthetic fixture: staff wear green aprons','venue','active','https://pad3.example.org/007','prose'),
                     ('0c900000-0000-4000-8000-00000c007904','$C7','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: the website lists holiday hours','Synthetic fixture: the website lists holiday hours','venue','active','https://pad4.example.org/007','prose'),
                     ('0c900000-0000-4000-8000-00000c007905','$C7','public_baseline_run','outside','outside_voice_about_client','Synthetic fixture: the menu changes every spring','Synthetic fixture: the menu changes every spring','venue','active','https://pad5.example.org/007','prose')
              on conflict (id) do nothing;
            insert into public.signal_recurrence_verdicts (company_id, pair_identity, signal_a_id, signal_b_id, statement_a_identity, statement_b_identity, verdict, judge_model, judge_reason, candidate_basis, model_provider, model_name)
              select x.c::uuid,
                     encode(sha256(convert_to('recur|' || least(x.na, x.nb) || '|' || greatest(x.na, x.nb), 'UTF8')), 'hex'),
                     x.a::uuid, x.b::uuid,
                     encode(sha256(convert_to(x.na, 'UTF8')), 'hex'), encode(sha256(convert_to(x.nb, 'UTF8')), 'hex'),
                     'accepted', 'ocg-fixture', 'OCG fixture: banked accepted pair', 'shared_tokens:fixture', 'ocg_fixture', 'ocg-fixture'
              from (select c, a, b, lower(trim(regexp_replace(ta, '\s+', ' ', 'g'))) na, lower(trim(regexp_replace(tb, '\s+', ' ', 'g'))) nb from (values
                ('$C6','0c900000-0000-4000-8000-00000c006b02','0c900000-0000-4000-8000-00000c006b03','Synthetic fixture: second quarter deliveries slip at the depot','Synthetic fixture: buyers say deliveries slip in the second quarter'),
                ('$C7','0c900000-0000-4000-8000-00000c007b02','0c900000-0000-4000-8000-00000c007b03','Synthetic fixture: reviewers praise the turnaround speed','Synthetic fixture: customers praise how fast the turnaround is')) v(c,a,b,ta,tb)) x
              where not exists (select 1 from public.signal_recurrence_verdicts r where r.company_id=x.c::uuid and r.signal_a_id=x.a::uuid and r.signal_b_id=x.b::uuid);
            insert into public.public_baseline_runs (company_id, company_name, website)
              select x.c::uuid, x.n, '' from (values ('$C6','ocg-throwaway-finding-private'),('$C7','ocg-throwaway-finding-public')) x(c,n)
              where not exists (select 1 from public.public_baseline_runs r where r.company_id=x.c::uuid);
            update public.findings f set origin_run_id = (select min(id) from public.public_baseline_runs r where r.company_id=f.company_id), beats = null
              where f.id in ('0c900000-0000-4000-8000-00000c006f01','0c900000-0000-4000-8000-00000c006f02','0c900000-0000-4000-8000-00000c007f02');") \
    || bad "(d4/d5) fixture SQL failed: $(echo "$out" | head -2 | tr '\n' ' ')"
  RUNS_D=$(dq "select count(distinct f.origin_run_id) from public.findings f where f.company_id in ('$C6','$C7') and f.origin_run_id is not null")
  [ "$RUNS_D" = "2" ] || bad "(d4/d5) the fixture findings do not point at their fixture runs (runs=$RUNS_D) — (d5) would be vacuous"

  # (d4) the recurrence finding-join judge — c006 private findings: local; c007 public control: outside
  R6=$(dcall generate-signal-recurrence "{\"company_id\":\"$C6\",\"write\":false}")
  J6=$(echo "$R6" | dpick 'j.totals ? j.totals.finding_judge_calls+"|"+j.totals.clusters : "none"')
  O6R=$(dq "select count(*) from public.model_calls where company_id='$C6' and call_site='generate-signal-recurrence' and provider in ('openai','anthropic') and coalesce(prompt_tokens,0) > 0")
  case "$J6" in
    none|0\|*|1\|*) bad "(d4) the c006 recurrence run did not reach the finding-join judge for both findings (calls|clusters=$J6) — $(echo "$R6" | head -c 160)" ;;
    *) ok "(d4) the recurrence finding-join judge ran on c006 (calls|clusters = $J6)" ;;
  esac
  [ "$O6R" = "0" ] && ok "(d4) and 0 outside model_calls rows carrying tokens for c006's recurrence run — both joins routed LOCAL" \
                   || bad "(d4) $O6R outside recurrence row(s) carrying tokens for c006 — a finding not public by source reached the outside judge"
  R7=$(dcall generate-signal-recurrence "{\"company_id\":\"$C7\",\"write\":false}")
  J7=$(echo "$R7" | dpick 'j.totals ? String(j.totals.finding_judge_calls) : "none"')
  O7R=$(dq "select count(*) from public.model_calls where company_id='$C7' and call_site='generate-signal-recurrence' and provider='openai' and coalesce(prompt_tokens,0) > 0")
  if [ "${J7:-0}" != "none" ] && [ "${J7:-0}" -ge 1 ] 2>/dev/null && [ "${O7R:-0}" -ge 1 ]; then
    ok "(d4) control: the c007 public finding still reaches the outside join judge (calls=$J7, $O7R OpenAI row(s) with tokens)"
  else
    bad "(d4) control: the c007 public finding did not reach the outside join judge (calls=$J7, rows=$O7R) — vacuous — $(echo "$R7" | head -c 160)"
  fi

  # (d5) open-question finding anchors — plan (zero model, zero writes) for the identities, then ONE scoped chunk
  for spec in "$C6|6" "$C7|7"; do
    cid="${spec%%|*}"; n="${spec#*|}"
    PL=$(dcall generate-open-questions "{\"company_id\":\"$cid\",\"plan\":true}")
    IDS=$(echo "$PL" | dpick 'JSON.stringify((j.anchors||[]).filter(a=>a.kind==="finding").map(a=>a.identity))')
    NA=$(echo "$PL" | dpick 'String((j.anchors||[]).filter(a=>a.kind==="finding").length)')
    CH=$(dcall generate-open-questions "{\"company_id\":\"$cid\",\"write\":false,\"anchor_identities\":$IDS}")
    PR=$(echo "$CH" | dpick 'j.totals ? j.totals.anchors_processed+"|"+((j.perAnchor||[]).filter(a=>a.error).length)+"|"+(j.cost?j.cost.prompt_tokens:"?") : "none"')
    eval "NA$n=\"\$NA\"; PR$n=\"\$PR\"; CH$n=\"\$CH\""
  done
  O6Q=$(dq "select count(*) from public.model_calls where company_id='$C6' and call_site='generate-open-questions' and provider in ('openai','anthropic') and coalesce(prompt_tokens,0) > 0")
  O7Q=$(dq "select count(*) from public.model_calls where company_id='$C7' and call_site='generate-open-questions' and provider='openai' and coalesce(prompt_tokens,0) > 0")
  [ "$NA6" = "2" ] && [ "$PR6" = "2|0|0" ] && [ "$O6Q" = "0" ] \
    && ok "(d5) both c006 finding anchors were processed LOCAL (anchors=$NA6, processed|errors|outside_tokens = $PR6; 0 outside rows with tokens)" \
    || bad "(d5) c006 finding anchors: anchors=$NA6, processed|errors|outside_tokens=$PR6, outside rows=$O6Q — $(echo "$CH6" | head -c 160)"
  case "$PR7" in
    1\|0\|0|none|*\|*\|\?) bad "(d5) control: the c007 public finding anchor did not reach the outside model ($PR7, rows=$O7Q) — vacuous — $(echo "$CH7" | head -c 160)" ;;
    *) [ "${O7Q:-0}" -ge 1 ] && ok "(d5) control: the c007 public finding anchor still reaches the outside model ($PR7; $O7Q OpenAI row(s) with tokens)" \
                             || bad "(d5) control: no OpenAI open-questions row with tokens for c007 ($PR7)" ;;
  esac
fi

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
