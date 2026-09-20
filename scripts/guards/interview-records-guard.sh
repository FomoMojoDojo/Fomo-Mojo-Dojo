#!/usr/bin/env bash
# Gate B guards (i), (j), (k) at the DB (2026-09-19) — against the REAL local database, every case inside a
# transaction that is ROLLED BACK (nothing persists). Prints "guard: PASS" or "guard: FAIL …".
#   (i) verbatim / file_sha256 / text_sha256 updates refused; journey_key update allowed on a live row, refused on a retracted row
#   (j) market_basis is append-only history: two changes → three entries, first = original "none"; an overwrite is refused
#   (k) retracting a transcript record: the retraction triple lands set-once; archiving the file hides it from the listing read
# Planted failure: PLANT=1 disables interview_records_immutable inside the transaction → (i) and (j) refusals vanish → FAIL.
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
CO=3dd2cfbb-0792-4bf1-9cd4-15db9646874b
PLANT_SQL=""; [ "${PLANT:-0}" = "1" ] && PLANT_SQL="alter table public.interview_records disable trigger interview_records_immutable;"
out=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=0 <<SQL 2>&1
begin;
$PLANT_SQL
-- fixture: one flagged file row + one customer transcript record (throwaway strings, rolled back)
insert into input_files (id, input_id, file_name, file_type, file_path, tags, is_interview)
  select '11111111-1111-4111-8111-111111111111', i.id, 'guard-fixture.txt', 'text/plain', 'guard/fixture.txt', '{}', true from inputs i where i.company_id='$CO' limit 1;
insert into interview_records (id, company_id, speaker_role, interviewed_at, verbatim, created_by, input_file_id, file_sha256, file_bytes, text_sha256, extraction_method, extraction_version, market_state, market_basis)
  select '22222222-2222-4222-8222-222222222222', '$CO', 'market_participant', now(), 'guard fixture text (rolled back)', c.created_by, '11111111-1111-4111-8111-111111111111', repeat('a',64), 10, repeat('b',64), 'local_text_reader', 'v', 'unplaced', '[{"kind":"original","result":"none"}]'::jsonb from companies c where c.id='$CO';
\\echo I1 verbatim
savepoint s1; update interview_records set verbatim='changed' where id='22222222-2222-4222-8222-222222222222'; rollback to s1;
\\echo I2 file_sha256
savepoint s2; update interview_records set file_sha256=repeat('c',64) where id='22222222-2222-4222-8222-222222222222'; rollback to s2;
\\echo I3 text_sha256
savepoint s3; update interview_records set text_sha256=repeat('d',64) where id='22222222-2222-4222-8222-222222222222'; rollback to s3;
\\echo J1 first-change
update interview_records set journey_key='customer', market_state='placed', market_basis = market_basis || '[{"kind":"operator_override","journey_key":"customer"}]'::jsonb where id='22222222-2222-4222-8222-222222222222';
\\echo J2 second-change
update interview_records set journey_key='internal', market_state='placed', market_basis = market_basis || '[{"kind":"operator_override","journey_key":"internal"}]'::jsonb where id='22222222-2222-4222-8222-222222222222';
select 'J3 entries='||jsonb_array_length(market_basis)||' first='||(market_basis->0->>'result')||' key='||journey_key from interview_records where id='22222222-2222-4222-8222-222222222222';
\\echo J4 overwrite
savepoint s4; update interview_records set market_basis='[{"kind":"operator_override","journey_key":"x"}]'::jsonb where id='22222222-2222-4222-8222-222222222222'; rollback to s4;
\\echo K1 retract-archive
update interview_records set retracted_at=now(), retracted_reason='guard retraction (rolled back)', retracted_by=created_by where id='22222222-2222-4222-8222-222222222222';
update input_files set archived_at=now(), archive_reason='user_removed', archive_source='ui' where id='11111111-1111-4111-8111-111111111111';
select 'K2 retracted='||(retracted_at is not null)||' listing_hides='||(select count(*)=0 from input_files where id='11111111-1111-4111-8111-111111111111' and archived_at is null) from interview_records where id='22222222-2222-4222-8222-222222222222';
\\echo I4 retracted-row
savepoint s5; update interview_records set journey_key='customer', market_basis = market_basis || '[{"kind":"operator_override"}]'::jsonb where id='22222222-2222-4222-8222-222222222222'; rollback to s5;
rollback;
SQL
)
fail=0
# stderr and stdout interleave non-deterministically inside docker exec, so refusals are COUNTED, not ordered.
n_immutable=$(echo "$out" | grep -c "is immutable after birth")
chk() { local label="$1" cond="$2"; if eval "$cond"; then echo "  ok   $label"; else echo "  FAIL $label"; fail=1; fi; }
chk "(i) verbatim / file_sha256 / text_sha256 updates refused (3 refusals)" '[ "$n_immutable" = 3 ]'
chk "(j) two changes → 3 entries, first none, key=internal" 'echo "$out" | grep -q "J3 entries=3 first=none key=internal"'
chk "(j) overwrite refused"                                  'echo "$out" | grep -q "market_basis is append-only history"'
chk "(k) retracted; archived file hidden from the listing read" 'echo "$out" | grep -q "K2 retracted=true listing_hides=true"'
chk "(i) journey_key on a retracted row refused"             'echo "$out" | grep -q "is retracted and can no longer change"'
[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^(I|J|K)[0-9]|ERROR" | head -20; exit 1; }
