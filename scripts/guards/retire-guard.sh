#!/usr/bin/env bash
# GUARD — retirement of proposals by operator decision (mechanism signed 2026-09-14; retire-proposals).
#
# Runs against the LOCAL stack on a THROWAWAY company it creates and deletes (cascade) — never a client
# company, never a client document. Seeds three proposals with live organization-band signals:
#   P_FILE  — file_id set, input_files row present (a normal proposal)
#   P_GONE  — file_id set, input_files row DELETED (the orphan shape)
#   P_NONE  — no file_id at all (the June-4 shape)
#   P_KEEP  — a proposal NOT named in the batch (its signals must be untouched)
# plus claims: CL_SOLE backed only by P_GONE, CL_JOINT backed by P_GONE and P_KEEP, CL_OLD standing only
# on an already-superseded signal. Proves, in order:
#   d. DRY RUN writes nothing (no ledger row, no superseded signal, no strike) and names every proposal
#   r. REASON: a reason that is not <who>:<what> is refused (400) — the constant is not an operator reason
#   c. REACH: the no-file_id proposal and the gone-file proposal are both retired
#   b. HISTORY: retired signals survive with superseded_reason=<reason> and from/to + actor in raw_payload;
#      the struck claim keeps its refs, provenance, state and gets a claim_events row with the same reason/actor
#   j. JOINT: a claim with a live ref outside the batch is NOT struck; a claim on already-dead signals only is not this run's
#   n. NOTHING MINTED, NOTHING DELETED: signal/claim/ref counts unchanged; no minting_version 2 row; P_KEEP untouched
#   l. LEDGER: one 'retirement' row per retired proposal carrying the reason verbatim
#   a. IDEMPOTENT: the second apply supersedes 0, strikes 0, writes no ledger row, changes no signal or claim
# Exit 0 = every proof held.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
API=http://127.0.0.1:54321
SR=$(supabase status -o env 2>/dev/null | grep -E '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
CO="00000000-0000-4000-8000-00000000aaad"
IN="00000000-0000-4000-8000-00000000ac01"
F_FILE="00000000-0000-4000-8000-00000000ac10"; F_GONE="00000000-0000-4000-8000-00000000ac20"; F_KEEP="00000000-0000-4000-8000-00000000ac40"
P_FILE="00000000-0000-4000-8000-00000000ac11"; P_GONE="00000000-0000-4000-8000-00000000ac21"; P_NONE="00000000-0000-4000-8000-00000000ac31"; P_KEEP="00000000-0000-4000-8000-00000000ac41"
CL_SOLE="00000000-0000-5000-8000-00000000ac12"; CL_JOINT="00000000-0000-5000-8000-00000000ac22"; CL_OLD="00000000-0000-5000-8000-00000000ac32"
REASON="operator_retired:guard_ingest"; ACTOR="operator_retired:guard_ingest (guard)"
psql() { docker exec -i "$DB" psql -U postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
cleanup() {
  psql "select set_claim_status(id, 'active', 'guard cleanup', 'guard') from claims where company_id='$CO' and status='struck'" >/dev/null 2>&1 || true
  psql "begin; set local app.remint_ledger_purge = 'on'; delete from provenance_remints where company_id='$CO'; delete from long_runner_runs where company_id='$CO'; delete from companies where id='$CO'; delete from claim_removals where company_id='$CO'; commit;" >/dev/null || true
}
retire() { curl -s --max-time 600 -X POST "$API/functions/v1/retire-proposals" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "$1"; }
BATCH="[\"$P_FILE\",\"$P_GONE\",\"$P_NONE\"]"

cleanup
psql "insert into companies (id, name, created_by) values ('$CO', 'ZZ throwaway retire guard', (select id from auth.users order by created_at limit 1))" >/dev/null
psql "insert into inputs (id, company_id, user_id, input_key, input_label) values ('$IN', '$CO', (select id from auth.users order by created_at limit 1), 'zz_retire', 'ZZ retire')" >/dev/null
psql "insert into input_files (id, input_id, file_name, file_type, file_path, tags) values ('$F_FILE','$IN','guard-file.md','text/markdown','zz-throwaway/retire/file.md','{}'), ('$F_GONE','$IN','guard-gone.md','text/markdown','zz-throwaway/retire/gone.md','{}'), ('$F_KEEP','$IN','guard-keep.md','text/markdown','zz-throwaway/retire/keep.md','{}')" >/dev/null
for pair in "$P_FILE:'$F_FILE':guard-file.md" "$P_GONE:'$F_GONE':guard-gone.md" "$P_NONE:null:guard-none.md" "$P_KEEP:'$F_KEEP':guard-keep.md"; do pid=${pair%%:*}; rest=${pair#*:}; fid=${rest%%:*}; name=${rest#*:}
  psql "insert into file_proposals (id, company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, evidence, framework_results, candidate_needs, candidate_job_steps, candidate_outcomes, possible_routes, experiments_to_run, contradictions, questions_to_verify, processing_completed_at) values ('$pid','$CO',$fid,'$name','uploaded_file','Families wait three weeks.','document','pending','ready','[\"Families wait three weeks.\"]','[]','[]','[]','[]','[]','[]','[]','[]', now())" >/dev/null
  psql "insert into signals (company_id, source_id, source_type, source_title, signal_band, evidence_type, claim_text, evidence_excerpt, topic, framework, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload) values
    ('$CO','$pid','uploaded_file','$name','organization','internal_data','Families wait three weeks ($name).','Families wait three weeks.','strategy',null,'inferred','strong','extracted','unvalidated','medium','{\"seed\":true}'),
    ('$CO','$pid','uploaded_file','$name','organization','internal_data','Summary of $name','Summary of $name','strategy','dify_summary','inferred','strong','interpreted','unvalidated','medium','{\"seed\":true}')" >/dev/null
done
# the orphan shape: the input_files row is gone, the proposal keeps its file_id (FK is nullable / not enforced on delete? — mirror reality: delete the row)
psql "delete from input_files where id='$F_GONE'" >/dev/null
[ "$(psql "select file_id::text from file_proposals where id='$P_GONE'")" = "$F_GONE" ] || fail seed "the gone-file proposal lost its file_id on input_files delete (shape differs from the Edgewood orphans)"
SIG_GONE=$(psql "select id from signals where company_id='$CO' and source_id='$P_GONE' and structure_level='extracted'")
SIG_KEEP=$(psql "select id from signals where company_id='$CO' and source_id='$P_KEEP' and structure_level='extracted'")
# an already-superseded signal (earlier history) for CL_OLD
SIG_OLD="00000000-0000-6000-8000-00000000ac33"; psql "insert into signals (id, company_id, source_id, source_type, source_title, signal_band, evidence_type, claim_text, evidence_excerpt, topic, directness, framing_fit, structure_level, validation_status, confidence_to_use, raw_payload, superseded_at, superseded_reason) values ('$SIG_OLD','$CO','$P_GONE','uploaded_file','guard-gone.md','organization','internal_data','Old reading','Old reading','strategy','inferred','strong','extracted','unvalidated','medium','{}', now(), 'remint_authorship_v2')" >/dev/null
for pair in "$CL_SOLE:sole" "$CL_JOINT:joint" "$CL_OLD:old"; do cid=${pair%%:*}; k=${pair#*:}
  psql "insert into claims (id, company_id, statement, topic, claim_type, provenance, state, organization_support_count, triangulation_state, confidence) values ('$cid','$CO','Guard claim $k.','strategy','observation','internal_declared','diagnose',1,'single_source','medium')" >/dev/null; done
psql "insert into claim_signal_refs (company_id, claim_id, signal_id, relationship) values ('$CO','$CL_SOLE','$SIG_GONE','supports'), ('$CO','$CL_JOINT','$SIG_GONE','supports'), ('$CO','$CL_JOINT','$SIG_KEEP','supports'), ('$CO','$CL_OLD','$SIG_OLD','supports')" >/dev/null
COUNTS() { psql "select (select count(*) from signals where company_id='$CO')||'|'||(select count(*) from claims where company_id='$CO')||'|'||(select count(*) from claim_signal_refs where company_id='$CO')||'|'||(select count(*) from file_proposals where company_id='$CO')"; }
BEFORE=$(COUNTS)

# ── d. dry run writes nothing ──
DRY=$(retire "{\"company_id\":\"$CO\",\"proposal_ids\":$BATCH,\"reason\":\"$REASON\",\"dry_run\":true}")
echo "$DRY" | grep -q '"dry_run":true' || fail d "dry run failed: $(echo "$DRY" | head -c 300)"
[ "$(psql "select count(*) from provenance_remints where company_id='$CO'")" = 0 ] || fail d "dry run wrote a ledger row"
[ "$(psql "select count(*) from signals where company_id='$CO' and superseded_reason='$REASON'")" = 0 ] || fail d "dry run superseded a signal"
[ "$(psql "select count(*) from claims where company_id='$CO' and status='struck'")" = 0 ] || fail d "dry run struck a claim"
set +e; python3 - "$DRY" "$P_FILE" "$P_GONE" "$P_NONE" "$CL_SOLE" <<'PY'
import json,sys; d=json.loads(sys.argv[1]); by={p['proposal_id']:p for p in d['plans']}
for pid in sys.argv[2:5]:
    p=by[pid]; assert p['found'] and p['change']=='retire' and p['live_signals']==2, p
assert by[sys.argv[4]]['file_id'] is None, by[sys.argv[4]]
struck=[c['id'] for p in d['plans'] for c in p['struck_claim_ids']]
assert struck==[sys.argv[5]], struck
print("d. dry run: 3 proposals planned (2 live signals each, incl. no-file_id and gone-file), strike = the sole-backed claim only; nothing written")
PY
[ $? = 0 ] || fail d "plan mismatch (see traceback above)"; set -e

# ── r. reason validated ──
BAD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/functions/v1/retire-proposals" -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "{\"company_id\":\"$CO\",\"proposal_ids\":$BATCH,\"reason\":\"remint_authorship_v2\",\"dry_run\":true}")
[ "$BAD" = 400 ] || fail r "a non-operator reason was accepted (HTTP $BAD)"
echo "r. reason: 'remint_authorship_v2' refused with 400 — only <who>:<what> operator reasons apply"

# ── apply ──
R1=$(retire "{\"company_id\":\"$CO\",\"proposal_ids\":$BATCH,\"reason\":\"$REASON\",\"actor\":\"$ACTOR\",\"note\":\"guard\",\"dry_run\":false}")
echo "$R1" | grep -q '"dry_run":false' || fail apply "$(echo "$R1" | head -c 300)"
# c. reach
for pid in $P_NONE $P_GONE $P_FILE; do [ "$(psql "select count(*) from signals where company_id='$CO' and source_id='$pid' and superseded_at is null")" = 0 ] || fail c "proposal $pid still has live signals"; done
echo "c. reach: the no-file_id proposal and the gone-file proposal are retired alongside the normal one"
# b. history
[ "$(psql "select count(*) from signals where company_id='$CO' and source_id in ('$P_FILE','$P_GONE','$P_NONE') and superseded_reason='$REASON' and raw_payload->'superseded_by_retirement'->>'from'='live' and raw_payload->'superseded_by_retirement'->>'to'='retired' and raw_payload->'superseded_by_retirement'->>'actor'='$ACTOR' and raw_payload->>'seed'='true'")" = 6 ] || fail b "retired signals not retained as readable history (reason / from-to / actor / prior payload)"
[ "$(psql "select status||'|'||coalesce(struck_by,'')||'|'||coalesce(struck_reason,'')||'|'||provenance||'|'||state from claims where id='$CL_SOLE'")" = "struck|$ACTOR|$REASON|internal_declared|diagnose" ] || fail b "claim not struck with the operator reason/actor, or provenance/state edited: $(psql "select status, struck_by, struck_reason, provenance, state from claims where id='$CL_SOLE'")"
[ "$(psql "select count(*) from claim_signal_refs where claim_id='$CL_SOLE'")" = 1 ] || fail b "the struck claim lost its refs"
[ "$(psql "select count(*) from claim_events where claim_id='$CL_SOLE' and triggered_by_event='status:active->struck'")" = 1 ] || fail b "no claim_events row for the strike"
echo "b. history: 6 signals superseded (reason, from/to, actor, prior payload kept); claim struck via set_claim_status — refs kept, provenance/state untouched, event recorded"
# j. joint / old
[ "$(psql "select status from claims where id='$CL_JOINT'")" = active ] || fail j "a claim with a live ref outside the batch was struck"
[ "$(psql "select status from claims where id='$CL_OLD'")" = active ] || fail j "a claim standing only on pre-existing superseded history was struck by this run"
echo "j. joint: the claim also backed by an unretired proposal stands; the claim on older history is not this run's"
# n. nothing minted, nothing deleted
[ "$(COUNTS)" = "$BEFORE" ] || fail n "counts changed: before $BEFORE after $(COUNTS) (something minted or deleted)"
[ "$(psql "select count(*) from signals where company_id='$CO' and raw_payload->>'minting_version'='2'")" = 0 ] || fail n "a minting_version 2 row appeared (re-ingest ran)"
[ "$(psql "select count(*) from signals where company_id='$CO' and source_id='$P_KEEP' and superseded_at is null")" = 2 ] || fail n "the unnamed proposal's signals were touched"
echo "n. nothing minted, nothing deleted: signal/claim/ref/proposal counts unchanged, no minting_version 2 row, unnamed proposal untouched"
# l. ledger
[ "$(psql "select count(*) from provenance_remints where company_id='$CO' and kind='retirement' and reason='$REASON' and actor='$ACTOR' and dry_run=false and array_length(superseded_signal_ids,1)=2 and array_length(minted_signal_ids,1) is null")" = 3 ] || fail l "expected 3 retirement ledger rows with the reason verbatim: $(psql "select kind, reason, actor, array_length(superseded_signal_ids,1) from provenance_remints where company_id='$CO'")"
[ "$(psql "select proposal_id::text from provenance_remints where company_id='$CO' and struck_claim_ids @> array['$CL_SOLE'::uuid]")" = "$P_GONE" ] || fail l "the strike is not attributed to the proposal that backed the claim"
echo "l. ledger: one 'retirement' row per proposal, reason verbatim, strike attributed to its proposal"
# a. idempotent
SNAP=$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || (select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'))")
R2=$(retire "{\"company_id\":\"$CO\",\"proposal_ids\":$BATCH,\"reason\":\"$REASON\",\"actor\":\"$ACTOR\",\"dry_run\":false}")
set +e; python3 - "$R2" <<'PY'
import json,sys; d=json.loads(sys.argv[1])
assert all(p['change']=='none' and p['live_signals']==0 for p in d['plans']), d['plans']
assert all(a['superseded']==0 and a['struck']==0 and a['ledger_id'] is None for a in d['applied']), d['applied']
print("a. idempotent: second apply planned 'none' for every proposal, superseded 0, struck 0, ledger none")
PY
[ $? = 0 ] || fail a "second apply changed something (see traceback above)"; set -e
[ "$(psql "select count(*) from provenance_remints where company_id='$CO'")" = 3 ] || fail a "second apply wrote a ledger row"
[ "$(psql "select md5((select string_agg(row_to_json(s)::text, ',' order by id) from signals s where company_id='$CO') || (select string_agg(row_to_json(c)::text, ',' order by id) from claims c where company_id='$CO'))")" = "$SNAP" ] || fail a "second apply changed a signal or claim"
cleanup
echo "GUARD OK"
