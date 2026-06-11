-- Reviewer-integrity logging (design gate 2026-06-11, council-accepted).
-- Law on record: "all clear" that never asked isn't all clear. Every checking
-- component (reviewers, judges, gates, scans) persists a record that it ran, failed,
-- or had nothing to examine — the durable form of the composition logs that found
-- two real defects this week. Append-only; no retention policy (council Q6).
-- integrity_runs OWNS execution state; research_review_runs untouched (council Q3).
create table if not exists public.integrity_runs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  component text not null,
  surface_type text null,
  surface_id uuid null,
  ran_at timestamptz not null default now(),
  status text not null check (status in ('completed', 'failed', 'skipped_empty_input')),
  examined int null,
  admitted int null,
  excluded_by_rule jsonb null,
  error text null,
  run_ref text null
);

create index if not exists idx_integrity_runs_lookup
  on public.integrity_runs (company_id, component, ran_at desc);

alter table public.integrity_runs enable row level security;

create policy "service role full access on integrity_runs"
  on public.integrity_runs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Read access mirrors the drift-assessment view policy: company owner or member.
create policy "users can view company integrity runs"
  on public.integrity_runs for select
  using (exists (
    select 1 from public.companies c
    where c.id = integrity_runs.company_id
      and (c.created_by = auth.uid()
        or exists (select 1 from public.company_members cm where cm.company_id = c.id and cm.user_id = auth.uid()))
  ));
