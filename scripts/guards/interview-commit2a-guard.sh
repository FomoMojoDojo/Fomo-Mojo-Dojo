#!/usr/bin/env bash
# Gate B commit 2a DB guards (2026-09-20) — (b) restore refused, (c) non-admin / no-JWT refused, (d) admin
# withdraw = 1 record + 1 file + 1 audit, (e) set-once, (g) storage policy, (h) R21 record policy + the
# quote path as a member, (i)–(n) speaker correction. Against the REAL local database, everything inside a
# ROLLED-BACK transaction over a throwaway company + rows (never CB1/CB2/Edgewood data); the non-admin is
# the throwaway NONADMIN_ID user from backups/fr-nonadmin.env. Prints "guard: PASS" or "guard: FAIL …".
# Plants (each removes one rule INSIDE the transaction): PLANT=trigger (b) · PLANT=archive (d) ·
# PLANT=policy (g) · PLANT=records (h) · PLANT=catch (k) · PLANT=guc (m) · PLANT=append (n)
# Added 2026-09-21 (commit 2b Part 1 — every 2a check shown failing): PLANT=admin (c, member withdraw) ·
# PLANT=jwt (c, no-JWT withdraw) · PLANT=setonce (e) · PLANT=dir_i (i) · PLANT=dir_j (j) · PLANT=parsed (l)
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
NA=${NONADMIN_ID:-}
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }
ADMIN=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select user_id from user_roles where role='admin' limit 1")
CO=77777777-7777-4777-8777-777777777777; F_INT=77777777-7777-4777-8777-777777777772; F_ORD=77777777-7777-4777-8777-777777777773; R_UP=77777777-7777-4777-8777-777777777774; R_UP2=77777777-7777-4777-8777-777777777776; R_UP3=77777777-7777-4777-8777-777777777778; F_INT3=77777777-7777-4777-8777-777777777779
P=""
case "${PLANT:-}" in
  trigger) P="drop trigger trg_input_files_refuse_interview_restore on public.input_files;";;
  archive) P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.withdraw_interview_upload'::regproc), 'SET archived_at = coalesce(archived_at, v_now),', 'SET archived_at = archived_at,')");";;
  policy)  P="alter policy \"Users can view company input files\" on storage.objects using ((bucket_id = 'input-files'::text) and (exists (select 1 from public.input_files f join public.inputs i on i.id = f.input_id where f.file_path = objects.name and exists (select 1 from public.company_members cm where cm.company_id = i.company_id and cm.user_id = auth.uid()))));";;
  records) P="alter policy \"Users can view company interview_records\" on public.interview_records using (exists (select 1 from public.company_members cm where cm.company_id = interview_records.company_id and cm.user_id = auth.uid()));";;
  catch)   P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.correct_interview_speaker'::regproc), 'EXCEPTION WHEN unique_violation THEN', 'EXCEPTION WHEN no_data_found THEN')");";;
  guc)     P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.interview_records_immutable'::regproc), 'AND NOT v_correcting THEN', 'AND false THEN')");";;
  append)  P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.interview_records_immutable'::regproc), 'IF NEW.speaker_history -> i IS DISTINCT FROM OLD.speaker_history -> i THEN', 'IF false THEN')");";;
  admin)   P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.withdraw_interview_upload'::regproc), 'IF NOT public.has_role(v_actor, ''admin''::app_role) THEN', 'IF false THEN')");";;
  jwt)     P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.withdraw_interview_upload'::regproc), 'IF v_actor IS NULL THEN', 'IF false THEN')");";;
  setonce) P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.withdraw_interview_upload'::regproc), 'IF v_rec.retracted_at IS NOT NULL THEN', 'IF false THEN')");";;
  dir_i)   P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.correct_interview_speaker'::regproc), 'THEN ''per_item'' ELSE ''unplaced'' END;', 'THEN ''unplaced'' ELSE ''unplaced'' END;')");";;
  dir_j)   P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.correct_interview_speaker'::regproc), 'THEN ''per_item'' ELSE ''unplaced'' END;', 'THEN ''per_item'' ELSE ''per_item'' END;')");";;
  parsed)  P="$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.correct_interview_speaker'::regproc), 'IF v_rec.parsed_at IS NOT NULL THEN', 'IF false THEN')");";;
esac
out=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=0 <<SQL 2>&1
begin;
$P
insert into companies (id, name, created_by) values ('$CO', 'C2A guard co', '$ADMIN');
insert into company_members (company_id, user_id, role) values ('$CO', '$NA', 'sponsor');
insert into inputs (id, user_id, input_key, input_label, group_key, group_label, sub_group, completeness, status, score_impact, impact_tier, company_id) values ('77777777-7777-4777-8777-777777777771', '$ADMIN', 'customer-research', 'Customer Research', 'foundation', 'P', 'P', 0, 'not_started', 1.0, 'low', '$CO');
insert into input_files (id, input_id, file_name, file_type, file_path, tags, is_interview) values ('$F_INT', '77777777-7777-4777-8777-777777777771', 'guard-interview.txt', 'text/plain', 'guard/c2a/interview.txt', '{}', true), ('$F_ORD', '77777777-7777-4777-8777-777777777771', 'guard-ordinary.txt', 'text/plain', 'guard/c2a/ordinary.txt', '{}', false), ('77777777-7777-4777-8777-777777777777', '77777777-7777-4777-8777-777777777771', 'guard-interview-2.txt', 'text/plain', 'guard/c2a/interview2.txt', '{}', true), ('$F_INT3', '77777777-7777-4777-8777-777777777771', 'guard-interview-3.txt', 'text/plain', 'guard/c2a/interview3.txt', '{}', true);
insert into interview_records (id, company_id, speaker_role, verbatim, created_by, input_file_id, file_sha256, file_bytes, text_sha256, extraction_method, extraction_version, market_state, journey_key, market_basis) values
  ('$R_UP', '$CO', 'market_participant', 'guard transcript (rolled back)', '$ADMIN', '$F_INT', repeat('a',64), 10, repeat('b',64), 'local_text_reader', 'v', 'placed', 'customer', '[{"kind":"original","result":"none"},{"kind":"operator_override","journey_key":"customer"}]'),
  ('$R_UP2', '$CO', 'client_stakeholder', 'guard transcript two (rolled back)', '$ADMIN', '77777777-7777-4777-8777-777777777777', repeat('c',64), 10, repeat('d',64), 'local_text_reader', 'v', 'per_item', null, '[{"kind":"original","result":"none"}]');
insert into storage.objects (bucket_id, name, owner) values ('input-files', 'guard/c2a/interview.txt', null), ('input-files', 'guard/c2a/ordinary.txt', null);
-- (c)/(g)/(h) as the non-admin member
select set_config('request.jwt.claims', '{"sub":"$NA","role":"authenticated"}', true); set role authenticated;
select 'H1 member upload records='||(select count(*) from interview_records where id='$R_UP')||' ordinary_object='||(select count(*) from storage.objects where name='guard/c2a/ordinary.txt')||' interview_object='||(select count(*) from storage.objects where name='guard/c2a/interview.txt');
savepoint c1; select 'C1 '||public.withdraw_interview_upload('$R_UP')::text; rollback to c1;
savepoint c2; select 'C2 '||public.correct_interview_speaker('$R_UP', 'client_stakeholder')::text; rollback to c2;
reset role; select set_config('request.jwt.claims', '', true);
-- (c) no JWT at all (authenticated role, no claims)
set role authenticated; savepoint c3; select 'C3 '||public.withdraw_interview_upload('$R_UP')::text; rollback to c3; reset role;
-- (h) the quote path: the RPC as the service role with the member as p_user_id, then the member reads it back
select 'H2 quote record='||(select left(r.record_id::text,8) from public.record_interview_finding('$CO', '$NA', 'customer', 1, 'x', 'Minimize the guard', null, '{"speaker_role":"client_stakeholder","person_name":"Guard Person","journey_key":null,"interviewed_at":"2026-09-10T17:00:00Z","interviewer":"guard","consent_basis":"verbal","verbatim":"guard quote (rolled back)"}'::jsonb) r);
select set_config('request.jwt.claims', '{"sub":"$NA","role":"authenticated"}', true); set role authenticated;
select 'H3 member reads own quote record='||count(*) from interview_records where person_name='Guard Person';
reset role;
-- (i)–(n) as admin
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true); set role authenticated;
select 'I1 '||public.correct_interview_speaker('$R_UP', 'client_stakeholder')::text;
select 'I2 role='||speaker_role||' state='||market_state||' jk='||coalesce(journey_key,'null')||' basis_len='||jsonb_array_length(market_basis)||' history='||jsonb_array_length(speaker_history)||' from='||(speaker_history->0->>'from')||' to='||(speaker_history->0->>'to')||' by_ok='||((speaker_history->0->>'by')='$ADMIN')||' at_ok='||((speaker_history->0->>'at') is not null)||' identity_ok='||(content_identity=public.interview_content_identity(company_id, speaker_role, verbatim)) from interview_records where id='$R_UP';
select 'J1 '||public.correct_interview_speaker('$R_UP', 'market_participant')::text;
select 'J2 role='||speaker_role||' state='||market_state||' jk='||coalesce(journey_key,'null')||' basis_len='||jsonb_array_length(market_basis)||' history='||jsonb_array_length(speaker_history) from interview_records where id='$R_UP';
insert into interview_records (id, company_id, speaker_role, verbatim, created_by, input_file_id, file_sha256, file_bytes, text_sha256, extraction_method, extraction_version, market_state, journey_key, market_basis) values ('$R_UP3', '$CO', 'client_stakeholder', 'guard transcript (rolled back)', '$ADMIN', '$F_INT3', repeat('e',64), 10, repeat('f',64), 'local_text_reader', 'v', 'per_item', null, '[{"kind":"original","result":"none"}]');
-- (k) collision: R_UP3 (stakeholder, SAME text as R_UP) → customer would equal the live identity of R_UP (customer again after J1)
create temp table k_before as select row_to_json(r)::text as j from interview_records r where id='$R_UP3';
savepoint k1; select 'K1 '||public.correct_interview_speaker('$R_UP3', 'market_participant')::text; rollback to k1;
select 'K2 byte_identical='||((select row_to_json(r)::text from interview_records r where id='$R_UP3') = (select j from k_before));
-- (l) parsed → refused
savepoint l1; update interview_records set parsed_at=now() where id='$R_UP2'; select 'L1 '||public.correct_interview_speaker('$R_UP2', 'market_participant')::text; rollback to l1;
-- (m) direct UPDATE without the RPC
savepoint m1; update interview_records set speaker_role='market_participant' where id='$R_UP2'; rollback to m1;
-- (n) speaker_history overwrite — even inside a correction context (the GUC naming the row) the history is append-only
savepoint n1; select set_config('app.interview_correction', '$R_UP', true); update interview_records set speaker_history='[{"kind":"forged"},{"kind":"forged2"}]'::jsonb where id='$R_UP'; rollback to n1;
-- (d) withdraw as admin: counts before/after
select 'D0 retracted='||(select count(*) from interview_records where company_id='$CO' and retracted_at is not null)||' archived='||(select count(*) from input_files where input_id='77777777-7777-4777-8777-777777777771' and archived_at is not null)||' audits='||(select count(*) from integrity_runs where component='interview_withdrawn' and company_id='$CO');
select 'D1 '||public.withdraw_interview_upload('$R_UP')::text;
select 'D2 retracted='||(select count(*) from interview_records where company_id='$CO' and retracted_at is not null)||' archived='||(select count(*) from input_files where input_id='77777777-7777-4777-8777-777777777771' and archived_at is not null)||' audits='||(select count(*) from integrity_runs where component='interview_withdrawn' and company_id='$CO')||' reason='||(select retracted_reason from interview_records where id='$R_UP')||' file_reason='||(select archive_reason||'/'||archive_source from input_files where id='$F_INT');
-- (e) set-once
savepoint e1; select 'E1 '||public.withdraw_interview_upload('$R_UP')::text; rollback to e1;
-- (b) restore refused
savepoint b1; update input_files set archived_at=null where id='$F_INT'; rollback to b1;
select 'B2 still_archived='||(archived_at is not null) from input_files where id='$F_INT';
reset role;
rollback;
SQL
)
fail=0
chk() { local label="$1" pattern="$2"; if echo "$out" | grep -q "$pattern"; then echo "  ok   $label"; else echo "  FAIL $label"; fail=1; fi; }
chk "(h) member: 0 upload records, ordinary object visible, interview object hidden" "H1 member upload records=0 ordinary_object=1 interview_object=0"
chk "(c) member withdraw refused"     "withdraw_interview_upload: caller is not an admin"
chk "(c) member correct refused"      "correct_interview_speaker: caller is not an admin"
chk "(c) no-JWT withdraw refused"     "withdraw_interview_upload: no authenticated caller"
chk "(h) quote path as member works"  "H2 quote record="
chk "(h) member reads back the quote record" "H3 member reads own quote record=1"
chk "(i) customer→stakeholder: per_item, jk null, basis kept (2), history 1 {from,to,by,at}" "I2 role=client_stakeholder state=per_item jk=null basis_len=2 history=1 from=market_participant to=client_stakeholder by_ok=true at_ok=true identity_ok=true"
chk "(j) stakeholder→customer: unplaced, override NOT re-applied, history 2" "J2 role=market_participant state=unplaced jk=null basis_len=2 history=2"
chk "(k) collision → speaker_identity_collision"  "ERROR:  speaker_identity_collision"
chk "(k) collision leaves the row byte-identical" "K2 byte_identical=true"
chk "(l) parsed → refused"            "is parsed — the speaker is fixed"
chk "(m) direct speaker_role UPDATE refused" "change only through correct_interview_speaker"
chk "(n) speaker_history overwrite refused" "speaker_history is append-only history"
chk "(d) withdraw: 1 record + 1 file + 1 audit, reasons" "D2 retracted=1 archived=1 audits=1 reason=operator_withdrew_upload file_reason=interview_withdrawn/withdraw_interview"
chk "(e) second withdraw refused (set-once)" "is already withdrawn"
chk "(b) restore refused; still archived" "is withdrawn — it cannot be restored"
[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^[A-Z][0-9]|ERROR" | head -30; exit 1; }
