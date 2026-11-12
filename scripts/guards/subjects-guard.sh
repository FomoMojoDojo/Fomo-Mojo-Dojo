#!/usr/bin/env bash
# ── SUBJECTS GUARD — SP-11, SP-26, SP-40, SP-50, SP-51, SP-52 (operator rulings 2026-11-11) ──────
#
# WHY. subjects answers "who is this row of evidence ABOUT", which company_id and voice_class
# together cannot. Three of its properties are load-bearing and none of them is visible in a diff
# six months from now, so each has a check here:
#
#   * a row's subject must belong to the ROW'S OWN company (SP-11/SP-51). Stated as a composite
#     foreign key (subject_id, company_id) -> subjects (id, company_id), not a trigger. If that key
#     is ever dropped or re-pointed at subjects(id) alone, company A's evidence can be attributed to
#     a subject of company B and a member of A reads a name they have no right to. Check d.
#   * deleting a referenced subject is REFUSED (SP-40). ON DELETE SET NULL would re-attribute that
#     subject's evidence TO THE CLIENT, because NULL means the client (C1) — the one answer that is
#     always wrong. Retirement is retired_at. Check e.
#   * nothing reads or writes subject_id yet (SP-50). This slice adds the columns and no reader, so
#     every row fleet-wide must still be NULL and src/ must mention subject_id only in the generated
#     types. Check g, run both before and after this guard's own fixtures exist.
#
# Checks:
#   a. subjects_role_check accepts account / account_related / buyers and refuses 'self' and 'x',
#      BY NAME — 'self' is the one that matters: C1 removed the self role deliberately, and a self
#      row would be a second place the client's own name and host live, free to disagree with
#      companies.name and companies.website.
#   b. subjects_host_check is byte-identical to company_related_entities_host_check, so the two
#      tables cannot drift apart about what a host is.
#   b2. a NULL host is ACCEPTED. The CHECK has no `host is null or` arm and does not need one — a
#      CHECK refuses a row only when it evaluates to FALSE, and every arm here is NULL when host is
#      NULL. b2 proves that rather than leaving it to be re-derived.
#   c. the same host twice on one company is refused by subjects_one_host.
#   d. SP-51: a signal / claim / need on company A carrying a subject of company B is REFUSED, and
#      the error NAMES the composite FK. Also that the same subject on its OWN company is accepted —
#      a check that only proves a refusal passes equally well against a table nobody can write.
#   e. SP-40: deleting a subject a row points at is refused by the FK; a subject with no rows
#      deletes cleanly.
#   f. RLS (SP-52): the member of a company reads its subject; a member of ANOTHER company and a
#      signed-in account with no company each read none of it; an admin reads it (non-vacuity);
#      member INSERT is refused and member UPDATE / DELETE touch 0 rows; anon is refused outright.
#   g. SP-50: zero non-null subject_id on all three tables fleet-wide, asserted BEFORE this guard
#      writes its own fixtures and again after teardown; and `grep -rnE '\bsubject_id\b' src/`
#      reaches only src/integrations/supabase/types.ts. The word boundary matters: a plain
#      `grep subject_id` also matches subject_identity in src/lib/checkOutcomes/index.ts, which is
#      an unrelated field and not a reader of this column.
#
# FIXTURES. Two held throwaway companies with FIXED ids, born held (E2: stamp first), reused every
# run so the fleet gains two accounted-for held companies and not two per run. Their deletable
# children are removed at teardown; the companies themselves are NEVER deleted.
#
# The RLS checks cannot use a held throwaway for the member's own company: the only member fixture
# is MEMBER_ID on 66666666-…601, which must stay UNHELD (SP-44) and must keep exactly one
# company_members row (first-read-rls-guard asserts that shape), so this guard must not grant it a
# membership anywhere else. So …601 plays "the member's own company" and holds one subject named
# with this guard's own prefix, deleted by that prefix at teardown; the held throwaway CO_A plays
# "another company", which is what MEMBER_ID must read nothing of.
#
# Plants (run by hand; the guard must be shown non-vacuous):
#   # (d) — drop the composite FK on signals
#   bash scripts/plant.sh save supabase/migrations/20261111234100_subject_id_on_signals_claims_odi_needs.sql
#   docker exec -i supabase_db_dzlgyxcvuwiulgifbmew psql -U postgres -d postgres \
#     -c "alter table public.signals drop constraint signals_subject_fkey;"
#   bash scripts/guards/subjects-guard.sh            # → d RED: the cross-company signal is ACCEPTED
#   docker exec -i supabase_db_dzlgyxcvuwiulgifbmew psql -U postgres -d postgres \
#     -c "alter table public.signals add constraint signals_subject_fkey foreign key (subject_id, company_id) references public.subjects (id, company_id) on delete restrict;"
#   bash scripts/plant.sh restore supabase/migrations/20261111234100_subject_id_on_signals_claims_odi_needs.sql
#   # (a) — remove 'buyers' from the role CHECK
#   bash scripts/plant.sh save supabase/migrations/20261111234000_subjects.sql
#   # edit the file's role CHECK to ('account','account_related'), then in the DB:
#   #   alter table public.subjects drop constraint subjects_role_check;
#   #   alter table public.subjects add constraint subjects_role_check check (role in ('account','account_related'));
#   bash scripts/guards/subjects-guard.sh            # → a RED: the role 'buyers' was REFUSED
#   bash scripts/plant.sh restore supabase/migrations/20261111234000_subjects.sql
#   # restore the CHECK from the restored file; the run after THAT is the GREEN one.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
CO_A=00000000-0000-4000-8000-0000000053b1
CO_B=00000000-0000-4000-8000-0000000053b2
HOLD_A='SB:subjects-guard-A'
HOLD_B='SB:subjects-guard-B'
PREFIX='ZZ subjects-guard'

MEM=${MEMBER_ID:-}
[ -n "$MEM" ] || { echo "guard: FAIL MEMBER_ID not set (source backups/fr-member.env)"; exit 1; }
MEMCO=${MEMBER_COMPANY_ID:-}
[ -n "$MEMCO" ] || { echo "guard: FAIL MEMBER_COMPANY_ID not set (source backups/fr-member.env)"; exit 1; }
NA=${NONADMIN_ID:-}
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }

psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
psql_err() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1" 2>&1 1>/dev/null || true; }
# -q as well as -At: without it psql appends the command status tag ("INSERT 0 1") as a second
# line, and a captured "returning id" becomes a two-line string that is not a uuid.
psql_val() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAtc "$1"; }
fail() { echo "FAIL $1: $2"; exit 1; }

# One query as a given auth.uid(), with RLS applied: role authenticated plus the jwt sub the
# policies read. Rolled back, so a write that slips through cannot persist.
asuser() {
  docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt <<SQL 2>/dev/null
begin;
\\o /dev/null
select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, true);
set local role authenticated;
\\o
$2;
rollback;
SQL
}
asuser_err() {
  docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt <<SQL 2>&1 1>/dev/null || true
begin;
\\o /dev/null
select set_config('request.jwt.claims', json_build_object('sub','$1','role','authenticated')::text, true);
set local role authenticated;
\\o
$2;
rollback;
SQL
}
asanon_err() {
  docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt <<SQL 2>&1 1>/dev/null || true
begin;
\\o /dev/null
set local role anon;
\\o
$1;
rollback;
SQL
}

# ── g1: fleet-wide NULL, asserted BEFORE this guard writes anything ──────────────────────────────
for t in signals claims odi_needs; do
  N=$(psql "select count(*) from public.$t where subject_id is not null")
  [ "$N" = "0" ] || fail g1 "$t already carries $N non-null subject_id rows — this slice adds no writer, so something else is writing the column"
done
echo "g1. zero non-null subject_id on signals, claims and odi_needs, fleet-wide (before fixtures)"

# ── seed: both throwaways born HELD, owned by the test account, never the operator ───────────────
for pair in "$CO_A|$HOLD_A|A" "$CO_B|$HOLD_B|B"; do
  IFS='|' read -r co hold tag <<< "$pair"
  psql "insert into companies (id, name, website, created_by, fixture_hold)
        select '$co', 'ZZ Subjects Guard $tag', 'https://subjects-$tag.example',
               (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), '$hold'
        where not exists (select 1 from companies where id='$co');" >/dev/null
  [ "$(psql "select coalesce(fixture_hold,'∅') from companies where id='$co'")" = "$hold" ] \
    || fail seed "throwaway $co is not held — refusing to write subjects to an unheld company"
  [ "$(psql "select frozen from companies where id='$co'")" = "f" ] \
    || fail seed "throwaway $co is frozen — enforce_company_freeze would refuse every insert"
done

cleanup() {
  psql "delete from public.signals   where company_id in ('$CO_A','$CO_B');" >/dev/null 2>&1 || true
  psql "delete from public.claims    where company_id in ('$CO_A','$CO_B');" >/dev/null 2>&1 || true
  psql "delete from public.odi_needs where company_id in ('$CO_A','$CO_B');" >/dev/null 2>&1 || true
  psql "delete from public.subjects  where company_id in ('$CO_A','$CO_B');" >/dev/null 2>&1 || true
  # on the member's live-ish fixture company, delete ONLY this guard's own rows, by name
  psql "delete from public.subjects where company_id='$MEMCO' and name like '$PREFIX%';" >/dev/null 2>&1 || true
}
trap cleanup EXIT
cleanup
echo "seed. held throwaways $CO_A / $CO_B (fixture_hold=$HOLD_A / $HOLD_B), no subjects"

OWNER=$(psql "select created_by from companies where id='$CO_A'")
ADMIN=$(psql "select user_id from user_roles where role='admin' order by user_id limit 1")
[ -n "$ADMIN" ] || fail seed "no admin in user_roles — check f's non-vacuity arm cannot run"

# ── a: the role CHECK ────────────────────────────────────────────────────────────────────────────
for r in account account_related buyers; do
  psql "insert into public.subjects (company_id, role, name) values ('$CO_A', '$r', '$PREFIX role $r');" >/dev/null \
    || fail a "the role '$r' was REFUSED"
done
for r in self x; do
  ERR=$(psql_err "insert into public.subjects (company_id, role, name) values ('$CO_A', '$r', '$PREFIX bad $r');")
  [ -n "$ERR" ] || fail a "the role '$r' was ACCEPTED — the role vocabulary is not enforced"
  echo "$ERR" | grep -q subjects_role_check \
    || fail a "the role '$r' failed, but not on subjects_role_check: $(echo "$ERR" | head -1)"
done
N=$(psql "select count(*) from public.subjects where company_id='$CO_A'")
[ "$N" = "3" ] || fail a "expected 3 rows after the role checks, found $N"
echo "a. subjects_role_check accepts account / account_related / buyers; 'self' and 'x' are each refused by it"

# ── b: the host CHECK is the sibling's, byte for byte ────────────────────────────────────────────
H_SUB=$(psql "select pg_get_constraintdef(oid) from pg_constraint where conname='subjects_host_check'")
H_CRE=$(psql "select pg_get_constraintdef(oid) from pg_constraint where conname='company_related_entities_host_check'")
[ -n "$H_SUB" ] || fail b "subjects_host_check does not exist"
[ -n "$H_CRE" ] || fail b "company_related_entities_host_check does not exist"
[ "$H_SUB" = "$H_CRE" ] || fail b "the two host CHECKs have drifted apart:
  subjects:                  $H_SUB
  company_related_entities:  $H_CRE"
echo "b. subjects_host_check is byte-identical to company_related_entities_host_check"

psql "insert into public.subjects (company_id, role, name, host) values ('$CO_A', 'account', '$PREFIX null host', null);" >/dev/null \
  || fail b2 "a NULL host was REFUSED — the CHECK has no 'host is null or' arm and must not need one"
for bad in 'WWW.Example.COM' 'www.example.com' 'not a host'; do
  ERR=$(psql_err "insert into public.subjects (company_id, role, name, host) values ('$CO_A', 'account', '$PREFIX bad host', '$bad');")
  [ -n "$ERR" ] || fail b2 "the host '$bad' was ACCEPTED"
  echo "$ERR" | grep -q subjects_host_check || fail b2 "the host '$bad' failed, but not on subjects_host_check"
done
echo "b2. a NULL host is accepted; uppercase, www. and non-host strings are each refused by subjects_host_check"

# ── c: one confirmed host per company ────────────────────────────────────────────────────────────
psql "insert into public.subjects (company_id, role, name, host) values ('$CO_A', 'account', '$PREFIX host one', 'dup.example');" >/dev/null
ERR=$(psql_err "insert into public.subjects (company_id, role, name, host) values ('$CO_A', 'account_related', '$PREFIX host two', 'dup.example');")
[ -n "$ERR" ] || fail c "the same host twice on one company was ACCEPTED"
echo "$ERR" | grep -q subjects_one_host || fail c "the duplicate host failed, but not on subjects_one_host: $(echo "$ERR" | head -1)"
psql "insert into public.subjects (company_id, role, name, host) values ('$CO_B', 'account', '$PREFIX host on B', 'dup.example');" >/dev/null \
  || fail c "the same host on a DIFFERENT company was refused — subjects_one_host must be per company"
echo "c. the same host twice on one company is refused by subjects_one_host; the same host on another company is allowed"

# ── d: SP-51, a subject cannot cross companies ───────────────────────────────────────────────────
SA=$(psql_val "insert into public.subjects (company_id, role, name) values ('$CO_A','account','$PREFIX A subject') returning id")
SB=$(psql_val "insert into public.subjects (company_id, role, name) values ('$CO_B','account','$PREFIX B subject') returning id")
ins_signal() { psql "insert into public.signals (company_id, claim_text, signal_band, source_type, subject_id) values ('$1','$PREFIX signal','organization','intake', $2);"; }
ins_claim()  { psql "insert into public.claims (company_id, statement, subject_id) values ('$1','$PREFIX claim', $2);"; }
ins_need()   { psql "insert into public.odi_needs (company_id, user_id, desired_outcome, subject_id) values ('$1','$OWNER','$PREFIX need', $2);"; }
ins_signal_err() { psql_err "insert into public.signals (company_id, claim_text, signal_band, source_type, subject_id) values ('$1','$PREFIX signal','organization','intake', $2);"; }
ins_claim_err()  { psql_err "insert into public.claims (company_id, statement, subject_id) values ('$1','$PREFIX claim', $2);"; }
ins_need_err()   { psql_err "insert into public.odi_needs (company_id, user_id, desired_outcome, subject_id) values ('$1','$OWNER','$PREFIX need', $2);"; }

for spec in "signals|signals_subject_fkey" "claims|claims_subject_fkey" "odi_needs|odi_needs_subject_fkey"; do
  IFS='|' read -r tbl con <<< "$spec"
  case "$tbl" in
    signals)   ERR=$(ins_signal_err "$CO_A" "'$SB'") ;;
    claims)    ERR=$(ins_claim_err  "$CO_A" "'$SB'") ;;
    odi_needs) ERR=$(ins_need_err   "$CO_A" "'$SB'") ;;
  esac
  [ -n "$ERR" ] || fail d "$tbl ACCEPTED a row on company A carrying a subject of company B — SP-11 is not enforced"
  echo "$ERR" | grep -q "$con" || fail d "$tbl refused the cross-company subject, but not on $con: $(echo "$ERR" | head -1)"
  # non-vacuity: the SAME subject on its OWN company must be accepted
  case "$tbl" in
    signals)   ins_signal "$CO_A" "'$SA'" >/dev/null || fail d "$tbl refused a subject of its OWN company" ;;
    claims)    ins_claim  "$CO_A" "'$SA'" >/dev/null || fail d "$tbl refused a subject of its OWN company" ;;
    odi_needs) ins_need   "$CO_A" "'$SA'" >/dev/null || fail d "$tbl refused a subject of its OWN company" ;;
  esac
done
echo "d. a cross-company subject is refused on signals / claims / odi_needs, each by its own composite FK; the same subject on its own company is accepted"

# ── e: SP-40, a referenced subject cannot be deleted ─────────────────────────────────────────────
ERR=$(psql_err "delete from public.subjects where id='$SA';")
[ -n "$ERR" ] || fail e "a subject that three rows point at was DELETED — the FKs are not RESTRICT"
echo "$ERR" | grep -qE "signals_subject_fkey|claims_subject_fkey|odi_needs_subject_fkey" \
  || fail e "the delete failed, but not on a subject FK: $(echo "$ERR" | head -1)"
STILL=$(psql "select count(*) from public.signals where subject_id='$SA'")
[ "$STILL" = "1" ] || fail e "the refused delete changed the referencing rows (signals pointing at it: $STILL)"
FREE=$(psql_val "insert into public.subjects (company_id, role, name) values ('$CO_A','buyers','$PREFIX unreferenced') returning id")
psql "delete from public.subjects where id='$FREE';" >/dev/null || fail e "an UNREFERENCED subject could not be deleted — RESTRICT is too broad"
echo "e. deleting a referenced subject is refused by its FK and changes nothing; an unreferenced subject deletes cleanly"

# ── f: RLS (SP-52) ───────────────────────────────────────────────────────────────────────────────
S601=$(psql_val "insert into public.subjects (company_id, role, name) values ('$MEMCO','account','$PREFIX member company subject') returning id")

N=$(asuser "$MEM" "select count(*) from public.subjects where id='$S601'")
[ "$N" = "1" ] || fail f "a member of its own company read $N of 1 of that company's subjects"
N=$(asuser "$MEM" "select count(*) from public.subjects where company_id='$CO_A'")
[ "$N" = "0" ] || fail f "a member of ANOTHER company read $N subjects of company A — the cross-tenant boundary is open"
N=$(asuser "$NA" "select count(*) from public.subjects")
[ "$N" = "0" ] || fail f "a signed-in account with no company read $N subjects"
N=$(asuser "$ADMIN" "select count(*) from public.subjects where company_id='$CO_A'")
[ "$N" -gt 0 ] || fail f "NON-VACUITY: the admin read 0 subjects of company A — the reads above may be passing because the table looks empty"
echo "f. member reads its own company's subject (1); member of another company reads 0; no-company account reads 0; admin reads $N (non-vacuous)"

ERR=$(asuser_err "$MEM" "insert into public.subjects (company_id, role, name) values ('$MEMCO','account','$PREFIX member insert')")
[ -n "$ERR" ] || fail f "a member INSERT was ACCEPTED — writes are admin-only (SP-52)"
echo "$ERR" | grep -qi "row-level security\|violates row-level" || fail f "the member INSERT failed, but not on RLS: $(echo "$ERR" | head -1)"
UPD=$(asuser "$MEM" "with u as (update public.subjects set name='$PREFIX hijacked' where id='$S601' returning 1) select count(*) from u")
[ "$UPD" = "0" ] || fail f "a member UPDATE touched $UPD rows"
DEL=$(asuser "$MEM" "with d as (delete from public.subjects where id='$S601' returning 1) select count(*) from d")
[ "$DEL" = "0" ] || fail f "a member DELETE touched $DEL rows"
[ "$(psql "select name from public.subjects where id='$S601'")" = "$PREFIX member company subject" ] \
  || fail f "the member's refused writes changed the row anyway"
ERR=$(asanon_err "select count(*) from public.subjects")
[ -n "$ERR" ] || fail f "anon read the table — the anon grant was not revoked"
echo "$ERR" | grep -qi "permission denied" || fail f "anon failed, but not on a missing grant: $(echo "$ERR" | head -1)"
echo "f2. member INSERT refused by RLS; member UPDATE and DELETE touch 0 rows; anon is refused for want of a grant"

# ── g2: no reader in src/ ────────────────────────────────────────────────────────────────────────
FILES=$(grep -rlE '\bsubject_id\b' src/ 2>/dev/null | sort || true)
[ "$FILES" = "src/integrations/supabase/types.ts" ] \
  || fail g2 "subject_id is referenced outside the generated types — this slice adds no reader:
$FILES"
echo "g2. subject_id appears in src/ only in src/integrations/supabase/types.ts"

# ── g3: fleet-wide NULL restored once this guard's fixtures are gone ─────────────────────────────
cleanup
for t in signals claims odi_needs; do
  N=$(psql "select count(*) from public.$t where subject_id is not null")
  [ "$N" = "0" ] || fail g3 "$t still carries $N non-null subject_id rows after teardown"
done
echo "g3. teardown restored zero non-null subject_id on all three tables"

echo "GUARD OK"
