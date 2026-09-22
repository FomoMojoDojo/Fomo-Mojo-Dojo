#!/usr/bin/env bash
# First-read marks, commit 1 (FM1–FM15, 2026-09-21) — the DB guards, against the REAL local database, everything
# inside ONE ROLLED-BACK transaction over a throwaway company (never CB1 / CB2 / Edgewood / any live company).
# The non-admin is the throwaway NONADMIN_ID user from backups/fr-nonadmin.env; the admin is the first user_roles
# admin row. Prints "guard: PASS" or "guard: FAIL …".
# Checks: (a) member / no-JWT refused on all three RPCs · (b) frozen company refused · (c) empty note refused,
# nothing written · (d) our_mark with a disposition refused, client_reaction without one refused · (e) anchor and
# kind immutable · (f) note versions append, never overwrite or delete · (g) append on a withdrawn mark refused ·
# (h) second withdraw refused, ONE audit row · (i) member SELECT = 0 rows, admin SELECT = rows.
# Plants (each removes one rule INSIDE the transaction): PLANT=admin (a) · PLANT=jwt (a) · PLANT=frozen (b) ·
# PLANT=emptynote (c) · PLANT=disposition (d) · PLANT=immutable (e) · PLANT=noteimmutable (f) ·
# PLANT=appendwithdrawn (g) · PLANT=setonce (h) · PLANT=select (i)
# FM16 (2026-09-21, disposition on note versions): (j) a disposition change appends a version, v1 stays intact ·
# (k) an our_mark note with a disposition is refused · (l) a client_reaction append without one carries the previous.
# Plants: PLANT=v1rewrite (j: the append rewrites the mark's v1 disposition) · PLANT=ourmarkdisp (k: the RPC and
# trigger rules off) · PLANT=nocarry (l: the append stores NULL instead of carrying; trigger rule off)
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
NA=${NONADMIN_ID:-}
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }
psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1"; }
ADMIN=$(psqlq "select user_id from user_roles where role='admin' limit 1")
CO=88888888-8888-4888-8888-888888888888; CO_FROZEN=88888888-8888-4888-8888-888888888889
SHA=$(printf 'anchor text' | shasum -a 256 | cut -c1-64)
fndef() { psqlq "select pg_get_functiondef('public.$1'::regproc)"; }
P=""
case "${PLANT:-}" in
  admin)           P="$(psqlq "select replace(pg_get_functiondef('public.first_read_marks_actor'::regproc), 'IF NOT public.has_role(v_actor, ''admin''::app_role) THEN', 'IF false THEN')");";;
  jwt)             P="$(psqlq "select replace(pg_get_functiondef('public.first_read_marks_actor'::regproc), 'IF v_actor IS NULL THEN', 'IF false THEN')");";;
  frozen)          P="$(psqlq "select replace(pg_get_functiondef('public.create_first_read_mark'::regproc), 'IF v_frozen THEN', 'IF false THEN')"); alter table public.first_read_marks disable trigger enforce_company_freeze;";;
  emptynote)       P="$(psqlq "select replace(pg_get_functiondef('public.create_first_read_mark'::regproc), 'IF length(btrim(coalesce(p_note, ''''))) = 0 THEN', 'IF false THEN')"); alter table public.first_read_mark_notes drop constraint first_read_mark_notes_note_check;";;
  disposition)     P="alter table public.first_read_marks drop constraint first_read_marks_disposition_by_kind;";;
  immutable)       P="$(psqlq "select replace(replace(pg_get_functiondef('public.first_read_marks_immutable'::regproc), 'OR NEW.anchor_text IS DISTINCT FROM OLD.anchor_text', 'OR false'), 'IF NEW.withdrawn_at IS NULL THEN', 'IF false THEN')");";;
  noteimmutable)   P="drop trigger trg_first_read_mark_notes_immutable on public.first_read_mark_notes;";;
  appendwithdrawn) P="$(psqlq "select replace(pg_get_functiondef('public.append_first_read_mark_note'::regproc), 'IF v_mark.withdrawn_at IS NOT NULL THEN', 'IF false THEN')");";;
  setonce)         P="$(psqlq "select replace(pg_get_functiondef('public.withdraw_first_read_mark'::regproc), 'IF v_mark.withdrawn_at IS NOT NULL THEN', 'IF false THEN')");";;
  select)          P="alter policy \"Admins read first_read_marks\" on public.first_read_marks using (true);";;
  v1rewrite)       P="$(psqlq "select replace(pg_get_functiondef('public.append_first_read_mark_note'::regproc), 'INSERT INTO public.first_read_mark_notes (mark_id, version, note, disposition, created_by, created_at)', 'UPDATE public.first_read_marks SET disposition = v_disposition WHERE id = p_mark_id; INSERT INTO public.first_read_mark_notes (mark_id, version, note, disposition, created_by, created_at)')"); alter table public.first_read_marks disable trigger trg_first_read_marks_immutable;";;
  ourmarkdisp)     P="$(psqlq "select replace(pg_get_functiondef('public.append_first_read_mark_note'::regproc), 'IF v_mark.kind = ''our_mark'' AND p_disposition IS NOT NULL THEN', 'IF false THEN')"); $(psqlq "select replace(pg_get_functiondef('public.first_read_mark_notes_immutable'::regproc), 'IF v_kind = ''our_mark'' AND NEW.disposition IS NOT NULL THEN', 'IF false THEN')");";;
  nocarry)         P="$(psqlq "select replace(replace(pg_get_functiondef('public.append_first_read_mark_note'::regproc), 'SELECT disposition INTO v_disposition FROM public.first_read_mark_notes WHERE mark_id = p_mark_id ORDER BY version DESC LIMIT 1;', 'v_disposition := NULL;'), 'IF v_mark.kind = ''our_mark'' AND p_disposition IS NOT NULL THEN', 'IF v_mark.kind = ''our_mark'' AND p_disposition IS NOT NULL THEN')"); $(psqlq "select replace(pg_get_functiondef('public.first_read_mark_notes_immutable'::regproc), 'IF v_kind = ''client_reaction'' AND NEW.disposition IS NULL THEN', 'IF false THEN')");";;
esac
out=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=0 <<SQL 2>&1
begin;
$P
insert into companies (id, name, created_by) values ('$CO', 'FM guard co', '$ADMIN'), ('$CO_FROZEN', 'FM guard frozen co', '$ADMIN');
update companies set frozen = true where id = '$CO_FROZEN';
-- (a) the member, then no JWT, on all three RPCs
select set_config('request.jwt.claims', '{"sub":"$NA","role":"authenticated"}', true); set role authenticated;
savepoint a1; select 'A1 '||public.create_first_read_mark('$CO', 'our_mark', null, 'record', 'signal', 'sig-1', 'anchor text', '$SHA', 'a note')::text; rollback to a1;
savepoint a2; select 'A2 '||public.append_first_read_mark_note('00000000-0000-4000-8000-000000000001', 'a note')::text; rollback to a2;
savepoint a3; select 'A3 '||public.withdraw_first_read_mark('00000000-0000-4000-8000-000000000001', 'why')::text; rollback to a3;
reset role; select set_config('request.jwt.claims', '', true); set role authenticated;
savepoint a4; select 'A4 '||public.create_first_read_mark('$CO', 'our_mark', null, 'record', 'signal', 'sig-1', 'anchor text', '$SHA', 'a note')::text; rollback to a4;
savepoint a5; select 'A5 '||public.append_first_read_mark_note('00000000-0000-4000-8000-000000000001', 'a note')::text; rollback to a5;
savepoint a6; select 'A6 '||public.withdraw_first_read_mark('00000000-0000-4000-8000-000000000001', 'why')::text; rollback to a6;
reset role;
-- as the admin from here
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true); set role authenticated;
-- (b) frozen
savepoint b1; select 'B1 '||public.create_first_read_mark('$CO_FROZEN', 'our_mark', null, 'record', 'signal', 'sig-1', 'anchor text', '$SHA', 'a note')::text; rollback to b1;
-- (c) empty note → nothing written
savepoint c1; select 'C1 '||public.create_first_read_mark('$CO', 'our_mark', null, 'record', 'signal', 'sig-1', 'anchor text', '$SHA', '   ')::text; select 'C1b marks='||(select count(*) from first_read_marks where company_id='$CO')||' notes='||(select count(*) from first_read_mark_notes n join first_read_marks m on m.id=n.mark_id where m.company_id='$CO'); rollback to c1;
select 'C2 marks='||(select count(*) from first_read_marks where company_id='$CO')||' notes='||(select count(*) from first_read_mark_notes n join first_read_marks m on m.id=n.mark_id where m.company_id='$CO');
-- (d) disposition by kind
savepoint d1; select 'D1 '||public.create_first_read_mark('$CO', 'our_mark', 'interesting', 'record', 'signal', 'sig-1', 'anchor text', '$SHA', 'a note')::text; rollback to d1;
savepoint d2; select 'D2 '||public.create_first_read_mark('$CO', 'client_reaction', null, 'record', 'signal', 'sig-1', 'anchor text', '$SHA', 'a note')::text; rollback to d2;
-- a real mark (client reaction) + our mark
create temp table fm as select (public.create_first_read_mark('$CO', 'client_reaction', 'address_next_phase', 'gap', 'gap_statement', 'claim-1', 'anchor text', '$SHA', 'first note')->>'mark_id')::uuid as id;
select 'M1 created='||(select count(*) from first_read_marks where company_id='$CO')||' v1='||(select count(*) from first_read_mark_notes where mark_id=(select id from fm) and version=1);
-- (e) immutable anchor / kind (direct UPDATE as the admin is refused by RLS-no-policy AND by the trigger; prove the trigger as postgres)
reset role;
savepoint e1; update first_read_marks set anchor_text = 'other' where id=(select id from fm); rollback to e1;
savepoint e2; update first_read_marks set kind = 'our_mark', disposition = null where id=(select id from fm); rollback to e2;
-- destructive-ok: proof that the immutability trigger REFUSES this delete; throwaway row, inside the rolled-back guard transaction
savepoint e3; delete from first_read_marks where id=(select id from fm); rollback to e3;
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true); set role authenticated;
-- (f) versions append; never overwrite / delete
select 'F1 '||(public.append_first_read_mark_note((select id from fm), 'second note')->>'version');
select 'F2 '||(public.append_first_read_mark_note((select id from fm), 'third note')->>'version');
select 'F3 versions='||string_agg(version::text, ',' order by version) from first_read_mark_notes where mark_id=(select id from fm);
reset role;
savepoint f4; update first_read_mark_notes set note = 'rewritten' where mark_id=(select id from fm) and version=1; rollback to f4;
-- destructive-ok: proof that the note-history trigger REFUSES this delete; throwaway row, inside the rolled-back guard transaction
savepoint f5; delete from first_read_mark_notes where mark_id=(select id from fm) and version=3; rollback to f5;
select 'F6 v1_intact='||(select note='first note' from first_read_mark_notes where mark_id=(select id from fm) and version=1)||' n='||(select count(*) from first_read_mark_notes where mark_id=(select id from fm));
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true); set role authenticated;
-- FM16 (j) a disposition change appends a version; v1 (mark row and note v1) stays intact
select 'J1 v='||(public.append_first_read_mark_note((select id from fm), 'reconsidered', 'interesting')->>'version');
select 'J1b d4='||(select disposition from first_read_mark_notes where mark_id=(select id from fm) and version=4);
select 'J2 mark_v1='||(select disposition from first_read_marks where id=(select id from fm))||' note_v1='||(select disposition from first_read_mark_notes where mark_id=(select id from fm) and version=1)||' current='||(select disposition from first_read_mark_notes where mark_id=(select id from fm) order by version desc limit 1);
-- FM16 (l) a client_reaction append WITHOUT a disposition carries the previous one forward (versions 2-3 above carried the v1 value)
select 'L1 carried='||(select string_agg(coalesce(disposition,'NULL'), ',' order by version) from first_read_mark_notes where mark_id=(select id from fm));
select 'L2 v='||(public.append_first_read_mark_note((select id from fm), 'and again')->>'version');
select 'L2b d5='||(select disposition from first_read_mark_notes where mark_id=(select id from fm) and version=5);
-- FM16 (k) our mark never carries a disposition: on create (D1 above), on append, and at the trigger
create temp table om as select (public.create_first_read_mark('$CO', 'our_mark', null, 'record', 'signal', 'sig-1', 'anchor text', '$SHA', 'our first note')->>'mark_id')::uuid as id;
savepoint k1; select 'K1 '||public.append_first_read_mark_note((select id from om), 'our second note', 'interesting')::text; rollback to k1;
select 'K2 v='||(public.append_first_read_mark_note((select id from om), 'our second note')->>'version');
select 'K2b rows='||(select count(*) from first_read_mark_notes where mark_id=(select id from om) and version=2)||' d='||coalesce((select disposition from first_read_mark_notes where mark_id=(select id from om) and version=2),'NULL');
reset role;
savepoint k3; insert into first_read_mark_notes (mark_id, version, note, disposition, created_by) values ((select id from om), 9, 'direct', 'interesting', '$ADMIN'); rollback to k3;
savepoint k4; insert into first_read_mark_notes (mark_id, version, note, disposition, created_by) values ((select id from fm), 9, 'direct', null, '$ADMIN'); rollback to k4;
select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true); set role authenticated;
-- (h) withdraw once → one audit row; (g) append refused; second withdraw refused
select 'H1 '||(public.withdraw_first_read_mark((select id from fm), 'no longer relevant')->>'ok');
select 'H2 audits='||(select count(*) from integrity_runs where component='first_read_mark_withdrawn' and surface_id=(select id from fm))||' withdrawn='||(select withdrawn_at is not null and withdrawn_by='$ADMIN' and withdraw_reason='no longer relevant' from first_read_marks where id=(select id from fm));
savepoint g1; select 'G1 '||public.append_first_read_mark_note((select id from fm), 'late note')::text; rollback to g1;
savepoint h3; select 'H3 '||public.withdraw_first_read_mark((select id from fm), 'again')::text; rollback to h3;
select 'H4 audits='||(select count(*) from integrity_runs where component='first_read_mark_withdrawn' and surface_id=(select id from fm));
reset role;
-- (i) SELECT: the member sees 0, the admin sees the row
select set_config('request.jwt.claims', '{"sub":"$NA","role":"authenticated"}', true); set role authenticated;
select 'I1 member_marks='||(select count(*) from first_read_marks where company_id='$CO')||' member_notes='||(select count(*) from first_read_mark_notes where mark_id=(select id from fm));
reset role; select set_config('request.jwt.claims', '{"sub":"$ADMIN","role":"authenticated"}', true); set role authenticated;
select 'I2 admin_marks='||(select count(*) from first_read_marks where company_id='$CO')||' admin_notes='||(select count(*) from first_read_mark_notes where mark_id=(select id from fm));
reset role;
rollback;
SQL
)
fail=0
chk() { local label="$1" pattern="$2"; if echo "$out" | grep -q -- "$pattern"; then echo "  ok   $label"; else echo "  FAIL $label"; fail=1; fi; }
chk "(a) member create refused"        "create_first_read_mark: caller is not an admin"
chk "(a) member append refused"        "append_first_read_mark_note: caller is not an admin"
chk "(a) member withdraw refused"      "withdraw_first_read_mark: caller is not an admin"
chk "(a) no-JWT create refused"        "create_first_read_mark: no authenticated caller"
chk "(a) no-JWT append refused"        "append_first_read_mark_note: no authenticated caller"
chk "(a) no-JWT withdraw refused"      "withdraw_first_read_mark: no authenticated caller"
chk "(b) frozen company refused"       "frozen reference fixture"
chk "(c) empty note refused"           "the note is empty"
if echo "$out" | grep -q "C1b marks=[1-9]"; then echo "  FAIL (c) nothing written (the empty note wrote a mark)"; fail=1; else echo "  ok   (c) nothing written"; fi
if [ "$(echo "$out" | grep -c 'violates check constraint "first_read_marks_disposition_by_kind"')" = 2 ]; then echo "  ok   (d) our_mark with a disposition AND client_reaction without one both refused"; else echo "  FAIL (d) disposition-by-kind (expected 2 refusals)"; fail=1; fi
chk "(m) mark + note v1 in one call"   "M1 created=1 v1=1"
if [ "$(echo "$out" | grep -c 'anchor, kind, disposition and birth fields are immutable')" = 2 ]; then echo "  ok   (e) anchor UPDATE and kind UPDATE both refused"; else echo "  FAIL (e) anchor / kind UPDATE (expected 2 refusals)"; fail=1; fi
chk "(e) DELETE refused"               "withdrawn, never deleted"
chk "(f) versions 1,2,3 append"        "F3 versions=1,2,3"
chk "(f) note UPDATE refused"          "never edited; append the next version"
chk "(f) note DELETE refused"          "never deleted"
chk "(f) v1 intact, 3 versions"        "F6 v1_intact=true n=3"
chk "(j) disposition change appends v4 with the new value" "J1 v=4"
chk "(j) v4 carries the new disposition" "J1b d4=interesting"
chk "(j) v1 intact on the mark row and note v1; current = latest" "J2 mark_v1=address_next_phase note_v1=address_next_phase current=interesting"
chk "(l) appends without a disposition carried v1's forward" "L1 carried=address_next_phase,address_next_phase,address_next_phase,interesting"
chk "(l) an append without a disposition carries the latest (v5 = interesting)" "L2b d5=interesting"
chk "(k) our_mark append with a disposition refused (RPC)" "append_first_read_mark_note: our mark never carries a disposition"
chk "(k) our_mark append without one → v2, NULL" "K2b rows=1 d=NULL"
chk "(k) trigger: our_mark note with a disposition refused" "first_read_mark_notes: our mark never carries a disposition"
chk "(k) trigger: client_reaction note without a disposition refused" "first_read_mark_notes: a client_reaction version carries a disposition"
chk "(h) withdraw ok, one audit row, triple set" "H2 audits=1 withdrawn=true"
chk "(g) append on a withdrawn mark refused" "append_first_read_mark_note: mark .* is withdrawn"
chk "(h) second withdraw refused"      "is already withdrawn"
chk "(h) still one audit row"          "H4 audits=1"
chk "(i) member SELECT = 0"            "I1 member_marks=0 member_notes=0"
chk "(i) admin SELECT sees the rows"   "I2 admin_marks=2 admin_notes=5"
[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^[A-Z][0-9]|ERROR" | head -40; exit 1; }
