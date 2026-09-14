#!/usr/bin/env bash
# GUARD — SIGNAL-LEVEL retirement (operator ruling 2026-09-14; retire-proposals {signal_ids}). Throwaway company,
# never a client document. Seeds three live signals on one proposal (two named, one not) plus a claim sole-backed
# by a named signal and a claim jointly backed by a named and an unnamed signal. Proves:
#   f. dry run writes nothing
#   h. HISTORY: the named signals survive superseded (reason, from/to, actor in raw_payload; claim_text and
#      raw_payload.claim intact — the interpretation is history, readable); the unnamed signal is untouched
#   s. the sole-backed claim is struck with the reason/actor (refs kept, event written); the joint claim stands
#   l. one 'retirement' ledger row per signal, proposal_id = the signal's source
#   a. IDEMPOTENT: a second apply plans 'none', writes nothing, changes no row; a foreign/unknown id is not_found
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew; API=http://127.0.0.1:54321
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
CO="00000000-0000-4000-8000-00000000aab1"; P1="00000000-0000-4000-8000-00000000b101"; CL_SOLE="00000000-0000-5000-8000-00000000b111"; CL_JOINT="00000000-0000-5000-8000-00000000b112"
REASON="operator_corrected:guard_excerpt"; ACTOR="operator_corrected:guard_excerpt (guard)"
psql() { docker exec -i "$DB" psql -U postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
cleanup() { psql "select set_claim_status(id, 'active', 'guard cleanup', 'guard') from claims where company_id='$CO' and status='struck'" >/dev/null 2>&1 || true; psql "begin; set local app.remint_ledger_purge='on'; delete from provenance_remints where company_id='$CO'; delete from companies where id='$CO'; delete from claim_removals where company_id='$CO'; commit;" >/dev/null || true; }
retire() { curl -s --max-time 600 -X POST "$API/functions/v1/retire-proposals" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "$1"; }
cleanup
psql "insert into companies (id, name, created_by) values ('$CO', 'ZZ throwaway retire-signals guard', (select id from auth.users order by created_at limit 1))" >/dev/null
psql "insert into file_proposals (id, company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, evidence, framework_results, candidate_needs, candidate_job_steps, candidate_outcomes, possible_routes, experiments_to_run, contradictions, questions_to_verify, processing_completed_at) values ('$P1','$CO',null,'mojo-analysis-guard','mojo_analysis','s','document','pending','ready','[]','[]','[]','[]','[]','[]','[]','[]','[]', now())" >/dev/null
SIG() { psql "insert into signals (company_id, source_id, source_type, source_title, signal_band, evidence_type, claim_text, evidence_excerpt, topic, framework, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload) values ('$CO','$P1','mojo_analysis','guard','organization','internal_data','$1','$1','unknown','dify_contradiction','inferred','partial','interpreted','contradicted','medium','{\"claim\":\"$1\",\"conflicts_with\":\"\"}') returning id" | head -1; }
S_A=$(SIG "Claimed adoption high, but lacks direct evidence."); S_B=$(SIG "Advantage assumed without proof."); S_KEEP=$(SIG "Kept row.")
psql "insert into claims (id, company_id, statement, topic, claim_type, provenance, state, organization_support_count, triangulation_state, confidence) values ('$CL_SOLE','$CO','Sole.','strategy','observation','internal_declared','diagnose',1,'single_source','medium'), ('$CL_JOINT','$CO','Joint.','strategy','observation','internal_declared','diagnose',2,'single_source','medium')" >/dev/null
psql "insert into claim_signal_refs (company_id, claim_id, signal_id, relationship) values ('$CO','$CL_SOLE','$S_A','supports'), ('$CO','$CL_JOINT','$S_B','supports'), ('$CO','$CL_JOINT','$S_KEEP','supports')" >/dev/null
BEFORE=$(psql "select md5(string_agg(row_to_json(s)::text, ',' order by id)) from signals s where company_id='$CO'")
# f
DRY=$(retire "{\"company_id\":\"$CO\",\"signal_ids\":[\"$S_A\",\"$S_B\",\"00000000-0000-4000-8000-00000000dead\"],\"reason\":\"$REASON\",\"dry_run\":true}")
echo "$DRY" | grep -q '"mode":"signals"' || fail f "dry run: $(echo "$DRY" | head -c 200)"
[ "$(psql "select md5(string_agg(row_to_json(s)::text, ',' order by id)) from signals s where company_id='$CO'")" = "$BEFORE" ] || fail f "dry run changed a signal"
[ "$(psql "select count(*) from provenance_remints where company_id='$CO'")" = 0 ] || fail f "dry run wrote a ledger row"
python3 - "$DRY" "$S_A" "$CL_SOLE" <<'PY' || fail f "plan mismatch"
import json,sys; d=json.loads(sys.argv[1]); by={p['signal_id']:p for p in d['plans']}
assert by[sys.argv[2]]['change']=='retire' and [c['id'] for c in by[sys.argv[2]]['struck_claim_ids']]==[sys.argv[3]], by[sys.argv[2]]
assert by['00000000-0000-4000-8000-00000000dead']['change']=='not_found'
assert sum(len(p['struck_claim_ids']) for p in d['plans'])==1, "joint claim must not be struck"
print("f. dry run: 2 retire (1 sole-backed claim to strike, joint claim stands), 1 not_found; nothing written")
PY
# apply
R1=$(retire "{\"company_id\":\"$CO\",\"signal_ids\":[\"$S_A\",\"$S_B\"],\"reason\":\"$REASON\",\"actor\":\"$ACTOR\",\"note\":\"guard\",\"dry_run\":false}")
echo "$R1" | grep -q '"dry_run":false' || fail apply "$(echo "$R1" | head -c 300)"
# h
[ "$(psql "select count(*) from signals where company_id='$CO' and id in ('$S_A','$S_B') and superseded_reason='$REASON' and raw_payload->'superseded_by_retirement'->>'from'='live' and raw_payload->'superseded_by_retirement'->>'to'='retired' and raw_payload->'superseded_by_retirement'->>'actor'='$ACTOR' and raw_payload->>'claim'=claim_text and claim_text<>''")" = 2 ] || fail h "named signals not retained as readable history"
[ "$(psql "select count(*) from signals where company_id='$CO' and id='$S_KEEP' and superseded_at is null and raw_payload ? 'superseded_by_retirement' = false")" = 1 ] || fail h "the unnamed signal was touched"
echo "h. history: both named signals superseded with reason/from-to/actor, interpretation intact; unnamed signal untouched"
# s
[ "$(psql "select status||'|'||coalesce(struck_by,'')||'|'||coalesce(struck_reason,'') from claims where id='$CL_SOLE'")" = "struck|$ACTOR|$REASON" ] || fail s "sole claim: $(psql "select status, struck_by, struck_reason from claims where id='$CL_SOLE'")"
[ "$(psql "select count(*) from claim_signal_refs where claim_id='$CL_SOLE'")" = 1 ] || fail s "struck claim lost its refs"
[ "$(psql "select count(*) from claim_events where claim_id='$CL_SOLE' and triggered_by_event='status:active->struck'")" = 1 ] || fail s "no claim_events row"
[ "$(psql "select status from claims where id='$CL_JOINT'")" = active ] || fail s "joint claim was struck"
echo "s. sole-backed claim struck (refs kept, event written); joint claim stands"
# l
[ "$(psql "select count(*) from provenance_remints where company_id='$CO' and kind='retirement' and reason='$REASON' and proposal_id='$P1' and array_length(superseded_signal_ids,1)=1 and array_length(minted_signal_ids,1) is null")" = 2 ] || fail l "ledger: $(psql "select kind, reason, proposal_id, superseded_signal_ids from provenance_remints where company_id='$CO'")"
echo "l. ledger: one retirement row per signal, proposal_id = source, nothing minted"
# a
SNAP=$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || (select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'))")
R2=$(retire "{\"company_id\":\"$CO\",\"signal_ids\":[\"$S_A\",\"$S_B\"],\"reason\":\"$REASON\",\"actor\":\"$ACTOR\",\"dry_run\":false}")
python3 - "$R2" <<'PY' || fail a "second apply changed something"
import json,sys; d=json.loads(sys.argv[1])
assert all(p['change']=='none' for p in d['plans']) and all(a['superseded']==0 and a['struck']==0 and a['ledger_id'] is None for a in d['applied']), d
print("a. idempotent: second apply planned 'none', superseded 0, struck 0, ledger none")
PY
[ "$(psql "select count(*) from provenance_remints where company_id='$CO'")" = 2 ] || fail a "second apply wrote a ledger row"
[ "$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || (select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'))")" = "$SNAP" ] || fail a "second apply changed a row"
cleanup; echo "GUARD OK"
