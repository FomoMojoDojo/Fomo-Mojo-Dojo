#!/usr/bin/env bash
# ── SIGNAL-JUDGEMENT GUARD — T-1 (2026-11-18; the shared signal-judgement pattern) ───────────────────
#
# WHY. A per-signal judgement (stance today; market tags; polarity later) is read by code downstream,
# so it must always say WHO made it: a value without a version, an override without an actor, or a tag
# naming both a market and an unlisted group (or neither) is a judgement nobody can account for. Tags are
# never deleted: they leave by retired_at, and a delete cascaded from a signal is recorded.
#
# Checks (fleet-wide reads, then writes inside ONE transaction that is ROLLED BACK — nothing persists):
#   j1. no signal carries a stance without stance_version and stance_judged_at (constraint present, 0 rows).
#   j2. every live tag names exactly one target, belongs to its signal's company, and a listed market
#       is that company's with its journey_key.
#   j3. a stance without a version is refused.
#   j4. an override without an actor is refused.
#   j5. a tag naming both a market and an unlisted group is refused; so is a tag on another company's market.
#   j6. a DIRECT delete of a tag is refused; a signal delete cascades its tag and records it.
#
# Plant (run by hand):
#   bash scripts/plant.sh save supabase/migrations/20261118120000_signal_judgements.sql
#   # in the DB only: alter table public.signals drop constraint signals_stance_versioned;
#   bash scripts/guards/signal-judgement-guard.sh     # → j1 RED (constraint missing) and j3 RED
#   # re-add the constraint from the restored file; the run after that is GREEN.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
fail() { echo "FAIL $1: $2"; echo "guard: FAIL"; exit 1; }

[ "$(psql "select count(*) from pg_constraint where conname='signals_stance_versioned' and conrelid='public.signals'::regclass")" = 1 ] \
  || fail j1 "signals_stance_versioned is missing"
N=$(psql "select count(*) from signals where stance is not null and (stance_version is null or stance_judged_at is null)")
[ "$N" = 0 ] || fail j1 "$N signal(s) carry a stance with no version"
echo "j1. every stance carries its version ($(psql "select count(*) from signals where stance is not null") judged signal(s))"

N=$(psql "select count(*) from signal_market_tags t join signals s on s.id=t.signal_id
          left join odi_market_definitions d on d.id=t.market_definition_id
          where t.retired_at is null and (t.company_id <> s.company_id
             or ((t.market_definition_id is not null) = (t.unlisted_group is not null))
             or (t.market_definition_id is not null and (d.company_id <> t.company_id or d.journey_key <> t.journey_key)))")
[ "$N" = 0 ] || fail j2 "$N live tag(s) are malformed"
echo "j2. every live tag is well-formed ($(psql "select count(*) from signal_market_tags where retired_at is null") live tag(s))"

OUT=$(docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At 2>&1 <<'SQL' || true
begin;
insert into companies (id, name, website, created_by, fixture_hold)
  values ('00000000-0000-4000-8000-00000000d1a2', 'ZZ Signal Judgement Guard (rolled back)', 'https://signal-judgement.example',
          (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), 'SJ:signal-judgement-guard');
insert into odi_market_definitions (id, company_id, user_id, journey_key, job_executor, jtbd, market_register)
  values ('00000000-0000-4000-8000-00000000d1d1', '00000000-0000-4000-8000-00000000d1a2', (select id from auth.users where email='bob2@fomomojodojo.com' limit 1),
          'sj-donors', 'Donors', 'give', 'internal_declared');
insert into signals (id, company_id, source_type, signal_band, claim_text)
  values ('00000000-0000-4000-8000-00000000d1e1', '00000000-0000-4000-8000-00000000d1a2', 'uploaded_file', 'organization', 'Donors want to hear back');
do $$
declare other_md uuid := (select id from odi_market_definitions where company_id <> '00000000-0000-4000-8000-00000000d1a2' and retracted_at is null limit 1);
begin
  begin update signals set stance = 'customer_voice' where id='00000000-0000-4000-8000-00000000d1e1';
        raise exception 'FAIL j3: a stance without a version was stored';
  exception when check_violation then raise notice 'OK j3'; end;
  update signals set stance = 'customer_voice', stance_version = 'guard', stance_judged_at = now() where id='00000000-0000-4000-8000-00000000d1e1';
  begin insert into signal_judgement_overrides (company_id, signal_id, judgement, value, actor)
          values ('00000000-0000-4000-8000-00000000d1a2', '00000000-0000-4000-8000-00000000d1e1', 'stance', '"company"', ' ');
        raise exception 'FAIL j4: an override without an actor was stored';
  exception when check_violation then raise notice 'OK j4'; end;
  begin insert into signal_market_tags (company_id, signal_id, market_definition_id, journey_key, unlisted_group, tag_source, version, tagged_by)
          values ('00000000-0000-4000-8000-00000000d1a2', '00000000-0000-4000-8000-00000000d1e1', '00000000-0000-4000-8000-00000000d1d1', 'sj-donors', 'parents', 'model', 'guard', 'guard');
        raise exception 'FAIL j5: a tag naming a market AND a group was stored';
  exception when check_violation then null; end;
  begin insert into signal_market_tags (company_id, signal_id, market_definition_id, journey_key, tag_source, version, tagged_by)
          select '00000000-0000-4000-8000-00000000d1a2', '00000000-0000-4000-8000-00000000d1e1', d.id, d.journey_key, 'model', 'guard', 'guard'
            from odi_market_definitions d where d.id = other_md;
        raise exception 'FAIL j5: a tag on another company''s market was stored';
  exception when raise_exception then
    if sqlerrm like 'FAIL%' then raise; end if; raise notice 'OK j5'; end;
  insert into signal_market_tags (company_id, signal_id, market_definition_id, journey_key, tag_source, version, tagged_by)
    values ('00000000-0000-4000-8000-00000000d1a2', '00000000-0000-4000-8000-00000000d1e1', '00000000-0000-4000-8000-00000000d1d1', 'sj-donors', 'model', 'guard', 'guard');
  insert into signal_market_tags (company_id, signal_id, unlisted_group, tag_source, version, tagged_by)
    values ('00000000-0000-4000-8000-00000000d1a2', '00000000-0000-4000-8000-00000000d1e1', 'city funders', 'model', 'guard', 'guard');
  begin delete from signal_market_tags where signal_id='00000000-0000-4000-8000-00000000d1e1';
        raise exception 'FAIL j6: a direct delete of a tag was allowed';
  exception when insufficient_privilege then null; end;
  delete from signals where id='00000000-0000-4000-8000-00000000d1e1';
  if (select count(*) from signal_market_tags_deleted_audit where signal_id='00000000-0000-4000-8000-00000000d1e1') <> 2
    then raise exception 'FAIL j6: the cascaded delete was not recorded'; end if;
  raise notice 'OK j6';
end $$;
rollback;
SQL
)
for k in j3 j4 j5 j6; do echo "$OUT" | grep -q "OK $k" || fail "$k" "$(echo "$OUT" | grep -E 'FAIL|ERROR' | head -2)"; done
echo "j3. a stance without a version is refused"
echo "j4. an override without an actor is refused"
echo "j5. a tag with two targets, or on another company's market, is refused"
echo "j6. a direct tag delete is refused; a signal delete cascades its tags and records each"
[ "$(psql "select count(*) from companies where id='00000000-0000-4000-8000-00000000d1a2'")" = 0 ] || fail rollback "the guard's company persisted"
echo "GUARD OK"
