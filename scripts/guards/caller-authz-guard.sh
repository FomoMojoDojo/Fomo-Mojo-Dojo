#!/usr/bin/env bash
# ── CALLER AUTHZ GUARD — SP-141, SP-150..SP-154, SP-160, SP-164 (signed 2026-11-12, slice A) ──────
#
# WHY THIS GUARD EXISTS. The census of 2026-11-12 (authz-census.md Part 2) measured all 93 edge
# functions: 72 had NO caller check of any kind, 14 authenticated without authorising, and the
# publishable anon key — a key shipped in the frontend bundle to every visitor — returned 200 and the
# full company list from `public-companies` both on localhost and over the tailnet at :8443. The
# gateway's verify_jwt is satisfied by that key, so it was never a caller check. SP-141 is the law
# this guard enforces: every edge function decides WHO IS CALLING inside the function, before it
# reads or writes any row. A route wrapper and a client-side capability check are conveniences.
#
# SLICE A gates 32 functions. Slices B and C are DEFERRED, not cancelled (SP-163), so this guard
# ships with a NAMED not-yet-gated list (SP-164) and does NOT fail because that list is non-empty.
# It fails if a function is on NEITHER the gated set nor that list — so a new function cannot be
# added without a caller check — or if a gated function stops refusing the anon key.
#
# Checks:
#   (a)  CENSUS. Every function directory either IMPORTS the shared caller check AND CALLS it, or is
#        named on the not-yet-gated list with its group. A function on neither fails. The call is
#        checked, not just the import: a plant that deleted the call and left the import green-lit
#        (a) while the anon key received 200 and the full company list.
#   (f)  The not-yet-gated list's count is printed on every run (SP-164). Non-empty is not a failure
#        in slice A; a function missing from both sets is.
#   (b)  THE ANON KEY IS REFUSED. Every GATED function, probed with the publishable anon key and an
#        empty body, answers 401 `no_user`. This is the check the census failure would have caught.
#   (c)  A SIGNED-IN ACCOUNT WITH NO COMPANY is refused 403 `not_authorised` by every ADMIN-ONLY
#        gated function — authentication is not authorisation.
#   (d)  THE TWO CAPABILITY FUNCTIONS (SP-154). A member of company A acting on company B is refused
#        403 and writes nothing on B; an ADMIN reaches the handler. (d4) pins the filed SP-F31 gap.
#   (e)  THE INTERNAL DOORS STILL OPEN (SP-151). A bare service-role bearer reaches the handler of a
#        gated function and of assess-surface-drift, whose DB caller `trigger_scheduled_drift_scan`
#        sends exactly that. A door that closed would strand cron and every operator script.
#   (g)  PLANT: `PLANT=ungated` is set by the operator after removing a gate from one function; (a)
#        and (b) must then go RED on the restarted worker.
#
# Probes send EMPTY bodies and name held throwaway companies only (the two OCG ids, born held, E2
# teardown — the company is never deleted). No real company is read or written. A refused probe never
# reaches a model, so this guard spends nothing.
#
# Read the printed verdict, not only the exit code — this guard sets both (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."

PLANT="${PLANT:-}"
fails=0
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; fails=$((fails+1)); }
note() { echo "  note $*"; }

DB="${SUPABASE_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
psqlq() { docker exec -i "$DB" psql -U postgres -At -c "$1" 2>/dev/null; }
FUNCTIONS_URL="${FUNCTIONS_URL:-http://127.0.0.1:54321/functions/v1}"
AUTH_URL="${AUTH_URL:-http://127.0.0.1:54321/auth/v1}"

PRIV="0c900000-0000-4000-8000-00000000c001"
PUB="0c900000-0000-4000-8000-00000000c002"

# ── the GATED set (slice A) ───────────────────────────────────────────────────────────────────────
# The two capability functions (SP-154): admin, OR a member of that company holding the capability
# capabilities.ts already defines. Everything else here is admin only (plus a trusted internal
# caller, SP-151).
CAPABILITY_FNS="propose-route-changes propose-opportunity-changes"
ADMIN_ONLY_FNS="propose-cascade-changes propose-positioning-changes
evaluate-route-alignment evaluate-opportunity-alignment evaluate-positioning-alignment
assess-surface-drift backfill-canonical-statements refresh-cascade refresh-positioning
research-company check-file-analysis classify-operating-status crawl-outside-pages
extract-client-voice extract-outside-listing generate-declared-markets
generate-first-read-stated-problem generate-market-options generate-normative-consistency
generate-read-slots generate-reference-jobmap local-strategy-synthesis public-companies
recapture-findings recompute-validation-state record-check-outcome record-interview-correction
restamp-aggregator-self-voice retype-own-words supersede-old-client-voice"
# The lists above are written multi-line for legibility; collapse them to a single space-separated
# line, because the `case " $GATED_FNS " in *" $f "*)` membership test below matches on SPACES and a
# newline separator makes every function at a line boundary read as "not in the set".
ADMIN_ONLY_FNS=$(echo $ADMIN_ONLY_FNS)
GATED_FNS=$(echo $CAPABILITY_FNS $ADMIN_ONLY_FNS)

# ── the NOT-YET-GATED list (SP-164) ───────────────────────────────────────────────────────────────
# Every function slices B and C would have covered, by name, each with its group from
# authz-census.md Part 2. SP-163 defers those slices; SP-148 and SP-121 make this list a hard
# blocker before any account outside FMD exists and before the gateway is exposed beyond the tailnet.
# A function here has NO caller check, or authenticates without authorising. Moving one off this list
# means gating it.
not_yet_gated() {
  case "$1" in
    # GROUP 2 — internal-only (slice B): reached by another function or a cron row on the service-role key
    extract-own-words|first-read-fill|generate-claim-deltas|generate-finding-beats|\
    market-discovery-step|open-questions-step|recurrence-step|refresh-relevance-step)
      echo "group 2 — internal-only, slice B" ;;
    # GROUP 3 — script / guard / function-invoked (slice B)
    backstop-delta-relevance|detect-status-conflict|extract-outside-evidence|gateway-resume-step|\
    generate-conflict-explanation|generate-market-discovery|generate-public-read|outside-score|\
    rebuild-claims|remint-upload-provenance|retire-proposals|rf-channels-apply|verify-excerpts)
      echo "group 3 — script/guard-invoked, slice B" ;;
    # GROUP 1 — UI-invoked (slice C)
    analyze-file|analyze-social-signal|check-mojo-analysis|classify-upload-voice|\
    compute-featured-defaults|dify-analyze-file|feed-first-read-corrections|\
    generate-first-read-proposal|generate-leg-tests|generate-market-hypothesis|\
    generate-open-questions|generate-route-conditions|generate-route-legs|\
    generate-signal-recurrence|generate-step-conditions|generate-step-opportunities|\
    local-alignment|local-jobmap-synthesis|record-interview-finding|refresh-deltas-step|\
    refresh-mojo-score|run-mojo-analysis)
      echo "group 1 — UI-invoked, slice C" ;;
    # CLASS B — authenticates but authorises nothing (slice C)
    competitor-discovery|generate-normative-jobmap|public-baseline|reconcile-cascade|\
    reconcile-market-definition|record-interview-upload|retain-quote-supply|run-agent-flow|\
    run-framework-diagnosis|run-public-research|seed-inputs)
      echo "class B — authenticated, unauthorised, slice C" ;;
    *) echo "" ;;
  esac
}

# ── ALREADY AUTHORISED before slice A ─────────────────────────────────────────────────────────────
# These 7 carry their own in-function check and are neither gated by slice A nor deferred. They are
# named here with the mechanism so they are accounted for without inflating the not-yet-gated count.
already_authorised() {
  case "$1" in
    council-review)            echo "admin-only in-function (SP-106)" ;;
    import-intake-submissions) echo "admin-only in-function" ;;
    infer-interview-market)    echo "admin-only in-function" ;;
    interview-parser)          echo "admin-only in-function, plus the internal door" ;;
    maps)                      echo "admin-only in-function" ;;
    generate-deep-dive)        echo "membership-scoped via an RLS read on the user's own client" ;;
    publish-release-note)      echo "the x-publish-secret shared secret, fail-closed" ;;
    *) echo "" ;;
  esac
}

is_gated_fn() { case " $GATED_FNS " in *" $1 "*) return 0 ;; *) return 1 ;; esac; }

# ── (a) + (f) CENSUS ─────────────────────────────────────────────────────────────────────────────
echo "── (a) census: every function imports the shared caller check, or is named not-yet-gated ──"
if [ "$PLANT" = "ungated" ]; then echo "  (PLANT=ungated: (a) and (b) are expected RED)"; fi
ALL_FNS=$(ls -1 supabase/functions | grep -v '^_shared$' | sort)
[ -n "$ALL_FNS" ] || bad "(a) found no function directories — the listing is broken, not the code"
deferred=0; gated_seen=0; already=0; unaccounted=0
for f in $ALL_FNS; do
  d="supabase/functions/$f"
  # BOTH the import AND a real call. Checking the import alone is not enough: a plant on 2026-11-12
  # removed the `await adminOnlyGate(...)` line and left the import in place, and (a) stayed green
  # while the anon key got 200 and the whole company list back. The census asks for the call.
  imports=0
  if grep -rq '_shared/callerGate.ts\|_shared/callerAuthz.ts' "$d" --include="*.ts" 2>/dev/null \
     && grep -rqE 'await (adminOnlyGate|identifyCaller)\(' "$d" --include="*.ts" 2>/dev/null; then
    imports=1
  fi
  reason="$(not_yet_gated "$f")"
  own="$(already_authorised "$f")"
  if is_gated_fn "$f"; then
    gated_seen=$((gated_seen+1))
    if [ "$imports" = 1 ]; then ok "(a) $f — gated"
    else bad "(a) $f is in the GATED set but imports no caller check"; fi
  elif [ -n "$own" ]; then
    already=$((already+1))
    ok "(a) $f — already authorised: $own"
  elif [ -n "$reason" ]; then
    deferred=$((deferred+1))
    if [ "$imports" = 1 ]; then
      note "(a) $f is on the not-yet-gated list but DOES import the caller check — move it to the gated set"
    fi
  else
    unaccounted=$((unaccounted+1))
    bad "(a) $f is on NEITHER the gated set NOR the not-yet-gated list — a new function needs a caller check or a named deferral"
  fi
done
echo "── (f) not-yet-gated list (SP-164) ──"
echo "  gated: $gated_seen   already authorised: $already   not-yet-gated: $deferred   unaccounted: $unaccounted"
TOTAL=$((gated_seen + already + deferred + unaccounted))
[ "$TOTAL" = 93 ] && ok "(f) every one of the $TOTAL function directories is classified" \
  || bad "(f) classified $TOTAL function(s), expected 93"
[ "$deferred" = 54 ] && ok "(f) the not-yet-gated list is the expected 54 (slices B and C)" \
  || bad "(f) the not-yet-gated list is $deferred, expected 54 — update the list and CLAUDE.md together"
[ "$gated_seen" = 32 ] && ok "(f) all 32 slice-A functions accounted for" \
  || bad "(f) expected 32 gated functions, counted $gated_seen"
[ "$unaccounted" = 0 ] && ok "(f) every function is on exactly one of the two sets" \
  || bad "(f) $unaccounted function(s) on neither set"
note "(f) slices B and C are DEFERRED (SP-163): $deferred function(s) still carry no caller check."
note "(f) That list is a hard blocker before any account outside FMD (SP-121) and before the gateway"
note "(f) is exposed beyond the tailnet (SP-148). See authz-census.md Part 2."

# ── keys ─────────────────────────────────────────────────────────────────────────────────────────
SRK="${SERVICE_ROLE_KEY:-}"
[ -n "$SRK" ] || SRK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
ANONK="${ANON_KEY:-}"
[ -n "$ANONK" ] || ANONK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')

# status + body of one POST
probe() {  # probe <fn> <bearer> <body>
  curl -s -m 45 -o /tmp/caller-authz-body -w '%{http_code}' -X POST "$FUNCTIONS_URL/$1" \
    -H "apikey: $ANONK" -H "Authorization: Bearer $2" -H 'Content-Type: application/json' \
    -d "$3" 2>/dev/null
}
body() { head -c 400 /tmp/caller-authz-body 2>/dev/null; }

if [ -z "$SRK" ] || [ -z "$ANONK" ]; then
  bad "(b/c/d/e) could not resolve SERVICE_ROLE_KEY / ANON_KEY — the served-worker half did not run"
elif ! psqlq "select 1" >/dev/null 2>&1; then
  bad "(b/c/d/e) cannot reach the local database ($DB) — the served-worker half did not run"
else

# ── (b) the anon key is refused by every gated function ──────────────────────────────────────────
echo "── (b) every GATED function answers the anon key 401 no_user ──"
# restamp-aggregator-self-voice is NEVER probed with {}: an empty body is a valid ALL-COMPANIES dry
# run that loads every unfrozen company's outside-voice rows and runs the local authorship judge on
# each (CLAUDE.md, 2026-09-21). The gate refuses before the body is read, so the body is irrelevant
# while the gate holds — but under PLANT=ungated it would really run, so this one names a throwaway.
for f in $GATED_FNS; do
  case "$f" in
    restamp-aggregator-self-voice) pb="{\"company_id\":\"$PRIV\",\"dry_run\":true}" ;;
    *) pb='{}' ;;
  esac
  st=$(probe "$f" "$ANONK" "$pb")
  if [ "$st" = "401" ] && grep -q '"no_user"' /tmp/caller-authz-body 2>/dev/null; then
    ok "(b) $f — 401 no_user"
  else
    bad "(b) $f answered $st to the publishable anon key (expected 401 no_user): $(body)"
  fi
done

# ── (c) a signed-in account with NO company is refused by every admin-only function ──────────────
echo "── (c) a signed-in no-company account gets 403 not_authorised from every ADMIN-ONLY function ──"
JWT_NOCO=""
if [ -n "${NONADMIN_EMAIL:-}" ] && [ -n "${NONADMIN_PASSWORD:-}" ]; then
  JWT_NOCO=$(curl -s -m 30 -X POST "$AUTH_URL/token?grant_type=password" \
    -H "apikey: $ANONK" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$NONADMIN_EMAIL\",\"password\":\"$NONADMIN_PASSWORD\"}" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch(e){process.stdout.write("")}})')
fi
if [ -z "$JWT_NOCO" ]; then
  bad "(c) NONADMIN_EMAIL/NONADMIN_PASSWORD not set or login failed — source backups/fr-nonadmin.env; (c) did not run"
else
  for f in $ADMIN_ONLY_FNS; do
    case "$f" in
      restamp-aggregator-self-voice) pb="{\"company_id\":\"$PRIV\",\"dry_run\":true}" ;;
      *) pb='{}' ;;
    esac
    st=$(probe "$f" "$JWT_NOCO" "$pb")
    if [ "$st" = "403" ] && grep -q '"not_authorised"' /tmp/caller-authz-body 2>/dev/null; then
      ok "(c) $f — 403 not_authorised"
    else
      bad "(c) $f answered $st to a signed-in non-admin (expected 403 not_authorised): $(body)"
    fi
  done
fi

# ── (d) the two capability functions ─────────────────────────────────────────────────────────────
echo "── (d) the two capability functions (SP-154) ──"
JWT_MEM=""
if [ -n "${MEMBER_EMAIL:-}" ] && [ -n "${MEMBER_PASSWORD:-}" ]; then
  JWT_MEM=$(curl -s -m 30 -X POST "$AUTH_URL/token?grant_type=password" \
    -H "apikey: $ANONK" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$MEMBER_EMAIL\",\"password\":\"$MEMBER_PASSWORD\"}" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch(e){process.stdout.write("")}})')
fi
JWT_ADMIN=""
if [ -n "${FR_LOGIN_EMAIL:-}" ] && [ -n "${FR_LOGIN_PASSWORD:-}" ]; then
  JWT_ADMIN=$(curl -s -m 30 -X POST "$AUTH_URL/token?grant_type=password" \
    -H "apikey: $ANONK" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$FR_LOGIN_EMAIL\",\"password\":\"$FR_LOGIN_PASSWORD\"}" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).access_token||"")}catch(e){process.stdout.write("")}})')
fi

# (d1) a member of company A (MEMBER_COMPANY_ID) acting on company B (the held throwaway) -> 403
if [ -z "$JWT_MEM" ]; then
  bad "(d1) MEMBER_EMAIL/MEMBER_PASSWORD not set or login failed — source backups/fr-member.env; (d1) did not run"
else
  BEFORE=$(psqlq "select count(*) from public.surface_proposals where company_id='$PRIV'")
  st=$(probe propose-route-changes "$JWT_MEM" "{\"route_id\":\"00000000-0000-4000-8000-000000000001\",\"company_id\":\"$PRIV\"}")
  if [ "$st" = "403" ] && grep -q '"not_authorised"' /tmp/caller-authz-body 2>/dev/null; then
    ok "(d1) a member of another company is refused 403 not_authorised on this one"
  else
    bad "(d1) propose-route-changes answered $st to a member of a different company: $(body)"
  fi
  st2=$(probe propose-opportunity-changes "$JWT_MEM" "{\"opportunity_id\":\"00000000-0000-4000-8000-000000000001\",\"company_id\":\"$PRIV\"}")
  if [ "$st2" = "403" ] && grep -q '"not_authorised"' /tmp/caller-authz-body 2>/dev/null; then
    ok "(d1) propose-opportunity-changes likewise"
  else
    bad "(d1) propose-opportunity-changes answered $st2 to a member of a different company: $(body)"
  fi
  AFTER=$(psqlq "select count(*) from public.surface_proposals where company_id='$PRIV'")
  [ "${BEFORE:-0}" = "${AFTER:-1}" ] \
    && ok "(d2) and nothing was written on that company (surface_proposals ${BEFORE:-0} -> ${AFTER:-0})" \
    || bad "(d2) surface_proposals changed on the refused company: ${BEFORE:-?} -> ${AFTER:-?}"

  # (d3) NO EXISTENCE ORACLE (SP-144): a company that does not exist refuses identically
  st3=$(probe propose-route-changes "$JWT_MEM" '{"route_id":"00000000-0000-4000-8000-000000000001","company_id":"99999999-9999-4999-8999-999999999999"}')
  [ "$st3" = "403" ] \
    && ok "(d3) a nonexistent company refuses with the same 403 — no existence oracle" \
    || bad "(d3) a nonexistent company answered $st3, not 403 — that distinguishes it: $(body)"
fi

# (d4) THE FILED GAP, PINNED (SP-F31). public.has_capability knows five capabilities — the governance
# four plus interview.readText — and NOT structure.route.generate / structure.opportunity.generate,
# which exist only in src/lib/capabilities.ts (granted there to Decision-Owner). So the capability arm
# refuses a Decision-Owner today. This check pins that measured state: if has_capability is extended,
# it goes RED on purpose, and whoever extended it updates this guard and the review.
if [ -n "${MEMBER_ID:-}" ]; then
  HC=$(psqlq "select public.has_capability('$MEMBER_ID','structure.route.generate','${MEMBER_COMPANY_ID:-$PRIV}')")
  if [ "$HC" = "f" ]; then
    ok "(d4) FILED SP-F31: has_capability still does not grant structure.route.generate — the capability arm is inert"
  else
    bad "(d4) has_capability now grants structure.route.generate ($HC) — SP-F31 is resolved; update this guard, the review and authz-census.md"
  fi
else
  bad "(d4) MEMBER_ID not set — source backups/fr-member.env; (d4) did not run"
fi

# (d5) an ADMIN reaches the handler of both capability functions (non-vacuity: the gate is not a wall)
if [ -z "$JWT_ADMIN" ]; then
  bad "(d5) FR_LOGIN_EMAIL/FR_LOGIN_PASSWORD not set or login failed — source backups/fr-login.env; (d5) did not run"
else
  for f in $CAPABILITY_FNS; do
    st=$(probe "$f" "$JWT_ADMIN" '{}')
    if [ "$st" = "401" ] || [ "$st" = "403" ]; then
      bad "(d5) $f refused an ADMIN with $st — the gate is too tight: $(body)"
    else
      ok "(d5) $f lets an admin through to its own parameter check ($st)"
    fi
  done
fi

# ── (e) the internal doors still open (SP-151) ───────────────────────────────────────────────────
echo "── (e) a bare service-role bearer still reaches the handler (cron + operator scripts) ──"
# assess-surface-drift is the one with a live DB caller: public.trigger_scheduled_drift_scan posts
# with app.service_role_key and no secret header. record-check-outcome is on the session-open boot
# list and is probed the same way. Both must answer their OWN 4xx, never 401/403.
for f in assess-surface-drift record-check-outcome public-companies; do
  st=$(probe "$f" "$SRK" '{}')
  if [ "$st" = "401" ] || [ "$st" = "403" ]; then
    bad "(e) $f refused a bare service-role bearer with $st — cron and every operator script are stranded: $(body)"
  else
    ok "(e) $f admits the internal caller ($st — its own answer, not an identity refusal)"
  fi
done
# and the DB caller's own settings are still present, or cron would skip silently
SRK_SET=$(psqlq "select (coalesce(current_setting('app.service_role_key',true),'')<>'')::text")
FURL=$(psqlq "select coalesce(current_setting('app.supabase_functions_url',true),'')")
[ "$SRK_SET" = "true" ] && [ -n "$FURL" ] \
  && ok "(e) the DB caller's settings are set (app.service_role_key, app.supabase_functions_url)" \
  || bad "(e) app.service_role_key / app.supabase_functions_url missing — trigger_scheduled_drift_scan would skip"

fi

# ── the helper's own unit tests ──────────────────────────────────────────────────────────────────
echo "── (u) the shared helper's unit tests ──"
if command -v deno >/dev/null 2>&1; then
  if deno test supabase/functions/_shared/callerAuthz.test.ts >/tmp/caller-authz-unit 2>&1; then
    ok "(u) callerAuthz.test.ts — $(grep -oE '[0-9]+ passed' /tmp/caller-authz-unit | head -1)"
  else
    bad "(u) callerAuthz.test.ts failed: $(tail -5 /tmp/caller-authz-unit | tr '\n' ' ')"
  fi
else
  bad "(u) deno is not on PATH — the helper's unit tests did not run (export ~/.deno/bin)"
fi

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
