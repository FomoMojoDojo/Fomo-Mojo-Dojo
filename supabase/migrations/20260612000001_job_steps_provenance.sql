-- Phase 2 Gate 1: explicit job-step provenance. Three values, CHECK-enforced
-- (odi_market_definitions.provenance_type is the naming precedent; it has no CHECK —
-- this one does, per the gate brief). NULL = unproven = inadmissible to external
-- prompt framing (council decision #4, zero-backfill blast radius accepted).
alter table public.job_steps add column if not exists provenance_type text null;

alter table public.job_steps add constraint check_job_steps_provenance_type
  check (provenance_type is null or provenance_type in
    ('public_baseline', 'internal_derived', 'operator_authored'));

-- Backfill ONLY provably-public rows: source_run_id resolves in public_baseline_runs.
update public.job_steps js
set provenance_type = 'public_baseline'
where js.provenance_type is null
  and js.source_run_id is not null
  and exists (select 1 from public.public_baseline_runs r
              where r.id::text = js.source_run_id);
