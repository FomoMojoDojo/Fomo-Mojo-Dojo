#!/usr/bin/env bash
# ── SERVICE-STATE GUARD — SP-15, SP-20, SP-37, SP-38 (operator rulings 2026-11-11) ───────────────
#
# WHY. odi_needs.service_state carried four spellings of three meanings plus one value no reader
# knows, with nothing stopping a fifth. The census (slice1-review.md) found six of fourteen writers
# emitting outside the two values first proposed, which is why the vocabulary is FOUR:
# 'underserved', 'served', 'overserved', 'monitor'. 'overserved' is computed by two live writers
# (research-company/index.ts:2931; useOdiNeeds.ts:224) and rendered by ten readers; 'monitor' is
# admitted rather than rewritten because no reader recognises it, so it SUPPRESSES the verdict —
# rewriting it to 'served' would newly render "Served" on an unscored need (SP-37).
#
# The constraint is NOT VALID permanently: the six legacy-spelling rows sit on the frozen company
# 58b2b15b-…, enforce_company_freeze refuses every write to them, so VALIDATE CONSTRAINT can never
# succeed. s3 is the standing proof that those six are untouched.
#
# Checks:
#   s1. the constraint exists on odi_needs and convalidated = false.
#   s2. on a HELD throwaway company, an INSERT of each of the four values succeeds, and an INSERT of
#       'under_served', 'appropriately_served', 'over_served' and 'x' is each refused BY THIS
#       CONSTRAINT — the error must name odi_needs_service_state_check, not merely fail.
#   s3. the six frozen rows are present and unmodified, by id AND value.
#
# The throwaway is born HELD (fixture_hold) and is retired in E2 order: stamped first, its deletable
# children removed at teardown, the company itself NEVER deleted. It is a FIXED id reused every run,
# so the fleet gains one accounted-for held company, not one per run.
#
# Plant (run by hand; the guard must be shown non-vacuous):
#   bash scripts/plant.sh save supabase/migrations/20261111213000_odi_needs_service_state_check.sql
#   # remove 'overserved' from the CHECK in that file, then re-apply it to the DB:
#   #   drop constraint odi_needs_service_state_check; then run the edited file
#   bash scripts/guards/service-state-guard.sh        # → s2 RED: 'overserved' is refused
#   bash scripts/plant.sh restore supabase/migrations/20261111213000_odi_needs_service_state_check.sql
#   # re-apply the restored file; the run after THAT is the GREEN one.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.deno/bin:$PATH"
DB=supabase_db_dzlgyxcvuwiulgifbmew
CON=odi_needs_service_state_check
CO=00000000-0000-4000-8000-0000000053a1
HOLD='SS:service-state-guard'

psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
psql_err() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1" 2>&1 1>/dev/null || true; }
fail() { echo "FAIL $1: $2"; exit 1; }

# the throwaway is born HELD (E2: stamp first), and its owner is the test account, never the operator
psql "insert into companies (id, name, website, created_by, fixture_hold)
      select '$CO', 'ZZ Service State Guard', 'https://service-state.example',
             (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), '$HOLD'
      where not exists (select 1 from companies where id='$CO');" >/dev/null
[ "$(psql "select coalesce(fixture_hold,'∅') from companies where id='$CO'")" = "$HOLD" ] \
  || fail seed "the throwaway is not held — refusing to write needs to an unheld company"
cleanup() { psql "delete from odi_needs where company_id='$CO';" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup
echo "seed. held throwaway $CO (fixture_hold=$HOLD), no needs"

OWNER=$(psql "select created_by from companies where id='$CO'")

# ── s1 ───────────────────────────────────────────────────────────────────────────────────────────
ROW=$(psql "select convalidated from pg_constraint where conrelid='public.odi_needs'::regclass and conname='$CON'")
[ -n "$ROW" ] || fail s1 "constraint $CON does not exist on odi_needs"
[ "$ROW" = "f" ] || fail s1 "$CON is convalidated=$ROW — it must stay NOT VALID (the six frozen rows can never pass)"
echo "s1. $CON exists and is NOT VALID (convalidated=f)"

# ── s2 ───────────────────────────────────────────────────────────────────────────────────────────
for v in underserved served overserved monitor; do
  psql "insert into odi_needs (company_id, user_id, desired_outcome, service_state)
        values ('$CO', '$OWNER', 'guard accepts $v', '$v');" >/dev/null \
    || fail s2 "the admitted value '$v' was REFUSED"
done
N=$(psql "select count(*) from odi_needs where company_id='$CO'")
[ "$N" = "4" ] || fail s2 "expected 4 accepted rows, found $N"

for v in under_served appropriately_served over_served x; do
  ERR=$(psql_err "insert into odi_needs (company_id, user_id, desired_outcome, service_state)
                  values ('$CO', '$OWNER', 'guard refuses $v', '$v');")
  [ -n "$ERR" ] || fail s2 "'$v' was ACCEPTED — the vocabulary is not enforced"
  echo "$ERR" | grep -q "$CON" \
    || fail s2 "'$v' failed, but not on $CON: $(echo "$ERR" | head -1)"
done
N=$(psql "select count(*) from odi_needs where company_id='$CO'")
[ "$N" = "4" ] || fail s2 "a refused insert left a row behind: $N rows"
echo "s2. the four values are accepted; under_served / appropriately_served / over_served / x are each refused by $CON"

# ── s3 ───────────────────────────────────────────────────────────────────────────────────────────
WANT='1f4ae0ba-9952-40ca-91f0-0951f81a6581=appropriately_served|722d68bc-dab1-4fea-a648-d741d23486b3=under_served|750cda05-0969-4455-882e-c1a4b2338aff=under_served|bd74fab3-b4e4-482e-8dde-ca25d90d2cff=under_served|e25cc00b-2524-4d42-ad9c-907ffeb6f8c6=under_served|ff4b704f-352e-445a-9347-29f4781ec679=appropriately_served'
GOT=$(psql "select string_agg(id||'='||service_state, '|' order by id) from odi_needs
            where company_id='58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'
              and service_state not in ('underserved','served','overserved','monitor')")
[ "$GOT" = "$WANT" ] || fail s3 "the six frozen rows changed:
  want $WANT
  got  $GOT"
[ "$(psql "select frozen from companies where id='58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'")" = "t" ] \
  || fail s3 "the reference company is no longer frozen — the six rows are writable and VALIDATE could be attempted"
echo "s3. the six frozen rows are present and unmodified, on a company still frozen"

echo "GUARD OK"
