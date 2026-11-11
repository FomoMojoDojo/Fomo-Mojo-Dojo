#!/usr/bin/env bash
# MEMBER READ, PART 2 — THE REFUSAL MATRIX (U6-13, U6-14, U6-19, U6-22, U6-25, migration 20261110180000).
#
# WHAT THIS PROVES, on a throwaway company so nothing depends on live data:
#
#   (a) the four narrow doors return the CLIENT-SHOWN rows and nothing else. The held/hidden
#       predicate is in the function, not on the page, so a resolved finding, an internal_inferred
#       finding and a withdrawn mark are invisible to the door itself.
#   (b) the TABLES behind those doors answer a non-admin nothing at all.
#   (c) cross-company: a member of one company reads zero rows for another.
#   (d) no membership at all reads zero everywhere -- the arms are membership, not authentication.
#   (e) tier 2 opens for a sponsor and shuts for an observer and for a decision_owner (U6-19 makes
#       this the one capability where those two roles differ).
#
# WHY A GUARD AND NOT A UNIT TEST. Every claim above is a property of a POLICY or a definer function
# body. A vitest mock can only assert what the client asked for; it cannot show what Postgres would
# have handed back to a different principal. These run as the principals, in one transaction that is
# rolled back.
#
# Plants:
#   PLANT=findings_status  findings_client stops filtering status      => (a) red, the resolved finding appears
#   PLANT=findings_reg     findings_client stops filtering register    => (a) red, the internal finding appears
#   PLANT=marks_withdrawn  first_read_marks_client stops filtering     => (a) red, the withdrawn mark appears
#   PLANT=cap              has_capability grants interview.readText to observer => (e) red
set -uo pipefail
cd "$(dirname "$0")/../.."
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}

MEMBER=${MEMBER_ID:-}
NA=${NONADMIN_ID:-}
[ -n "$MEMBER" ] || { echo "guard: FAIL MEMBER_ID not set (source backups/fr-member.env)"; exit 1; }
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }

A=66666666-6666-4666-8666-66666666aa01   # the company the member belongs to
B=66666666-6666-4666-8666-66666666bb02   # another company, same fleet
RUN=66666666-6666-4666-8666-66666666cc03 # a market_discovery run on A

P=""
# A plant REPLACES a door body, and the replacement happens entirely inside SQL. pg_get_functiondef
# emits the body in dollar-quoted form, and letting that text through the shell (this heredoc is
# unquoted, inside a command substitution) mangles it and aborts the whole transaction rather than
# planting anything -- every check then fails, which looks like a catastrophic guard rather than one
# red step. So each plant below is a DO block whose text this script controls end to end.
case "${PLANT:-}" in
  findings_status) P="do \$p\$ begin execute replace(pg_get_functiondef('public.findings_client'::regproc), 'f.status = ''open''', 'true'); end \$p\$;";;
  findings_reg)    P="do \$p\$ begin execute replace(pg_get_functiondef('public.findings_client'::regproc), 'f.register = ''public_inferred''', 'true'); end \$p\$;";;
  marks_withdrawn) P="do \$p\$ begin execute replace(pg_get_functiondef('public.first_read_marks_client'::regproc), 'm.withdrawn_at is null', 'true'); end \$p\$;";;
  cap)             P="do \$p\$ begin execute replace(pg_get_functiondef('public.has_capability'::regproc), 'ARRAY[]::text[]', 'ARRAY[''interview.readText'']::text[]'); end \$p\$;";;
esac

ADMIN=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -c "select user_id from user_roles where role='admin' limit 1")

out=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=0 <<SQL 2>&1
begin;
$P
insert into companies (id, name, created_by) values ('$A','ZZ member-read guard A','$ADMIN'), ('$B','ZZ member-read guard B','$ADMIN');
insert into company_members (company_id, user_id, role) values ('$A','$MEMBER','observer');

-- findings: one the page shows, two the operator has put out of sight, one on the other company
insert into findings (id, company_id, kind, body, status, register) values
  ('$A'::uuid,'$A','observation','guard finding shown','open','public_inferred'),
  ('$B'::uuid,'$A','observation','guard finding resolved','resolved','public_inferred'),
  ('66666666-6666-4666-8666-66666666dd04','$A','observation','guard finding internal','open','internal_inferred'),
  ('66666666-6666-4666-8666-66666666ee05','$B','observation','guard finding other company','open','public_inferred');

-- marks: one live, one withdrawn; a note on each
insert into first_read_marks (id, company_id, kind, disposition, beat_key, anchor_kind, anchor_key, anchor_text, anchor_text_sha256, created_by) values
  ('$A'::uuid,'$A','client_reaction','important','findings','finding','k1','guard live anchor',repeat('a',64),'$ADMIN'),
  ('$B'::uuid,'$A','client_reaction','important','findings','finding','k2','guard withdrawn anchor',repeat('b',64),'$ADMIN');
update first_read_marks set withdrawn_at=now(), withdrawn_by='$ADMIN', withdraw_reason='guard' where id='$B'::uuid;
insert into first_read_mark_notes (mark_id, version, note, disposition, created_by) values
  ('$A'::uuid,1,'guard live note','important','$ADMIN'),
  ('$B'::uuid,1,'guard withdrawn note','important','$ADMIN');

-- outcomes: one rejection the page lists, one acceptance the version-aware selector drops
insert into long_runner_runs (id, company_id, run_kind, status, started_at) values ('$RUN','$A','market_discovery','completed',now());
insert into market_candidate_outcomes (company_id, run_id, candidate_index, job_executor, original_jtbd, original_identity, outcome, judge_reasons) values
  ('$A','$RUN',1,'guard executor','guard jtbd','guard-identity-1','rejected_solution','{"gate":"guard judge reason"}'),
  ('$A','$RUN',2,'guard executor 2','guard jtbd 2','guard-identity-2','accepted_active','{"gate":"guard judge reason 2"}');

-- an interview record + item on A, for tier 2
insert into interview_records (id, company_id, speaker_role, verbatim, created_by, market_state, person_name, person_role)
  values ('$A'::uuid,'$A','client_stakeholder','guard transcript for tier two','$ADMIN','unplaced','Guard Person','Guard Role');
insert into interview_items (id, company_id, interview_record_id, kind, raw_words, content_identity, landing, trace_state, review_state, pointer, record_text_sha256, judge_state, judge_reason, rules_version)
  values ('$A'::uuid,'$A','$A'::uuid,'ask','guard item raw words','guard-item-identity','unplaced','located','unreviewed',
          jsonb_build_object('turn_index',1,'line_start',1,'line_end',1,'passage_sha256',repeat('a',64)), repeat('b',64),'accepted','guard','v');

-- ── as the MEMBER (observer on A) ──────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"$MEMBER","role":"authenticated"}', true); set role authenticated;
select 'M1 findings_client=' || (select count(*) from findings_client('$A'))
    || ' bodies=' || coalesce((select string_agg(body, ',' order by body) from findings_client('$A')), 'none');
select 'M2 marks_client=' || (select count(*) from first_read_marks_client('$A'))
    || ' anchors=' || coalesce((select string_agg(anchor_text, ',' order by anchor_text) from first_read_marks_client('$A')), 'none');
select 'M3 notes_client=' || (select count(*) from first_read_mark_notes_client('$A'))
    || ' notes=' || coalesce((select string_agg(note, ',' order by note) from first_read_mark_notes_client('$A')), 'none');
select 'M4 outcomes_client=' || (select count(*) from market_candidate_outcomes_client('$RUN'));
select 'M5 people=' || (select count(*) from interview_people(array['$A'::uuid]))
    || ' name=' || coalesce((select person_name from interview_people(array['$A'::uuid])), 'none');
-- the tables themselves
select 'M6 tables findings=' || (select count(*) from findings)
    || ' marks=' || (select count(*) from first_read_marks)
    || ' notes=' || (select count(*) from first_read_mark_notes)
    || ' outcomes=' || (select count(*) from market_candidate_outcomes)
    || ' interview_records=' || (select count(*) from interview_records);
-- cross company
select 'M7 cross_company findings_client=' || (select count(*) from findings_client('$B'));
-- tier 2 as an observer
select 'M8 observer text=' || (select count(*) from interview_text('$A'::uuid))
    || ' item_text=' || (select count(*) from interview_item_text('$A'::uuid))
    || ' cap=' || public.has_capability('$MEMBER','interview.readText','$A')::text;

-- ── decision_owner is refused too (U6-19) ──────────────────────────────────────────────────────
reset role; update company_members set role='decision_owner' where company_id='$A' and user_id='$MEMBER'; set role authenticated;
select 'M9 decision_owner text=' || (select count(*) from interview_text('$A'::uuid))
    || ' cap=' || public.has_capability('$MEMBER','interview.readText','$A')::text;

-- ── sponsor opens ──────────────────────────────────────────────────────────────────────────────
reset role; update company_members set role='sponsor' where company_id='$A' and user_id='$MEMBER'; set role authenticated;
select 'M10 sponsor text_chars=' || coalesce((select length(verbatim)::text from interview_text('$A'::uuid)),'0')
    || ' item_words=' || coalesce((select raw_words from interview_item_text('$A'::uuid)),'none')
    || ' cap=' || public.has_capability('$MEMBER','interview.readText','$A')::text;

-- ── no membership anywhere ─────────────────────────────────────────────────────────────────────
reset role; select set_config('request.jwt.claims', '{"sub":"$NA","role":"authenticated"}', true); set role authenticated;
select 'N1 nomember findings=' || (select count(*) from findings_client('$A'))
    || ' marks=' || (select count(*) from first_read_marks_client('$A'))
    || ' notes=' || (select count(*) from first_read_mark_notes_client('$A'))
    || ' outcomes=' || (select count(*) from market_candidate_outcomes_client('$RUN'))
    || ' people=' || (select count(*) from interview_people(array['$A'::uuid]))
    || ' text=' || (select count(*) from interview_text('$A'::uuid));
reset role;
rollback;
SQL
)

fail=0
chk() { local label="$1" pattern="$2"; if echo "$out" | grep -q "$pattern"; then echo "  ok   $label"; else echo "  FAIL $label"; fail=1; fi; }

chk "(a) findings_client shows the open public finding and hides the resolved and internal ones" "M1 findings_client=1 bodies=guard finding shown"
chk "(a) first_read_marks_client shows the live mark and hides the withdrawn one"                "M2 marks_client=1 anchors=guard live anchor"
chk "(a) first_read_mark_notes_client drops the withdrawn mark notes with it"                    "M3 notes_client=1 notes=guard live note"
chk "(a) market_candidate_outcomes_client returns the run rows (the outcome filter is the version-aware selector)" "M4 outcomes_client=2"
chk "(a) interview_people returns name and role, never the text"                                 "M5 people=1 name=Guard Person"
chk "(b) every table behind the doors answers the member nothing"                                "M6 tables findings=0 marks=0 notes=0 outcomes=0 interview_records=0"
chk "(c) a member of one company reads zero for another"                                         "M7 cross_company findings_client=0"
chk "(e) an observer is refused both tier-2 doors"                                               "M8 observer text=0 item_text=0 cap=false"
chk "(e) a decision_owner is refused too (U6-19)"                                                "M9 decision_owner text=0 cap=false"
chk "(e) a sponsor is admitted to the text and the raw words"                                    "M10 sponsor text_chars=29 item_words=guard item raw words cap=true"
chk "(d) no membership anywhere reads zero from every door"                                      "N1 nomember findings=0 marks=0 notes=0 outcomes=0 people=0 text=0"

if [ "$fail" = 0 ]; then echo "guard: PASS"; else echo "guard: FAIL"; echo "$out" | tail -24; fi
exit "$fail"
