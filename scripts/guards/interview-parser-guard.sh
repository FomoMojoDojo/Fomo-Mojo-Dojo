#!/usr/bin/env bash
# Interview parser, commit 1 — the DB guards, against the REAL local database, everything inside ONE
# ROLLED-BACK transaction over a throwaway company (never CB1 / CB2 / Edgewood / any live company).
# Prints "guard: PASS" or "guard: FAIL …".
#
# Commit 4c adds: (k) the scope CHECK and its fixed-at-landing rule · (l) the two new kinds are
# accepted and a kind outside the ten is not · (m) a near-duplicate annotation is an ordinary
# judge_reason UPDATE — the row is KEPT and its statement is not touched.
#
# Commit 4a adds: (h) the speaker_side check constraint and its fixed-at-landing rule · (i) the
# set_interview_our_speakers refusals (non-admin, withdrawn record, frozen company) and its audit row
# with COUNT ONLY · (j) supersession and side-change retraction reasons are accepted by the pair
# constraint and the retracted row is KEPT.
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
#   PLANT=validated (e) · PLANT=census (f, source) · PLANT=rules (g, source) ·
#   PLANT=side (h, drops the speaker_side constraint) · PLANT=rpc (i, drops the admin check) ·
#   PLANT=scope (k, drops the scope constraint) · PLANT=kinds (l, reverts the kind CHECK to eight)
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
[ "$PLANT" = "side" ] && echo "alter table public.interview_items drop constraint interview_items_speaker_side_check;"
[ "$PLANT" = "scope" ] && echo "alter table public.interview_items drop constraint interview_items_scope_check;"
[ "$PLANT" = "kinds" ] && echo "alter table public.interview_items drop constraint interview_items_kind_check; alter table public.interview_items add constraint interview_items_kind_check check (kind in ('job','pain_point','desire','outcome','route','step','positioning','cascade'));"
if [ "$PLANT" = "rpc" ]; then
  echo "create or replace function public.set_interview_our_speakers(p_record_id uuid, p_labels text[]) returns jsonb language plpgsql security definer set search_path=public as \$f\$ begin update public.interview_records set our_speakers=coalesce(p_labels,'{}') where id=p_record_id; return jsonb_build_object('ok',true); end; \$f\$;"
fi

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

# ── (h) R5: speaker_side is constrained, and fixed at landing like the words ──
echo "select 'H0 side='||(select speaker_side from interview_items where id='$IT');"
echo "savepoint h1; update interview_items set speaker_side='ours' where id='$IT'; select 'H1 side_changed'; rollback to h1;"
echo "savepoint h2; insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, speaker_side) values ('$CO','$REC','desire','FIXTURE bad side','{}'::jsonb,'$SHA','located','unplaced','annotated','r','2026-09-23.1','identity-bad-side','neither'); select 'H2 bad_side_accepted'; rollback to h2;"

# ── (k) R5 of 4c: scope is constrained and fixed at landing ──
echo "select 'K0 scope='||(select scope from interview_items where id='$IT');"
echo "savepoint k1; update interview_items set scope='internal' where id='$IT'; select 'K1 scope_changed'; rollback to k1;"
echo "savepoint k2; insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, scope) values ('$CO','$REC','desire','FIXTURE bad scope','{}'::jsonb,'$SHA','located','unplaced','annotated','r','2026-09-23.2','identity-bad-scope','elsewhere'); select 'K2 bad_scope_accepted'; rollback to k2;"

# ── (l) R4: the two new kinds land; a kind outside the ten does not ──
echo "savepoint l1;"
echo "insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, scope) values ('$CO','$REC','ask','FIXTURE could you send the slides before Friday','{}'::jsonb,'$SHA','located','unplaced','annotated','ask items are recorded, not converted','2026-09-23.2','identity-ask','internal');"
echo "insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, scope) values ('$CO','$REC','hypothesis','FIXTURE we never told our own story well','{}'::jsonb,'$SHA','located','unplaced','annotated','hypothesis items are recorded, not converted','2026-09-23.2','identity-hyp','market');"
echo "select 'L2 new_kinds='||(select count(*) from interview_items where kind in ('ask','hypothesis') and interview_record_id='$REC')||' forms_null='||(select count(*) from interview_items where kind in ('ask','hypothesis') and framework_form is null and interview_record_id='$REC');"
echo "rollback to l1;"
echo "savepoint l3; insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, scope) values ('$CO','$REC','vision','FIXTURE not a kind','{}'::jsonb,'$SHA','located','unplaced','annotated','r','2026-09-23.2','identity-vision','market'); select 'L3 bad_kind_accepted'; rollback to l3;"

# ── (m) R9: a near-duplicate annotation is an ordinary reason UPDATE; the row and its statement stay ──
echo "savepoint m1;"
echo "update interview_items set judge_reason='near-duplicate of 1234abcd' where id='$IT';"
echo "select 'M1 kept='||(select count(*) from interview_items where id='$IT' and retracted_at is null)||' reason='||(select judge_reason from interview_items where id='$IT')||' state='||(select judge_state from interview_items where id='$IT');"
echo "rollback to m1;"

# ── (j) R6/R7: both retraction reasons are legal, and the retracted row is KEPT ──
echo "savepoint j1;"
echo "update interview_items set retracted_at=now(), retracted_reason='superseded by rules 2026-09-23.1' where id='$IT';"
echo "select 'J1 kept='||(select count(*) from interview_items where id='$IT')||' reason='||(select retracted_reason from interview_items where id='$IT');"
echo "insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, speaker_side) values ('$CO','$REC','pain_point','FIXTURE raw words','{}'::jsonb,'$SHA','located','unplaced','annotated','spoken by our side','2026-09-23.1','identity-one','ours');"
echo "select 'J2 relanded='||(select count(*) from interview_items where content_identity='identity-one');"
echo "rollback to j1;"
echo "savepoint j3; update interview_items set retracted_at=now(), retracted_reason='speaker side changed' where id='$IT'; select 'J3 side_reason_ok'; rollback to j3;"
echo "savepoint j4; update interview_items set retracted_at=now(), retracted_reason='' where id='$IT'; select 'J4 blank_reason_accepted'; rollback to j4;"

# ── (i) R5: the RPC — refusals, then the audit row that carries a COUNT and never a label ──
echo "reset role;"
echo "select set_config('request.jwt.claims', '{\"sub\":\"$NA\",\"role\":\"authenticated\"}', true); set role authenticated;"
echo "savepoint i1; select 'I1 nonadmin_allowed='||(public.set_interview_our_speakers('$REC', array['Someone']))::text; rollback to i1;"
echo "reset role; select set_config('request.jwt.claims', '{\"sub\":\"$ADMIN\",\"role\":\"authenticated\"}', true); set role authenticated;"
echo "savepoint i2;"
echo "select 'I2 set='||(public.set_interview_our_speakers('$REC', array['Taylor ','Bob','','Bob']))::text;"
echo "select 'I3 labels='||(select array_to_string(our_speakers,'|') from interview_records where id='$REC');"
echo "select 'I4 audit='||(select excluded_by_rule::text from integrity_runs where component='interview_our_speakers_set' and surface_id='$REC' order by id desc limit 1);"
echo "rollback to i2;"
echo "reset role;"
echo "savepoint i5; update companies set frozen=true where id='$CO'; select set_config('request.jwt.claims', '{\"sub\":\"$ADMIN\",\"role\":\"authenticated\"}', true); set role authenticated; select 'I5 frozen_allowed='||(public.set_interview_our_speakers('$REC', array['X']))::text; reset role; rollback to i5;"
echo "savepoint i6; update interview_records set retracted_at=now(), retracted_reason='guard' where id='$REC'; select set_config('request.jwt.claims', '{\"sub\":\"$ADMIN\",\"role\":\"authenticated\"}', true); set role authenticated; select 'I6 withdrawn_allowed='||(public.set_interview_our_speakers('$REC', array['X']))::text; reset role; rollback to i6;"

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
chk "(d) the refusal names the fixed-at-landing rule" "the words, the speaker side, the scope, the pointer, the identity and the rules version are fixed at landing"
chk "(d) review_state IS updatable" "D4 review=reviewed"
no  "(e) validated cannot be set by an UPDATE" "E1 validated_set"
chk "(e) the refusal names the RPC rule" "validated is set only by its own RPC"
chk "(a) member SELECT = 0" "A1 member_items=0"
chk "(a) admin SELECT sees the row" "A2 admin_items=1"
chk "(b) retraction reaches items AND needs, with the ruled reason" "B1 items_retracted=1 needs_retracted=1 reason=source interview withdrawn"
chk "(k) R5-4c scope defaults to market at landing" "K0 scope=market"
no  "(k) R5-4c scope is fixed at landing — an UPDATE is refused" "K1 scope_changed"
chk "(k) the refusal names the scope" "the words, the speaker side, the scope, the pointer"
no  "(k) R5-4c a scope outside market|internal is refused" "K2 bad_scope_accepted"
chk "(k) the refusal names the scope constraint" "interview_items_scope_check"
chk "(l) R4 ask and hypothesis land, both with framework_form NULL" "L2 new_kinds=2 forms_null=2"
no  "(l) R4 a kind outside the ten is refused" "L3 bad_kind_accepted"
chk "(l) the refusal names the kind constraint" "interview_items_kind_check"
chk "(m) R9 a near-duplicate annotation keeps the row, the state and the statement" "M1 kept=1 reason=near-duplicate of 1234abcd state=accepted"
chk "(h) R5 speaker_side defaults to client at landing" "H0 side=client"
no  "(h) R5 speaker_side is fixed at landing — an UPDATE is refused" "H1 side_changed"
chk "(h) the refusal names the speaker side" "the words, the speaker side, the scope, the pointer"
no  "(h) R5 a speaker_side outside client|ours is refused" "H2 bad_side_accepted"
chk "(h) the refusal names the side constraint" "interview_items_speaker_side_check"
chk "(j) R6 a superseded item KEEPS its row, with the signed reason" "J1 kept=1 reason=superseded by rules 2026-09-23.1"
chk "(j) R6/R7 the same identity lands again beside the retracted row" "J2 relanded=2"
chk "(j) R7 the side-change reason is accepted" "J3 side_reason_ok"
no  "(j) a BLANK retraction reason is still refused" "J4 blank_reason_accepted"
no  "(i) R5 the RPC refuses a NON-ADMIN caller" "I1 nonadmin_allowed"
chk "(i) the refusal names the admin rule" "not_admin: only an admin can say which speakers are our side"
chk "(i) R5 an admin CAN set the labels" "I2 set="
chk "(i) R5 labels are trimmed, de-duplicated and blanks dropped" "I3 labels=Bob|Taylor"
chk "(i) R5 the audit row carries a COUNT" "labels_count\": 2"
no  "(i) R5 the audit row never carries a LABEL" "I4 audit=.*Taylor"
no  "(i) R5 the RPC refuses a FROZEN company" "I5 frozen_allowed"
no  "(i) R5 the RPC refuses a WITHDRAWN record" "I6 withdrawn_allowed"

if npx vitest run src/lib/interviewParser/interviewItems.census.test.ts >/dev/null 2>&1; then
  echo "  ok   (f) the interview_items census is green"
else echo "  FAIL (f) the interview_items census"; fail=1; fi
RULES=supabase/functions/interview-parser/rules.ts
if grep -q 'PARSER_RULES_VERSION = "2026-09-23.2"' "$RULES" && [ "$(grep -c '^  "' "$RULES")" = 5 ]; then
  echo "  ok   (g) the rules file exports the version and all five rules"
else echo "  FAIL (g) the rules file version / rule count"; fail=1; fi

[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^ ?[A-Z][0-9]|ERROR" | head -30; exit 1; }
