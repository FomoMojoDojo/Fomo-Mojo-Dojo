-- Market-lens layer M2 — backfill, WRITABLE COMPANIES ONLY. Data-only, zero child
-- rewrites (children already carry journey_key; the lens adopts them by the
-- (company_id, journey_key) pair — no child row is touched).
--
-- FROZEN-FIXTURE GUARD (operator law): CB1 and CB2 are hard-excluded from EVERY
-- statement below. CB1 = never written, no bypass. CB2 lens rows, if ever wanted,
-- come through its script-local bypass as a separate deliberate step — NOT here.
--   CB1 = 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc (Cafe Barra)
--   CB2 = fd3f7f63-968b-4698-b946-3d6b6450d79d (Cafe Barra 2)
-- Rollback: DELETE from route_lens_refs, then market_lens (M2 runs alone).

-- (a) Lens rows from the live emergent keys, excluding frozen fixtures.
insert into public.market_lens (company_id, journey_key, title)
select js.company_id, js.journey_key, min(js.journey_title)
from public.job_steps js
where js.company_id not in (
  '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', -- CB1 frozen
  'fd3f7f63-968b-4698-b946-3d6b6450d79d'  -- CB2 frozen
)
group by js.company_id, js.journey_key;

-- (b) Lead seeding from the operator's existing on-strategy choice
-- (operator_primary_selection domain='job_step_set'). Companies with no
-- selection stay all-support (honest: no lead declared yet).
update public.market_lens ml
set portfolio_role = 'lead'
from public.operator_primary_selection ops
where ops.company_id = ml.company_id
  and ops.domain = 'job_step_set'
  and ops.item_key = ml.journey_key
  and ml.company_id not in (
    '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', -- CB1 frozen
    'fd3f7f63-968b-4698-b946-3d6b6450d79d'  -- CB2 frozen
  );

-- (c) Anchor seeding: each writable company's lens(es) anchor the company's
-- is_primary managed outcome where one exists. A shared outcome anchoring 2+
-- lenses is expected reference-sharing, not an error.
update public.market_lens ml
set anchor_outcome_id = mo.id
from public.managed_outcomes mo
where mo.company_id = ml.company_id
  and mo.is_primary = true
  and ml.company_id not in (
    '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', -- CB1 frozen
    'fd3f7f63-968b-4698-b946-3d6b6450d79d'  -- CB2 frozen
  );

-- (d) Route refs: SINGLE-lens writable companies only — one ref per active route
-- into the sole lens. Multi-lens companies (e.g. Edgewood) start UNREFERENCED by
-- design (no one has assessed route↔lens fit yet). No route/leg/test row touched.
insert into public.route_lens_refs (company_id, route_id, lens_id)
select r.company_id, r.id, ml.id
from public.routes r
join public.market_lens ml on ml.company_id = r.company_id
where r.level = 'route'
  and r.relevance_state = 'active'
  and r.company_id not in (
    '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc', -- CB1 frozen
    'fd3f7f63-968b-4698-b946-3d6b6450d79d'  -- CB2 frozen
  )
  and (select count(*) from public.market_lens m2 where m2.company_id = r.company_id) = 1;
