#!/usr/bin/env bash
# THE INTERVIEW UPLOAD DOOR STILL OPENS AFTER THE REVOKES (U6-38, 2026-11-10).
#
# WHEN TO RUN THIS. On demand, NOT in the every-session sweep — it drives a real browser against the
# dev server and takes about a minute. Run it after any change to:
#   * grants or policies on interview_records (U6-26 revoked INSERT, U6-30 revoked DELETE, both from
#     `authenticated` — and an admin in the browser IS `authenticated`),
#   * supabase/functions/record-interview-upload (the door itself),
#   * the Inputs page upload dialog or its interview branch (src/components/FileUploadDialog.tsx).
#
# WHAT IT PROVES. The revokes close the browser's own hand on interview_records without closing the
# product's upload path, because that path never inserted from the browser: record-interview-upload
# holds a SERVICE-ROLE client and does the write itself, stamping created_by with the caller it
# resolved from the Authorization header. The two halves are asserted together, which is the whole
# point — either alone is consistent with a broken door:
#   (a) the browser principal may only SELECT and UPDATE interview_records
#   (b) a direct INSERT as that principal is refused
#   (c) yet the dialog, driven as the admin, creates exactly one record — and the page's own network
#       trace carries NO POST to /rest/v1/interview_records, so the row came from the function
#   (d) the upload's integrity row records model_called=false (the stakeholder door calls no model)
#   (e) the row's Withdraw control retracts it
#   (f) the model ledger did not move
#
# ONE KEPT FIXTURE COMPANY, NOT ONE PER RUN. interview_records is append-only —
# interview_records_immutable() raises "interview records are retracted, never deleted" — and its
# input_files parent is then pinned by interview_records_input_file_id_fkey. A per-run company would
# therefore leak one undeletable company per run forever. So this guard reuses ONE company, held out
# of every sweep by companies.fixture_hold, and each run simply adds one more retracted record to it.
# The guard asserts the fixture's shape before it starts rather than creating it, so a missing or
# un-held fixture is a FAIL and never a silent pass on a live company.
#
# Plants:
#   PLANT=grant     INSERT is granted back to authenticated inside (b)'s own transaction
#                   => (b) red, the direct browser-role INSERT succeeds
#   PLANT=norecord  record-interview-upload is intercepted in the browser and answered with a
#                   success body, so the dialog says "saved" and nothing is written
#                   => (c) red, the upload created no record
set -uo pipefail
cd "$(dirname "$0")/../.."
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
DRIVE="$(dirname "$0")/interview-upload-path-drive.mjs"

# The kept fixture (U6-38). Held as IUP:fixture; see docs/held-fixtures.md.
CO=8507eb60-468a-4d90-83a1-eedd197a9cd1
HOLD=IUP:fixture

psql() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1"; }

fail=0
ok()  { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fail=1; }
chk() { if [ "$2" = "$3" ]; then ok "$1 ($2)"; else bad "$1: got '$2', expected '$3'"; fi; }

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
RUN=$(date -u +%Y%m%dT%H%M%SZ)

# ── the fixture must already exist, be held, and carry the interview door's fixed home ────────────
# R17: an interview file's only home is the company's customer-research input; without it the dialog
# refuses before any of this is exercised, and the guard would pass on a refusal it never noticed.
NAME=$(psql "select name from companies where id='$CO'")
[ -n "$NAME" ] || { echo "guard: FAIL kept fixture company $CO is missing — see docs/held-fixtures.md"; exit 1; }
chk "the kept fixture is held out of every sweep" "$(psql "select coalesce(fixture_hold,'∅') from companies where id='$CO'")" "$HOLD"
chk "the fixture carries a customer-research input" "$(psql "select count(*) from inputs where company_id='$CO' and input_key='customer-research'")" "1"
ADMIN=$(psql "select user_id from user_roles where role='admin' limit 1")
[ -n "$ADMIN" ] || { echo "guard: FAIL no admin in user_roles"; exit 1; }

RECS_BEFORE=$(psql "select count(*) from interview_records where company_id='$CO'")
MC_BEFORE=$(psql "select count(*) from model_calls")

TRANSCRIPT="$TMP/zz-iup-$RUN.txt"
cat > "$TRANSCRIPT" <<'TXT'
Operator | 00:01
Thanks for making time. What made you look for something new this quarter?

Stakeholder | 00:09
Our intake queue kept stalling and nobody could say where. We needed one place to look.
TXT
BYTES=$(wc -c < "$TRANSCRIPT" | tr -d ' ')

# ── (a) what the browser principal may do to interview_records ────────────────────────────────────
echo "── (a) the grant surface ──"
chk "grants to authenticated" \
    "$(psql "select coalesce(string_agg(privilege_type,',' order by privilege_type),'∅') from information_schema.role_table_grants where table_schema='public' and table_name='interview_records' and grantee='authenticated'")" \
    "SELECT,UPDATE"

# ── (b) a direct INSERT as that principal ─────────────────────────────────────────────────────────
# Entirely inside one rolled-back transaction, so PLANT=grant cannot leak a real grant: a GRANT is
# transactional in Postgres and the ROLLBACK takes it back with everything else.
echo "── (b) a direct INSERT as the browser principal ──"
GRANT_PLANT=""
[ "${PLANT:-}" = "grant" ] && GRANT_PLANT="grant insert on public.interview_records to authenticated;"
DIRECT=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=0 <<SQL 2>&1 | grep -oE 'permission denied for table interview_records|INSERT 0 1' | head -1
begin;
$GRANT_PLANT
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true);
set role authenticated;
insert into interview_records (company_id, speaker_role, verbatim, created_by, market_state)
  values ('$CO','client_stakeholder','guard direct insert attempt','$ADMIN','unplaced');
rollback;
SQL
)
chk "a direct admin-as-authenticated INSERT is refused" "$DIRECT" "permission denied for table interview_records"
chk "the rolled-back plant left no grant behind" \
    "$(psql "select coalesce(string_agg(privilege_type,',' order by privilege_type),'∅') from information_schema.role_table_grants where table_schema='public' and table_name='interview_records' and grantee='authenticated'")" \
    "SELECT,UPDATE"

# ── (c)-(e) the product's own door, driven in the browser ─────────────────────────────────────────
echo "── (c) the upload dialog → record-interview-upload → the Inputs page → Withdraw ──"
export CO TRANSCRIPT
export POSTS_OUT="$TMP/posts.txt" STEPS_OUT="$TMP/steps.txt"
[ -n "${SHOTS_DIR:-}" ] && export SHOTS_DIR
: > "$POSTS_OUT"; : > "$STEPS_OUT"
node "$DRIVE" >"$TMP/drive.log" 2>&1 || true
sed 's/^/     /' "$TMP/drive.log"

REC=$(psql "select id from interview_records where company_id='$CO' and created_at > now() - interval '10 minutes' order by created_at desc limit 1")
RECS_AFTER=$(psql "select count(*) from interview_records where company_id='$CO'")
chk "the upload created exactly one new record" "$((RECS_AFTER - RECS_BEFORE))" "1"
if [ -n "$REC" ]; then
  ok "new record $REC"
  chk "created_by is the admin who drove the browser" "$(psql "select created_by from interview_records where id='$REC'")" "$ADMIN"
  chk "extraction_method"                             "$(psql "select extraction_method from interview_records where id='$REC'")" "local_text_reader"
  chk "speaker_role"                                  "$(psql "select speaker_role from interview_records where id='$REC'")" "client_stakeholder"
  chk "file_bytes match the uploaded file"            "$(psql "select file_bytes from interview_records where id='$REC'")" "$BYTES"
  # (d) and (e)
  chk "the upload's integrity row says model_called=false" \
      "$(psql "select excluded_by_rule->>'model_called' from integrity_runs where company_id='$CO' and component='interview_upload' and excluded_by_rule->>'record_id'='$REC'")" "false"
  chk "(e) Withdraw retracted it"                     "$(psql "select (retracted_at is not null)::text from interview_records where id='$REC'")" "true"
else
  bad "the upload created no record — the door did not open"
fi

# the trace: the browser never inserted the row itself
if grep -qE 'POST /rest/v1/interview_records' "$POSTS_OUT"; then
  bad "the page POSTed to /rest/v1/interview_records — the row did not come from the function"
else
  ok "the page made no POST to /rest/v1/interview_records (the record came from the service-role client)"
fi
grep -q '/functions/v1/record-interview-upload' "$POSTS_OUT" && ok "the page called record-interview-upload" \
  || { [ "${PLANT:-}" = "norecord" ] && ok "(plant) the function call was intercepted" || bad "the page never called record-interview-upload"; }

# ── (f) the ledger ────────────────────────────────────────────────────────────────────────────────
echo "── (f) model ledger ──"
MC_AFTER=$(psql "select count(*) from model_calls")
chk "model_calls did not move ($MC_BEFORE → $MC_AFTER)" "$MC_AFTER" "$MC_BEFORE"
chk "no model_calls row for the fixture company" "$(psql "select count(*) from model_calls where company_id='$CO'")" "0"

# ── tidy what IS deletable ────────────────────────────────────────────────────────────────────────
# A record pins its input_files row, so those stay. But a run that creates no record — PLANT=norecord,
# or a genuinely broken door — leaves an input_files row with nothing pointing at it, and that one is
# deletable. Removing it keeps repeated plant runs from silting up the fixture's Inputs page.
SR=$(npx supabase status --output env 2>/dev/null | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
while read -r ORPHAN_PATH; do
  [ -n "$ORPHAN_PATH" ] && [ -n "$SR" ] && curl -s -X DELETE "http://127.0.0.1:54321/storage/v1/object/input-files" \
    -H "Authorization: Bearer $SR" -H 'Content-Type: application/json' --data "{\"prefixes\":[\"$ORPHAN_PATH\"]}" >/dev/null || true
done < <(psql "select f.file_path from input_files f join inputs i on i.id=f.input_id
                where i.company_id='$CO' and not exists (select 1 from interview_records r where r.input_file_id=f.id)")
psql "delete from input_files f using inputs i where i.id=f.input_id and i.company_id='$CO'
        and not exists (select 1 from interview_records r where r.input_file_id=f.id)" >/dev/null 2>&1
chk "no orphaned input_files row left on the fixture" \
    "$(psql "select count(*) from input_files f join inputs i on i.id=f.input_id where i.company_id='$CO' and not exists (select 1 from interview_records r where r.input_file_id=f.id)")" "0"

# ── the fixture stays held; its append-only children accumulate by design ─────────────────────────
chk "the fixture is still held after the run" "$(psql "select coalesce(fixture_hold,'∅') from companies where id='$CO'")" "$HOLD"
LIVE=$(psql "select count(*) from interview_records where company_id='$CO' and retracted_at is null")
chk "no live interview record is left on the fixture" "$LIVE" "0"

echo
if [ "$fail" = 0 ]; then echo "guard: PASS"; else echo "guard: FAIL"; fi
exit "$fail"
