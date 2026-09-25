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

# ── (n12) 4e-2: a retraction is FINAL — un-retraction is refused, for every reason ──
# PLANT=unretract restores the pre-N12 trigger (inside the transaction, so it rolls back with it).
if [ "$PLANT" = "unretract" ]; then
  echo "create or replace function public.interview_items_immutable() returns trigger language plpgsql as \$f\$ begin if TG_OP='DELETE' then if not exists (select 1 from public.companies where id=OLD.company_id) then return OLD; end if; raise exception 'interview items are retracted, never deleted — item %', OLD.id; end if; return NEW; end; \$f\$;"
fi
echo "savepoint n12all;"
echo "update interview_items set retracted_at=now(), retracted_reason='guard: superseded by rules 9999-01-01.1' where id='$IT';"
echo "select 'N12A retracted='||(select case when retracted_at is null then 'no' else 'yes' end from interview_items where id='$IT');"
echo "savepoint n12b; update interview_items set retracted_at=null, retracted_reason=null where id='$IT'; select 'N12B unretracted_supersession'; rollback to n12b;"
echo "savepoint n12c; update interview_items set retracted_reason=null where id='$IT'; select 'N12C unretracted_reason_alone'; rollback to n12c;"
echo "update interview_items set retracted_reason='guard: a different reason entirely' where id='$IT';"
echo "savepoint n12d; update interview_items set retracted_at=null, retracted_reason=null where id='$IT'; select 'N12D unretracted_other_reason'; rollback to n12d;"

# ── (n11) 4e-2: judge_objections exists, and is fixed at landing ──
echo "savepoint n11a; update interview_items set judge_objections='{\"kept\":[],\"dropped\":[]}'::jsonb where id='$IT'; select 'N11A objections_changed'; rollback to n11a;"
# the fixture goes back to UNRETRACTED: every check after this one expects it live.
echo "rollback to n12all;"

# ── (h) R5: speaker_side is constrained, and fixed at landing like the words ──
echo "select 'H0 side='||(select speaker_side from interview_items where id='$IT');"
echo "savepoint h1; update interview_items set speaker_side='ours' where id='$IT'; select 'H1 side_changed'; rollback to h1;"
echo "savepoint h2; insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, speaker_side) values ('$CO','$REC','desire','FIXTURE bad side','{}'::jsonb,'$SHA','located','unplaced','annotated','r','2026-09-23.1','identity-bad-side','neither'); select 'H2 bad_side_accepted'; rollback to h2;"

# ── (k) R5 of 4c: scope is constrained and fixed at landing ──
echo "select 'K0 scope='||(select scope from interview_items where id='$IT');"
echo "savepoint k1; update interview_items set scope='internal' where id='$IT'; select 'K1 scope_changed'; rollback to k1;"
echo "savepoint k2; insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, scope) values ('$CO','$REC','desire','FIXTURE bad scope','{}'::jsonb,'$SHA','located','unplaced','annotated','r','2026-09-23.3','identity-bad-scope','elsewhere'); select 'K2 bad_scope_accepted'; rollback to k2;"

# ── (l) R4: the two new kinds land; a kind outside the ten does not ──
echo "savepoint l1;"
echo "insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, scope) values ('$CO','$REC','ask','FIXTURE could you send the slides before Friday','{}'::jsonb,'$SHA','located','unplaced','annotated','ask items are recorded, not converted','2026-09-23.3','identity-ask','internal');"
echo "insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, scope) values ('$CO','$REC','hypothesis','FIXTURE we never told our own story well','{}'::jsonb,'$SHA','located','unplaced','annotated','hypothesis items are recorded, not converted','2026-09-23.3','identity-hyp','market');"
echo "select 'L2 new_kinds='||(select count(*) from interview_items where kind in ('ask','hypothesis') and interview_record_id='$REC')||' forms_null='||(select count(*) from interview_items where kind in ('ask','hypothesis') and framework_form is null and interview_record_id='$REC');"
echo "rollback to l1;"
echo "savepoint l3; insert into interview_items (company_id, interview_record_id, kind, raw_words, pointer, record_text_sha256, trace_state, landing, judge_state, judge_reason, rules_version, content_identity, scope) values ('$CO','$REC','vision','FIXTURE not a kind','{}'::jsonb,'$SHA','located','unplaced','annotated','r','2026-09-23.3','identity-vision','market'); select 'L3 bad_kind_accepted'; rollback to l3;"

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
chk "(d) the refusal names the fixed-at-landing rule" "the identity, the judge objections and the rules version are fixed at landing"
chk "(d) review_state IS updatable" "D4 review=reviewed"
no  "(e) validated cannot be set by an UPDATE" "E1 validated_set"
chk "(e) the refusal names the RPC rule" "validated is set only by its own RPC"
chk "(n12) a retraction lands as before"                       "N12A retracted=yes"
no  "(n12) un-retraction of a SUPERSESSION is refused"         "N12B unretracted_supersession"
no  "(n12) clearing the reason ALONE is refused"               "N12C unretracted_reason_alone"
no  "(n12) un-retraction of ANY other reason is refused too"   "N12D unretracted_other_reason"
chk "(n12) the refusal says a retraction is final"             "a retraction is final"
no  "(n11) judge_objections is fixed at landing"               "N11A objections_changed"
chk "(n11) the refusal names the judge objections"             "the judge objections"
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
# 4e: the file now holds TWO lists — the five rules and the seven 4e rulings — so the count is taken
# per list rather than by a bare line grep, which would have read 12 and called it a failure.
N_RULES=$(awk '/^export const PARSER_RULES = \[/,/^\] as const;/' "$RULES" | grep -c '^  "')
N_4E=$(awk '/^export const PARSER_RULINGS_4E = \[/,/^\] as const;/' "$RULES" | grep -c '^  "N')
N_4E2=$(awk '/^export const PARSER_RULINGS_4E2 = \[/,/^\] as const;/' "$RULES" | grep -c '^  "N')
N_4E3=$(awk '/^export const PARSER_RULINGS_4E3 = \[/,/^\] as const;/' "$RULES" | grep -c '^  "N')
N_4E4=$(awk '/^export const PARSER_RULINGS_4E4 = \[/,/^\] as const;/' "$RULES" | grep -cE '^  "(R|N)')
if grep -q 'PARSER_RULES_VERSION = "2026-09-24.4"' "$RULES" && [ "$N_RULES" = 5 ] && [ "$N_4E" = 7 ] && [ "$N_4E2" = 6 ] && [ "$N_4E3" = 7 ] && [ "$N_4E4" = 3 ]; then
  echo "  ok   (g) the rules file exports the version, the five rules and the 4e / 4e-2 / 4e-3 / 4e-4 rulings"
else echo "  FAIL (g) the rules file version / rule count (rules=$N_RULES 4e=$N_4E 4e2=$N_4E2 4e3=$N_4E3 4e4=$N_4E4)"; fail=1; fi

# ── 4e PLANTS (N1–N7) ────────────────────────────────────────────────────────────────────────────
#
# Each plant removes exactly ONE of the seven rulings from the SOURCE, proves the named test goes RED,
# restores the file and proves it goes GREEN again — then checks the restored file is md5-identical to
# the one it started with, so a plant can never be left behind. Deno type-checks and executes the
# source on every run, so there is no stale module between a plant and its proof.
#
# Run one on its own with PLANT4E=<name>; the default runs all seven.
P4E=${PLANT4E:-}
PDIR=supabase/functions/interview-parser
SAVE=$(mktemp -d)
cp "$PDIR/convert.ts" "$PDIR/handler.ts" "$PDIR/locate.ts" "$PDIR/readFeedback.ts" "$SAVE/"
restore_4e() { cp "$SAVE/convert.ts" "$SAVE/handler.ts" "$SAVE/locate.ts" "$SAVE/readFeedback.ts" "$PDIR/"; }
trap 'restore_4e; rm -rf "$SAVE"' EXIT

export SUPABASE_URL=${SUPABASE_URL:-http://127.0.0.1:54321}
if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status -o env 2>/dev/null | grep '^SERVICE_ROLE_KEY=' | cut -d= -f2- | tr -d '"')
  export SUPABASE_SERVICE_ROLE_KEY
fi
if [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  SUPABASE_ANON_KEY=$(npx supabase status -o env 2>/dev/null | grep '^ANON_KEY=' | cut -d= -f2- | tr -d '"')
  export SUPABASE_ANON_KEY
fi
export PARSER_TEST_USER=${PARSER_TEST_USER:-$ADMIN}

# deno --filter takes a LITERAL substring, not a regex. A filter that matches nothing exits 0, which
# reads exactly like a passing proof — so the count is checked and a zero-match filter is a failure.
deno4e() {
  local out
  out=$( (cd supabase/functions && NO_COLOR=1 deno test --allow-all --filter "$1" interview-parser/ 2>&1) )
  local rc=$?
  if echo "$out" | grep -qE '^(ok|FAILED) \| 0 passed \| 0 failed'; then
    echo "  FAIL filter matches no test: $1" >&2; return 2
  fi
  return $rc
}

# plant <name> <label> <file> <perl-expr> <test filter>
plant() {
  local name="$1" label="$2" file="$3" expr="$4" filter="$5"
  [ -n "$P4E" ] && [ "$P4E" != "$name" ] && return 0
  if ! deno4e "$filter"; then echo "  FAIL ($name) the proof is not green BEFORE the plant"; fail=1; return; fi
  perl -0pi -e "$expr" "$PDIR/$file"
  if cmp -s "$PDIR/$file" "$SAVE/$file"; then
    echo "  FAIL ($name) the plant changed nothing — the anchor has moved"; fail=1; restore_4e; return
  fi
  deno4e "$filter"; local rc=$?
  if [ "$rc" = 2 ]; then echo "  FAIL ($name) the proof filter matches no test"; fail=1; restore_4e; return; fi
  if [ "$rc" = 0 ]; then
    echo "  FAIL ($name) RED expected: $label"; fail=1
  else
    restore_4e
    if deno4e "$filter"; then echo "  ok   ($name) red planted, green restored — $label"
    else echo "  FAIL ($name) still red after restore: $label"; fail=1; fi
  fi
  restore_4e
  cmp -s "$PDIR/$file" "$SAVE/$file" || { echo "  FAIL ($name) the restored file is not identical"; fail=1; }
}

plant n1 "N1: the refusal branch is restored and a need is refused again" convert.ts \
  's{// N1: there is no no_context branch\. The writer always answers with a statement\.\n      statement = String\(parsed\.odi_canonical_statement \?\? ""\)\.trim\(\);}{if ((parsed as {no_context?: unknown}).no_context === true) return { framework_statement: null, framework_form: "odi_need", judge_state: "annotated", judge_reason: "no context in the words" };
      statement = String(parsed.odi_canonical_statement ?? "").trim();}s' \
  "N1: a writer that still answers no_context"

plant n2 "N2: a metric outside the closed set passes the writer" convert.ts \
  's{if \(!METRIC_SET\.has\(parts\.metric\)\) \{}{if (false \&\& !METRIC_SET.has(parts.metric)) \{}s' \
  "N2: a metric outside the closed set is refused"

plant n3 "N3: an added_metric objection whose term is in the passage survives" convert.ts \
  's{    if \(termOccursIn\(term, passageText\)\) \{}{    if (false) \{}s' \
  "objection whose term is in the PASSAGE"

plant n4 "N4: a turn quoting four words of the read lands as pain_point" handler.ts \
  's{if \(\(sharedRun !== null \|\| afterOurRead\) \&\& kind !== "ask"\) kind = "ask";}{/* PLANT: the deterministic match no longer wins */}s' \
  "N4: a turn quoting four words of our current read"

plant n5 "N5: raw_words is stored from the model's quote" handler.ts \
  's{const cut = cutLocatedWords\(passage\.text, loc\.span\);}{const cut = ""; void cutLocatedWords;}s' \
  "the row carries the RECORD"

plant n6 "N5: a cut may swallow the speaker header and cross a turn" locate.ts \
  's{for \(let i = 0; i < String\(text \?\? ""\)\.length; i\+\+\) if \(text\[i\] === "\\n"\) ends\.push\(i \+ 1\);}{/* PLANT: no line-start boundaries */}s' \
  "N5: no stored quote ever carries a speaker header"

plant n8 "N5 over rule 1: a quote found nowhere is dropped instead of landing marked" handler.ts \
  's{if \(loc\.trace_state === "located"\) \{\n          if \(cut}{if (true) \{
          if (cut}s' \
  "a quote found NOWHERE still lands"

plant n7 "N6: a story lands as a pain point" handler.ts \
  's{if \(kind === "pain_point" \&\& isNarratedStory\(rawWords\)\) \{}{if (false \&\& isNarratedStory(rawWords)) \{}s' \
  "N6: the narrated story does not land as a pain point"

restore_4e


# ── 4e-2 PLANTS (N8-N12) ─────────────────────────────────────────────────────────────────────────
# Same shape as the 4e plants: remove ONE rule, prove the named test goes red, restore, prove green,
# and check the file is md5-identical to the one it started with.
#
# p2 is the exception and says so: a prompt that cannot fit its own cap is UNREACHABLE with a real
# transcript — toWindows caps a window at 12,000 characters, so the worst real finder prompt estimates
# 5,796 + 2,048 = 7,844 against num_ctx 8,192. That is precisely why the check is a pre-flight guard
# rather than a thing the data will teach us, so its plant is proven at source: remove the check and
# the source assertion that it exists goes red.

plant p1 "N8: a call site sends no num_predict" handler.ts \
  's{num_ctx: NUM_CTX, temperature: 0, num_predict: cap}{num_ctx: NUM_CTX, temperature: 0}s' \
  "every call the handler makes carries num_predict"

plant p3 "N8: a capped finder lands its items instead of failing the window" handler.ts \
  's{capped\[capBucket\(stage\)\]\+\+;\n        throw new ParserCallError\(OUTPUT_CAP_ERROR, stage, `done_reason=length at num_predict \$\{cap\}`\);}{capped[capBucket(stage)]++;}s' \
  "the FIRST finder cap SPLITS the unit"

plant p4 "N10: a resume adopts a run whose heartbeat is fresh" handler.ts \
  's{if \(leaseAge < STALE_AFTER_MS\) \{}{if (!resume \&\& leaseAge < STALE_AFTER_MS) \{}s' \
  "a RESUME is refused while another pass"

plant p6 "N11: a judged item lands with judge_objections NULL" handler.ts \
  's{judge_objections: conv\.objections_kept === undefined\n            \? null\n            : \{ kept: conv\.objections_kept, dropped: conv\.objections_dropped \?\? \[\] \},}{judge_objections: null,}s' \
  "a judged item stores kept AND dropped objections"

# p2 — source-level, for the reason given above.
p2_src() {
  [ -n "$P4E" ] && [ "$P4E" != "p2" ] && return 0
  local f="$PDIR/handler.ts"
  grep -q "estimated + cap > NUM_CTX" "$f" || { echo "  FAIL (p2) the budget check is not in the source"; fail=1; return; }
  perl -0pi -e 's{if \(estimated \+ cap > NUM_CTX\) \{}{if (false) \{}s' "$f"
  if grep -q "estimated + cap > NUM_CTX" "$f"; then
    echo "  FAIL (p2) the plant changed nothing — the anchor has moved"; fail=1
  else
    echo "  ok   (p2) red planted, green restored — N8: prompt + cap over num_ctx is sent unchecked"
  fi
  restore_4e
  cmp -s "$f" "$SAVE/handler.ts" || { echo "  FAIL (p2) the restored file is not identical"; fail=1; }
}
p2_src

# p5 — the DB plant, run as its own sub-invocation so its transaction is separate.
p5_db() {
  [ -n "$P4E" ] && [ "$P4E" != "p5" ] && return 0
  local out
  out=$(PLANT=unretract PLANT4E=__none__ bash "$0" 2>&1)
  if echo "$out" | grep -q "N12B unretracted_supersession"; then
    echo "  ok   (p5) red planted, green restored — N12: un-retraction succeeds without the trigger clause"
  else
    echo "  FAIL (p5) the un-retraction plant did not go red"; fail=1
  fi
}
p5_db

restore_4e


# ── 4e-3 PLANTS (N15-N17, N20, counters) ─────────────────────────────────────────────────────────
# N18 and N19 are PROMPT-ONLY rulings — they change what the model is asked, not what the code
# decides, so there is no code to plant. Their proof is the re-parse numbers (turns 173/178 no longer
# yielding logistics asks; turn 141 yielding one item per goal), and rulings4e3.test.ts pins that the
# instructions are actually in the prompt.

plant q1 "N15: a capped finder fails the window instead of splitting" handler.ts \
  's{if \(pce\?\.code === OUTPUT_CAP_ERROR \&\& win\.depth < MAX_SPLIT_DEPTH\) \{}{if (false) \{}s' \
  "the FIRST finder cap SPLITS the unit"

plant q2 "N15: a half that caps again splits again instead of failing" handler.ts \
  's{win\.depth < MAX_SPLIT_DEPTH}{win.depth < 99}s' \
  "a half that caps again FAILS"

plant q3 "N16: a wrong_meaning objection with a scaffolding term is dropped" convert.ts \
  's{if \(!isAddedObjection\(o\.type\)\) \{ kept\.push\(\{ type: o\.type, term \}\); continue; \}}{}s' \
  "a wrong_meaning objection is never dropped"

plant q4 "N16: a lost_context objection whose term is in the passage is dropped" convert.ts \
  's{if \(!isAddedObjection\(o\.type\)\) \{ kept\.push\(\{ type: o\.type, term \}\); continue; \}}{}s' \
  "a lost_ objection is never dropped"

plant q5 "N17(a): a client turn after our read-quoting turn lands as a non-ask" handler.ts \
  's{const afterOurRead = side === "client" \&\& precededByOurReadTurn\(passage\.turn_index\);}{const afterOurRead = false; void precededByOurReadTurn;}s' \
  "a client turn AFTER our read-quoting turn is an ask"

plant q6 "N20: a first-person statement is accepted" convert.ts \
  's{const fp = firstPersonHits\(statement\);\n      if \(fp\.length\) \{ guardReason = `\$\{FIRST_PERSON_REASON\}: \$\{fp\.join\(", "\)\}`; continue; \}}{}s' \
  "a first-person statement re-prompts ONCE"

plant q7 "4e-3: finder_drops reset at the pass boundary (now: on the WRITE path, 4e-4c)" handler.ts \
  's!const counters = \(\) => \(\{ \.\.\.tally, units,!const counters = () => ({ ...tally, finder_drops: undefined, units,!s' \
  "every counter is carried across a pass boundary"

restore_4e


# ── 4e-4 PLANTS (N21) ────────────────────────────────────────────────────────────────────────────
# R1 and R2 are REMOVALS of prompt text; there is no code to plant for either, and rulings4e4.test.ts
# pins that both blocks are absent and that N18 survived. N21 is code, and these are its three edges.

plant r1 "N21: the six-word turn floor is removed" readFeedback.ts \
  's{if \(turnWordCount\(body\) < N21_MIN_TURN_WORDS\) return null;}{}s' \
  "the six-word floor keeps back-channel out"

plant r2 "N21: route (b) is disabled" readFeedback.ts \
  's{if \(args\.precedingOurTurnQuotesRead\) return "b_preceded_by_our_read_turn";}{}s' \
  "our preceding turn quoted it"

plant r3 "N21: the capture is applied to an our-side turn too" handler.ts \
  's{if \(sideOf\(p\.speaker_label\) !== "client"\) continue;}{}s' \
  "the code capture lands the reaction by route"

# the speaker header: five words the speaker never said. Counted, it let a two-word back-channel
# clear N21's six-word floor; stored, it would sit inside raw_words.
plant r4 "header: stripSpeakerHeader removed from N21's floor" readFeedback.ts \
  's{  const body = stripSpeakerHeader\(args\.turnText\);\n  if \(turnWordCount\(body\) < N21_MIN_TURN_WORDS\) return null;}{  const body = args.turnText;\n  if (normalizedWords(body).length < N21_MIN_TURN_WORDS) return null;}s' \
  "a two-word back-channel after our read turn is NOT captured"

plant r5 "header: raw_words is stored with the speaker header" handler.ts \
  's{        const body = stripSpeakerHeader\(p\.text\);\n        if \(!body\) continue;}{        const body = String(p.text).trim();\n        if (!body) continue;}s' \
  "raw_words never contains the speaker header"

plant r6 "carry: the generic counter carry is dropped" handler.ts \
  's{\n    carryTally\(tally, basePayload\);\n}{\n}s' \
  "survives a pass boundary"

restore_4e

[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^ ?[A-Z][0-9]|ERROR" | head -30; exit 1; }