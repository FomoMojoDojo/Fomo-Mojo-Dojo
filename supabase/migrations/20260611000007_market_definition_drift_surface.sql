-- B2.2b — market-definition reconciler joins the existing drift family.
-- The ONLY schema touch: surface_type CHECK gains 'market_definition'. No new tables —
-- comparison verdicts and the baseline state live in the assessment row's
-- assessment_basis (one row per surface, updated in place, family convention).
alter table public.surface_drift_assessments drop constraint check_drift_surface_type;
alter table public.surface_drift_assessments add constraint check_drift_surface_type
  check (surface_type = any (array[
    'positioning'::text,
    'cascade'::text,
    'route'::text,
    'opportunity'::text,
    'market_definition'::text
  ]));
