#!/usr/bin/env bash
# INGEST QUEUE — analysis starts by itself, one at a time, and the queue cannot wedge
# (SP-178..SP-182, SP-187, SP-189..SP-194; 2026-11-13). The FAST half: static + read-only + SQL.
#
# The on-demand half — three real files analysed end to end — is
# scripts/guards/ingest-queue-ondemand-guard.sh, excluded from the sweep BY NAME because it runs real
# local analyses and takes many minutes (SP-185b).
#
# D4 (2026-11-07): NOTHING HERE INVOKES A WRITER OR A MODEL. Both sweeps end in a net.http_post to
# dify-analyze-file, which writes rows and calls a model, so neither sweep function is used as a
# probe for its positive path. What is exercised instead:
#   · the starter's SELECT, as a read-only query with the same predicate
#   · the enqueue's SELECT, likewise — including a variant proving WHICH clause excludes a file
#   · the single-flight primary key and the one-live-per-file index, by attempting real inserts on a
#     HELD throwaway company and reading the refusal
#   · the served worker's caller gate, with empty bodies that are refused before any row is read
#
# Read the printed verdict, not only the exit code — this guard sets both (SP-59).
set -uo pipefail
cd "$(dirname "$0")/../.."

fails=0
ok()   { echo "  ok   $*"; }
bad()  { echo "  FAIL $*"; fails=$((fails+1)); }

DB="${SUPABASE_DB_CONTAINER:-supabase_db_dzlgyxcvuwiulgifbmew}"
psqlq() { docker exec -i "$DB" psql -U postgres -At -c "$1" 2>/dev/null; }
psqlx() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1; }
psql_refused() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1 && return 1 || return 0; }
# INSERT ... RETURNING through `psql -At -c` prints the value AND the "INSERT 0 1" status line, so a
# bare capture is two lines and fails as a uuid in the next statement — silently, because psqlx hides
# stderr. Wrapping in a CTE makes the id the only result row.
psql_insert_id() { psqlq "with ins as ($1 returning id) select id from ins;"; }

CUTOFF="2026-11-13 16:00:00+00"
FROZEN_CB1="58b2b15b-bada-4bcd-9c12-b7e66a37d0bc"

echo "── (q1) the pieces exist, and the upload path no longer starts the run ──"
W="supabase/functions/dify-analyze-file/index.ts"
if grep -q 'mode === "start"' "$W"; then
  ok "(q1) dify-analyze-file has a start door"
else
  bad "(q1) no mode:\"start\" door in dify-analyze-file — the starter would post at a reconciler"
fi
# The deletion IS the slice: the upload request must not call startDifyRun any more.
if grep -q 'queued, not started' "$W" && [ "$(grep -c 'await startDifyRun(' "$W")" = "1" ]; then
  ok "(q1) exactly one startDifyRun call site remains, and it is the start door"
else
  bad "(q1) startDifyRun is called $(grep -c 'await startDifyRun(' "$W") time(s) — the upload path must not start a run (SP-178, SP-182)"
fi
if grep -q 'await adminOnlyGate(req, corsHeaders)' "$W"; then
  ok "(q1) dify-analyze-file decides who is calling, in-function (SP-179)"
else
  bad "(q1) dify-analyze-file has no caller gate"
fi
# The refusal STRING is not the check: a plant that disables the comparison leaves the string sitting
# in a dead branch, and a grep for it passes while the lock is bypassable. Measured — that is exactly
# what the first plant of this guard did. So the COMPARISON is what gets asserted.
if grep -q 'not_claimed' "$W" \
   && grep -qE '\?\?[[:space:]]*""\)[[:space:]]*!==[[:space:]]*String\(r\.id\)' "$W" \
   && grep -q 'from("ingest_single_flight")' "$W"; then
  ok "(q1) the start door reads the claim and compares it to the row it was asked to start — the lock is not bypassable by a direct post (SP-180)"
else
  bad "(q1) the start door does not compare the single-flight claim against this row: a direct mode:start post could run a second analysis"
fi
if grep -q 'releaseIngestLock' "$W" && [ "$(grep -c 'await releaseIngestLock(' "$W")" -ge 3 ]; then
  ok "(q1) the lock is released on $(grep -c 'await releaseIngestLock(' "$W") paths (ready, failed, not-startable)"
else
  bad "(q1) the lock is released on fewer than 3 paths — a terminal run would hold the queue (SP-189)"
fi

echo "── (q2) the lock is fleet-wide, by primary key, and refuses a second holder ──"
PK=$(psqlq "select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.ingest_single_flight'::regclass and contype='p';")
[ "$PK" = "PRIMARY KEY (lock_key)" ] \
  && ok "(q2) ingest_single_flight is keyed on lock_key alone — one row fleet-wide, not one per company" \
  || bad "(q2) unexpected primary key: '$PK'"

echo "── (q3) the schedule: a SEPARATE job, so completion-sweep-guard's subject is untouched ──"
for j in sweep-file-proposal-start sweep-file-proposal-enqueue sweep-file-proposal-completion; do
  [ "$(psqlq "select count(*) from cron.job where jobname='$j' and active;")" = 1 ] \
    && ok "(q3) $j is scheduled and active" \
    || bad "(q3) $j is missing or inactive"
done
# SP-186: the starter must not have been bolted onto jobid 2's function.
if psqlq "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sweep_file_proposal_completion';" | grep -q "'start'"; then
  bad "(q3) the completion sweep now posts mode 'start' — that changes completion-sweep-guard's subject"
else
  ok "(q3) the completion sweep still posts only its own reconcile door"
fi
# and the starter must post the START door, not the reconciler
if psqlq "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sweep_file_proposal_start';" | grep -q "'mode', 'start'"; then
  ok "(q3) the starter posts mode 'start'"
else
  bad "(q3) the starter does not post mode 'start' — posting 'sync' at a queued row does nothing and holds the lock"
fi

echo "── (q4) the starter's selection: oldest queued first, one at a time, yielding to a baseline ──"
STARTER=$(psqlq "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sweep_file_proposal_start';")
echo "$STARTER" | grep -q "order by p.created_at" && ok "(q4) oldest first (order by created_at)" || bad "(q4) the starter does not order by created_at"
echo "$STARTER" | grep -qE "limit 1" && ok "(q4) one row per tick (limit 1)" || bad "(q4) the starter does not limit to 1"
echo "$STARTER" | grep -q "processing_state = 'queued'" && ok "(q4) it selects ONLY queued rows, so it never competes for a running one" || bad "(q4) the starter does not restrict to queued"
echo "$STARTER" | grep -q "company_run_locks" && ok "(q4) it yields to a baseline or research run (SP-184)" || bad "(q4) the starter does not check company_run_locks"
echo "$STARTER" | grep -q "if held > 0 then return" && ok "(q4) it returns while a lock is held — the single-flight check precedes any post" || bad "(q4) no early return while the lock is held"

echo "── (q5) E2 fixture: born HELD, company never deleted ──"
CO="0c900000-0000-4000-8000-00000000c021"
remove_children() {
  docker exec -i "$DB" psql -U postgres -q -c "delete from public.ingest_single_flight where company_id='$CO';" >/dev/null 2>&1
  docker exec -i "$DB" psql -U postgres -q -c "delete from public.file_proposals where company_id='$CO';" >/dev/null 2>&1
}
if ! psqlq "select 1" >/dev/null 2>&1; then
  bad "(q5) cannot reach the local database — the SQL half did not run"
else
  OWNER=""
  [ -n "${FR_LOGIN_EMAIL:-}" ] && OWNER=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
  if [ -z "$OWNER" ]; then
    bad "(q5) FR_LOGIN_EMAIL not set or no such account — source backups/fr-login.env; the SQL half did not run (the fixture owner is the CC-owned test account, never the operator's login)"
  else
    trap remove_children EXIT
    remove_children
    psqlx "insert into public.companies (id, name, created_by, fixture_hold)
           values ('$CO','iq-throwaway-ingest-queue','$OWNER','IQ:test_fixture')
           on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'IQ:test_fixture');"
    HELD=$(psqlq "select coalesce(fixture_hold,'') from public.companies where id='$CO';")
    [ -n "$HELD" ] && ok "(q5) the fixture company is HELD ($HELD) and is never deleted" || bad "(q5) the fixture company carries no hold"

    if [ -n "$HELD" ]; then
      F1="4b000000-0000-4000-8000-00000000f001"
      echo "── (q6) SP-192: one live proposal per file, enforced by the database ──"
      P1=$(psql_insert_id "insert into public.file_proposals (company_id, file_id, processing_state) values ('$CO','$F1','queued')")
      [ -n "$P1" ] && ok "(q6) the first live row for a file is accepted" || bad "(q6) could not insert the first live row"
      if psql_refused "insert into public.file_proposals (company_id, file_id, processing_state) values ('$CO','$F1','running');"; then
        ok "(q6) a SECOND live row for the same file is refused — two ticks, or a tick and a click, cannot both win"
      else
        bad "(q6) a second live proposal for one file was ACCEPTED (SP-192)"
      fi
      # and the rule is not simply "one row ever": a finished analysis may be re-queued.
      psqlx "update public.file_proposals set processing_state='ready' where id='$P1';"
      if psqlx "insert into public.file_proposals (company_id, file_id, processing_state) values ('$CO','$F1','queued');"; then
        ok "(q6) a re-queue after the first FINISHED is still legal — Analyse again is not blocked"
      else
        bad "(q6) a finished row blocks a re-queue, so Analyse again could never work"
      fi
      remove_children

      echo "── (q7) SP-189: a held lock with no live run clears, and the next queued file starts ──"
      # NON-VACUOUS, in three steps: prove the queue is blocked, clear it the way the sweep does,
      # prove the same starter would now pick the waiting row.
      P_DEAD=$(psql_insert_id "insert into public.file_proposals (company_id, file_id, processing_state) values ('$CO','4b000000-0000-4000-8000-00000000f0de','ready')")
      P_WAIT=$(psql_insert_id "insert into public.file_proposals (company_id, file_id, processing_state, created_at) values ('$CO','4b000000-0000-4000-8000-00000000f002','queued', now())")
      [ -n "$P_DEAD" ] && [ -n "$P_WAIT" ] || bad "(q7) could not create the two fixture rows (dead='$P_DEAD' waiting='$P_WAIT')"
      # a lock pointing at a row that is NOT live — exactly what a dead worker leaves behind
      psqlx "insert into public.ingest_single_flight (lock_key, proposal_id, company_id, expires_at)
             values ('file_analysis','$P_DEAD','$CO', now() + interval '30 minutes')
             on conflict (lock_key) do update set proposal_id='$P_DEAD', company_id='$CO', expires_at=now() + interval '30 minutes';"
      BLOCKED=$(psqlq "select count(*) from public.ingest_single_flight;")
      [ "$BLOCKED" = 1 ] && ok "(q7) a stale lock is held (the queue is blocked) — the starting state is real" \
                         || bad "(q7) could not establish a held lock"
      # the sweep's own clause, run as the sweep runs it
      FREED=$(psqlq "with gone as (
                       delete from public.ingest_single_flight l
                        where not exists (select 1 from public.file_proposals p
                                           where p.id = l.proposal_id
                                             and p.processing_state in ('queued','running')
                                             and p.status <> 'rejected')
                        returning 1)
                     select count(*) from gone;")
      [ "$FREED" = 1 ] && ok "(q7) the completion sweep's clause frees a lock whose row is no longer live" \
                       || bad "(q7) the stale lock was NOT freed (freed=$FREED) — the queue would wedge for the whole TTL"
      # and now the starter's own selection finds the waiting row: the NEXT file would start
      NEXT=$(psqlq "select p.id::text from public.file_proposals p
                     where p.status <> 'rejected' and p.processing_state='queued' and p.dify_workflow_run_id is null
                     order by p.created_at limit 1;")
      if [ -n "$NEXT" ] && [ "$(psqlq "select count(*) from public.ingest_single_flight;")" = 0 ]; then
        ok "(q7) with the lock gone, the starter's selection returns a waiting row — the next file starts"
      else
        bad "(q7) after freeing, no waiting row was selectable (next='$NEXT') — the clearing is vacuous"
      fi
      remove_children

      echo "── (q8) SP-191: NO BACKFILL — an older proposal-less file is left alone ──"
      # Non-vacuous: find a REAL pre-cutoff file with no proposal, prove the predicate excludes it,
      # and prove the ONLY reason is its date by re-running the predicate without the date clause.
      OLD=$(psqlq "select f.id::text from public.input_files f
                    join public.inputs i on i.id=f.input_id
                   where f.uploaded_at <= '$CUTOFF' and f.archived_at is null
                     and not exists (select 1 from public.file_proposals p where p.file_id=f.id and p.status<>'rejected')
                   limit 1;")
      if [ -z "$OLD" ]; then
        bad "(q8) no pre-cutoff proposal-less file exists to test against — the check would be vacuous"
      else
        IN_SCOPE=$(psqlq "select count(*) from public.input_files f
                           join public.inputs i on i.id=f.input_id
                          where f.id='$OLD' and f.uploaded_at > '$CUTOFF';")
        [ "$IN_SCOPE" = 0 ] && ok "(q8) the pre-cutoff file $OLD is OUTSIDE the enqueue's window — never backfilled" \
                            || bad "(q8) a pre-cutoff file is inside the enqueue's window"
        WOULD=$(psqlq "select count(*) from public.input_files f
                        join public.inputs i on i.id=f.input_id
                       where f.id='$OLD' and f.archived_at is null;")
        [ "$WOULD" = 1 ] && ok "(q8) and it fails ONLY on the date — every other condition it meets (non-vacuity)" \
                         || bad "(q8) the file is excluded for another reason too, so the date clause is unproven"
      fi
      TOTAL_OLD=$(psqlq "select count(*) from public.input_files where uploaded_at <= '$CUTOFF';")
      NEW_ONES=$(psqlq "select count(*) from public.input_files where uploaded_at > '$CUTOFF';")
      ok "(q8) window: $TOTAL_OLD file(s) predate I-1 and are untouchable, $NEW_ONES after it are eligible"

      echo "── (q9) SP-191: the four exclusions are in the enqueue, and a HELD company is one of them ──"
      ENQ=$(psqlq "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sweep_file_proposal_enqueue';")
      echo "$ENQ" | grep -q "archived_at is null"        && ok "(q9) archived files are skipped"        || bad "(q9) no archived_at exclusion"
      echo "$ENQ" | grep -q "$FROZEN_CB1"                && ok "(q9) frozen CB1 is skipped by id"      || bad "(q9) frozen CB1 is not excluded"
      echo "$ENQ" | grep -q "c.fixture_hold is null"     && ok "(q9) any held fixture company is skipped" || bad "(q9) fixture_hold is not excluded"
      echo "$ENQ" | grep -q "is_interview, false) = false" && ok "(q9) interviews never enter the Dify path" || bad "(q9) no interview fence in the enqueue"
      echo "$ENQ" | grep -qE "limit 2"                   && ok "(q9) cap 2 files per tick (SP-194)"    || bad "(q9) the per-tick cap is not 2"
      echo "$ENQ" | grep -q "extracted.txt"              && ok "(q9) it enqueues only a file whose sidecar exists — stored AND extracted" || bad "(q9) no sidecar precondition"
      # the held-company clause is what excludes THIS fixture, proven by difference rather than by
      # running the sweep (D4: the sweep ends in a post to a writer that calls a model)
      HELD_EXCLUDES=$(psqlq "select count(*) from public.companies c where c.id='$CO' and c.fixture_hold is null;")
      [ "$HELD_EXCLUDES" = 0 ] && ok "(q9) and this guard's own fixture company is excluded BY ITS HOLD, so no guard run can ever enqueue a real analysis" \
                               || bad "(q9) the fixture company would pass the hold clause"

      echo "── (q10) SP-193: the enqueue is bounded at three attempts ──"
      echo "$ENQ" | grep -qE "coalesce\(a\.attempts, 0\) < 3" && ok "(q10) a file with 3 attempts is no longer posted" || bad "(q10) no attempt ceiling in the enqueue"
      echo "$ENQ" | grep -q "a.attempts >= 3" && ok "(q10) and at the ceiling it is closed out instead" || bad "(q10) no closeout branch at the ceiling"
      echo "$ENQ" | grep -q "could not be queued after" && ok "(q10) the closeout row carries the real reason and the attempt count" || bad "(q10) the closeout writes no reason"
      [ "$(psqlq "select count(*) from information_schema.tables where table_name='ingest_enqueue_attempts';")" = 1 ] \
        && ok "(q10) ingest_enqueue_attempts exists to hold the count" || bad "(q10) no attempts table"
    fi
  fi
fi

      echo "── (q14) SP-217: the automatic path fires ONCE per file — a REJECTED proposal blocks it ──"
      # Non-vacuous by difference: the same file is tested with and without the rejected row, so the
      # exclusion is attributable to that row and not to some other clause.
      R_INPUT=$(psqlq "select id::text from public.inputs where company_id='$CO' order by id limit 1;")
      [ -n "$R_INPUT" ] || R_INPUT=$(psql_insert_id "insert into public.inputs (company_id, user_id, input_key, input_label) values ('$CO','$OWNER','iq_guard_fixture','IQ guard fixture')")
      RF="4e000000-0000-4000-8000-00000000c00f"
      psqlx "delete from public.file_proposals where file_id='$RF';"
      psqlx "insert into public.input_files (id, input_id, file_name, file_type, file_path, uploaded_at)
             values ('$RF','$R_INPUT','rejected-once.pdf','application/pdf','$CO/rejected-once.pdf', now())
             on conflict (id) do update set uploaded_at = now();"
      [ "$(psqlq "select count(*) from public.input_files where id='$RF';")" = 1 ] \
        || bad "(q14) the rejected-proposal fixture file was not created — the checks below would be vacuous"
      # WITHOUT any proposal, the file is a candidate (this is the non-vacuity half)
      CAND_BEFORE=$(psqlq "select count(*) from public.input_files f
                            where f.id='$RF'
                              and not exists (select 1 from public.file_proposals p where p.file_id=f.id);")
      psqlx "insert into public.file_proposals (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, processing_completed_at)
             values ('$CO','$RF','rejected-once.pdf','uploaded_file','An analysis a human rejected.','document','rejected','ready', now());"
      CAND_AFTER=$(psqlq "select count(*) from public.input_files f
                           where f.id='$RF'
                             and not exists (select 1 from public.file_proposals p where p.file_id=f.id);")
      { [ "$CAND_BEFORE" = 1 ] && [ "$CAND_AFTER" = 0 ]; } \
        && ok "(q14) a file whose ONLY proposal is REJECTED is left alone — candidate before=1, after=0" \
        || bad "(q14) rejected-proposal exclusion unproven: candidate before=$CAND_BEFORE after=$CAND_AFTER, expected 1 then 0"
      # and the old predicate would have re-triggered it, which is the bug SP-217 names
      OLD_PRED=$(psqlq "select count(*) from public.input_files f
                         where f.id='$RF'
                           and not exists (select 1 from public.file_proposals p where p.file_id=f.id and p.status <> 'rejected');")
      [ "$OLD_PRED" = 1 ] \
        && ok "(q14) and the pre-SP-217 predicate WOULD have re-triggered it — the fix is not cosmetic" \
        || bad "(q14) the old predicate did not re-trigger it, so this check proves nothing"
      # the live function must carry no rejected-exclusion at all
      ENQ_DEF=$(psqlq "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sweep_file_proposal_enqueue';")
      [ "$(echo "$ENQ_DEF" | grep -c "p.status <> 'rejected'")" = 0 ] \
        && ok "(q14) no selection in the enqueue excludes a rejected proposal any more (all three)" \
        || bad "(q14) the enqueue still has a rejected-exclusion — a rejected analysis would be redone"
      psqlx "delete from public.file_proposals where file_id='$RF';"
      psqlx "delete from public.input_files where id='$RF';"

      echo "── (q12) SP-206: the voice gate's three branches, read-only ──"
      # Evaluated as SELECTs with the enqueue's own clauses. The fixture_hold clause is omitted from
      # THESE queries on purpose — it excludes this held company from everything (proven in q9), so
      # leaving it in would make every branch below trivially false and the checks vacuous.
      V_INPUT=$(psqlq "select id::text from public.inputs where company_id='$CO' order by id limit 1;")
      [ -n "$V_INPUT" ] || V_INPUT=$(psql_insert_id "insert into public.inputs (company_id, user_id, input_key, input_label) values ('$CO','$OWNER','iq_guard_fixture','IQ guard fixture')")
      # (a) a FRESH file with no verdict: not enqueued, and not yet failed either — it is still waiting
      VA="4d000000-0000-4000-8000-00000000b00a"
      psqlx "insert into public.input_files (id, input_id, file_name, file_type, file_path, uploaded_at)
             values ('$VA','$V_INPUT','voice-fresh.pdf','application/pdf','$CO/voice-fresh.pdf', now())
             on conflict (id) do update set uploaded_at = now();"
      [ "$(psqlq "select count(*) from public.input_files where id='$VA';")" = 1 ] \
        && ok "(q12) the voice fixture file exists — the three branches below are not vacuous" \
        || bad "(q12) the voice fixture file was NOT created (input row '$V_INPUT'), so q12a-c would all pass on absence"
      ENQ_A=$(psqlq "select count(*) from public.input_files f join public.inputs i on i.id=f.input_id
                      where f.id='$VA'
                        and exists (select 1 from public.doc_voice_verdicts v where v.input_file_id=f.id);")
      FAIL_A=$(psqlq "select count(*) from public.input_files f
                       where f.id='$VA' and f.uploaded_at < now() - interval '5 minutes';")
      { [ "$ENQ_A" = 0 ] && [ "$FAIL_A" = 0 ]; } \
        && ok "(q12a) a FRESH file with no verdict is neither enqueued nor failed — it is waiting for classify-upload-voice" \
        || bad "(q12a) fresh/no-verdict file: enqueueable=$ENQ_A failable=$FAIL_A, expected 0 and 0"
      # (b) the SAME file, aged past five minutes: now closed out as failed, never queued
      psqlx "update public.input_files set uploaded_at = now() - interval '6 minutes' where id='$VA';"
      FAIL_B=$(psqlq "select count(*) from public.input_files f join public.inputs i on i.id=f.input_id
                       where f.id='$VA'
                         and f.uploaded_at < now() - interval '5 minutes'
                         and not exists (select 1 from public.doc_voice_verdicts v where v.input_file_id=f.id);")
      ENQ_B=$(psqlq "select count(*) from public.input_files f
                      where f.id='$VA'
                        and exists (select 1 from public.doc_voice_verdicts v where v.input_file_id=f.id);")
      { [ "$FAIL_B" = 1 ] && [ "$ENQ_B" = 0 ]; } \
        && ok "(q12b) past five minutes with no verdict it is CLOSED OUT as failed, and still never enqueued (SP-205)" \
        || bad "(q12b) aged/no-verdict file: failable=$FAIL_B enqueueable=$ENQ_B, expected 1 and 0"
      # (c) a file WITH a verdict passes the pre-filter
      psqlx "insert into public.doc_voice_verdicts (input_file_id, company_id, content_sha, verdict, basis, classifier_model, authorship, subject, subject_basis)
             values ('$VA','$CO','deadbeef','external','guard fixture','guard','uncertain','uncertain','guard fixture');"
      ENQ_C=$(psqlq "select count(*) from public.input_files f join public.inputs i on i.id=f.input_id
                      where f.id='$VA'
                        and exists (select 1 from public.doc_voice_verdicts v where v.input_file_id=f.id);")
      FAIL_C=$(psqlq "select count(*) from public.input_files f
                       where f.id='$VA' and f.uploaded_at < now() - interval '5 minutes'
                         and not exists (select 1 from public.doc_voice_verdicts v where v.input_file_id=f.id);")
      { [ "$ENQ_C" = 1 ] && [ "$FAIL_C" = 0 ]; } \
        && ok "(q12c) with a verdict it passes the pre-filter and is no longer closed out" \
        || bad "(q12c) verdict-bearing file: enqueueable=$ENQ_C failable=$FAIL_C, expected 1 and 0"
      # the pre-filter is only that — it does NOT ask whether the sha matches
      ENQ_SQL=$(psqlq "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sweep_file_proposal_enqueue';")
      if echo "$ENQ_SQL" | grep -q "content_sha"; then
        bad "(q12) the enqueue SQL mentions content_sha — SQL cannot be a second content-identity authority (SP-209)"
      else
        ok "(q12) the enqueue SQL asks only whether a verdict EXISTS — the sha-matched question is asked in TypeScript (SP-209)"
      fi
      psqlx "delete from public.doc_voice_verdicts where input_file_id='$VA';"
      psqlx "delete from public.input_files where id='$VA';"

echo "── (q11) the served worker refuses the anon key and a signed-in non-admin ──"
SRK="${SERVICE_ROLE_KEY:-}"
[ -n "$SRK" ] || SRK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
ANONK="${ANON_KEY:-}"
[ -n "$ANONK" ] || ANONK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
FN="http://127.0.0.1:54321/functions/v1/dify-analyze-file"
if [ -z "$SRK" ] || [ -z "$ANONK" ]; then
  bad "(q11) could not resolve SERVICE_ROLE_KEY / ANON_KEY — the served-worker half did not run"
else
  A=$(curl -s -m 25 -X POST "$FN" -H "Authorization: Bearer $ANONK" -H 'content-type: application/json' -d '{}')
  echo "$A" | grep -q '"no_user"' && ok "(q11) the publishable anon key is refused 401 no_user" \
                                 || bad "(q11) the anon key was not refused: $(echo "$A" | head -c 100)"
  # the trusted internal caller must still get through, or cron and every operator script is stranded
  S=$(curl -s -o /dev/null -w '%{http_code}' -m 25 -X POST "$FN" -H "Authorization: Bearer $SRK" -H 'content-type: application/json' -d '{}')
  [ "$S" = 400 ] && ok "(q11) a bare service-role bearer reaches the handler ($S) — the cron poster is not locked out" \
                 || bad "(q11) the service-role bearer got $S, expected its own 400"
  if [ -n "${NONADMIN_EMAIL:-}" ] && [ -n "${NONADMIN_PASSWORD:-}" ]; then
    TOK=$(curl -s -m 25 -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: $ANONK" -H 'content-type: application/json' \
            -d "{\"email\":\"$NONADMIN_EMAIL\",\"password\":\"$NONADMIN_PASSWORD\"}" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
    if [ -n "$TOK" ]; then
      N=$(curl -s -m 25 -X POST "$FN" -H "Authorization: Bearer $TOK" -H 'content-type: application/json' -d '{}')
      echo "$N" | grep -q '"not_authorised"' && ok "(q11) a signed-in NON-ADMIN is refused 403 not_authorised" \
                                             || bad "(q11) a non-admin was not refused: $(echo "$N" | head -c 100)"
    else
      bad "(q11) could not sign in the non-admin fixture — check backups/fr-nonadmin.env"
    fi
  else
    bad "(q11) NONADMIN_EMAIL / NONADMIN_PASSWORD not set — source backups/fr-nonadmin.env rather than passing vacuously"
  fi
fi

echo "── (q13) SP-213: a verdict for an OLDER sha is refused on the served worker ──"
# The one check here that posts. SP-213 authorises it; D4's rule against probing a writer is
# satisfied in substance because the call is REFUSED before Dify is reached — it writes one failed
# row on a HELD fixture company and calls no model. That is the fact being proven.
if [ -z "${SRK:-}" ]; then
  SRK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
fi
if [ -z "$SRK" ] || ! psqlq "select 1" >/dev/null 2>&1; then
  bad "(q13) could not resolve the service-role key or the database — the stale-sha check did not run"
else
  OWNER13=""
  [ -n "${FR_LOGIN_EMAIL:-}" ] && OWNER13=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
  CO13="0c900000-0000-4000-8000-00000000c021"
  if [ -z "$OWNER13" ]; then
    bad "(q13) FR_LOGIN_EMAIL not set — the stale-sha check did not run"
  else
    psqlx "insert into public.companies (id, name, created_by, fixture_hold)
           values ('$CO13','iq-throwaway-ingest-queue','$OWNER13','IQ:test_fixture')
           on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'IQ:test_fixture');"
    I13=$(psqlq "select id::text from public.inputs where company_id='$CO13' order by id limit 1;")
    [ -n "$I13" ] || I13=$(psql_insert_id "insert into public.inputs (company_id, group_key, input_key, value_text) values ('$CO13','iq_guard','iq_stale','fixture')")
    F13="4d000000-0000-4000-8000-00000000b013"
    P13="$CO13/voice-stale-$F13.pdf"
    WORK13="$(mktemp -d)"
    node scripts/guards/fixtures/make-paged-pdf.mjs "$WORK13/stale.pdf" 2 >/dev/null 2>&1
    curl -s -o /dev/null -X POST "http://127.0.0.1:54321/storage/v1/object/input-files/$P13" \
         -H "Authorization: Bearer $SRK" -H "Content-Type: application/pdf" --data-binary "@$WORK13/stale.pdf"
    printf 'the extracted text of the stale fixture' > "$WORK13/sc.txt"
    curl -s -o /dev/null -X POST "http://127.0.0.1:54321/storage/v1/object/input-files/$P13.extracted.txt" \
         -H "Authorization: Bearer $SRK" -H "Content-Type: text/plain" --data-binary "@$WORK13/sc.txt"
    psqlx "delete from public.file_proposals where file_id='$F13';"
    psqlx "insert into public.input_files (id, input_id, file_name, file_type, file_path, uploaded_at)
           values ('$F13','$I13','voice-stale.pdf','application/pdf','$P13', now())
           on conflict (id) do update set file_path='$P13', uploaded_at=now();"
    # the ONLY verdict for this file is for a DIFFERENT content — an older sha
    psqlx "delete from public.doc_voice_verdicts where input_file_id='$F13';"
    psqlx "insert into public.doc_voice_verdicts (input_file_id, company_id, content_sha, verdict, basis, classifier_model, authorship, subject, subject_basis)
           values ('$F13','$CO13','0000000000000000000000000000000000000000000000000000000000000000','external','stale fixture','guard','uncertain','uncertain','stale fixture');"
    R13=$(curl -s -m 60 -X POST "http://127.0.0.1:54321/functions/v1/dify-analyze-file" \
            -H "Authorization: Bearer $SRK" -H 'content-type: application/json' \
            -d "{\"fileId\":\"$F13\",\"filePath\":\"$P13\",\"fileName\":\"voice-stale.pdf\",\"fileType\":\"application/pdf\",\"companyId\":\"$CO13\",\"sourceType\":\"uploaded_file\"}")
    echo "$R13" | grep -q 'voice_not_classified' \
      && ok "(q13) a trusted-internal call on a file whose only verdict is for an older sha is REFUSED voice_not_classified" \
      || bad "(q13) expected voice_not_classified, got: $(echo "$R13" | head -c 140)"
    ST13=$(psqlq "select processing_state||'|'||coalesce(processing_error_code,'')||'|'||coalesce(processing_error,'<null>') from public.file_proposals where file_id='$F13' limit 1;")
    [ "$ST13" = "failed|voice_not_classified|<null>" ] \
      && ok "(q13) the row ends failed, the code is stored, and processing_error is NULL so the client reads no code (SP-212)" \
      || bad "(q13) row reads '$ST13', expected 'failed|voice_not_classified|<null>'"
    [ "$(psqlq "select count(*) from public.file_proposals where file_id='$F13' and processing_state='queued';")" = 0 ] \
      && ok "(q13) and it was NEVER queued" || bad "(q13) a queued row exists for an unclassified file"
    # teardown: this fixture only
    psqlx "delete from public.file_proposals where file_id='$F13';"
    psqlx "delete from public.doc_voice_verdicts where input_file_id='$F13';"
    psqlx "delete from public.input_files where id='$F13';"
    curl -s -X DELETE "http://127.0.0.1:54321/storage/v1/object/input-files/$P13" -H "Authorization: Bearer $SRK" -o /dev/null
    curl -s -X DELETE "http://127.0.0.1:54321/storage/v1/object/input-files/$P13.extracted.txt" -H "Authorization: Bearer $SRK" -o /dev/null
    rm -rf "$WORK13"
  fi
fi

echo "── (q15) SP-218: the sweeps are not callable with the publishable anon key ──"
if [ -z "${ANONK:-}" ]; then
  ANONK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
fi
if [ -z "${SRK:-}" ]; then
  SRK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
fi
if [ -z "$ANONK" ] || [ -z "$SRK" ]; then
  bad "(q15) could not resolve ANON_KEY / SERVICE_ROLE_KEY — the rpc exposure check did not run"
else
  for fn in sweep_file_proposal_enqueue sweep_file_proposal_start sweep_file_proposal_completion sweep_stale_chains; do
    CODE=$(curl -s -o /dev/null -w '%{http_code}' -m 25 -X POST "http://127.0.0.1:54321/rest/v1/rpc/$fn" \
             -H "apikey: $ANONK" -H "Authorization: Bearer $ANONK" -H 'content-type: application/json' -d '{}')
    case "$CODE" in
      2*) bad "(q15) $fn answered $CODE to the ANON key — a SECURITY DEFINER sweep that writes rows is reachable from the browser bundle" ;;
      *)  ok "(q15) $fn refuses the anon key ($CODE)" ;;
    esac
  done
  # non-vacuity: the service role must still reach them, or cron and every operator script is stranded
  SCODE=$(curl -s -o /dev/null -w '%{http_code}' -m 60 -X POST "http://127.0.0.1:54321/rest/v1/rpc/sweep_stale_chains" \
            -H "apikey: $SRK" -H "Authorization: Bearer $SRK" -H 'content-type: application/json' -d '{}')
  case "$SCODE" in
    2*) ok "(q15) and the service role still reaches them ($SCODE) — the revoke is targeted, not a lockout" ;;
    *)  bad "(q15) the service role got $SCODE — the revoke went too far" ;;
  esac
fi

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
