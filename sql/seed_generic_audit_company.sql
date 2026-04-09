-- Generic audit company: exposes fallback/generic derivation paths for scoring/readout tuning.
-- Safe to re-run: it removes prior seeded company by name first.

begin;

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.input_files where input_id in (
  select i.id from public.inputs i join target_company tc on i.company_id = tc.id
);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.input_subitems where input_id in (
  select i.id from public.inputs i join target_company tc on i.company_id = tc.id
);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.inputs where company_id in (select id from target_company);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.odi_needs where company_id in (select id from target_company);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.odi_market_definitions where company_id in (select id from target_company);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.managed_outcomes where company_id in (select id from target_company);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.opportunities where company_id in (select id from target_company);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.job_steps where company_id in (select id from target_company);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.routes where company_id in (select id from target_company);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.positioning_canvases where company_id in (select id from target_company);

with target_company as (
  select id from public.companies where name = 'Generic Audit - Fallback Diagnostics'
)
delete from public.strategy_cascades where company_id in (select id from target_company);

delete from public.companies where name = 'Generic Audit - Fallback Diagnostics';

with owner as (
  select user_id as id
  from public.user_roles
  where role = 'admin'
  order by user_id
  limit 1
),
new_company as (
  insert into public.companies (
    name,
    website,
    quarter,
    archetype,
    tier,
    created_by,
    mojo_score,
    potential_score,
    projected_score,
    evidence_status,
    evidence_note,
    last_scored_at,
    area_scores_json,
    public_source_filters_json
  )
  select
    'Generic Audit - Fallback Diagnostics',
    'https://generic-audit.local',
    'Q2 2026',
    'Diagnostics',
    1,
    owner.id,
    18,
    34,
    52,
    'generated_no_baseline',
    'Audit company intentionally surfaces fallback and generic derivation paths for tuning.',
    null,
    jsonb_build_object(
      'evidence', jsonb_build_object('baseline_strength', 18, 'implementation_tested', 0),
      'generic_audit', jsonb_build_object(
        'purpose', 'Expose fallback and generic derivation logic by area for tuning.',
        'created_at', now(),
        'areas', jsonb_build_array(
          jsonb_build_object('area_key','positioning','source','src/hooks/useDynamicScoring.ts','logic','buildAreaLabels defaults + blank state'),
          jsonb_build_object('area_key','strategy','source','src/hooks/useDynamicScoring.ts','logic','constraint explanation template from weakest foundation score'),
          jsonb_build_object('area_key','product','source','src/hooks/useInputs.ts','logic','inferPublicSeed from key defaults + uncertainty text'),
          jsonb_build_object('area_key','marketing','source','src/hooks/useInputs.ts','logic','contextualizeInputText generic profile rewrites'),
          jsonb_build_object('area_key','sales','source','src/views/Routes/useRoutes.ts','logic','derive routes from opportunities when routes table empty'),
          jsonb_build_object('area_key','cx','source','src/hooks/usePrimaryEvidenceSignal.ts','logic','source_path keyword markers drive primary evidence confidence')
        )
      )
    ),
    jsonb_build_object(
      'include_domains', jsonb_build_array(),
      'exclude_domains', jsonb_build_array(),
      'exclude_source_types', jsonb_build_array()
    )
  from owner
  returning id, created_by
)
insert into public.inputs (
  company_id,
  user_id,
  input_key,
  input_label,
  group_key,
  group_label,
  sub_group,
  completeness,
  status,
  score_impact,
  impact_tier,
  description,
  why_it_matters
)
select
  nc.id,
  nc.created_by,
  v.input_key,
  v.input_label,
  v.group_key::public.input_group_key,
  v.group_label,
  v.sub_group,
  v.completeness,
  v.status::public.input_status,
  v.score_impact,
  v.impact_tier::public.input_impact_tier,
  v.description,
  v.why_it_matters
from new_company nc
cross join (
  values
    (
      'comp-alt','Positioning Fallback Audit','foundation','Foundation','Positioning',
      0,'not_started',8.5,'high',
      'Pulled from src/hooks/useDynamicScoring.ts and src/lib/areaMapping.ts. Default area labels and mapInputToAreaKey fallback can create generic positioning readouts when sub_group/input_key is weak.',
      'Derived by label defaults plus substring mapping. Tune by requiring explicit positioning evidence tags before scoring boost.'
    ),
    (
      'program-model','Strategy Constraint Audit','foundation','Foundation','Strategy',
      0,'not_started',7.8,'high',
      'Pulled from src/hooks/useDynamicScoring.ts (constraint_area and constraint_explanation). Strategy readout is templated from weakest foundation area.',
      'Derived from min(positioning,strategy). Tune by adding evidence-weighted variance and plain-language rewrite rules.'
    ),
    (
      'outcome-data','Product Public-Seed Audit','execution','Execution','Product & Operations',
      0,'not_started',7.1,'med',
      'Pulled from src/hooks/useInputs.ts (inferPublicSeed). Completeness is seeded from key defaults and uncertainty markers when raw completeness is empty.',
      'Derived from PUBLIC_SEED_COMPLETENESS_BY_KEY and text heuristics. Tune by tightening confidence gates before completeness seeding.'
    ),
    (
      'channel-strat','Marketing Context-Rewrite Audit','execution','Execution','Marketing & Awareness',
      0,'not_started',6.4,'med',
      'Pulled from src/hooks/useInputs.ts (contextualizeInputText). Generic profile rewrites not-applicable language into market copy.',
      'Derived from company-name profile inference and token rules. Tune by requiring company-specific nouns and hard evidence references.'
    ),
    (
      'referral-map','Sales Derived-Route Audit','market_evidence','Market Evidence','Sales & Revenue',
      0,'not_started',6.9,'high',
      'Pulled from src/views/Routes/useRoutes.ts. When routes are missing, sales routes are derived directly from opportunities.',
      'Derived by mapping priority_tier to category and templating short_description from step/score fields. Tune by enforcing route quality checks.'
    ),
    (
      'family-satisfaction','CX Source-Marker Audit','market_evidence','Market Evidence','Customer Experience',
      0,'not_started',5.9,'med',
      'Pulled from src/hooks/usePrimaryEvidenceSignal.ts and src/lib/sourceConfidence.ts. Primary evidence confidence is marker-based via source_path tags.',
      'Derived from keyword lists and uploaded file tags. Tune by adding provenance confidence and recency weighting.'
    )
) as v(
  input_key,input_label,group_key,group_label,sub_group,
  completeness,status,score_impact,impact_tier,description,why_it_matters
);

with company as (
  select id, created_by from public.companies where name = 'Generic Audit - Fallback Diagnostics' limit 1
)
insert into public.job_steps (
  company_id,user_id,journey_key,journey_title,journey_subtitle,step_number,step_label,description,designed,has_gap,gap_note,evidence_status,evidence_basis,evidence_confidence
)
select c.id,c.created_by,v.journey_key,v.journey_title,v.journey_subtitle,v.step_number,v.step_label,v.description,v.designed,v.has_gap,v.gap_note,v.evidence_status,v.evidence_basis,v.evidence_confidence
from company c
cross join (
  values
    ('customer','Customer Journey','Fallback diagnostics',1,'Discover options','Step intentionally generic to test readability and confidence overlays',true,true,'Generic discovery label without explicit customer segment','implied','Legacy-style inferred evidence basis for diagnostics',45),
    ('customer','Customer Journey','Fallback diagnostics',2,'Evaluate fit','Derived evaluation step with minimal specificity',true,true,'Needs explicit ODI outcome linkage','unclear','No primary interview markers present in source_path',20),
    ('customer','Customer Journey','Fallback diagnostics',3,'Adopt and repeat','Adoption step used to test route/opportunity linkage behavior',true,false,'','implied','Derived from seeded diagnostic map',50)
) as v(journey_key,journey_title,journey_subtitle,step_number,step_label,description,designed,has_gap,gap_note,evidence_status,evidence_basis,evidence_confidence);

with company as (
  select id, created_by from public.companies where name = 'Generic Audit - Fallback Diagnostics' limit 1
)
insert into public.opportunities (
  company_id,user_id,outcome,step_number,step_label,importance,satisfaction,opportunity_score,priority_tier,journey_key,workflow_status
)
select c.id,c.created_by,v.outcome,v.step_number,v.step_label,v.importance,v.satisfaction,v.opportunity_score,v.priority_tier,v.journey_key,v.workflow_status
from company c
cross join (
  values
    ('Improve customer progress through the journey',1,'Discover options',8,3,13.0,'focus','customer','in_progress'),
    ('Increase conversion in core flow',2,'Evaluate fit',7,4,10.5,'monitor','customer','planned'),
    ('Reduce dropoff after onboarding',3,'Adopt and repeat',6,4,9.1,'monitor','customer','planned')
) as v(outcome,step_number,step_label,importance,satisfaction,opportunity_score,priority_tier,journey_key,workflow_status);

with company as (
  select id, created_by from public.companies where name = 'Generic Audit - Fallback Diagnostics' limit 1
)
insert into public.odi_market_definitions (
  company_id,user_id,job_executor,chooser,jtbd,source_path,frameworks_used
)
select
  c.id,
  c.created_by,
  'Unknown from public evidence',
  'Buying/decision lead',
  'Make progress through customer journey',
  'public_research',
  array['JTBD','ODI','Audit Fixture']::text[]
from company c;

with company as (
  select id, created_by from public.companies where name = 'Generic Audit - Fallback Diagnostics' limit 1
)
insert into public.odi_needs (
  company_id,user_id,tier,desired_outcome,journey_key,step_number,step_label,importance,satisfaction,opportunity_score,service_state,source_path,frameworks_used,sort_order
)
select
  c.id,
  c.created_by,
  v.tier,
  v.desired_outcome,
  v.journey_key,
  v.step_number,
  v.step_label,
  v.importance,
  v.satisfaction,
  v.opportunity_score,
  v.service_state,
  v.source_path,
  array['ODI','JTBD','Audit Fixture']::text[],
  v.sort_order
from company c
cross join (
  values
    ('core','Minimize the time it takes to identify the right option','customer',1,'Discover options',8,3,13,'underserved','public_research',1),
    ('core','Increase confidence before committing to a provider','customer',2,'Evaluate fit',7,4,10,'underserved','public_research',2),
    ('supporting','Reduce rework during onboarding and first use','customer',3,'Adopt and repeat',6,5,7,'served','public_research',3)
) as v(tier,desired_outcome,journey_key,step_number,step_label,importance,satisfaction,opportunity_score,service_state,source_path,sort_order);

commit;
