#!/usr/bin/env bash
# integrity_runs system-scope guard (ruling M, 2026-09-19) — against the REAL local database, every case
# inside a transaction that is ROLLED BACK (nothing persists). Prints "guard: PASS" or "guard: FAIL …".
#   (1) NULL company + system_scope false → rejected by CHECK integrity_runs_company_or_system_scope
#   (2) NULL company + system_scope true  → accepted
#   (3) an ordinary company row (system_scope default false) → unchanged / accepted
# Planted failure (reported in the gate): drop the CHECK → case (1) is accepted → FAIL.
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
psql_q() { docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=0 "$@"; }
CO=$(psql_q -c "select id from companies where name='Edgewood' limit 1")
[ -n "$CO" ] || { echo "guard: FAIL no fixture company"; exit 1; }
# case 1 — must be rejected
r1=$(psql_q <<SQL 2>&1
begin;
insert into integrity_runs (company_id, system_scope, component, surface_type, ran_at, status, examined, admitted) values (null, false, 'guard_probe', 'guard', now(), 'completed', 0, 0);
rollback;
SQL
)
echo "$r1" | grep -q "integrity_runs_company_or_system_scope" || { echo "guard: FAIL case 1 — a NULL-company row without system_scope was NOT rejected: $r1"; exit 1; }
# case 2 — must be accepted (then rolled back)
r2=$(psql_q <<SQL 2>&1
begin;
insert into integrity_runs (company_id, system_scope, component, surface_type, ran_at, status, examined, admitted) values (null, true, 'guard_probe', 'guard', now(), 'completed', 0, 0) returning 'accepted:'||id;
rollback;
SQL
)
echo "$r2" | grep -q "^accepted:" || { echo "guard: FAIL case 2 — a flagged system-scope row was rejected: $r2"; exit 1; }
# case 3 — ordinary row unchanged
r3=$(psql_q <<SQL 2>&1
begin;
insert into integrity_runs (company_id, component, surface_type, ran_at, status, examined, admitted) values ('$CO', 'guard_probe', 'guard', now(), 'completed', 0, 0) returning 'accepted:'||id||':'||system_scope;
rollback;
SQL
)
echo "$r3" | grep -q "^accepted:.*:f" || { echo "guard: FAIL case 3 — an ordinary company row broke: $r3"; exit 1; }
left=$(psql_q -c "select count(*) from integrity_runs where component='guard_probe'")
[ "$left" = "0" ] || { echo "guard: FAIL probe rows persisted: $left"; exit 1; }
echo "guard: PASS (1 rejected, 2 accepted, 3 unchanged; 0 probe rows persisted)"
