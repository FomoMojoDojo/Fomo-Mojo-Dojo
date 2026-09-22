#!/usr/bin/env bash
# Interview parser, commit 1 — the DB guards, against the REAL local database, everything inside ONE
# ROLLED-BACK transaction over a throwaway company (never CB1 / CB2 / Edgewood / any live company).
# Prints "guard: PASS" or "guard: FAIL …".
#
# Checks: (a) member SELECT on items = 0, admin sees the rows · (b) retracting the record retracts its
# items AND its needs in one statement, with the ruled reason · (c) a second LIVE item with the same
# content identity on one record is refused (rule 5, idempotent re-parse) · (d) raw_words / pointer /
# content_identity UPDATE refused, review_state still updatable (rules 2 and 3) · (e) `validated`
# cannot be set by any UPDATE (rule 4 — only its own RPC, which does not exist yet) · (f) the census is
# green · (g) the rules file exports the version and the five rules.
#
# Plants (each removes ONE rule, inside the transaction where possible):
#   PLANT=select (a) · PLANT=reach (b) · PLANT=identity (c) · PLANT=immutable (d) ·
#   PLANT=validated (e) · PLANT=census (f, source) · PLANT=rules (g, source)
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
NA=${NONADMIN_ID:-}
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }
ADMIN=$(docker exec -i "$PGC" psql -U postgres -d postgres -Atc "select user_id from user_roles where role='admin' limit 1;")
[ -n "$ADMIN" ] || { echo "guard: FAIL no admin user_roles row"; exit 1; }
PLANT=${PLANT:-}
CO=11111111-1111-1111-1111-111111111111
REC=22222222-2222-2222-2222-222222222222
IT=33333333-3333-3333-3333-333333333333
SHA=$(printf 'a%.0s' $(seq 64))

SQL=$(mktemp)
{
echo "begin;"
echo "insert into companies (id, name, created_by) values ('$CO','zz-parser-guard','$ADMIN');"
echo "insert into interview_records (id, company_id, speaker_role, person_name, person_role, interviewed_at, interviewer, consent_basis, verbatim, created_by) values ('$REC','$CO','client_stakeholder','P','R',now(),'I','verbal','FIXTURE transcript text','$ADMIN');"
echo "insert into odi_needs (company_id, user_id, journey_key, desired_outcome, interview_record_id, status, provenance_type) values ('$CO','$ADMIN','customer','FIXTURE need','$REC','active','client_attested');"

if [ "$PLANT" = "reach" ]; then
  echo "create or replace function public.interview_records_retraction_propagates() returns trigger language plpgsql as \$f\$ begin if old.retracted_at is null and new.retracted_at is not null then update public.odi_needs set status='retracted', updated_at=now() where interview_record_id=new.id and status<>'retracted'; end if; return new; end; \$f\$;"
fi
[ "$PLANT" = "immutable" ] && echo "drop trigger trg_interview_items_immutable on public.interview_items;"
[ "$PLANT" = "validated" ] && echo "drop trigger trg_interview_items_immutable on public.interview_items;"
[ "$PLANT" = "identity" ] && echo "drop index public.interview_items_one_live_per_identity;"
[ "$PLANT" = "select" ] && echo "create policy \"PLANT members read items\" on public.interview_items for select using (true);"

echo "insert into interview_items (id, company_id, interview_record_id, kind, raw_words, speaker_label, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity) values ('$IT','$CO','$REC','pain_point','FIXTURE raw words','Speaker A','{\"turn_index\":3,\"line_start\":10,\"line_end\":12,\"passage_sha256\":\"$SHA\"}'::jsonb,'$SHA','located','market','accepted','FIXTURE judge reason','2026-09-22.1','identity-one');"
echo "select 'L1 landed='||(select count(*) from interview_items where id='$IT')||' validated='||(select validated from interview_items where id='$IT')||' review='||(select review_state from interview_items where id='$IT');"

echo "savepoint c1;"
echo "insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity) values ('$CO','$REC','pain_point','FIXTURE raw words again','{}'::jsonb,'$SHA','located','market','accepted','r','2026-09-22.1','identity-one');"
echo "select 'C1 second_live_accepted';"
echo "rollback to c1;"

echo "savepoint d1; update interview_items set raw_words='rewritten' where id='$IT'; select 'D1 raw_words_changed'; rollback to d1;"
echo "savepoint d2; update interview_items set pointer='{\"turn_index\":99}'::jsonb where id='$IT'; select 'D2 pointer_changed'; rollback to d2;"
echo "savepoint d3; update interview_items set content_identity='other' where id='$IT'; select 'D3 identity_changed'; rollback to d3;"
echo "update interview_items set review_state='reviewed' where id='$IT';"
echo "select 'D4 review='||(select review_state from interview_items where id='$IT');"
echo "savepoint e1; update interview_items set validated=true where id='$IT'; select 'E1 validated_set'; rollback to e1;"

echo "reset role;"
echo "select set_config('request.jwt.claims', '{\"sub\":\"$NA\",\"role\":\"authenticated\"}', true); set role authenticated;"
echo "select 'A1 member_items='||(select count(*) from interview_items where company_id='$CO');"
echo "reset role; select set_config('request.jwt.claims', '{\"sub\":\"$ADMIN\",\"role\":\"authenticated\"}', true); set role authenticated;"
echo "select 'A2 admin_items='||(select count(*) from interview_items where company_id='$CO');"
echo "reset role;"

echo "update interview_records set retracted_at=now(), retracted_reason='guard' where id='$REC';"
echo "select 'B1 items_retracted='||(select count(*) from interview_items where interview_record_id='$REC' and retracted_at is not null)||' needs_retracted='||(select count(*) from odi_needs where interview_record_id='$REC' and status='retracted')||' reason='||coalesce((select retracted_reason from interview_items where interview_record_id='$REC' limit 1),'NULL');"
echo "rollback;"
} > "$SQL"

out=$(docker exec -i "$PGC" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f - < "$SQL" 2>&1)
rm -f "$SQL"

fail=0
chk() { if echo "$out" | grep -q -- "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }
no()  { if echo "$out" | grep -q -- "$2"; then echo "  FAIL $1"; fail=1; else echo "  ok   $1"; fi; }

chk "(landing) item lands unvalidated and unreviewed" "L1 landed=1 validated=false review=unreviewed"
no  "(c) a second LIVE item with the same identity is refused" "C1 second_live_accepted"
chk "(c) the refusal names the live-identity index" "interview_items_one_live_per_identity"
no  "(d) raw_words UPDATE refused" "D1 raw_words_changed"
no  "(d) pointer UPDATE refused" "D2 pointer_changed"
no  "(d) content_identity UPDATE refused" "D3 identity_changed"
chk "(d) the refusal names the fixed-at-landing rule" "the words, the pointer, the identity and the rules version are fixed at landing"
chk "(d) review_state IS updatable" "D4 review=reviewed"
no  "(e) validated cannot be set by an UPDATE" "E1 validated_set"
chk "(e) the refusal names the RPC rule" "validated is set only by its own RPC"
chk "(a) member SELECT = 0" "A1 member_items=0"
chk "(a) admin SELECT sees the row" "A2 admin_items=1"
chk "(b) retraction reaches items AND needs, with the ruled reason" "B1 items_retracted=1 needs_retracted=1 reason=source interview withdrawn"

if npx vitest run src/lib/interviewParser/interviewItems.census.test.ts >/dev/null 2>&1; then
  echo "  ok   (f) the interview_items census is green"
else echo "  FAIL (f) the interview_items census"; fail=1; fi
RULES=supabase/functions/interview-parser/rules.ts
if grep -q 'PARSER_RULES_VERSION = "2026-09-22.1"' "$RULES" && [ "$(grep -c '^  "' "$RULES")" = 5 ]; then
  echo "  ok   (g) the rules file exports the version and all five rules"
else echo "  FAIL (g) the rules file version / rule count"; fail=1; fi

[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^ ?[A-Z][0-9]|ERROR" | head -30; exit 1; }
