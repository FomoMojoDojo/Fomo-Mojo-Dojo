-- Cleanup pass for FomoMojoDojo:
-- Align ODI market context-adjacent artifacts (job steps, ODI needs, opportunities, routes, managed outcome)
-- to Strategic Decision System language and internal claims.

begin;

with c as (
  select id
  from public.companies
  where lower(name) = 'fomomojodojo'
  limit 1
)
update public.job_steps js
set
  step_label = v.step_label,
  description = v.description,
  evidence_status = v.evidence_status,
  evidence_basis = v.evidence_basis,
  evidence_confidence = v.evidence_confidence
from (
  values
    (
      'customer', 1,
      'Frame Strategic Problem',
      'Leadership team names the client-stated strategic problem and the decision to be made before mapping.',
      'evidenced',
      'Aligned to internal intake and strategic-problem framing used before first MojoMap session.',
      80
    ),
    (
      'customer', 2,
      'Start MojoMap Intake',
      'Team completes quiz and diagnostic intake to establish context before first call.',
      'evidenced',
      'Supported by launch-site quiz + diagnostic flow and first-call process design.',
      78
    ),
    (
      'customer', 3,
      'Prepare Evidence Inputs',
      'Team assembles minimum evidence needed to build an initial MojoMap.',
      'implied',
      'Evidence-input requirement is explicit in workflow; quality thresholds still being validated by live clients.',
      68
    ),
    (
      'customer', 4,
      'Map Constraints and Options',
      'Team maps current reality, key constraint, and practical next-move options.',
      'evidenced',
      'Core product claim: MojoMap reveals current position, key constraint, and next move.',
      82
    ),
    (
      'customer', 5,
      'Run Weekly Decision Cadence',
      'Team uses MojoMap in a recurring decision rhythm to align priorities and execution.',
      'implied',
      'Cadence behavior is central to promise; additional customer evidence accumulation in progress.',
      65
    ),
    (
      'customer', 6,
      'Review Outcomes and Reprioritize',
      'Team reviews outcome signals and updates priorities as conditions change.',
      'implied',
      'Continuous reprioritization is stated product behavior; usage validation continues as deployments scale.',
      66
    ),
    (
      'revenue', 1,
      'Define Growth Outcomes',
      'Company sets commercial outcomes for the Strategic Decision System category launch.',
      'implied',
      'Revenue map reframed from investor narrative to customer-value growth narrative.',
      62
    ),
    (
      'revenue', 2,
      'Attract Qualified Decision Teams',
      'Company draws in ICP teams that have active strategic decision bottlenecks.',
      'implied',
      'Aligned with target audience and category-positioning inputs.',
      62
    ),
    (
      'revenue', 3,
      'Prepare Proof and Offer Assets',
      'Company packages proof, process, and offer assets to support purchase decisions.',
      'implied',
      'Derived from current positioning and route intent.',
      60
    ),
    (
      'revenue', 4,
      'Confirm Buying Readiness',
      'Company validates decision-owner readiness and commitment to run the process.',
      'implied',
      'Aligned with diagnostic-to-call funnel behavior.',
      60
    ),
    (
      'revenue', 5,
      'Convert to Initial MojoMap Engagement',
      'Company converts qualified conversations into paid initial map engagements.',
      'implied',
      'Aligned with take-quiz -> book-call -> initial-map flow.',
      63
    ),
    (
      'revenue', 6,
      'Monitor Conversion and Retention',
      'Company tracks conversion quality, repeat usage, and retention of engaged teams.',
      'implied',
      'Revenue and retention instrumentation is a current operating focus.',
      61
    ),
    (
      'revenue', 7,
      'Refine Growth Strategy',
      'Company adjusts go-to-market and offer strategy from observed decision outcomes.',
      'implied',
      'Closed-loop refinement mirrors product thesis and operating model.',
      61
    )
) as v(journey_key, step_number, step_label, description, evidence_status, evidence_basis, evidence_confidence)
where js.company_id = (select id from c)
  and js.journey_key = v.journey_key
  and js.step_number = v.step_number;

with c as (
  select id
  from public.companies
  where lower(name) = 'fomomojodojo'
  limit 1
)
update public.opportunities o
set
  step_label = v.step_label,
  outcome = v.outcome
from (
  values
    ('3b05bb2b-020f-41e0-b296-37c8d3f57cc4'::uuid,'Frame Strategic Problem','Increase the quality of the client-stated strategic problem before initial mapping begins.'),
    ('b4e9504c-17e7-4d13-acbf-7bc89f299e5f'::uuid,'Start MojoMap Intake','Reduce time from first touch to completed Mojo Diagnostic intake.'),
    ('cc5672d8-3d50-4e7f-9d54-58d6ee3b49c8'::uuid,'Start MojoMap Intake','Increase clarity on what happens after intake and before the first strategy call.'),
    ('9bb729b1-7df5-484b-9d84-f51bcc0bb31c'::uuid,'Prepare Evidence Inputs','Reduce effort required to assemble the minimum evidence set for an initial MojoMap.'),
    ('4092e0b1-af23-4505-893a-048fdfa2d902'::uuid,'Prepare Evidence Inputs','Increase confidence that submitted evidence is decision-ready before mapping.'),
    ('a5be3213-ecd8-4a39-9cfa-fdf5f8af8bd5'::uuid,'Map Constraints and Options','Increase confidence in the first recommended next move generated from the initial MojoMap.'),
    ('a7940928-0b8f-4c35-baf3-f8e6d7afef17'::uuid,'Run Weekly Decision Cadence','Increase the share of teams that run a weekly decision cadence using MojoMap.'),
    ('4c0633e2-1147-459f-ba32-96c3d7adfc07'::uuid,'Run Weekly Decision Cadence','Reduce re-litigation of priorities between weekly decision reviews.'),
    ('47acd7ac-21f5-48f5-a64f-4558d49388b6'::uuid,'Review Outcomes and Reprioritize','Increase the rate at which teams update priorities after reviewing outcome signals.'),
    ('dc62e5b3-524e-4f45-9348-f3eefa3ec550'::uuid,'Review Outcomes and Reprioritize','Reduce time needed to translate outcome signals into a clear next decision.'),
    ('7299098e-7c8e-4279-9c79-d3d7c981e3a5'::uuid,'Review Outcomes and Reprioritize','Increase 30-day reuse of MojoMap for subsequent strategic decisions.')
) as v(id, step_label, outcome)
where o.company_id = (select id from c)
  and o.id = v.id;

with c as (
  select id
  from public.companies
  where lower(name) = 'fomomojodojo'
  limit 1
)
update public.odi_needs n
set
  step_label = v.step_label,
  desired_outcome = v.desired_outcome,
  source_path = 'manual_context_edit'
from (
  values
    ('1cc38495-3fbe-49a9-b7cc-19a8272709b3'::uuid,'Frame Strategic Problem','Increase the quality of the client-stated strategic problem before initial mapping begins.'),
    ('268cc58a-5b75-43ea-ad84-a257493f5ce6'::uuid,'Start MojoMap Intake','Reduce time from first touch to completed Mojo Diagnostic intake.'),
    ('3bf212fc-bbff-45ff-900b-9a7c1ec84ff0'::uuid,'Start MojoMap Intake','Increase clarity on what happens after intake and before the first strategy call.'),
    ('04a1969f-5637-4147-a20e-637113631def'::uuid,'Prepare Evidence Inputs','Reduce effort required to assemble the minimum evidence set for an initial MojoMap.'),
    ('8bc32b6c-f984-4836-ada5-2fe0d5cfb7bc'::uuid,'Prepare Evidence Inputs','Increase confidence that submitted evidence is decision-ready before mapping.'),
    ('66d2389b-157a-4531-b281-322e1a0e3ba6'::uuid,'Map Constraints and Options','Increase confidence in the first recommended next move generated from the initial MojoMap.'),
    ('dbab8662-9d81-43e5-9d1e-17092b4e0c65'::uuid,'Run Weekly Decision Cadence','Increase the share of teams that run a weekly decision cadence using MojoMap.'),
    ('fe0cbaf4-f216-497d-8a04-cf7728b55298'::uuid,'Run Weekly Decision Cadence','Reduce re-litigation of priorities between weekly decision reviews.'),
    ('a198da22-dcd0-46fe-bf5a-ba464258129c'::uuid,'Review Outcomes and Reprioritize','Increase the rate at which teams update priorities after reviewing outcome signals.'),
    ('fa24e8a1-0c71-4e69-9828-8ad795491946'::uuid,'Review Outcomes and Reprioritize','Reduce time needed to translate outcome signals into a clear next decision.'),
    ('1cbdae29-c72e-4ef0-b07f-dcb30a3c76f0'::uuid,'Review Outcomes and Reprioritize','Increase 30-day reuse of MojoMap for subsequent strategic decisions.')
) as v(id, step_label, desired_outcome)
where n.company_id = (select id from c)
  and n.id = v.id;

with c as (
  select id
  from public.companies
  where lower(name) = 'fomomojodojo'
  limit 1
)
update public.routes r
set
  title = v.title,
  short_description = v.short_description,
  type = v.type
from (
  values
    ('a93a77d7-207b-4065-ad41-79343cd6e245'::uuid,'Clarify First-Call Problem Framing','Improve the precision of the client-stated strategic problem before mapping so teams start from the right decision context.','Fix'),
    ('1b023fd8-1481-4634-88c9-df0779628145'::uuid,'Simplify Evidence Intake for Initial MojoMap','Reduce friction in collecting minimum evidence so teams can reach a decision-ready first map faster.','Fix'),
    ('2f64efe3-da21-4e97-85a9-20501a54ad68'::uuid,'Standardize Weekly Decision Cadence','Create a repeatable weekly cadence so priorities stop drifting and decisions are not re-litigated.','Fix'),
    ('e205c096-937b-4ac8-a6ad-ed50e79bba83'::uuid,'Turn Outcome Signals Into Next Moves','Make it easier to convert outcome signals into explicit next decisions and updated priorities.','Fix'),
    ('659b243c-a42a-45e0-bbbf-138df7218433'::uuid,'Strengthen Category and Buyer Narrative','Sharpen strategic-decision-system messaging so decision owners immediately understand relevance and expected outcomes.','Improve'),
    ('23a20ea8-3662-43a5-b0bb-0fe05fa61c39'::uuid,'Improve Quiz-to-Call Conversion Flow','Increase conversion quality from intake to booked diagnostic calls with clearer expectations and tighter qualification.','Improve'),
    ('001d3999-1c76-4bd6-8cde-4520acb36270'::uuid,'Build Reusable Decision Review Loop','Implement a lightweight loop to review decisions, track outcomes, and feed updates back into the map each week.','Create'),
    ('56488528-a70c-4dcd-8eb5-10cc1808fdec'::uuid,'Create Public Proof for Outcome Improvement','Develop proof assets that show clearer decisions and faster momentum for teams using MojoMap.','Create')
) as v(id, title, short_description, type)
where r.company_id = (select id from c)
  and r.id = v.id;

with c as (
  select id
  from public.companies
  where lower(name) = 'fomomojodojo'
  limit 1
)
update public.managed_outcomes m
set
  outcome_title = 'Leadership teams start the right decision cycle quickly and with clear context.',
  outcome_statement = 'Leadership teams start the right decision cycle quickly and with clear context.',
  leading_indicator = 'Median time from first touch to completed intake and agreed strategic problem statement',
  target_direction = 'reduce',
  evidence_basis = 'Aligned to intake + first-call workflow and updated ODI/customer journey outcomes.',
  confidence = 72,
  frameworks_used = array['JTBD','ODI','Teresa Torres','Internal claims alignment','Manual context review']::text[],
  updated_at = now()
where m.company_id = (select id from c)
  and m.journey_key = 'customer';

with c as (
  select id
  from public.companies
  where lower(name) = 'fomomojodojo'
  limit 1
)
update public.odi_market_definitions m
set
  source_path = 'manual_context_edit',
  frameworks_used = array['JTBD','ODI','Teresa Torres','Public market comparison','Internal claims alignment','Manual context review']::text[],
  updated_at = now()
where m.company_id = (select id from c);

commit;
