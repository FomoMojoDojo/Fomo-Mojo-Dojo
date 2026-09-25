#!/usr/bin/env bash
# ── 4f-1: THE THIRD RECORD TYPE — "working session" ─────────────────────────────────────────────
# Against the REAL local database, everything inside ONE ROLLED-BACK transaction over a throwaway
# company (never CB1 / CB2 / Edgewood / any live company). Prints "guard: PASS" or "guard: FAIL …".
#
# Checks
#   (w1) the speaker_role CHECK admits working_session, and still refuses a role outside the three
#   (w2) a working-session record is born per_item with journey_key NULL
#   (w3) correct_interview_speaker re-types INTO working_session before parsing, and its audit row
#        and speaker_history record the move
#   (w4) ... and back OUT of it again
#   (w5) ... and is REFUSED once the record is parsed (the speaker is fixed)
#   (w6) a need pointing at a working-session record lands as client_attested (ruling F1)
#   (w7) market_interviewed against a working-session record is still refused — the third type is
#        the client attesting, never a market participant
#   (w8) the one mapping: record_interview_finding_provenance over all three roles and a bad one
#
# Plants (each removes ONE rule, inside the transaction so it rolls back with it):
#   PLANT=check     narrows the speaker_role CHECK back to two  -> (w1)(w2) go red
#   PLANT=rpc       drops the third arm from correct_interview_speaker's whitelist -> (w3) goes red
#   PLANT=map       drops working_session from the provenance mapping -> (w6) goes red
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
ADMIN=$(docker exec -i "$PGC" psql -U postgres -d postgres -Atc "select user_id from user_roles where role='admin' limit 1;")
[ -n "$ADMIN" ] || { echo "guard: FAIL no admin user_roles row"; exit 1; }
PLANT=${PLANT:-}
CO=44444444-4444-4444-4444-444444444444
R1=55555555-5555-5555-5555-555555555555
R2=66666666-6666-6666-6666-666666666666
R3=77777777-7777-7777-7777-777777777777

SQL=$(mktemp)
{
echo "begin;"
# The RPC reads auth.uid(); inside psql there is no JWT, so the claim is set for this transaction.
echo "set local role authenticated;"
echo "select set_config('request.jwt.claims', json_build_object('sub','$ADMIN','role','authenticated')::text, true);"
echo "reset role;"
echo "insert into companies (id, name, created_by) values ('$CO','zz-record-types-guard','$ADMIN');"

# ── the plants ──
[ "$PLANT" = "check" ] && echo "alter table public.interview_records drop constraint interview_records_speaker_role_check; alter table public.interview_records add constraint interview_records_speaker_role_check check (speaker_role in ('client_stakeholder','market_participant'));"
if [ "$PLANT" = "map" ]; then
  echo "create or replace function public.record_interview_finding_provenance(p_role text) returns public.provenance_type_enum language sql immutable as \$f\$ select case p_role when 'client_stakeholder' then 'client_attested'::public.provenance_type_enum when 'market_participant' then 'market_interviewed'::public.provenance_type_enum end; \$f\$;"
fi

# ── (w1)(w2) birth ──
echo "savepoint w1;"
echo "insert into interview_records (id, company_id, speaker_role, person_name, person_role, interviewed_at, interviewer, consent_basis, verbatim, created_by, market_state, input_file_id) values ('$R1','$CO','working_session','P','R',now(),'I','verbal','FIXTURE working session text','$ADMIN','per_item',null);"
echo "select 'W1 born role='||(select speaker_role from interview_records where id='$R1')||' state='||(select market_state from interview_records where id='$R1')||' key='||coalesce((select journey_key from interview_records where id='$R1'),'NULL');"
echo "savepoint w1b;"
echo "insert into interview_records (id, company_id, speaker_role, person_name, person_role, interviewed_at, interviewer, consent_basis, verbatim, created_by) values ('$R2','$CO','board_meeting','P','R',now(),'I','verbal','FIXTURE other','$ADMIN');"
echo "select 'W1B fourth_role_accepted';"
echo "rollback to w1b;"

# ── (w3)(w4)(w5) re-typing. correct_interview_speaker needs an UPLOAD record, so R3 carries the
#     identity quartet an upload row has. ──
echo "with i as (insert into inputs (user_id, company_id, input_key, input_label, group_key, group_label, sub_group, completeness, status, score_impact, impact_tier, description, why_it_matters, frameworks_used) values ('$ADMIN','$CO','customer-research','zz','market_evidence','Market evidence','interviews',0,'partial',0,'low','t','t','{}') returning id) insert into input_files (id, input_id, file_name, file_type, file_path, is_interview) select '88888888-8888-8888-8888-888888888888', i.id, 'zz.txt', 'text/plain', 'zz/zz.txt', true from i;"
echo "insert into interview_records (id, company_id, speaker_role, person_name, person_role, interviewed_at, interviewer, consent_basis, verbatim, created_by, market_state, input_file_id, file_sha256, file_bytes, text_sha256, extraction_method, extraction_version) values ('$R3','$CO','client_stakeholder','P','R',now(),'I','verbal','FIXTURE upload text','$ADMIN','per_item','88888888-8888-8888-8888-888888888888', repeat('a',64), 12, repeat('b',64), 'local_text_reader', 'test');"

if [ "$PLANT" = "rpc" ]; then
  echo "create or replace function public.correct_interview_speaker(p_record_id uuid, p_speaker_role text) returns jsonb language plpgsql security definer set search_path=public as \$f\$ begin if p_speaker_role not in ('client_stakeholder','market_participant') then raise exception 'correct_interview_speaker: speaker_role must be client_stakeholder or market_participant' using errcode='check_violation'; end if; return jsonb_build_object('ok',true); end; \$f\$;"
fi

echo "set local role authenticated;"
echo "savepoint w3;"
echo "select 'W3RPC '||(public.correct_interview_speaker('$R3','working_session')->>'market_state');"
echo "select 'W3 to_working state='||(select market_state from interview_records where id='$R3')||' role='||(select speaker_role from interview_records where id='$R3');"
echo "select 'W3B history='||(select jsonb_array_length(speaker_history) from interview_records where id='$R3')||' audit='||(select count(*) from integrity_runs where surface_id='$R3' and component='interview_speaker_corrected');"
echo "select 'W4RPC '||(public.correct_interview_speaker('$R3','client_stakeholder')->>'market_state');"
echo "select 'W4 back state='||(select market_state from interview_records where id='$R3')||' role='||(select speaker_role from interview_records where id='$R3');"
echo "reset role;"
echo "rollback to w3;"

echo "update interview_records set parsed_at=now() where id='$R3';"
echo "set local role authenticated;"
echo "savepoint w5;"
echo "select 'W5 retyped_after_parse='||(public.correct_interview_speaker('$R3','working_session')->>'ok');"
echo "rollback to w5;"
echo "reset role;"

# ── (w6)(w7) the need pairing ──
echo "savepoint w6;"
echo "insert into odi_needs (company_id, user_id, journey_key, desired_outcome, interview_record_id, status, provenance_type) values ('$CO','$ADMIN','customer','FIXTURE need from a working session','$R1','active','client_attested');"
echo "select 'W6 need_client_attested='||(select count(*) from odi_needs where interview_record_id='$R1' and provenance_type='client_attested');"
echo "rollback to w6;"
echo "savepoint w7;"
echo "insert into odi_needs (company_id, user_id, journey_key, desired_outcome, interview_record_id, status, provenance_type) values ('$CO','$ADMIN','customer','FIXTURE need mis-typed','$R1','active','market_interviewed');"
echo "select 'W7 market_interviewed_accepted';"
echo "rollback to w7;"

# ── (w8) the one mapping ──
echo "select 'W8 '||coalesce(public.record_interview_finding_provenance('client_stakeholder')::text,'NULL')||' '||coalesce(public.record_interview_finding_provenance('working_session')::text,'NULL')||' '||coalesce(public.record_interview_finding_provenance('market_participant')::text,'NULL')||' '||coalesce(public.record_interview_finding_provenance('board_meeting')::text,'NULL');"
echo "rollback;"
} > "$SQL"

out=$(docker exec -i "$PGC" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f - < "$SQL" 2>&1)
rm -f "$SQL"

fail=0
chk() { if echo "$out" | grep -q -- "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }
no()  { if echo "$out" | grep -q -- "$2"; then echo "  FAIL $1"; fail=1; else echo "  ok   $1"; fi; }

chk "(w1) a working-session record is admitted by the CHECK"        "W1 born role=working_session"
chk "(w2) it is born per_item with no market key"                   "W1 born role=working_session state=per_item key=NULL"
no  "(w1) a role outside the three is still refused"                "W1B fourth_role_accepted"
chk "(w3) correct_interview_speaker re-types INTO working_session"  "W3 to_working state=per_item role=working_session"
chk "(w3) and answers per_item for the new role"                    "W3RPC per_item"
chk "(w3) the move is in speaker_history and in an audit row"       "W3B history=1 audit=1"
chk "(w4) and back out of it again"                                 "W4 back state=per_item role=client_stakeholder"
no  "(w5) re-typing a PARSED record is refused"                     "W5 retyped_after_parse=true"
chk "(w5) the refusal says the speaker is fixed"                    "is parsed — the speaker is fixed"
chk "(w6) a need on a working session lands client_attested (F1)"   "W6 need_client_attested=1"
no  "(w7) market_interviewed against it is refused"                 "W7 market_interviewed_accepted"
chk "(w8) the one mapping answers for all three, and NULL otherwise" "W8 client_attested client_attested market_interviewed NULL"

[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^ ?[A-Z][0-9]|ERROR" | head -30; exit 1; }
