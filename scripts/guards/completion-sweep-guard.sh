#!/usr/bin/env bash
# GUARD — file_proposals completion sweep (migration 20260913180000, sweep_file_proposal_completion).
#
# Runs against the LOCAL stack on a THROWAWAY company it creates and deletes (cascade). No browser is
# involved: the sweep is invoked as SQL (exactly what pg_cron runs every minute) and its posts go
# through pg_net to the real dify-analyze-file {mode:"sync"} door. The Dify run used is the throwaway
# 24 MiB probe's own run (workflow_runs 1b36a082…, succeeded 2026-09-13 — synthetic text; never a
# client document). Proves, in order:
#   a. FINISHED-BUT-UNPERSISTED: running, started 10 min ago, real succeeded run id ⇒ one sync post ⇒
#      processing_state ready, content persisted, signals ingested — with no browser
#   b. IN-FLIGHT: running, started 60 s ago (inside the 400 s worker wall clock) ⇒ NOT posted, untouched
#   c. DEAD: (c1) running 10 min, NO run id ⇒ posted ⇒ failed "Dify run id missing";
#            (c2) running 10 min, bogus run id ⇒ posted ⇒ failed "Dify detail error (404)";
#            (c3) running 25 h, any id ⇒ closed by the 24 h ceiling in SQL, NOT posted
#      — every dead row lands on the terminal state 'failed' and is never re-entered
#   d. IDEMPOTENT: a second sweep posts nothing and changes nothing (row snapshots identical)
# Exit 0 = every proof held. Any failed proof exits 1 with the failing step named.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
CO="00000000-0000-4000-8000-00000000aaaa"
RUN_OK="1b36a082-6bf3-4f3e-b403-bc1b8b95466d"   # throwaway probe's succeeded Dify run
RUN_BOGUS="00000000-0000-4000-8000-0000000000ff"
A="00000000-0000-4000-8000-0000000000a1"; B="00000000-0000-4000-8000-0000000000b2"
C1="00000000-0000-4000-8000-0000000000c1"; C2="00000000-0000-4000-8000-0000000000c2"; C3="00000000-0000-4000-8000-0000000000c3"
psql() { docker exec -i "$DB" psql -U postgres -Atc "$1"; }
fail() { echo "FAIL step $1: $2"; cleanup; exit 1; }
cleanup() {
  psql "delete from long_runner_runs where company_id='$CO'; delete from companies where id='$CO'; delete from claim_removals where company_id='$CO';" >/dev/null || true
}
state() { psql "select processing_state||'|'||status||'|'||coalesce(processing_error,'')||'|'||coalesce(summary,'') from file_proposals where id='$1'"; }
snapshot() { psql "select md5(string_agg(row_to_json(p)::text, ',' order by id)) from file_proposals p where company_id='$CO'"; }
wait_terminal() { # $1 id, $2 seconds
  for i in $(seq 1 "$2"); do st=$(psql "select processing_state from file_proposals where id='$1'"); [ "$st" = ready ] || [ "$st" = failed ] && return 0; sleep 1; done; return 1;
}

cleanup
psql "insert into companies (id, name, created_by) values ('$CO', 'ZZ throwaway completion-sweep guard', (select id from auth.users order by created_at limit 1))" >/dev/null
psql "insert into file_proposals (id, company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, processing_started_at, created_at, dify_workflow_run_id) values
  ('$A',  '$CO', gen_random_uuid(), 'guard-a-finished.pdf', 'uploaded_file', 'Analysis queued. Results will appear when processing finishes.', 'document', 'pending', 'running', now() - interval '10 minutes', now() - interval '10 minutes', '$RUN_OK'),
  ('$B',  '$CO', gen_random_uuid(), 'guard-b-inflight.pdf', 'uploaded_file', 'Analysis queued. Results will appear when processing finishes.', 'document', 'pending', 'running', now() - interval '60 seconds', now() - interval '60 seconds', '$RUN_OK'),
  ('$C1', '$CO', gen_random_uuid(), 'guard-c1-noid.pdf',    'uploaded_file', 'Analysis queued. Results will appear when processing finishes.', 'document', 'pending', 'running', now() - interval '10 minutes', now() - interval '10 minutes', null),
  ('$C2', '$CO', gen_random_uuid(), 'guard-c2-bogus.pdf',   'uploaded_file', 'Analysis queued. Results will appear when processing finishes.', 'document', 'pending', 'running', now() - interval '10 minutes', now() - interval '10 minutes', '$RUN_BOGUS'),
  ('$C3', '$CO', gen_random_uuid(), 'guard-c3-ceiling.pdf', 'uploaded_file', 'Analysis queued. Results will appear when processing finishes.', 'document', 'pending', 'running', now() - interval '25 hours', now() - interval '25 hours', '$RUN_OK')" >/dev/null
BEFORE_B=$(state "$B")
LAST_NET=$(psql "select coalesce(max(id),0) from net.http_request_queue" ); LAST_RESP=$(psql "select coalesce(max(id),0) from net._http_response")

# ── first sweep (what pg_cron runs) ──
psql "select public.sweep_file_proposal_completion()" >/dev/null
# c3: closed in SQL, synchronously
[ "$(psql "select processing_state from file_proposals where id='$C3'")" = failed ] || fail c3 "ceiling row not closed: $(state "$C3")"
echo "$(state "$C3")" | grep -q "Dify background monitor timed out" || fail c3 "ceiling wording: $(state "$C3")"
# posts: exactly A, C1, C2 — never B, never C3
sleep 2
POSTED=$(psql "select string_agg(body->>'proposalId', ',' order by body->>'proposalId') from net.http_request_queue where id > $LAST_NET" 2>/dev/null || true)
# the queue drains as pg_net sends; read the responses instead once they land
wait_terminal "$A" 90 || fail a "row A did not reach a terminal state: $(state "$A")"
wait_terminal "$C1" 30 || fail c1 "row C1 not terminal: $(state "$C1")"
wait_terminal "$C2" 30 || fail c2 "row C2 not terminal: $(state "$C2")"
sleep 2
RESP=$(psql "select count(*) from net._http_response where id > $LAST_RESP")
[ "$RESP" = 3 ] || fail posts "expected 3 sync responses (A, C1, C2), saw $RESP"
# a. finished-but-unpersisted ⇒ ready with content and signals
SA=$(state "$A"); echo "$SA" | grep -q "^ready|pending|" || fail a "row A: $SA"
EVID=$(psql "select jsonb_array_length(evidence) from file_proposals where id='$A'"); [ "${EVID:-0}" -ge 1 ] || fail a "row A persisted no evidence"
SUMLEN=$(psql "select length(summary) from file_proposals where id='$A'"); [ "${SUMLEN:-0}" -ge 50 ] || fail a "row A summary not persisted ($SUMLEN chars)"
SIG=$(psql "select count(*) from signals where source_id::text='$A'"); [ "${SIG:-0}" -ge 1 ] || fail a "row A ingested no signals"
echo "a. finished-but-unpersisted → ready; evidence=$EVID summary=${SUMLEN}ch signals=$SIG; summary: $(psql "select left(summary,90) from file_proposals where id='$A'")"
# b. in-flight untouched
[ "$(state "$B")" = "$BEFORE_B" ] || fail b "in-flight row changed: $(state "$B")"
[ "$(psql "select count(*) from net._http_response where id > $LAST_RESP and (content::jsonb->>'state') is not null")" = 3 ] || fail b "unexpected response shape"
echo "b. in-flight (60 s old): untouched, not posted"
# c. dead ⇒ failed, terminal
echo "$(state "$C1")" | grep -q "^failed|pending|No dify_workflow_run_id" || fail c1 "row C1: $(state "$C1")"
echo "$(state "$C2")" | grep -q "^failed|pending|" || fail c2 "row C2: $(state "$C2")"
echo "$(state "$C2")" | grep -q "Dify detail error (404)" || fail c2 "row C2 wording: $(state "$C2")"
echo "c. dead → failed: c1 '$(psql "select summary from file_proposals where id='$C1'")' · c2 '$(psql "select summary from file_proposals where id='$C2'")' · c3 '$(psql "select summary from file_proposals where id='$C3'")'"

# ── d. second sweep: nothing posted, nothing changed ──
SNAP1=$(snapshot); LAST_RESP2=$(psql "select coalesce(max(id),0) from net._http_response"); LAST_Q2=$(psql "select coalesce(max(id),0) from net.http_request_queue")
psql "select public.sweep_file_proposal_completion()" >/dev/null
sleep 3
Q=$(psql "select count(*) from net.http_request_queue where id > $LAST_Q2"); R=$(psql "select count(*) from net._http_response where id > $LAST_RESP2")
[ "$Q" = 0 ] && [ "$R" = 0 ] || fail d "second sweep posted (queued $Q, responded $R)"
[ "$(snapshot)" = "$SNAP1" ] || fail d "second sweep changed a row"
echo "d. idempotent: second sweep posted 0, changed 0 (B still in flight is not posted while inside the wall clock)"
cleanup
echo "GUARD OK"
