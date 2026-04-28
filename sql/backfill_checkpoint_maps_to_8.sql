-- Ensure every company has at least one checkpoint map and every map has steps 1-8.
-- Existing steps are preserved. Only missing checkpoints are inserted.

with checkpoint_catalog(step_number, step_label, description) as (
  values
    (1, 'Define success clearly', 'State the result the customer is trying to achieve and what good looks like.'),
    (2, 'Find the best path', 'Find the options, information, and resources most likely to move this job forward.'),
    (3, 'Get ready to act', 'Gather prerequisites, align the right people, and remove blockers before starting.'),
    (4, 'Check before committing', 'Confirm the chosen path is feasible, credible, and worth committing to.'),
    (5, 'Do the core work', 'Carry out the key actions that move the customer toward the target result.'),
    (6, 'Track progress in real time', 'Track progress, quality, and confidence signals while work is underway.'),
    (7, 'Adjust when reality changes', 'Adjust quickly when conditions change or results fall behind expectations.'),
    (8, 'Finish and capture lessons', 'Confirm the result, close open loops, and record what to repeat or improve next time.')
),
existing_maps as (
  select
    js.company_id,
    js.journey_key,
    max(js.user_id::text)::uuid as user_id,
    max(coalesce(js.journey_title, '')) as journey_title,
    max(coalesce(js.journey_subtitle, '')) as journey_subtitle
  from public.job_steps js
  group by js.company_id, js.journey_key
),
default_customer_maps as (
  select
    c.id as company_id,
    'customer'::text as journey_key,
    c.created_by as user_id,
    'Customer Checkpoint Map'::text as journey_title,
    'How a customer progresses through the 8 required checkpoints.'::text as journey_subtitle
  from public.companies c
  where not exists (
    select 1 from public.job_steps js where js.company_id = c.id
  )
),
map_scope as (
  select * from existing_maps
  union all
  select * from default_customer_maps
),
missing_checkpoints as (
  select
    ms.company_id,
    ms.journey_key,
    coalesce(ms.user_id, c.created_by) as user_id,
    case
      when coalesce(ms.journey_title, '') <> '' then ms.journey_title
      when ms.journey_key = 'customer' then 'Customer Checkpoint Map'
      else initcap(replace(ms.journey_key, '-', ' ')) || ' Checkpoint Map'
    end as journey_title,
    case
      when coalesce(ms.journey_subtitle, '') <> '' then ms.journey_subtitle
      when ms.journey_key = 'customer' then 'How a customer progresses through the 8 required checkpoints.'
      else 'How this audience progresses through the 8 required checkpoints.'
    end as journey_subtitle,
    cc.step_number,
    cc.step_label,
    cc.description
  from map_scope ms
  join public.companies c on c.id = ms.company_id
  cross join checkpoint_catalog cc
  left join public.job_steps js
    on js.company_id = ms.company_id
   and js.journey_key = ms.journey_key
   and js.step_number = cc.step_number
  where js.id is null
)
insert into public.job_steps (
  company_id,
  user_id,
  journey_key,
  journey_title,
  journey_subtitle,
  step_number,
  step_label,
  description,
  designed,
  has_gap,
  gap_note,
  frameworks_used,
  evidence_status,
  evidence_basis,
  evidence_confidence
)
select
  company_id,
  user_id,
  journey_key,
  journey_title,
  journey_subtitle,
  step_number,
  step_label,
  description,
  false as designed,
  true as has_gap,
  'Backfilled missing checkpoint to enforce 8-step map completeness.' as gap_note,
  '{}'::text[] as frameworks_used,
  'unclear'::text as evidence_status,
  'Backfilled checkpoint placeholder. Validate with evidence.' as evidence_basis,
  20 as evidence_confidence
from missing_checkpoints;
