#!/usr/bin/env bash
# RE-ANALYSIS SUPERSEDES — a newer analysis of a file retires the earlier ones (SP-300/SP-301; 2026-11-14).
#
# WHY. Re-analysing a file inserted a new proposal and minted afresh while the earlier analysis's
# signals and claims stayed live: the Charter 10-Q analysed twice left 29 + 35 = 64 live signals from
# one document (SP-F49), so the map counted one filing twice.
#
# THE RULE (SP-301-plan.md), reusing the signed retirement path (_shared/retireProposals.ts):
#   - every OTHER proposal on the same file has its live signals SUPERSEDED (never deleted) under
#     reanalysis:superseded_by_newer_analysis;
#   - a claim whose ENTIRE live backing was those signals is STRUCK; a claim that also rests on the
#     newer analysis's signals STAYS LIVE;
#   - the newer analysis's own signals are untouched; the earlier proposal rows are not changed;
#   - it runs only after the newer analysis has minted and is `ready`, and never on a failed one.
#
# D4: the function under test DOES write — so it is run only on a HELD throwaway company that this
# guard owns (E2: born held, never deleted), on rows this guard creates. No model is called.
#
# Read the printed verdict, not only the exit code (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."
oks=0; fails=0
ok()  { echo "  ok   $*"; oks=$((oks+1)); }
bad() { echo "  FAIL $*"; fails=$((fails+1)); }
DB="${SUPABASE_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
DENO="${DENO_BIN:-$HOME/.deno/bin/deno}"
psqlq() { docker exec -i "$DB" psql -U postgres -At -c "$1" 2>/dev/null; }
psqlx() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1; }
psql_insert_id() { psqlq "with ins as ($1 returning id) select id from ins;"; }
W="supabase/functions/dify-analyze-file/index.ts"
R="supabase/functions/_shared/retireProposals.ts"
CO="0c900000-0000-4000-8000-00000000c041"
REASON="reanalysis:superseded_by_newer_analysis"

echo "── (r1) the rule is the signed retirement path, called in the right place ──"
grep -q 'export async function retireEarlierAnalysesOfFile' "$R" && grep -q 'planRetirement(supabase, companyId, earlier, REANALYSIS_REASON)' "$R" \
  && ok "(r1) retireEarlierAnalysesOfFile reuses planRetirement/applyRetirement — no second supersede path" \
  || bad "(r1) the supersede rule does not reuse the signed retirement path"
grep -q "export const REANALYSIS_REASON = \"$REASON\";" "$R" \
  && ok "(r1) the reason is $REASON — not operator_retired, so rule J2 does not drop the upload from the corpus" \
  || bad "(r1) the reanalysis reason is missing or changed"
# ORDER: the call must come AFTER the success arm's `ready` write, and must not appear in the failure arm.
READY_AT=$(grep -n 'minting_origin_state: mintingOriginState,' "$W" | tail -1 | cut -d: -f1)
CALL_AT=$(grep -n 'await supersedeEarlierAnalyses({' "$W" | head -1 | cut -d: -f1)
FAIL_AT=$(grep -n 'processing_error_code: "ingest_failed",' "$W" | head -1 | cut -d: -f1)
if [ -n "$READY_AT" ] && [ -n "$CALL_AT" ] && [ "$CALL_AT" -gt "$READY_AT" ]; then
  ok "(r1) the supersede runs AFTER the analysis is marked ready (line $CALL_AT > $READY_AT)"
else
  bad "(r1) the supersede is not after the ready write (ready $READY_AT, call $CALL_AT)"
fi
[ "$(grep -c 'await supersedeEarlierAnalyses({' "$W")" = "1" ] && [ -n "$FAIL_AT" ] && [ "$CALL_AT" -gt "$FAIL_AT" ] \
  && ok "(r1) exactly one call site, after the failure arm returns — a failed re-analysis supersedes nothing" \
  || bad "(r1) the supersede has more than one call site, or one before the failure arm"

echo "── (r2) on a HELD fixture: the old analysis stands down, the shared claim stays ──"
OWNER=""
[ -n "${FR_LOGIN_EMAIL:-}" ] && OWNER=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
if [ -z "$OWNER" ]; then
  bad "(r2) FR_LOGIN_EMAIL not set — the behavioural half did not run; source backups/fr-login.env"
else
  psqlx "insert into public.companies (id, name, created_by, fixture_hold) values ('$CO','rsg-throwaway-reanalysis','$OWNER','RSG:test_fixture')
         on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'RSG:test_fixture');"
  [ -n "$(psqlq "select fixture_hold from companies where id='$CO' and coalesce(fixture_hold,'')<>'';")" ] \
    && ok "(r2) the fixture company is HELD and is never deleted (E2)" || bad "(r2) the fixture company is not held"
  INPUT=$(psqlq "select id from inputs where company_id='$CO' limit 1;")
  [ -n "$INPUT" ] || INPUT=$(psql_insert_id "insert into public.inputs (company_id, user_id, input_key, input_label) values ('$CO','$OWNER','rsg_fixture','RSG fixture')")
  FILE=$(psql_insert_id "insert into public.input_files (input_id, file_name, file_type, file_path) values ('$INPUT','rsg-$(date +%s).pdf','application/pdf','rsg/fixture.pdf')")
  newprop() { psql_insert_id "insert into public.file_proposals (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state)
                              values ('$CO','$FILE','rsg.pdf','uploaded_file','$1','document','pending','ready')"; }
  OLD=$(newprop "older analysis"); NEW=$(newprop "newer analysis")
  sig() { psql_insert_id "insert into public.signals (company_id, source_id, source_type, signal_band, claim_text) values ('$CO','$1','file_proposal','organization','$2')"; }
  S_OLD=$(sig "$OLD" "rsg old signal"); S_NEW=$(sig "$NEW" "rsg new signal")
  claim() { psql_insert_id "insert into public.claims (company_id, statement) values ('$CO','$1')"; }
  C_OLD=$(claim "rsg claim backed by the old analysis only $(date +%s%N)")
  C_SHARED=$(claim "rsg claim backed by both analyses $(date +%s%N)")
  for pair in "$C_OLD|$S_OLD" "$C_SHARED|$S_OLD" "$C_SHARED|$S_NEW"; do
    IFS='|' read c s <<<"$pair"; psqlx "insert into public.claim_signal_refs (company_id, claim_id, signal_id) values ('$CO','$c','$s');"
  done
  if [ -z "$OLD" ] || [ -z "$NEW" ] || [ -z "$S_OLD" ] || [ -z "$S_NEW" ] || [ -z "$C_OLD" ] || [ -z "$C_SHARED" ]; then
    bad "(r2) could not build the fixture — the checks below would pass on absence"
  else
    eval "$(npx supabase status --output env 2>/dev/null | grep -E '^(SERVICE_ROLE_KEY|API_URL)=')"
    PROBE="$(mktemp -t rsgprobe).ts"; trap 'rm -f "$PROBE"' EXIT
    cat > "$PROBE" <<TS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { retireEarlierAnalysesOfFile } from "file://$PWD/supabase/functions/_shared/retireProposals.ts";
const sb = createClient("$API_URL", "$SERVICE_ROLE_KEY");
const first = await retireEarlierAnalysesOfFile(sb as never, "$CO", "$FILE", "$NEW");
const second = await retireEarlierAnalysesOfFile(sb as never, "$CO", "$FILE", "$NEW");
console.log(JSON.stringify({ first, second }));
TS
    OUT=$("$DENO" run --allow-net --allow-env --allow-read --allow-import "$PROBE" 2>/dev/null | tail -1)
    echo "     $OUT"
    [ -n "$OUT" ] || bad "(r2) the helper did not run"
    q() { psqlq "$1"; }
    [ "$(q "select superseded_reason from signals where id='$S_OLD';")" = "$REASON" ] \
      && ok "(r2) the OLDER analysis's signal is superseded under $REASON" || bad "(r2) the older signal was not superseded"
    [ "$(q "select count(*) from signals where id='$S_OLD';")" = "1" ] \
      && ok "(r2) and it still exists — superseded, never deleted" || bad "(r2) the older signal is gone"
    [ "$(q "select coalesce(superseded_at::text,'live') from signals where id='$S_NEW';")" = "live" ] \
      && ok "(r2) the NEWER analysis's signal is untouched" || bad "(r2) the newer analysis's signal was superseded"
    [ "$(q "select status||'|'||coalesce(struck_reason,'') from claims where id='$C_OLD';")" = "struck|$REASON" ] \
      && ok "(r2) a claim backed ONLY by the older analysis is struck, with the reason" || bad "(r2) the old-only claim was not struck: $(q "select status from claims where id='$C_OLD';")"
    [ "$(q "select status from claims where id='$C_SHARED';")" = "active" ] \
      && ok "(r2) a claim backed by BOTH analyses STAYS live — its newer signal still backs it" || bad "(r2) the shared claim was struck"
    [ "$(q "select status||'|'||processing_state from file_proposals where id='$OLD';")" = "pending|ready" ] \
      && ok "(r2) the older proposal row itself is unchanged — kept as a record (SP-310)" || bad "(r2) the older proposal row was changed"
    [ "$(q "select count(*) from provenance_remints where proposal_id='$OLD' and kind='retirement' and reason='$REASON';")" = "1" ] \
      && ok "(r2) one retirement ledger row records the decision" || bad "(r2) no retirement ledger row"
    echo "$OUT" | grep -q '"second":{"proposals":0,"signals":0,"claims_struck":0}' \
      && ok "(r2) a second run changes nothing — idempotent" || bad "(r2) a second run changed something: $OUT"
  fi
  # Teardown: this run's children, each in its own statement. The company stays, HELD (E2). Claims and
  # their events are append-only on purpose and stay on the held fixture.
  psqlx "delete from public.claim_signal_refs where company_id='$CO' and claim_id in ('${C_OLD:-00000000-0000-0000-0000-000000000000}','${C_SHARED:-00000000-0000-0000-0000-000000000000}');" || true
fi

echo "  -- $oks ok / $fails FAIL --"
if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
