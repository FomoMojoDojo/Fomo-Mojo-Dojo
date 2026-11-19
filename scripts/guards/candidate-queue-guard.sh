#!/usr/bin/env bash
# CANDIDATE REVIEW QUEUE — a file analysis's candidates reach surface_proposals, and only an admin's
# accept turns one into a map row (BRIEF-17 commit 2: SP-324..SP-327; 2026-11-13).
#
# THE RULES
#   SP-324  when an analysis is ready AND is the live analysis of its file, each candidate item is
#           queued `pending`, current_state NULL, naming the file_proposal and the signals it rests on.
#           No model call. One row per (analysis, list, item) — a second run queues nothing.
#   SP-325  a re-analysis retires the earlier analysis's still-PENDING rows; accepted and rejected rows
#           are the operator's decisions and are never touched. Nothing is deleted.
#   SP-326  accept is insert-type for need / job step / outcome: a file_derived row with its evidence
#           ids and voice; a need gets NO service_state from that evidence.
#   SP-327  nothing reaches the map without an accept: no map row anywhere rests on a proposal that is
#           not `accepted`.
#   SP-321  the voice is the evidence's: an uploaded document speaks with its author's voice, so a
#           company's own document is `company` even where its signals carry an outside label.
#
# D4: the functions under test WRITE — they run only on a HELD throwaway company this guard owns (E2:
# born held, never deleted), on rows this guard creates (SP-264). No model is called. The accept checks
# run inside a transaction that is rolled back.
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
Q="supabase/functions/_shared/candidateQueue.ts"
R="supabase/functions/_shared/retireProposals.ts"
CO="0c900000-0000-4000-8000-00000000c051"
REASON="reanalysis:superseded_by_newer_analysis"

echo "── (q1) the queue is written in the right place, and retired by the signed path ──"
READY_AT=$(grep -n 'minting_origin_state: mintingOriginState,' "$W" | tail -1 | cut -d: -f1)
SUP_AT=$(grep -n 'await supersedeEarlierAnalyses({' "$W" | head -1 | cut -d: -f1)
QUE_AT=$(grep -n 'await queueAnalysisCandidates({' "$W" | head -1 | cut -d: -f1)
if [ -n "$READY_AT" ] && [ -n "$SUP_AT" ] && [ -n "$QUE_AT" ] && [ "$QUE_AT" -gt "$SUP_AT" ] && [ "$SUP_AT" -gt "$READY_AT" ]; then
  ok "(q1) candidates are queued AFTER ready and AFTER the earlier analyses stand down (lines $READY_AT < $SUP_AT < $QUE_AT)"
else
  bad "(q1) the queue call is not after ready + supersede (ready $READY_AT, supersede $SUP_AT, queue $QUE_AT)"
fi
[ "$(grep -c 'await queueAnalysisCandidates({' "$W")" = "1" ] \
  && ok "(q1) exactly one call site" || bad "(q1) the queue has more than one call site"
grep -q 'const queueRows = await retirePendingCandidates(supabase, companyId, earlier, keepProposalId);' "$R" \
  && ok "(q1) retireEarlierAnalysesOfFile retires the earlier analyses' pending queue rows (SP-325)" \
  || bad "(q1) the re-analysis path does not retire pending queue rows"
grep -qE 'callOpenAIJSON|callLocal|fetch\(' "$Q" \
  && bad "(q1) the queue module calls a model or the network — SP-324 says no model call" \
  || ok "(q1) the queue module calls no model and no network"
grep -qE '\.from\("(odi_needs|job_steps|desired_outcomes|routes|opportunities|positioning_canvases)"\)' "$Q" \
  && bad "(q1) the queue module touches a map table — SP-327" \
  || ok "(q1) the queue module touches no map table (SP-327)"

echo "── (q2) on a HELD fixture: queue, idempotence, live-only, retirement ──"
OWNER=""
[ -n "${FR_LOGIN_EMAIL:-}" ] && OWNER=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
if [ -z "$OWNER" ]; then
  bad "(q2) FR_LOGIN_EMAIL not set — the behavioural half did not run; source backups/fr-login.env"
else
  psqlx "insert into public.companies (id, name, created_by, fixture_hold) values ('$CO','cqg-throwaway-candidate-queue','$OWNER','CQG:test_fixture')
         on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'CQG:test_fixture');"
  [ -n "$(psqlq "select fixture_hold from companies where id='$CO' and coalesce(fixture_hold,'')<>'';")" ] \
    && ok "(q2) the fixture company is HELD and is never deleted (E2)" || bad "(q2) the fixture company is not held"
  TAG="cqg$(date +%s%N)"
  INPUT=$(psqlq "select id from inputs where company_id='$CO' limit 1;")
  [ -n "$INPUT" ] || INPUT=$(psql_insert_id "insert into public.inputs (company_id, user_id, input_key, input_label) values ('$CO','$OWNER','cqg_fixture','CQG fixture')")
  FILE=$(psql_insert_id "insert into public.input_files (input_id, file_name, file_type, file_path) values ('$INPUT','$TAG.pdf','application/pdf','cqg/$TAG.pdf')")
  # the document is the company's own (SP-321) — its signals below carry an OUTSIDE label on purpose
  psqlx "insert into public.doc_voice_verdicts (input_file_id, company_id, content_sha, verdict, basis, classifier_model, authorship, subject)
         values ('$FILE','$CO','$TAG','client_voice','guard fixture','guard','client','this_company');"
  EV_NEED="$TAG need evidence alpha beta gamma delta"
  EV_STEP="$TAG step evidence epsilon zeta eta theta"
  EV_OUT="$TAG outcome evidence iota kappa lambda mu"
  OLD=$(psql_insert_id "insert into public.file_proposals (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, created_at,
         candidate_needs, candidate_job_steps, possible_routes)
         values ('$CO','$FILE','$TAG.pdf','uploaded_file','older','document','pending','ready', now() - interval '1 hour',
         '[{\"desired_outcome\":\"cqg need\",\"evidence\":\"$EV_NEED\"}]'::jsonb,
         '[{\"step_label\":\"cqg step\",\"step_description\":\"d\",\"evidence\":\"$EV_STEP\"}]'::jsonb,
         '[{\"title\":\"cqg route\",\"evidence\":\"$TAG nothing any signal says\"}]'::jsonb)")
  NEW=$(psql_insert_id "insert into public.file_proposals (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, created_at,
         candidate_needs, candidate_outcomes)
         values ('$CO','$FILE','$TAG.pdf','uploaded_file','newer','document','pending','running', now(),
         '[{\"desired_outcome\":\"cqg need again\",\"evidence\":\"$EV_NEED\"}]'::jsonb,
         '[{\"outcome\":\"cqg outcome\",\"evidence\":\"$EV_OUT\"}]'::jsonb)")
  # G1 (candidate-queue v2): a candidate matches a signal by its STORED evidence_excerpt only, so
  # each fixture signal carries the excerpt; raw_payload keeps the same text. S_BLANK is the
  # counter-case: its raw_payload quotes the need's evidence but its excerpt was blanked (E4), so it
  # must never be named as the need's evidence.
  sig() { psql_insert_id "insert into public.signals (company_id, source_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, raw_payload)
                          values ('$CO','$1','uploaded_file','outside','outside_voice_about_client','$TAG signal','…$2…','{\"evidence\":\"…$2…\"}'::jsonb)"; }
  S_OLD_NEED=$(sig "$OLD" "$EV_NEED"); S_OLD_STEP=$(sig "$OLD" "$EV_STEP"); S_NEW_NEED=$(sig "$NEW" "$EV_NEED"); S_NEW_OUT=$(sig "$NEW" "$EV_OUT")
  S_BLANK=$(psql_insert_id "insert into public.signals (company_id, source_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, raw_payload)
                          values ('$CO','$OLD','uploaded_file','outside','outside_voice_about_client','$TAG blanked signal','','{\"evidence\":\"…${EV_NEED}…\"}'::jsonb)")
  if [ -z "$OLD" ] || [ -z "$NEW" ] || [ -z "$S_OLD_NEED" ] || [ -z "$S_NEW_OUT" ] || [ -z "$S_BLANK" ]; then
    bad "(q2) could not build the fixture — the checks below would pass on absence"
  else
    eval "$(npx supabase status --output env 2>/dev/null | grep -E '^(SERVICE_ROLE_KEY|API_URL)=')"
    PROBE="$(mktemp -t cqgprobe).ts"; trap 'rm -f "$PROBE"' EXIT
    cat > "$PROBE" <<TS
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { queueCandidatesForAnalysis } from "file://$PWD/$Q";
import { retireEarlierAnalysesOfFile } from "file://$PWD/$R";
const sb = createClient("$API_URL", "$SERVICE_ROLE_KEY");
const out: Record<string, unknown> = {};
out.old1 = await queueCandidatesForAnalysis(sb as never, "$CO", "$OLD");
out.old2 = await queueCandidatesForAnalysis(sb as never, "$CO", "$OLD");
out.newRunning = await queueCandidatesForAnalysis(sb as never, "$CO", "$NEW");
await sb.from("file_proposals").update({ processing_state: "ready" }).eq("id", "$NEW");
out.oldAfterNew = await queueCandidatesForAnalysis(sb as never, "$CO", "$OLD");
// the operator's decisions on two of the older rows — these must survive the retirement
const { data: oldRows } = await sb.from("surface_proposals").select("id, surface_type").eq("company_id", "$CO").eq("raw_payload->>file_proposal_id", "$OLD");
const byType = Object.fromEntries((oldRows ?? []).map((r: { id: string; surface_type: string }) => [r.surface_type, r.id]));
await sb.from("surface_proposals").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", byType.candidate_job_step);
await sb.from("surface_proposals").update({ status: "accepted", reviewed_at: new Date().toISOString() }).eq("id", byType.candidate_route);
out.retire = await retireEarlierAnalysesOfFile(sb as never, "$CO", "$FILE", "$NEW");
out.new1 = await queueCandidatesForAnalysis(sb as never, "$CO", "$NEW");
out.new2 = await queueCandidatesForAnalysis(sb as never, "$CO", "$NEW");
out.ids = byType;
console.log(JSON.stringify(out));
TS
    OUT=$("$DENO" run --allow-net --allow-env --allow-read --allow-import "$PROBE" 2>/dev/null | tail -1)
    echo "     $OUT"
    [ -n "$OUT" ] || bad "(q2) the probe did not run"
    j() { echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);const v=process.argv[1].split(".").reduce((a,k)=>a?.[k],o);console.log(typeof v==="object"?JSON.stringify(v):String(v))})' "$1" 2>/dev/null; }
    q() { psqlq "$1"; }
    [ "$(j old1.queued)" = "3" ] && ok "(q2) the live analysis queued its 3 candidates" || bad "(q2) first queue wrote $(j old1.queued), expected 3"
    [ "$(j old2.queued)|$(j old2.already)" = "0|3" ] && ok "(q2) a second run queues nothing — one row per item" || bad "(q2) second run: $(j old2)"
    [ "$(j newRunning.skipped)" = "not_ready" ] && ok "(q2) an analysis that is not ready queues nothing" || bad "(q2) a running analysis queued: $(j newRunning)"
    [ "$(j oldAfterNew.skipped)" = "not_live" ] && ok "(q2) once a newer analysis of the file is ready, the older one is not live and queues nothing" || bad "(q2) a replaced analysis still queues: $(j oldAfterNew)"
    [ "$(q "select count(*) from surface_proposals where company_id='$CO' and raw_payload->>'file_proposal_id'='$OLD' and current_state is null and status in ('pending','superseded','rejected','accepted')")" = "3" ] \
      && ok "(q2) queued rows carry current_state NULL" || bad "(q2) a queued row carries a current_state"
    NEED_ROW="select proposed_state from surface_proposals where company_id='$CO' and raw_payload->>'file_proposal_id'='$OLD' and surface_type='candidate_need'"
    [ "$(q "select proposed_state->'evidence_signal_ids' = '[\"$S_OLD_NEED\"]'::jsonb from ($NEED_ROW) x")" = "t" ] \
      && ok "(q2) the need names exactly the signal its evidence came from" || bad "(q2) the need's evidence ids are wrong: $(q "select proposed_state->'evidence_signal_ids' from ($NEED_ROW) x")"
    [ "$(q "select coalesce(proposed_state->'evidence_signal_ids' ? '$S_BLANK', false) from ($NEED_ROW) x")" = "f" ] \
      && ok "(q2) G1: a signal whose excerpt is blank is never named, though its raw_payload quotes the evidence" \
      || bad "(q2) G1: the blanked signal $S_BLANK was named as evidence"
    [ "$(q "select proposed_state->>'evidence_voice' from ($NEED_ROW) x")" = "company" ] \
      && ok "(q2) SP-321: the company's own document is company voice, though its signal carries an outside label" \
      || bad "(q2) SP-321: voice is $(q "select proposed_state->>'evidence_voice' from ($NEED_ROW) x"), expected company"
    [ "$(q "select raw_payload->>'evidence_match' from surface_proposals where id='$(j ids.candidate_route)'")" = "unmatched" ] \
      && ok "(q2) an item whose evidence no signal carries is queued as unmatched, with no ids" || bad "(q2) the unmatched route is not marked unmatched"
    [ "$(j retire.queue_rows)" = "1" ] && ok "(q2) the re-analysis retired exactly the 1 still-pending older row" || bad "(q2) retirement touched $(j retire.queue_rows) queue rows, expected 1"
    [ "$(q "select status||'|'||(raw_payload->'superseded_by_reanalysis'->>'reason') from surface_proposals where id='$(j ids.candidate_need)'")" = "superseded|$REASON" ] \
      && ok "(q2) the older pending need is superseded, with the reason recorded" || bad "(q2) the older pending need was not superseded with its reason"
    [ "$(q "select status from surface_proposals where id='$(j ids.candidate_job_step)'")|$(q "select status from surface_proposals where id='$(j ids.candidate_route)'")" = "rejected|accepted" ] \
      && ok "(q2) the operator's rejected and accepted rows are untouched (SP-325)" || bad "(q2) a decided row was changed by the retirement"
    [ "$(q "select count(*) from surface_proposals where company_id='$CO' and raw_payload->>'file_proposal_id' in ('$OLD','$NEW')")" = "5" ] \
      && ok "(q2) nothing was deleted — 3 older rows kept as records, 2 newer queued" || bad "(q2) row count is not 5"
    [ "$(j new1.queued)|$(j new2.queued)" = "2|0" ] && ok "(q2) the newer analysis queues its 2, once" || bad "(q2) the newer analysis queued $(j new1.queued) then $(j new2.queued)"

    echo "── (q3) accept: admin-only, insert-type, voice and evidence carried, no service_state (rolled back) ──"
    NEW_NEED=$(q "select id from surface_proposals where company_id='$CO' and raw_payload->>'file_proposal_id'='$NEW' and surface_type='candidate_need'")
    NEW_OUT=$(q "select id from surface_proposals where company_id='$CO' and raw_payload->>'file_proposal_id'='$NEW' and surface_type='candidate_outcome'")
    NA="${NONADMIN_ID:-}"
    [ -n "$NA" ] || bad "(q3) NONADMIN_ID not set — source backups/fr-nonadmin.env"
    ACC=$(docker exec -i "$DB" psql -U postgres -X -v ON_ERROR_STOP=1 2>&1 <<SQL
BEGIN;
DO \$g\$
DECLARE r jsonb; n record; fired boolean; msg text; rev text;
BEGIN
  -- a non-admin is refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '${NA:-00000000-0000-0000-0000-000000000000}', 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  fired := false; BEGIN PERFORM public.accept_candidate_proposal('$NEW_NEED'); EXCEPTION WHEN others THEN fired := true; END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT fired THEN RAISE EXCEPTION 'GUARD-FAIL (q3a) a non-admin accept was NOT refused'; END IF;
  RAISE NOTICE 'OK q3a a non-admin accept is refused';
  -- the admin accepts the need
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '$OWNER', 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  r := public.accept_candidate_proposal('$NEW_NEED');
  PERFORM set_config('role', 'postgres', true);
  SELECT provenance_type::text AS p, service_state, evidence_voice, evidence_baseline_signal_ids AS ids, source_proposal_id INTO n FROM public.odi_needs WHERE id = (r->>'row_id')::uuid;
  IF n.p <> 'file_derived' THEN RAISE EXCEPTION 'GUARD-FAIL (q3b) provenance %', n.p; END IF;
  IF n.service_state IS NOT NULL THEN RAISE EXCEPTION 'GUARD-FAIL (q3b) a company-voice need got service_state %', n.service_state; END IF;
  IF n.evidence_voice <> 'company' THEN RAISE EXCEPTION 'GUARD-FAIL (q3b) voice %', n.evidence_voice; END IF;
  IF n.ids <> '["$S_NEW_NEED"]'::jsonb THEN RAISE EXCEPTION 'GUARD-FAIL (q3b) evidence ids %', n.ids; END IF;
  IF n.source_proposal_id <> '$NEW_NEED' THEN RAISE EXCEPTION 'GUARD-FAIL (q3b) source_proposal_id'; END IF;
  IF (SELECT status FROM public.surface_proposals WHERE id = '$NEW_NEED') <> 'accepted' THEN RAISE EXCEPTION 'GUARD-FAIL (q3b) proposal not accepted'; END IF;
  RAISE NOTICE 'OK q3b accepted need: file_derived, service_state NULL, company voice, its evidence id, linked back, proposal accepted';
  -- the outcome
  PERFORM set_config('role', 'authenticated', true);
  r := public.accept_candidate_proposal('$NEW_OUT');
  PERFORM set_config('role', 'postgres', true);
  IF (SELECT provenance_type FROM public.desired_outcomes WHERE id = (r->>'row_id')::uuid) <> 'file_derived' THEN RAISE EXCEPTION 'GUARD-FAIL (q3c) outcome row'; END IF;
  RAISE NOTICE 'OK q3c an accepted outcome lands in desired_outcomes as file_derived';
  -- a second accept, a decided row, and a type with no accept are all refused
  PERFORM set_config('role', 'authenticated', true);
  fired := false; BEGIN PERFORM public.accept_candidate_proposal('$NEW_NEED'); EXCEPTION WHEN others THEN fired := true; END;
  IF NOT fired THEN PERFORM set_config('role', 'postgres', true); RAISE EXCEPTION 'GUARD-FAIL (q3d) a second accept was NOT refused'; END IF;
  fired := false; BEGIN PERFORM public.accept_candidate_proposal('$(j ids.candidate_need)'); EXCEPTION WHEN others THEN fired := true; END;
  IF NOT fired THEN PERFORM set_config('role', 'postgres', true); RAISE EXCEPTION 'GUARD-FAIL (q3d) a superseded row was accepted'; END IF;
  PERFORM set_config('role', 'postgres', true);
  UPDATE public.surface_proposals SET status = 'pending' WHERE id = '$(j ids.candidate_route)';
  PERFORM set_config('role', 'authenticated', true);
  fired := false; BEGIN PERFORM public.accept_candidate_proposal('$(j ids.candidate_route)'); EXCEPTION WHEN others THEN fired := true; msg := SQLERRM; END;
  PERFORM set_config('role', 'postgres', true);
  IF NOT fired THEN RAISE EXCEPTION 'GUARD-FAIL (q3d) a route candidate was accepted — it has no insert-type accept'; END IF;
  RAISE NOTICE 'OK q3d a second accept, a superseded row and a route candidate are each refused';
  -- SP-433: an OUTSIDE-VOICE card lands as what it rests on, never as a file. Same rolled-back
  -- transaction, same throwaway company — Charter is never written by a guard.
  PERFORM set_config('role', 'postgres', true);
  -- a REVIEW-LANE shaped signal to cite: the outside-voice path rests on public review-lane rows, not
  -- on the file-analysis fixture the company-voice checks above use.
  INSERT INTO public.signals (company_id, source_type, signal_band, voice_class, claim_text, evidence_excerpt, topic, source_url)
  VALUES ('$CO', 'public_baseline_run', 'outside', 'outside_voice_about_client',
          'GUARD review quote', 'GUARD review quote', 'customer_review', 'https://www.trustpilot.com/review/guard.example')
  RETURNING id::text INTO rev;
  INSERT INTO public.surface_proposals (company_id, surface_type, proposed_state, status, raw_payload)
  VALUES ('$CO', 'candidate_need',
          jsonb_build_object('item', jsonb_build_object('desired_outcome', 'GUARD outside-voice need'),
                             'evidence_signal_ids', jsonb_build_array(rev),
                             'evidence_voice', 'outside',
                             'origin', 'outside_voice_read'),
          'pending', jsonb_build_object('candidate_list', 'outside_voice_read'))
  RETURNING id INTO msg;
  PERFORM set_config('role', 'authenticated', true);
  r := public.accept_candidate_proposal(msg::uuid);
  PERFORM set_config('role', 'postgres', true);
  SELECT source_path, provenance_type::text AS p, evidence_voice, evidence_baseline_signal_ids AS ids,
         source_proposal_id INTO n FROM public.odi_needs WHERE id = (r->>'row_id')::uuid;
  IF n.source_path <> 'outside_voice_read' THEN RAISE EXCEPTION 'GUARD-FAIL (q3e) source_path is %, expected outside_voice_read', n.source_path; END IF;
  IF n.source_path LIKE 'file_proposal:%' THEN RAISE EXCEPTION 'GUARD-FAIL (q3e) an outside-voice need was recorded as file-derived'; END IF;
  IF n.p <> 'outside_review_derived' THEN RAISE EXCEPTION 'GUARD-FAIL (q3e) provenance is %, expected outside_review_derived', n.p; END IF;
  IF n.evidence_voice <> 'outside' THEN RAISE EXCEPTION 'GUARD-FAIL (q3e) voice %', n.evidence_voice; END IF;
  IF n.ids <> jsonb_build_array(rev) THEN RAISE EXCEPTION 'GUARD-FAIL (q3e) evidence ids %', n.ids; END IF;
  IF n.source_proposal_id IS NULL THEN RAISE EXCEPTION 'GUARD-FAIL (q3e) source_proposal_id is NULL — the need would not be private by that gate'; END IF;
  -- every cited id is a signal of THIS company, from the public review lane
  IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(n.ids) x
              WHERE NOT EXISTS (SELECT 1 FROM public.signals s
                                 WHERE s.id = x::uuid AND s.company_id = '$CO'
                                   AND s.source_type = 'public_baseline_run'))
  THEN RAISE EXCEPTION 'GUARD-FAIL (q3e) a cited evidence id is not a public review-lane signal of this company'; END IF;
  RAISE NOTICE 'OK q3e accepted outside-voice need: source_path outside_voice_read (never file_proposal:), outside_review_derived, outside voice, its own evidence ids, linked back';
END
\$g\$;
ROLLBACK;
SQL
)
    for k in q3a q3b q3c q3d q3e; do
      echo "$ACC" | grep -q "OK $k" && ok "($k) $(echo "$ACC" | grep "OK $k" | sed "s/.*OK $k //")" || bad "($k) $(echo "$ACC" | grep -m1 -E 'GUARD-FAIL|ERROR' || echo 'did not run')"
    done
    [ "$(q "select count(*) from odi_needs where source_proposal_id='$NEW_NEED'")" = "0" ] \
      && ok "(q3) the accept checks were rolled back — no map row left on the fixture" || bad "(q3) the rolled-back accept left a map row"
  fi
fi

echo "── (q3f) SP-433: the TS predicates refuse an outside-voice need ──"
# The accept path writes a row that must be PRIVATE by source and REFUSED by the external gate. Both
# are TS predicates, so they are exercised in TS rather than restated in SQL. The row is synthetic:
# this check is about the predicates, not about live data.
Q3F=$(PATH="$HOME/.deno/bin:$PATH" deno run -A scripts/guards/helpers/outsideVoiceNeedPredicates.ts 2>&1 || true)
case "$Q3F" in
  Q3F-OK*) ok "(q3f) ${Q3F#Q3F-OK }" ;;
  *) bad "(q3f) ${Q3F:-did not run}" ;;
esac

echo "── (q4) SP-327, fleet-wide: no map row rests on a proposal that is not accepted ──"
ORPHANS=$(psqlq "select count(*) from (
  select source_proposal_id from public.odi_needs where source_proposal_id is not null
  union all select source_proposal_id from public.job_steps where source_proposal_id is not null
  union all select source_proposal_id from public.desired_outcomes where source_proposal_id is not null) m
  join public.surface_proposals p on p.id = m.source_proposal_id where p.status <> 'accepted';")
[ "${ORPHANS:-x}" = "0" ] && ok "(q4) 0 map rows rest on a pending, rejected or superseded proposal" || bad "(q4) $ORPHANS map row(s) rest on a proposal that is not accepted"
UNLINKED=$(psqlq "select (select count(*) from public.odi_needs where provenance_type='file_derived' and source_proposal_id is null)
  + (select count(*) from public.job_steps where provenance_type='file_derived' and source_proposal_id is null)
  + (select count(*) from public.desired_outcomes where provenance_type='file_derived' and source_proposal_id is null);")
[ "${UNLINKED:-x}" = "0" ] && ok "(q4) every file_derived map row names the accepted proposal it came from" || bad "(q4) $UNLINKED file_derived row(s) name no proposal"

echo "  -- $oks ok / $fails FAIL --"
if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
