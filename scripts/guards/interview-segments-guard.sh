#!/usr/bin/env bash
# ── 4f-2: SEGMENT STORAGE, ITS SETTER AND THE LEASE GUARD ───────────────────────────────────────
# Against the REAL local database, everything inside ONE ROLLED-BACK transaction over throwaway
# companies (never CB1 / CB2 / Edgewood / any live company). Prints "guard: PASS" or "guard: FAIL …".
#
# Checks
#   (g1) an operator set lands: rows confirmed, proposed_by operator, and the audit row carries
#        counts and ranges by kind — and NO transcript text
#   (g2) a second call SUPERSEDES the first set rather than deleting it: the old rows are still
#        there, superseded, and only the new ones are live
#   (g3) an empty array supersedes everything and inserts nothing
#   (g4) two CONFIRMED live ranges that overlap are refused by the exclusion constraint
#   (g5) adjacent ranges ([3,5] then [6,8]) are ACCEPTED — the range is half-open, not off by one
#   (g6) two UNCONFIRMED system proposals may overlap each other freely (4f-3 depends on this)
#   (g7) a market_discussion row with no journey_key is refused, and a read_review row WITH one is too
#   (g8) a non-admin caller is refused
#   (g9) a frozen company is refused
#  (g10) a withdrawn record is refused
#  (g11) a record that is not a working session is refused
#  (g12) set_interview_segments is refused while a parse holds a FRESH lease, and allowed once the
#        lease has gone stale
#  (g13) set_interview_our_speakers gains the same refusal, and is allowed once stale
#  (g14) a segment is immutable after birth: the kind, the range and the record cannot change
#  (g15) a superseded segment cannot be un-superseded, and a confirmation cannot be undone
#  (g16) a segment is superseded, never deleted
#
# Plants (each removes ONE rule, inside the transaction so it rolls back with it):
#   PLANT=s1  drop the exclusion constraint            -> (g4) accepts an overlap
#   PLANT=s2  drop the admin check from the setter      -> (g8) accepts a non-admin
#   PLANT=s3  drop the frozen-company check from the RPC -> (g9b) a TRIGGER answers instead
#             (the write stays refused: the frozen rule is held three times over)
#   PLANT=s4  drop the withdrawn-record check           -> (g10) accepts a withdrawn record
#   PLANT=s5  drop the working-session check            -> (g11) accepts a stakeholder record
#   PLANT=s6  the setter DELETES instead of superseding -> (g2) loses the old rows
#   PLANT=s7  drop the lease guard from set_interview_segments      -> (g12) sets during a fresh lease
#   PLANT=s8  drop the lease guard from set_interview_our_speakers  -> (g13) sets during a fresh lease
#   PLANT=s9  the audit payload carries a turn's text   -> (g1) finds text in the payload
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
NA=${NONADMIN_ID:-}
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }
ADMIN=$(docker exec -i "$PGC" psql -U postgres -d postgres -Atc "select user_id from user_roles where role='admin' limit 1;")
[ -n "$ADMIN" ] || { echo "guard: FAIL no admin user_roles row"; exit 1; }
PLANT=${PLANT:-}
CO=aaaaaaaa-0000-4000-8000-000000000001          # the working company
FZ=aaaaaaaa-0000-4000-8000-000000000002          # a frozen company
WS=bbbbbbbb-0000-4000-8000-000000000001          # the working-session record
WD=bbbbbbbb-0000-4000-8000-000000000002          # a withdrawn working session
SH=bbbbbbbb-0000-4000-8000-000000000003          # a stakeholder record
FR=bbbbbbbb-0000-4000-8000-000000000004          # a working session on the frozen company
# The transcript text below is a throwaway string written here, never a real transcript.
FIXTURE='FIXTURE working session text'

SQL=$(mktemp)
{
echo "begin;"
echo "set local role authenticated;"
echo "select set_config('request.jwt.claims', json_build_object('sub','$ADMIN','role','authenticated')::text, true);"
echo "reset role;"
echo "insert into companies (id, name, created_by) values ('$CO','zz-segments-guard','$ADMIN'),('$FZ','zz-segments-guard-frozen','$ADMIN');"
for R in "$WS:$CO:working_session:null" "$WD:$CO:working_session:now()" "$SH:$CO:client_stakeholder:null" "$FR:$FZ:working_session:null"; do
  ID=${R%%:*}; REST=${R#*:}; C=${REST%%:*}; REST=${REST#*:}; ROLE=${REST%%:*}; RET=${REST##*:}
  echo "insert into interview_records (id, company_id, speaker_role, person_name, person_role, interviewed_at, interviewer, consent_basis, verbatim, created_by, market_state, retracted_at, retracted_reason) values ('$ID','$C','$ROLE','P','R',now(),'I','verbal','$FIXTURE','$ADMIN','per_item',$RET,$([ "$RET" = "null" ] && echo null || echo "'guard'"));"
done
echo "update companies set frozen = true where id = '$FZ';"

# ── the plants ───────────────────────────────────────────────────────────────────────────────────
# Each plant removes ONE rule from the LIVE definition (pg_get_functiondef + one targeted removal,
# re-executed inside this transaction), so it reddens the check it targets and leaves the rest green.
# A plant whose anchor no longer matches RAISES rather than passing silently — the "anchor has moved"
# failure the file plants in interview-parser-guard.sh get from cmp.
plant_sql() {   # $1 = function name, $2 = anchor, $3 = replacement
  cat <<PLANTEOF
do \$plant\$
declare src text; before text;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='$1';
  before := src;
  src := replace(src, \$a\$$2\$a\$, \$b\$$3\$b\$);
  if src = before then raise exception 'PLANT ANCHOR HAS MOVED in %', '$1'; end if;
  execute src;
end \$plant\$;
PLANTEOF
}

[ "$PLANT" = "s1" ] && echo "alter table public.interview_segments drop constraint interview_segments_no_overlap;"

[ "$PLANT" = "s2" ] && plant_sql set_interview_segments \
  "IF NOT public.has_role(v_actor, 'admin'::app_role) THEN" \
  "IF false THEN"

# The frozen rule is held THREE times: the RPC's own check, enforce_company_freeze on
# interview_segments, and enforce_company_freeze on integrity_runs (the audit row). Measured — with
# the RPC check lifted the write is STILL refused, by the triggers. So this plant lifts only the
# RPC's own check, and what goes red is (g9b): which layer answered. Defence in depth is the finding
# here, not a weakness, and a plant that lifted all three would stop being "remove one rule".
[ "$PLANT" = "s3" ] && plant_sql set_interview_segments \
  "IF v_frozen IS TRUE THEN" "IF false THEN"

[ "$PLANT" = "s4" ] && plant_sql set_interview_segments \
  "IF v_rec.retracted_at IS NOT NULL THEN" "IF false THEN"

[ "$PLANT" = "s5" ] && plant_sql set_interview_segments \
  "IF v_rec.speaker_role <> 'working_session' THEN" "IF false THEN"

[ "$PLANT" = "s6" ] && plant_sql set_interview_segments \
  "UPDATE public.interview_segments
       SET superseded_at = v_now, superseded_by_id = id
     WHERE interview_record_id = p_record_id" \
  "DELETE FROM public.interview_segments
     WHERE interview_record_id = p_record_id"

[ "$PLANT" = "s7" ] && plant_sql set_interview_segments \
  "IF public.interview_parse_lease_fresh(p_record_id) THEN
    RAISE EXCEPTION 'parse_in_flight: a parse pass holds the lease on this record — try again when it returns' USING ERRCODE = 'check_violation';
  END IF;" ""

[ "$PLANT" = "s8" ] && plant_sql set_interview_our_speakers \
  "IF public.interview_parse_lease_fresh(p_record_id) THEN" "IF false THEN"

[ "$PLANT" = "s9" ] && plant_sql set_interview_segments \
  "'note', 'turn indices and kinds only — no transcript text enters this payload'," \
  "'note', v_rec.verbatim,"

echo "set local role authenticated;"

# ── (g1) an operator set lands, audited ──
echo "savepoint g1;"
echo "select 'G1 set='||(public.set_interview_segments('$WS', '[{\"segment_kind\":\"problem_statement\",\"turn_start\":0,\"turn_end\":9},{\"segment_kind\":\"market_discussion\",\"turn_start\":10,\"turn_end\":19,\"journey_key\":\"customer\"},{\"segment_kind\":\"read_review\",\"turn_start\":20,\"turn_end\":29}]'::jsonb)->>'inserted');"
echo "select 'G1B live='||count(*)||' confirmed='||count(*) filter (where confirmed_at is not null)||' operator='||count(*) filter (where proposed_by='operator') from public.interview_segments where interview_record_id='$WS' and superseded_at is null;"
echo "select 'G1C audit='||count(*)||' ranges='||(select (excluded_by_rule->'live_by_kind'->'problem_statement'->'ranges')::text from public.integrity_runs where surface_id='$WS' and component='interview_segments_set' order by id desc limit 1) from public.integrity_runs where surface_id='$WS' and component='interview_segments_set';"
echo "select 'G1D textinpayload='||(exists (select 1 from public.integrity_runs where surface_id='$WS' and component='interview_segments_set' and excluded_by_rule::text like '%FIXTURE working session%'))::text;"

# ── (g2) a second call supersedes rather than deletes ──
echo "select 'G2 set='||(public.set_interview_segments('$WS', '[{\"segment_kind\":\"other\",\"turn_start\":0,\"turn_end\":4}]'::jsonb)->>'inserted');"
echo "select 'G2B live='||count(*) filter (where superseded_at is null)||' superseded='||count(*) filter (where superseded_at is not null)||' total='||count(*) from public.interview_segments where interview_record_id='$WS';"

# ── (g3) an empty array supersedes everything ──
echo "select 'G3 set='||(public.set_interview_segments('$WS', '[]'::jsonb)->>'inserted');"
echo "select 'G3B live='||count(*) filter (where superseded_at is null) from public.interview_segments where interview_record_id='$WS';"
echo "rollback to g1;"

# ── (g4) overlapping CONFIRMED ranges refused · (g5) adjacent accepted ──
echo "savepoint g4;"
echo "select 'G4 overlap='||(public.set_interview_segments('$WS', '[{\"segment_kind\":\"other\",\"turn_start\":3,\"turn_end\":7},{\"segment_kind\":\"other\",\"turn_start\":5,\"turn_end\":9}]'::jsonb)->>'inserted');"
echo "rollback to g4;"
echo "savepoint g5;"
echo "select 'G5 adjacent='||(public.set_interview_segments('$WS', '[{\"segment_kind\":\"other\",\"turn_start\":3,\"turn_end\":5},{\"segment_kind\":\"other\",\"turn_start\":6,\"turn_end\":8}]'::jsonb)->>'inserted');"
echo "rollback to g5;"

# ── (g6) two UNCONFIRMED system proposals may overlap ──
echo "reset role;"
echo "savepoint g6;"
echo "insert into public.interview_segments (company_id, interview_record_id, segment_kind, turn_start, turn_end, proposed_by, created_by) values ('$CO','$WS','read_review',10,20,'system','$ADMIN'),('$CO','$WS','read_review',15,25,'system','$ADMIN');"
echo "select 'G6 system_overlap_ok='||count(*) from public.interview_segments where interview_record_id='$WS' and proposed_by='system';"
echo "rollback to g6;"

# ── (g7) the market-key rule, both directions ──
echo "savepoint g7a;"
echo "insert into public.interview_segments (company_id, interview_record_id, segment_kind, turn_start, turn_end, proposed_by, created_by) values ('$CO','$WS','market_discussion',30,31,'system','$ADMIN');"
echo "select 'G7A market_without_key_accepted';"
echo "rollback to g7a;"
echo "savepoint g7b;"
echo "insert into public.interview_segments (company_id, interview_record_id, segment_kind, turn_start, turn_end, journey_key, proposed_by, created_by) values ('$CO','$WS','read_review',30,31,'customer','system','$ADMIN');"
echo "select 'G7B read_review_with_key_accepted';"
echo "rollback to g7b;"

# ── (g8) a non-admin caller ──
echo "savepoint g8;"
echo "set local role authenticated;"
echo "select set_config('request.jwt.claims', json_build_object('sub','$NA','role','authenticated')::text, true);"
echo "select 'G8 nonadmin_set='||(public.set_interview_segments('$WS', '[{\"segment_kind\":\"other\",\"turn_start\":0,\"turn_end\":1}]'::jsonb)->>'ok');"
echo "rollback to g8;"
echo "reset role;"
echo "set local role authenticated;"
echo "select set_config('request.jwt.claims', json_build_object('sub','$ADMIN','role','authenticated')::text, true);"

# ── (g9) frozen · (g10) withdrawn · (g11) not a working session ──
echo "savepoint g9;"
echo "select 'G9 frozen_set='||(public.set_interview_segments('$FR', '[{\"segment_kind\":\"other\",\"turn_start\":0,\"turn_end\":1}]'::jsonb)->>'ok');"
echo "rollback to g9;"
echo "savepoint g10;"
echo "select 'G10 withdrawn_set='||(public.set_interview_segments('$WD', '[{\"segment_kind\":\"other\",\"turn_start\":0,\"turn_end\":1}]'::jsonb)->>'ok');"
echo "rollback to g10;"
echo "savepoint g11;"
echo "select 'G11 stakeholder_set='||(public.set_interview_segments('$SH', '[{\"segment_kind\":\"other\",\"turn_start\":0,\"turn_end\":1}]'::jsonb)->>'ok');"
echo "rollback to g11;"

# ── (g12)(g13) the lease ──
# A FRESH lease: a planned parse run whose heartbeat is now. Then a STALE one, 10 minutes old.
echo "reset role;"
echo "insert into public.integrity_runs (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref) values ('$CO','interview_parse','interview_records','$WS',now(),'planned',1,0, jsonb_build_object('lease', jsonb_build_object('pass_id','guard-pass','heartbeat', to_char(now(),'YYYY-MM-DD\"T\"HH24:MI:SSOF'))), 'interview-parser');"
echo "select 'G12A fresh='||public.interview_parse_lease_fresh('$WS')::text;"
echo "set local role authenticated;"
echo "savepoint g12;"
echo "select 'G12 set_under_lease='||(public.set_interview_segments('$WS', '[{\"segment_kind\":\"other\",\"turn_start\":0,\"turn_end\":1}]'::jsonb)->>'ok');"
echo "rollback to g12;"
echo "savepoint g13;"
echo "select 'G13 speakers_under_lease='||(public.set_interview_our_speakers('$WS', array['Someone'])->>'ok');"
echo "rollback to g13;"
echo "reset role;"
echo "update public.integrity_runs set excluded_by_rule = jsonb_build_object('lease', jsonb_build_object('pass_id','guard-pass','heartbeat', to_char(now() - interval '10 minutes','YYYY-MM-DD\"T\"HH24:MI:SSOF'))) where surface_id='$WS' and component='interview_parse';"
echo "select 'G12C stale='||public.interview_parse_lease_fresh('$WS')::text;"
echo "set local role authenticated;"
echo "select 'G12D set_after_stale='||(public.set_interview_segments('$WS', '[{\"segment_kind\":\"other\",\"turn_start\":0,\"turn_end\":1}]'::jsonb)->>'ok');"
echo "select 'G13D speakers_after_stale='||(public.set_interview_our_speakers('$WS', array['Someone'])->>'ok');"
echo "reset role;"

# ── (g14)(g15)(g16) immutability ──
echo "savepoint g14;"
echo "update public.interview_segments set segment_kind='read_review' where interview_record_id='$WS' and superseded_at is null;"
echo "select 'G14A kind_changed';"
echo "rollback to g14;"
echo "savepoint g14b;"
echo "update public.interview_segments set turn_end=99 where interview_record_id='$WS' and superseded_at is null;"
echo "select 'G14B range_changed';"
echo "rollback to g14b;"
echo "savepoint g15;"
echo "update public.interview_segments set confirmed_at=null, confirmed_by=null where interview_record_id='$WS' and superseded_at is null;"
echo "select 'G15A unconfirmed';"
echo "rollback to g15;"
echo "savepoint g16;"
echo "delete from public.interview_segments where interview_record_id='$WS';"
echo "select 'G16 deleted';"
echo "rollback to g16;"
echo "rollback;"
} > "$SQL"

out=$(docker exec -i "$PGC" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -f - < "$SQL" 2>&1)
rm -f "$SQL"

fail=0
chk() { if echo "$out" | grep -q -- "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fail=1; fi; }
no()  { if echo "$out" | grep -q -- "$2"; then echo "  FAIL $1"; fail=1; else echo "  ok   $1"; fi; }

chk "(g1) an operator set of three lands"                      "G1 set=3"
chk "(g1) all three are live, confirmed and operator-proposed" "G1B live=3 confirmed=3 operator=3"
chk "(g1) the audit row carries the ranges by kind"            "G1C audit=1 ranges=\[\[0, 9\]\]"
no  "(g9) no transcript text reaches the audit payload"        "G1D textinpayload=true"
chk "(g2) the second call inserts its own set"                 "G2 set=1"
chk "(g2) and SUPERSEDES the first rather than deleting it"    "G2B live=1 superseded=3 total=4"
chk "(g3) an empty array supersedes everything"                "G3B live=0"
no  "(g4) overlapping CONFIRMED ranges are refused"            "G4 overlap=2"
chk "(g4) the refusal names the exclusion constraint"          "interview_segments_no_overlap"
chk "(g5) ADJACENT ranges are accepted — no off-by-one"        "G5 adjacent=2"
chk "(g6) two UNCONFIRMED system proposals may overlap"        "G6 system_overlap_ok=2"
no  "(g7) market_discussion without a market key is refused"   "G7A market_without_key_accepted"
no  "(g7) a non-market kind WITH a market key is refused too"  "G7B read_review_with_key_accepted"
chk "(g7) the refusal names the market-key rule"               "interview_segments_market_key"
no  "(g8) a non-admin caller is refused"                       "G8 nonadmin_set=true"
chk "(g8) the refusal says only an admin may set them"         "only an admin may set the segments"
no  "(g9) a frozen company is refused"                         "G9 frozen_set=true"
chk "(g9b) and it is the SETTER's own check that answers"      "frozen_company: this company is a frozen reference fixture"
no  "(g10) a withdrawn record is refused"                      "G10 withdrawn_set=true"
no  "(g11) a record that is not a working session is refused"   "G11 stakeholder_set=true"
chk "(g11) the refusal names the record type"                  "segments apply to a working session only"
chk "(g12) the lease reads FRESH while a pass holds it"        "G12A fresh=true"
no  "(g12) the setter is refused under a fresh lease"          "G12 set_under_lease=true"
chk "(g12) the refusal names the parse in flight"              "parse_in_flight"
no  "(g13) set_interview_our_speakers too"                     "G13 speakers_under_lease=true"
chk "(g12) the lease reads STALE after five minutes"           "G12C stale=false"
chk "(g12) and the setter is allowed again"                    "G12D set_after_stale=true"
chk "(g13) and so is set_interview_our_speakers"               "G13D speakers_after_stale=true"
no  "(g14) the kind cannot change after birth"                 "G14A kind_changed"
no  "(g14) nor the range"                                      "G14B range_changed"
chk "(g14) the refusal names the immutability rule"            "is immutable after birth"
no  "(g15) a confirmation cannot be undone"                    "G15A unconfirmed"
no  "(g16) a segment is superseded, never deleted"             "G16 deleted"
chk "(g16) the refusal says so"                                "superseded, never deleted"

[ $fail = 0 ] && echo "guard: PASS" || { echo "guard: FAIL"; echo "$out" | grep -E "^ ?G[0-9]|ERROR" | head -40; exit 1; }
