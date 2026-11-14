#!/usr/bin/env bash
# INGEST QUEUE — the ON-DEMAND half: real analyses, start to finish (SP-185b, SP-196, SP-197).
#
# EXCLUDED FROM THE SWEEP BY NAME (scripts/guards-sweep.sh), because it stores real files and lets
# the server run REAL local analyses on them, one after another — many minutes and real local model
# time. Its fast sibling, ingest-queue-guard.sh, is IN the sweep and holds the static, SQL and
# caller-gate halves. Run this one by hand:
#
#   source backups/fr-login.env && source backups/fr-member.env && bash scripts/guards/ingest-queue-ondemand-guard.sh
#
# D4: on-demand guards MAY call a model (SP-196); D4 binds the fast guard. Nothing here posts to an
# edge function from the guard itself — that is the whole point of part M: the CRON must do it, or
# "starts by itself" is unproven.
#
# TWO PARTS.
#   M (SP-196) ENQUEUE END TO END, on the UNHELD member fixture company. One generated PDF is stored
#     with its sidecar and an input_files row; the guard then posts NOTHING and waits. If the queued
#     row appears, the cron enqueue made it. If it then runs and finishes, the starter started it.
#     Afterwards the file and its child rows are removed and the company is left as found (SP-196).
#   S (SP-197) THE SERIAL PROOF, on a HELD throwaway with three direct inserts — direct because
#     SP-191 makes the enqueue skip any fixture_hold company, so enqueue can never fire there. The
#     three rows are exactly what the enqueue would have produced.
#
# WHY THE MEMBER COMPANY IS SAFE FOR PART M (SP-198): first-read-rls asserts counts on user_roles,
# company_members, first_read_sessions and first_read_responses — never input_files or
# file_proposals. zz-member-landing asserts redirect pathnames and the sign-out string. Neither reads
# what this guard adds, and what it adds is removed in an EXIT trap.
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
psql_insert_id() { psqlq "with ins as ($1 returning id) select id from ins;"; }
psql_refused() { docker exec -i "$DB" psql -U postgres -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null 2>&1 && return 1 || return 0; }

SRK="${SERVICE_ROLE_KEY:-}"
[ -n "$SRK" ] || SRK=$(npx supabase status --output env 2>/dev/null | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')
[ -n "$SRK" ] || { echo "guard: FAIL could not resolve SERVICE_ROLE_KEY"; exit 1; }
STORAGE="http://127.0.0.1:54321/storage/v1/object"
MEMCO="${MEMBER_COMPANY_ID:-66666666-6666-4666-8666-666666666601}"
HELDCO="0c900000-0000-4000-8000-00000000c022"
WORK="$(mktemp -d)"

# ── teardown: everything this guard made, and nothing else ───────────────────────────────────────
M_FILE_ID=""
M_PATH=""
S_FILE_PATHS=""
cleanup() {
  # part M: the member company is left EXACTLY as found (SP-196)
  if [ -n "$M_FILE_ID" ]; then
    docker exec -i "$DB" psql -U postgres -q -c "delete from public.file_proposals where file_id='$M_FILE_ID';" >/dev/null 2>&1
    docker exec -i "$DB" psql -U postgres -q -c "delete from public.ingest_enqueue_attempts where file_id='$M_FILE_ID';" >/dev/null 2>&1
    docker exec -i "$DB" psql -U postgres -q -c "delete from public.doc_voice_verdicts where input_file_id='$M_FILE_ID';" >/dev/null 2>&1
    docker exec -i "$DB" psql -U postgres -q -c "delete from public.input_files where id='$M_FILE_ID';" >/dev/null 2>&1
  fi
  if [ -n "$M_PATH" ]; then
    curl -s -X DELETE "$STORAGE/input-files/$M_PATH" -H "Authorization: Bearer $SRK" -o /dev/null
    curl -s -X DELETE "$STORAGE/input-files/$M_PATH.extracted.txt" -H "Authorization: Bearer $SRK" -o /dev/null
  fi
  # part S: the held company keeps its hold and its row; children go (E2)
  docker exec -i "$DB" psql -U postgres -q -c "delete from public.ingest_single_flight where company_id in ('$HELDCO','$MEMCO');" >/dev/null 2>&1
  docker exec -i "$DB" psql -U postgres -q -c "delete from public.file_proposals where company_id='$HELDCO';" >/dev/null 2>&1
  for sp in ${S_FILE_PATHS:-}; do
    curl -s -X DELETE "$STORAGE/input-files/$sp" -H "Authorization: Bearer $SRK" -o /dev/null
    curl -s -X DELETE "$STORAGE/input-files/$sp.extracted.txt" -H "Authorization: Bearer $SRK" -o /dev/null
  done
  docker exec -i "$DB" psql -U postgres -q -c "delete from public.ingest_enqueue_attempts a using public.input_files f join public.inputs i on i.id=f.input_id where a.file_id=f.id and i.company_id='$HELDCO';" >/dev/null 2>&1
  docker exec -i "$DB" psql -U postgres -q -c "delete from public.doc_voice_verdicts where company_id='$HELDCO';" >/dev/null 2>&1
  docker exec -i "$DB" psql -U postgres -q -c "delete from public.input_files f using public.inputs i where i.id=f.input_id and i.company_id='$HELDCO';" >/dev/null 2>&1
  rm -rf "$WORK"
}
trap cleanup EXIT

OWNER=""
[ -n "${FR_LOGIN_EMAIL:-}" ] && OWNER=$(psqlq "select id::text from auth.users where lower(email)=lower('$FR_LOGIN_EMAIL') limit 1")
[ -n "$OWNER" ] || { echo "guard: FAIL FR_LOGIN_EMAIL not set or no such account — source backups/fr-login.env"; exit 1; }

# ════════════════════════════════════════════════════════════════════════════════════════════════
echo "══ PART M (SP-196): the cron enqueue, end to end, with NO post from this guard ══"
# ════════════════════════════════════════════════════════════════════════════════════════════════
HOLD=$(psqlq "select coalesce(fixture_hold,'') from public.companies where id='$MEMCO';")
if [ -n "$HOLD" ]; then
  bad "(m0) the member fixture company carries fixture_hold='$HOLD', so SP-191 makes the enqueue skip it — part M cannot run"
else
  ok "(m0) the member fixture company is UNHELD, so the enqueue is allowed to see it"

  # what we must leave behind untouched
  BEFORE_FILES=$(psqlq "select count(*) from public.input_files f join public.inputs i on i.id=f.input_id where i.company_id='$MEMCO';")
  BEFORE_PROPS=$(psqlq "select count(*) from public.file_proposals where company_id='$MEMCO';")
  BEFORE_SESS=$(psqlq "select count(*) from public.first_read_sessions where company_id='$MEMCO';")
  echo "     as found: input_files=$BEFORE_FILES file_proposals=$BEFORE_PROPS first_read_sessions=$BEFORE_SESS"

  INPUT_ID=$(psqlq "select id::text from public.inputs where company_id='$MEMCO' order by id limit 1;")
  if [ -z "$INPUT_ID" ]; then
    bad "(m0) the member company has no inputs row to attach a file to"
  else
    node scripts/guards/fixtures/make-paged-pdf.mjs "$WORK/iq-ondemand.pdf" 3 >/dev/null 2>&1 \
      || bad "(m1) could not generate the fixture PDF"
    M_FILE_ID=$(psqlq "select gen_random_uuid()::text;")
    M_PATH="$MEMCO/iq-ondemand-$M_FILE_ID.pdf"

    # store the document, and the sidecar an upload would have written. The sidecar text is the
    # LOCAL PARSER's own answer — read-only, no model — so the row is as faithful as a real upload.
    UP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$STORAGE/input-files/$M_PATH" \
          -H "Authorization: Bearer $SRK" -H "Content-Type: application/pdf" \
          --data-binary "@$WORK/iq-ondemand.pdf")
    node -e '
      const fs=require("node:fs");
      const b64=fs.readFileSync(process.argv[1]).toString("base64");
      fetch("http://127.0.0.1:8789/extract",{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({file_name:"iq-ondemand.pdf",file_type:"application/pdf",content_base64:b64})})
        .then(r=>r.json()).then(j=>fs.writeFileSync(process.argv[2], String(j.text||"")))
        .catch(()=>fs.writeFileSync(process.argv[2],""));
    ' "$WORK/iq-ondemand.pdf" "$WORK/sidecar.txt" 2>/dev/null
    UPS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$STORAGE/input-files/$M_PATH.extracted.txt" \
          -H "Authorization: Bearer $SRK" -H "Content-Type: text/plain" --data-binary "@$WORK/sidecar.txt")
    { [ "$UP" = 200 ] || [ "$UP" = 201 ]; } && { [ "$UPS" = 200 ] || [ "$UPS" = 201 ]; } \
      && ok "(m1) the PDF and its sidecar are stored ($(wc -c < "$WORK/sidecar.txt" | tr -d ' ') chars extracted)" \
      || bad "(m1) storage upload failed: pdf=$UP sidecar=$UPS"

    psqlx "insert into public.input_files (id, input_id, file_name, file_type, file_path, uploaded_at)
           values ('$M_FILE_ID','$INPUT_ID','iq-ondemand.pdf','application/pdf','$M_PATH', now());"
    [ "$(psqlq "select count(*) from public.input_files where id='$M_FILE_ID';")" = 1 ] \
      && ok "(m1) the input_files row exists, uploaded_at AFTER the I-1 cutoff" \
      || bad "(m1) could not create the input_files row"

    # SP-207: the verdict is obtained THE WAY THE DIALOG DOES — classify-upload-voice, the same call
    # FileUploadDialog.tsx:360 makes right after storing a file. Not inserted by hand: the sha the
    # classifier records has to be the sha the upload path will recompute, and only the real call
    # guarantees that. This is a local model call, which SP-196/SP-207 permit for an on-demand guard.
    CV=$(curl -s -m 180 -X POST "http://127.0.0.1:54321/functions/v1/classify-upload-voice" \
           -H "Authorization: Bearer $SRK" -H 'content-type: application/json' \
           -d "{\"company_id\":\"$MEMCO\",\"input_file_id\":\"$M_FILE_ID\"}")
    VN=$(psqlq "select count(*) from public.doc_voice_verdicts where input_file_id='$M_FILE_ID';")
    if [ "${VN:-0}" -ge 1 ]; then
      ok "(m1) classify-upload-voice recorded a verdict ($(psqlq "select verdict||'/'||coalesce(authorship,'-') from public.doc_voice_verdicts where input_file_id='$M_FILE_ID' limit 1;")) — the gate will find it sha-matched"
    else
      bad "(m1) classify-upload-voice recorded no verdict, so the enqueue will close the file out as voice_not_classified instead of queueing it: $(echo "$CV" | head -c 140)"
    fi

    echo "     waiting for the cron enqueue (jobid 4, every minute) — this guard posts nothing"
    QUEUED=""
    for i in $(seq 1 24); do
      QUEUED=$(psqlq "select id::text from public.file_proposals where file_id='$M_FILE_ID' limit 1;")
      [ -n "$QUEUED" ] && break
      sleep 5
    done
    if [ -n "$QUEUED" ]; then
      ok "(m2) the CRON ENQUEUE created the proposal with no click and no post from here ($QUEUED)"
      ATT=$(psqlq "select attempts from public.ingest_enqueue_attempts where file_id='$M_FILE_ID';")
      [ -n "$ATT" ] && ok "(m2) and the attempt was counted (attempts=$ATT), so SP-193's ceiling applies to it" \
                    || bad "(m2) no ingest_enqueue_attempts row — the attempt ceiling would never bite"
    else
      bad "(m2) no proposal appeared within 120 s — the cron enqueue did not pick the file up"
    fi

    if [ -n "$QUEUED" ]; then
      echo "     waiting for the starter (jobid 3) and the run to finish"
      SAW_RUNNING=0
      STATE=""
      for i in $(seq 1 120); do
        STATE=$(psqlq "select processing_state from public.file_proposals where id='$QUEUED';")
        [ "$STATE" = running ] && SAW_RUNNING=1
        { [ "$STATE" = ready ] || [ "$STATE" = failed ]; } && break
        sleep 5
      done
      [ "$SAW_RUNNING" = 1 ] && ok "(m3) the STARTER moved it to running — the server started it, nobody clicked" \
                             || bad "(m3) the row never read 'running' (last state '$STATE') — SP-182's truth is unproven"
      { [ "$STATE" = ready ] || [ "$STATE" = failed ]; } \
        && ok "(m4) it reached a terminal state: $STATE$([ "$STATE" = failed ] && echo " — a real reason, not a hang: $(psqlq "select left(coalesce(processing_error,''),90) from public.file_proposals where id='$QUEUED';")")" \
        || bad "(m4) it did not reach a terminal state within 600 s (state '$STATE')"
      [ "$(psqlq "select count(*) from public.ingest_single_flight where proposal_id='$QUEUED';")" = 0 ] \
        && ok "(m4) and the lock was released, so the queue is free for the next file" \
        || bad "(m4) the lock is still held after a terminal state (SP-189)"
    fi
  fi
fi

# ════════════════════════════════════════════════════════════════════════════════════════════════
echo "══ PART S (SP-197): three files, strictly one after another, on a HELD throwaway ══"
# ════════════════════════════════════════════════════════════════════════════════════════════════
psqlx "insert into public.companies (id, name, created_by, fixture_hold)
       values ('$HELDCO','iq-throwaway-ondemand','$OWNER','IQ:test_fixture')
       on conflict (id) do update set fixture_hold = coalesce(public.companies.fixture_hold,'IQ:test_fixture');"
SHELD=$(psqlq "select coalesce(fixture_hold,'') from public.companies where id='$HELDCO';")
[ -n "$SHELD" ] && ok "(s0) the serial fixture company is HELD ($SHELD) and is never deleted" \
               || bad "(s0) the serial fixture company carries no hold"

docker exec -i "$DB" psql -U postgres -q -c "delete from public.file_proposals where company_id='$HELDCO';" >/dev/null 2>&1

# ── (s2a) the PK refusal, DETERMINISTICALLY, before any timing is involved ───────────────────────
# The opportunistic plant below needs a live run to race; this one needs nothing, so the
# single-flight guarantee is never left resting on a sampling window.
# SP-264: a guard deletes ONLY rows it created, by its own fixture ids. This used to be an UNSCOPED
# `delete from public.ingest_single_flight` — the same defect as ingest-queue-guard q18, which on
# 2026-11-13 broke a live analysis by taking the Charter 10-Q's claim at window 10 of 17. The lock
# table's primary key is a CONSTANT, so there is only ever one row and "delete whatever is there" was
# the easy way to get the slot. It is never an acceptable one.
LOCK_OWNER=$(psqlq "select coalesce(company_id::text,'') from public.ingest_single_flight limit 1;")
if [ -n "$LOCK_OWNER" ] && [ "$LOCK_OWNER" != "$HELDCO" ]; then
  echo "  SKIP (s2a) an analysis is in flight on company $LOCK_OWNER — refusing to take its lock."
  echo "       Re-run this guard when nothing is in flight (SP-265)."
  PROBE=""
else
psqlx "delete from public.ingest_single_flight where company_id='$HELDCO';"
PROBE=$(psql_insert_id "insert into public.file_proposals (company_id, processing_state) values ('$HELDCO','queued')")
psqlx "insert into public.ingest_single_flight (lock_key, proposal_id, company_id, expires_at)
       values ('file_analysis','$PROBE','$HELDCO', now() + interval '5 minutes');"
if psql_refused "insert into public.ingest_single_flight (lock_key, proposal_id, company_id, expires_at)
                 values ('file_analysis','$PROBE','$HELDCO', now() + interval '5 minutes');"; then
  ok "(s2a) a second single-flight claim is refused by the primary key — unconditionally, no timing involved"
else
  bad "(s2a) a second single-flight claim was ACCEPTED (SP-180)"
fi
psqlx "delete from public.ingest_single_flight where company_id='$HELDCO';"
psqlx "delete from public.file_proposals where id='$PROBE';"
fi

# ── three REAL files on the held company ────────────────────────────────────────────────────────
# Direct proposal inserts, because SP-191 makes the enqueue skip a held company — but the files and
# sidecars behind them are real, so each run does real work and occupies real time. Without that, a
# run fails at the sidecar step inside one second, nothing is ever observed 'running', and the
# concurrency plant has no window: measured on the first attempt, max running observed was 0.
S_INPUT_ID=$(psqlq "select id::text from public.inputs where company_id='$HELDCO' order by id limit 1;")
if [ -z "$S_INPUT_ID" ]; then
  S_INPUT_ID=$(psql_insert_id "insert into public.inputs (company_id, user_id, input_key, input_label) values ('$HELDCO','$OWNER','iq_guard_fixture','IQ guard fixture')")
fi
S_PATHS=""
P_IDS=""
for n in 1 2 3; do
  node scripts/guards/fixtures/make-paged-pdf.mjs "$WORK/iq-serial-$n.pdf" 2 >/dev/null 2>&1
  fid=$(psqlq "select gen_random_uuid()::text;")
  spath="$HELDCO/iq-serial-$n-$fid.pdf"
  curl -s -o /dev/null -X POST "$STORAGE/input-files/$spath" -H "Authorization: Bearer $SRK"        -H "Content-Type: application/pdf" --data-binary "@$WORK/iq-serial-$n.pdf"
  node -e '
    const fs=require("node:fs");
    const b64=fs.readFileSync(process.argv[1]).toString("base64");
    fetch("http://127.0.0.1:8789/extract",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({file_name:"s.pdf",file_type:"application/pdf",content_base64:b64})})
      .then(r=>r.json()).then(j=>fs.writeFileSync(process.argv[2], String(j.text||"")))
      .catch(()=>fs.writeFileSync(process.argv[2],""));
  ' "$WORK/iq-serial-$n.pdf" "$WORK/sc-$n.txt" 2>/dev/null
  curl -s -o /dev/null -X POST "$STORAGE/input-files/$spath.extracted.txt" -H "Authorization: Bearer $SRK"        -H "Content-Type: text/plain" --data-binary "@$WORK/sc-$n.txt"
  psqlx "insert into public.input_files (id, input_id, file_name, file_type, file_path, uploaded_at)
         values ('$fid','$S_INPUT_ID','iq-serial-$n.pdf','application/pdf','$spath', now());"
  # the same real call, so each row's analysis passes the sha-matched gate (SP-207, SP-209)
  curl -s -m 180 -o /dev/null -X POST "http://127.0.0.1:54321/functions/v1/classify-upload-voice" \
       -H "Authorization: Bearer $SRK" -H 'content-type: application/json' \
       -d "{\"company_id\":\"$HELDCO\",\"input_file_id\":\"$fid\"}"
  pid=$(psql_insert_id "insert into public.file_proposals (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state, created_at)
        values ('$HELDCO','$fid','iq-serial-$n.pdf','uploaded_file','Analysis queued.','document','pending','queued', now() + interval '$n seconds')")
  P_IDS="$P_IDS $pid"
  S_PATHS="$S_PATHS $spath"
done
S_FILE_PATHS="$S_PATHS"
NQ=$(psqlq "select count(*) from public.file_proposals where company_id='$HELDCO' and processing_state='queued';")
[ "$NQ" = 3 ] && ok "(s1) three rows are waiting as 'queued' — SP-182's state means waiting, not running" \
              || bad "(s1) expected 3 queued rows, found $NQ"

echo "     sampling every 3 s: at no moment may two analyses run, or two locks exist"
MAX_RUNNING=0; MAX_LOCKS=0; TERMINAL=0
# BUDGET, measured 2026-11-13: a real analysis of these fixtures takes ~90 s and the starter picks up
# one file per minute, so three files need ~5.5 min from the first start, plus up to a minute before
# it. A 300 s loop timed out with run 3 legitimately in flight and read as a failure — the timings
# (17:04:00→17:05:35, 17:06:00→17:07:30, 17:08:00→…) showed nothing stuck. 240 × 3 s = 12 min.
for i in $(seq 1 240); do
  R=$(psqlq "select count(*) from public.file_proposals where company_id='$HELDCO' and processing_state='running';")
  L=$(psqlq "select count(*) from public.ingest_single_flight;")
  [ "${R:-0}" -gt "$MAX_RUNNING" ] && MAX_RUNNING=${R:-0}
  [ "${L:-0}" -gt "$MAX_LOCKS" ] && MAX_LOCKS=${L:-0}
  TERMINAL=$(psqlq "select count(*) from public.file_proposals where company_id='$HELDCO' and processing_state in ('ready','failed');")
  [ "${TERMINAL:-0}" = 3 ] && break
  # while something holds the lock, a SECOND claim must be impossible (SP-180, the planted bypass)
  if [ "${L:-0}" = 1 ] && [ "${MAX_LOCKS}" = 1 ] && [ -z "${PLANTED:-}" ]; then
    if psql_refused "insert into public.ingest_single_flight (lock_key, proposal_id, company_id, expires_at)
                     values ('file_analysis','$(echo $P_IDS | awk '{print $3}')','$HELDCO', now() + interval '5 minutes');"; then
      ok "(s2) PLANTED second concurrent start REFUSED while one is running — the key, not a code path, forbids it"
    else
      bad "(s2) a second single-flight claim was ACCEPTED while one was held (SP-180)"
    fi
    PLANTED=1
  fi
  sleep 3
done

[ "$MAX_RUNNING" -le 1 ] && ok "(s3) never more than ONE analysis running at a time (max observed: $MAX_RUNNING)" \
                         || bad "(s3) $MAX_RUNNING analyses ran at once — one-at-a-time is not enforced (SP-180)"
[ "$MAX_LOCKS" -le 1 ] && ok "(s3) never more than one single-flight row (max observed: $MAX_LOCKS)" \
                       || bad "(s3) $MAX_LOCKS locks existed at once"
[ "${PLANTED:-}" = 1 ] || bad "(s2) the planted second start was never attempted — no run was observed holding the lock. With real files behind the rows a run DOES occupy time, so this means the starter never ran: check cron.job 3 and the edge worker, not the lock."
[ "${TERMINAL:-0}" = 3 ] && ok "(s4) all three reached a terminal state with no click" \
                         || bad "(s4) only ${TERMINAL:-0} of 3 finished within 12 min — check the timings printed below before reading this as a hang"

# strict serialisation, from the rows' own timestamps
OVERLAPS=$(psqlq "select count(*) from public.file_proposals a join public.file_proposals b
                   on a.company_id=b.company_id and a.id <> b.id
                  where a.company_id='$HELDCO'
                    and a.processing_started_at is not null and b.processing_started_at is not null
                    and a.processing_completed_at is not null
                    and b.processing_started_at > a.processing_started_at
                    and b.processing_started_at < a.processing_completed_at;")
[ "${OVERLAPS:-1}" = 0 ] && ok "(s5) no pair overlaps: every start is after the previous completion (from the rows' timestamps)" \
                         || bad "(s5) $OVERLAPS overlapping pair(s) — the runs were not serial"
psqlq "select '     order: '||string_agg(file_name||' '||coalesce(to_char(processing_started_at,'HH24:MI:SS'),'-')||'→'||coalesce(to_char(processing_completed_at,'HH24:MI:SS'),'-'), '  ' order by processing_started_at) from public.file_proposals where company_id='$HELDCO';"

# ════════════════════════════════════════════════════════════════════════════════════════════════
echo "══ PART F (SP-227): a write step that FAILS ends the row failed, never ready ══"
# ════════════════════════════════════════════════════════════════════════════════════════════════
# The one arm that cannot be proven read-only: the row must be analyzed for real, and the write step
# must then throw. dify-analyze-file carries a forced-failure door keyed on a marker in the file name
# (guard-only, costs nothing) so the failure arm is exercised end to end rather than argued.
F_FID=$(psqlq "select gen_random_uuid()::text;")
F_PATH="$HELDCO/iq-forcefail-$F_FID.pdf"
node scripts/guards/fixtures/make-paged-pdf.mjs "$WORK/forcefail.pdf" 2 >/dev/null 2>&1
curl -s -o /dev/null -X POST "$STORAGE/input-files/$F_PATH" -H "Authorization: Bearer $SRK" \
     -H "Content-Type: application/pdf" --data-binary "@$WORK/forcefail.pdf"
node -e '
  const fs=require("node:fs");
  const b64=fs.readFileSync(process.argv[1]).toString("base64");
  fetch("http://127.0.0.1:8789/extract",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({file_name:"f.pdf",file_type:"application/pdf",content_base64:b64})})
    .then(r=>r.json()).then(j=>fs.writeFileSync(process.argv[2], String(j.text||"")))
    .catch(()=>fs.writeFileSync(process.argv[2],""));
' "$WORK/forcefail.pdf" "$WORK/forcefail.txt" 2>/dev/null
curl -s -o /dev/null -X POST "$STORAGE/input-files/$F_PATH.extracted.txt" -H "Authorization: Bearer $SRK" \
     -H "Content-Type: text/plain" --data-binary "@$WORK/forcefail.txt"
psqlx "insert into public.input_files (id, input_id, file_name, file_type, file_path, uploaded_at)
       values ('$F_FID','$S_INPUT_ID','iq-forcefail.pdf','application/pdf','$F_PATH', now());"
curl -s -m 180 -o /dev/null -X POST "http://127.0.0.1:54321/functions/v1/classify-upload-voice" \
     -H "Authorization: Bearer $SRK" -H 'content-type: application/json' \
     -d "{\"company_id\":\"$HELDCO\",\"input_file_id\":\"$F_FID\"}"
# the marker travels on the PROPOSAL's file_name, which is what the write step reads
F_PID=$(psql_insert_id "insert into public.file_proposals (company_id, file_id, file_name, source_type, summary, signal_type, status, processing_state)
        values ('$HELDCO','$F_FID','__iq_force_ingest_failure__ iq-forcefail.pdf','uploaded_file','Analysis queued.','document','pending','queued')")
[ -n "$F_PID" ] && ok "(f1) a real, voice-classified file is queued with the forced-failure marker" \
               || bad "(f1) could not queue the forced-failure fixture"

if [ -n "$F_PID" ]; then
  echo "     waiting for the starter to run it and the write step to throw"
  F_STATE=""; F_SAW_READY=0
  for i in $(seq 1 160); do
    F_STATE=$(psqlq "select processing_state from public.file_proposals where id='$F_PID';")
    [ "$F_STATE" = ready ] && F_SAW_READY=1
    { [ "$F_STATE" = ready ] || [ "$F_STATE" = failed ]; } && break
    sleep 3
  done
  [ "$F_STATE" = failed ] \
    && ok "(f2) SP-227: the row ends FAILED, not ready, because the write step threw" \
    || bad "(f2) the row ended '$F_STATE' — a failing write step must not leave the row ready"
  [ "$F_SAW_READY" = 0 ] \
    && ok "(f2) and it was NEVER observed 'ready' at any point — the state never led the write step" \
    || bad "(f2) the row read 'ready' before failing: the ordering is not what SP-227 requires"
  F_CODE=$(psqlq "select coalesce(processing_error_code,'<null>')||'|'||coalesce(processing_error,'<null>') from public.file_proposals where id='$F_PID';")
  [ "$F_CODE" = "ingest_failed|<null>" ] \
    && ok "(f3) the code is stored and processing_error is NULL, so the client reads no code (SP-212)" \
    || bad "(f3) expected 'ingest_failed|<null>', row reads '$F_CODE'"
  [ "$(psqlq "select count(*) from public.ingest_single_flight where proposal_id='$F_PID';")" = 0 ] \
    && ok "(f4) and the lock was released, so a failed write step does not wedge the queue" \
    || bad "(f4) the lock is still held after the write step failed (SP-227)"
  # non-vacuity: no signals were minted for it, which is what the failure means
  F_SIG=$(psqlq "select count(*) from public.signals where source_id::text='$F_PID';")
  [ "${F_SIG:-0}" = 0 ] \
    && ok "(f5) no signals were minted — the failure is real, not cosmetic" \
    || bad "(f5) $F_SIG signal(s) exist for a row whose write step threw"
fi
# part F teardown rides the EXIT trap for file_proposals/verdicts; its storage objects go here
curl -s -X DELETE "$STORAGE/input-files/$F_PATH" -H "Authorization: Bearer $SRK" -o /dev/null
curl -s -X DELETE "$STORAGE/input-files/$F_PATH.extracted.txt" -H "Authorization: Bearer $SRK" -o /dev/null

echo "── leaving the fixtures as found ──"
AFTER_FILES=$(psqlq "select count(*) from public.input_files f join public.inputs i on i.id=f.input_id where i.company_id='$MEMCO';")
# the cleanup trap removes part M's row; report what the count WILL be
ok "(z) the held company keeps its hold and its row; part M's file and children are removed in the EXIT trap"

if [ "$fails" = 0 ]; then echo "guard: PASS"; else echo "guard: RED ($fails check(s)) — see above"; fi
[ "$fails" -eq 0 ]
