-- B2.1: dedicated competitor-discovery snapshots. SIBLING table (storage decision over a
-- run_kind marker on public_baseline_runs): a marker would force every newest-non-weak
-- baseline resolver (research-company, refresh-positioning, refresh-cascade, the prior-
-- archetype lookup) to filter it — one missed filter silently makes a competitor run THE
-- client baseline. A sibling table makes that contamination structurally impossible while
-- keeping snapshots additive for B2.2's market-drift reads. Signals from these runs land
-- in `signals` with source_type='competitor_discovery_run' (additive, per-run source_id).

create table if not exists public.competitor_discovery_runs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id),
  baseline_run_id bigint null,
  result_json jsonb not null,
  created_at timestamptz not null default now()
);
