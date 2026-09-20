#!/usr/bin/env bash
# Gate B guard (u), server side — R15 (2026-09-19): an interview input_files row never moves an input's
# completeness / status (recalculate_input_completeness ignores is_interview rows); an ordinary row still adds
# its 15 %. Against the REAL local database inside a ROLLED-BACK transaction. Planted failure: PLANT=1 swaps
# in the pre-R15 count (every row counts) inside the transaction → the interview row moves completeness → FAIL.
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
CO=3dd2cfbb-0792-4bf1-9cd4-15db9646874b
PLANT_SQL=""
if [ "${PLANT:-0}" = "1" ]; then
  PLANT_SQL=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select replace(pg_get_functiondef('public.recalculate_input_completeness'::regproc), 'AND is_interview = false', '')")";"
fi
out=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=0 <<SQL 2>&1
begin;
$PLANT_SQL
insert into inputs (id, user_id, input_key, input_label, group_key, group_label, sub_group, completeness, status, score_impact, impact_tier, company_id)
  select '99999999-9999-4999-8999-999999999999', created_by, 'probe-input', 'Probe', 'foundation', 'Probe', 'Probe', 0, 'not_started', 1.0, 'low', id from companies where id='$CO';
insert into input_subitems (input_id, sort_order, name, done) values ('99999999-9999-4999-8999-999999999999', 1, 'probe item', false);
insert into input_files (input_id, file_name, file_type, file_path, tags, is_interview) values ('99999999-9999-4999-8999-999999999999', 'probe-interview.txt', 'text/plain', 'probe/i.txt', '{}', true);
select 'U1 after interview row: '||completeness||'/'||status from inputs where id='99999999-9999-4999-8999-999999999999';
insert into input_files (input_id, file_name, file_type, file_path, tags, is_interview) values ('99999999-9999-4999-8999-999999999999', 'probe-ordinary.txt', 'text/plain', 'probe/o.txt', '{}', false);
select 'U2 after ordinary row: '||completeness||'/'||status from inputs where id='99999999-9999-4999-8999-999999999999';
rollback;
SQL
)
fail=0
chk() { if echo "$out" | grep -q "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }
chk "(u) an interview row leaves completeness at 0 / not_started" "U1 after interview row: 0/not_started"
chk "(u) an ordinary row still adds 15 % → partial"              "U2 after ordinary row: 15/partial"
[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^U|ERROR" | head; exit 1; }
