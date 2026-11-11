#!/usr/bin/env bash
# INTERVIEW TEXT NEVER SITS IN A MEMBER-READABLE RELATION (U6-34, operator ruling 2026-11-10).
#
# WHY THIS GUARD EXISTS. U6-16 put one rule on interview text: it opens to a holder of
# interview.readText and to nobody else. The rule is enforced by two SECURITY DEFINER doors
# (interview_text, interview_item_text) over tables that stay admin-only — and that enforcement is
# worth exactly nothing if a COPY of the words is sitting in some other table a company member can
# read. On 2026-11-10 three such copies existed and none of them were in interview_records:
#
#   * claims.raw_payload on b24d11c5 carried item_raw_words plus the speaker name, stamped at mint by
#     record-interview-correction. `claims` carries a company_members arm.
#   * integrity_runs 9343 and 9344 carried an "attestation" object with words + speaker, written to
#     justify holding two public signals. `integrity_runs` carries a company_members arm too.
#
# The second pair is the reason this guard is shaped the way it is. Their words were REWORDED --
# "We are no longer level 14" against the item saying "We're no longer level 14" -- so an equality
# check, or a search for the item text verbatim, finds nothing. Only a normalised n-gram match sees it.
#
# (a) SHAPE: no member-readable relation carries an attestation.words / attestation.speaker pair.
#     That specific shape is checked by name because it is the one a writer reached for once already,
#     and it is cheap to assert over every jsonb column in the fleet.
# (b) MATCHER: the normalised 6-gram matcher actually catches a reworded copy, proven on a throwaway
#     fixture inside a rolled-back transaction, with a control run that must find nothing.
#
# "Member-readable" is COMPUTED, never listed: every relation authenticated may SELECT where either
# RLS is off or a SELECT policy carries a company_members arm. A new table inherits the check.
#
# Plants:
#   PLANT=shape     an attestation.words row in a member-readable relation => (a) red
#   PLANT=noexpand  the matcher stops expanding contractions               => (b) red (the reworded
#                                                                             copy stops matching)
set -uo pipefail
cd "$(dirname "$0")/../.."
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}

EXPAND_PLANT=""
SHAPE_PLANT=""
case "${PLANT:-}" in
  shape)    SHAPE_PLANT="yes";;
  noexpand) EXPAND_PLANT="yes";;
esac

# The fixture: ten words of interview text, and a REWORDED copy of six of them planted in a
# member-readable relation. The copy differs by a contraction, which is the whole point.
CO=66666666-6666-4666-8666-6666666634ff
FIXTURE_WORDS="We''re rebuilding intake from scratch this quarter."
REWORDED="The note says we are rebuilding intake from scratch, nothing more."

out=$(docker exec -i "$PGC" psql -U postgres -d postgres -At -v ON_ERROR_STOP=0 <<SQL 2>&1
begin;
set local statement_timeout = '0';

create function pg_temp.norm(t text, expand boolean) returns text language sql immutable as \$f\$
  select btrim(regexp_replace(regexp_replace(
    case when expand then
      replace(replace(replace(replace(replace(replace(lower(t),
        '''re', ' are'), '''ll', ' will'), '''ve', ' have'),
        'n''t', ' not'), '''m', ' am'), '''s', ' is')
    else lower(t) end,
    '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'))
\$f\$;

create function pg_temp.grams6(t text) returns setof text language sql immutable as \$f\$
  with w as (select string_to_array(t, ' ') a)
  select array_to_string(a[i:i+5], ' ') from w, generate_subscripts(a, 1) i
  where i + 5 <= array_length(a, 1)
\$f\$;

-- ── (a) the attestation shape, over every member-readable jsonb/text column ─────────────────────
create temp table shape_hits (relation text, col text, rows bigint);
do \$o\$
declare r record; c record; n bigint;
begin
  for r in
    select cl.relname, cl.oid from pg_class cl join pg_namespace ns on ns.oid=cl.relnamespace
    where ns.nspname='public' and cl.relkind in ('r','v')
      and has_table_privilege('authenticated','public.'||quote_ident(cl.relname),'SELECT')
      and (not cl.relrowsecurity or exists (select 1 from pg_policy p where p.polrelid=cl.oid
            and p.polcmd in ('r','*') and pg_get_expr(p.polqual,p.polrelid) ilike '%company_members%'))
  loop
    for c in select column_name from information_schema.columns
      where table_schema='public' and table_name=r.relname and data_type in ('text','character varying','jsonb','json')
    loop
      begin
        execute format(
          'select count(*) from public.%I where %I::text ~ %L',
          r.relname, c.column_name,
          '"attestation"[[:space:]]*:[[:space:]]*\{[^}]*"(words|speaker)"')
        into n;
        if n > 0 then insert into shape_hits values (r.relname, c.column_name, n); end if;
      exception when others then null;
      end;
    end loop;
  end loop;
end \$o\$;

-- ── (b) the matcher, on a throwaway fixture ────────────────────────────────────────────────────
insert into companies (id, name, created_by) values ('$CO', 'ZZ u6-34 guard co', (select user_id from user_roles where role='admin' limit 1));
insert into interview_records (id, company_id, speaker_role, verbatim, created_by, market_state)
  values ('$CO'::uuid, '$CO', 'client_stakeholder', '$FIXTURE_WORDS', (select user_id from user_roles where role='admin' limit 1), 'unplaced');
insert into interview_items (id, company_id, interview_record_id, kind, raw_words, content_identity, landing, trace_state, review_state, pointer, record_text_sha256, judge_state, judge_reason, rules_version)
  values ('$CO'::uuid, '$CO', '$CO'::uuid, 'ask', '$FIXTURE_WORDS', 'u6-34-guard-identity', 'unplaced', 'located', 'unreviewed', jsonb_build_object('turn_index', 1, 'line_start', 1, 'line_end', 1, 'passage_sha256', repeat('a',64)), repeat('b',64), 'accepted', 'guard fixture', 'v');

-- the planted copy, in a member-readable relation (claims carries a company_members arm)
insert into claims (id, company_id, statement, provenance, claim_type, state, status, confidence, raw_payload)
  values ('$CO'::uuid, '$CO', 'guard planted claim', 'analytic', 'observation', 'outside_view', 'active', 'high',
          jsonb_build_object('note', '$REWORDED'));

create temp table src_grams (gram text);
insert into src_grams
  select g from interview_items i, lateral pg_temp.grams6(pg_temp.norm(i.raw_words, false)) g
  where i.company_id = '$CO' and i.retracted_at is null;
$( [ -n "$EXPAND_PLANT" ] && echo "-- PLANT noexpand: the contraction-expanding pass is omitted" || cat <<'E2'
insert into src_grams
  select g from interview_items i, lateral pg_temp.grams6(pg_temp.norm(i.raw_words, true)) g
  where i.company_id = '66666666-6666-4666-8666-6666666634ff' and i.retracted_at is null;
E2
)
create index on src_grams (gram);

$( [ -n "$SHAPE_PLANT" ] && cat <<'E3'
-- PLANT shape: an attestation carrying words + speaker, in a member-readable relation
update claims set raw_payload = raw_payload || jsonb_build_object('attestation', jsonb_build_object('words','planted words here','speaker','Planted Person'))
  where id = '66666666-6666-4666-8666-6666666634ff';
insert into shape_hits
  select 'claims','raw_payload',count(*) from claims where raw_payload::text ~ '"attestation"[[:space:]]*:[[:space:]]*\{[^}]*"(words|speaker)"';
E3
)

select 'A1 shape_hits=' || (select count(*) from shape_hits)
  || ' detail=' || coalesce((select string_agg(relation||'.'||col, ',' order by relation, col) from shape_hits), 'none');

select 'B1 planted_match=' || (
  select count(distinct c.id) from claims c
  join src_grams s on s.gram in (
    select g from pg_temp.grams6(pg_temp.norm(c.raw_payload::text, false)) g
    union all
    select g from pg_temp.grams6(pg_temp.norm(c.raw_payload::text, true)) g)
  where c.company_id = '$CO');

-- CONTROL: with the planted copy gone, the same matcher must find nothing on this company
delete from claims where id = '$CO'::uuid;
select 'B2 control_match=' || (
  select count(distinct c.id) from claims c
  join src_grams s on s.gram in (
    select g from pg_temp.grams6(pg_temp.norm(c.raw_payload::text, false)) g
    union all
    select g from pg_temp.grams6(pg_temp.norm(c.raw_payload::text, true)) g)
  where c.company_id = '$CO');
rollback;
SQL
)

fail=0
chk() { local label="$1" pattern="$2"; if echo "$out" | grep -q "$pattern"; then echo "  ok   $label"; else echo "  FAIL $label"; fail=1; fi; }

chk "(a) no member-readable relation carries an attestation.words / .speaker shape" "A1 shape_hits=0 detail=none"
chk "(b) the normalised matcher CATCHES a reworded copy of interview text" "B1 planted_match=1"
chk "(b) control: with the copy removed the same matcher finds nothing" "B2 control_match=0"

if [ "$fail" = 0 ]; then echo "guard: PASS"; else echo "guard: FAIL"; echo "$out" | tail -20; fi
exit "$fail"
