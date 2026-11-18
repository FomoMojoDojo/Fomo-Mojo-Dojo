#!/usr/bin/env bash
# ── NEED-MARKETS GUARD — M-1 (2026-11-18; maps-and-markets decisions 1, 2, 10) ──────────────────────
#
# WHY. One need can belong to several markets as ONE record: the need is one odi_needs row and each of
# its markets is one need_markets link. Until M-4 moves the per-market writes onto the link, the HOME link
# (journey_key = the need's own) mirrors the need's per-market columns by trigger. A link is never
# deleted: it leaves a market by retired_at. A legacy delete of a NEED still cascades its links (that path
# predates the table) and each one is recorded in need_markets_deleted_audit.
#
# Checks (fleet-wide reads, then writes inside ONE transaction that is ROLLED BACK — nothing persists):
#   k1. every ACTIVE need of a market has at least one live link (a company-held need — journey_key NULL,
#       holder 'company' — has no market and so no link).
#   k2. every need of a market (any status) has its live HOME link; no link points at another company's need.
#   k3. every home link carries exactly the need's per-market values (the mirror holds).
#   k4. a DIRECT delete of a link is refused by need_markets_no_delete.
#   k5. inserting a need creates its home link; a slider-style update is mirrored; moving the need's
#       journey_key moves its home link.
#   k6. a legacy delete of a need cascades its link AND records it in need_markets_deleted_audit.
#   k7. a retirement must be signed: retired_at without retired_by / retired_reason is refused.
#
# Plant (run by hand):
#   bash scripts/plant.sh save supabase/migrations/20261118100000_need_markets.sql
#   # in the DB only: drop trigger need_markets_no_delete on public.need_markets;
#   bash scripts/guards/need-markets-guard.sh        # → k4 RED
#   # re-create the trigger from the restored file's statement; the run after that is GREEN.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=supabase_db_dzlgyxcvuwiulgifbmew
psql() { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -Atc "$1"; }
fail() { echo "FAIL $1: $2"; echo "guard: FAIL"; exit 1; }

N=$(psql "select count(*) from odi_needs n where n.status='active' and n.journey_key is not null and not exists (select 1 from need_markets l where l.need_id=n.id and l.retired_at is null)")
[ "$N" = 0 ] || fail k1 "$N active need(s) have no live link"
echo "k1. every active need has a live link ($(psql "select count(*) from odi_needs where status='active'") active needs)"

N=$(psql "select count(*) from odi_needs n where n.journey_key is not null and not exists (select 1 from need_markets l where l.need_id=n.id and l.journey_key=n.journey_key and l.retired_at is null)")
[ "$N" = 0 ] || fail k2 "$N need(s) have no live home link"
N=$(psql "select count(*) from need_markets l join odi_needs n on n.id=l.need_id where l.company_id <> n.company_id")
[ "$N" = 0 ] || fail k2 "$N link(s) carry another company's id"
echo "k2. every need has its live home link ($(psql "select count(*) from need_markets") links on $(psql "select count(*) from odi_needs") needs); no cross-company link"

N=$(psql "select count(*) from need_markets l join odi_needs n on n.id=l.need_id and l.journey_key=n.journey_key
          where (l.importance, l.satisfaction, l.opportunity_score, l.service_state, l.step_number, l.step_label, l.validation_state,
                 l.evidence_state, l.strategy_alignment, l.strategy_alignment_reason, l.canonical_statement, l.evidence_signal_ids::text)
       is distinct from (n.importance, n.satisfaction, n.opportunity_score, n.service_state, n.step_number, n.step_label, n.validation_state,
                 n.evidence_state, n.strategy_alignment, n.strategy_alignment_reason, n.odi_canonical_statement, n.evidence_baseline_signal_ids::text)")
[ "$N" = 0 ] || fail k3 "$N home link(s) differ from their need's per-market values"
echo "k3. every home link mirrors its need's per-market values"

OUT=$(docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At 2>&1 <<'SQL' || true
begin;
insert into companies (id, name, website, created_by, fixture_hold)
  values ('00000000-0000-4000-8000-00000000d1a1', 'ZZ Need Markets Guard (rolled back)', 'https://need-markets.example',
          (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), 'NM:need-markets-guard');
insert into odi_market_definitions (company_id, user_id, journey_key, job_executor, jtbd, market_register)
  values ('00000000-0000-4000-8000-00000000d1a1', (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), 'nm-donors', 'Donors', 'give', 'internal_declared');
insert into odi_needs (id, company_id, user_id, desired_outcome, journey_key, importance, status)
  values ('00000000-0000-4000-8000-00000000d1c1', '00000000-0000-4000-8000-00000000d1a1', (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), 'Know what the gift achieved', 'customer', 3, 'active');
do $$ begin
  if (select count(*) from need_markets where need_id='00000000-0000-4000-8000-00000000d1c1' and journey_key='customer' and importance=3 and tag_source='home') <> 1
    then raise exception 'FAIL k5: the insert did not create its home link'; end if;
  update odi_needs set importance = 8 where id='00000000-0000-4000-8000-00000000d1c1';
  if (select importance from need_markets where need_id='00000000-0000-4000-8000-00000000d1c1') <> 8
    then raise exception 'FAIL k5: the update was not mirrored'; end if;
  update odi_needs set journey_key = 'nm-donors' where id='00000000-0000-4000-8000-00000000d1c1';
  if (select count(*) from need_markets where need_id='00000000-0000-4000-8000-00000000d1c1' and journey_key='nm-donors'
        and market_definition_id is not null and retired_at is null) <> 1
     or exists (select 1 from need_markets where need_id='00000000-0000-4000-8000-00000000d1c1' and journey_key='customer' and retired_at is null)
    then raise exception 'FAIL k5: moving the need did not move its home link'; end if;
  update odi_needs set journey_key = null, holder = 'company' where id='00000000-0000-4000-8000-00000000d1c1';
  if exists (select 1 from need_markets where need_id='00000000-0000-4000-8000-00000000d1c1' and retired_at is null)
    then raise exception 'FAIL k5: a need made company-held kept a live link'; end if;
  update odi_needs set journey_key = 'nm-donors', holder = 'market' where id='00000000-0000-4000-8000-00000000d1c1';
  if not exists (select 1 from need_markets where need_id='00000000-0000-4000-8000-00000000d1c1' and journey_key='nm-donors' and retired_at is null)
    then raise exception 'FAIL k5: a need returned to its market was not re-linked'; end if;
  insert into odi_needs (company_id, user_id, desired_outcome, journey_key, holder, status)
    values ('00000000-0000-4000-8000-00000000d1a1', (select id from auth.users where email='bob2@fomomojodojo.com' limit 1), 'Company-held', null, 'company', 'active');
  raise notice 'OK k5';
end $$;
do $$ begin
  begin
    delete from need_markets where need_id='00000000-0000-4000-8000-00000000d1c1';
    raise exception 'FAIL k4: a direct delete of a link was allowed';
  exception when insufficient_privilege then raise notice 'OK k4';
  end;
  begin
    update need_markets set retired_at = now() where need_id='00000000-0000-4000-8000-00000000d1c1';
    raise exception 'FAIL k7: an unsigned retirement was allowed';
  exception when check_violation then raise notice 'OK k7';
  end;
  delete from odi_needs where id='00000000-0000-4000-8000-00000000d1c1';
  if exists (select 1 from need_markets where need_id='00000000-0000-4000-8000-00000000d1c1')
     or not exists (select 1 from need_markets_deleted_audit where need_id='00000000-0000-4000-8000-00000000d1c1' and how like 'cascade%')
    then raise exception 'FAIL k6: the cascaded delete was not recorded'; end if;
  raise notice 'OK k6';
end $$;
rollback;
SQL
)
for k in k4 k5 k6 k7; do echo "$OUT" | grep -q "OK $k" || fail "$k" "$(echo "$OUT" | grep -E 'FAIL|ERROR' | head -2)"; done
echo "k4. a direct delete of a link is refused"
echo "k5. a new need gets its home link; an update is mirrored; a journey move moves the link; company-held needs have none and insert cleanly"
echo "k6. a legacy need delete cascades its link and records it ($(psql "select count(*) from need_markets_deleted_audit") audit row(s) fleet-wide, all rolled-back runs excluded)"
echo "k7. an unsigned retirement is refused"
[ "$(psql "select count(*) from companies where id='00000000-0000-4000-8000-00000000d1a1'")" = 0 ] || fail rollback "the guard's company persisted"
echo "GUARD OK"
