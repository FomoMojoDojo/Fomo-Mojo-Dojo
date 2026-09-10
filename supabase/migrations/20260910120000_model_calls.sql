-- model_calls (Gate 3, 2026-09-10) — the cost ledger.
--
-- Six edge functions computed a USD cost and returned it in an HTTP body no caller ever parsed
-- (generate-public-read, generate-claim-deltas, backstop-delta-relevance, generate-signal-recurrence,
-- generate-open-questions, generate-conflict-explanation). No table in the system had a cost or token
-- column, so every run's spend was gone the moment the response was discarded. Past spend is not
-- recoverable — usage was never persisted — so this table starts from now.
--
-- Keyed to long_runner_runs (uuid PK, run_kind, parent_run_id) so a cost row joins to the run that
-- incurred it and a full_refresh parent can roll up its children. ON DELETE SET NULL, not CASCADE:
-- spend history must outlive the run row it came from.
create table if not exists public.model_calls (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null,
  run_id            uuid null references public.long_runner_runs(id) on delete set null,
  call_site         text not null,
  provider          text not null,
  model             text not null,
  prompt_tokens     int,
  completion_tokens int,
  usd               numeric(10,6) null,
  created_at        timestamptz not null default now()
);

create index if not exists model_calls_company_created_idx
  on public.model_calls (company_id, created_at desc);

alter table public.model_calls enable row level security;

drop policy if exists "service role full access on model_calls" on public.model_calls;
create policy "service role full access on model_calls" on public.model_calls
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "members and admins read model_calls" on public.model_calls;
create policy "members and admins read model_calls" on public.model_calls
  for select using (
    exists (select 1 from public.companies c where c.id = model_calls.company_id and c.created_by = auth.uid())
    or exists (select 1 from public.company_members cm where cm.company_id = model_calls.company_id and cm.user_id = auth.uid())
    or public.has_role(auth.uid(), 'admin'::public.app_role)
  );

comment on table public.model_calls is
  'Per-model-call cost ledger. One row per billable call; usd null when the provider returned no usage.';
