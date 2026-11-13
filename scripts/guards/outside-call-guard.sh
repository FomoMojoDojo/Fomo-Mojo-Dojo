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
grep -q 'signalProvenance(s.signal_band, s.voice_class)' supabase/functions/assess-surface-drift/index.ts \
  && ok "(a3) assess-surface-drift routes on every signal's provenance" \
  || bad "(a3) assess-surface-drift no longer routes on signal provenance"
grep -q "drift_state: \"withheld\"" supabase/functions/assess-surface-drift/index.ts \
  && ok "(a3) assess-surface-drift withholds rather than guessing a verdict" \
  || bad "(a3) assess-surface-drift has no withheld path"
for p in propose-route-changes propose-opportunity-changes; do
  grep -q 'isPublicProvenance(signalProvenance' "supabase/functions/$p/index.ts" \
    && ok "(a3) $p filters the evidence block by provenance" \
    || bad "(a3) $p sends its evidence block ungated"
done
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
  CO=$(psqlq "select company_id::text from public.signals
              where source_type in ('uploaded_file','file','intake')
                and not (signal_band='outside' and voice_class in
                      ('outside_voice_about_client','client_voice','market_context','competitor_voice'))
              group by company_id order by count(*) desc limit 1")
  if [ -z "$CO" ]; then
    ok "(b1) no company holds a non-public upload-derived signal — vacuous, nothing to contain"
  else
    NONPUB=$(psqlq "select count(*) from public.signals
                    where company_id='$CO' and relevance_state='active'
                      and not (signal_band='outside' and voice_class in
                            ('outside_voice_about_client','client_voice','market_context','competitor_voice'))")
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
                 src/lib/modelRouter/resolveModelHardening.test.ts >/tmp/outside-call-guard-vitest.log 2>&1; then
  ok "(b2/b4) router admits the external lane for all-public inputs; withheld renders correctly"
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
  for c in "$PRIV" "$PUB"; do
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
    for c in "$PRIV|private-evidence" "$PUB|public-only"; do
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

    CASC_PRIV=$(psqlq "select id::text from public.strategy_cascades where company_id='$PRIV' limit 1")
    CASC_PUB=$(psqlq "select id::text from public.strategy_cascades where company_id='$PUB' limit 1")
    ROUTE_PRIV=$(psqlq "select id::text from public.routes where company_id='$PRIV' limit 1")
    ROUTE_PUB=$(psqlq "select id::text from public.routes where company_id='$PUB' limit 1")

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

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
