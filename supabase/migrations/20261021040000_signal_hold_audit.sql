-- signal_hold_audit (operator ruling 2026-10-21, re-run brief ruling 2): every operator hold or release of a signal writes
-- one audit row — before and after (held_at, held_reason), the reason, the actor and the run_ref — so a hold is reversible
-- from the record alone. signals.held_at / held_reason (20260828000000) stay the flag; this table is its history.
-- Writer: scripts/signal-holds.ts (named mode plan|write|revert; no default). Service role writes; admins read; anon nothing.
create table public.signal_hold_audit (
  id uuid primary key default gen_random_uuid(),
  signal_id uuid not null references public.signals(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  action text not null check (action in ('hold', 'release')),
  reason text not null check (length(btrim(reason)) > 0),
  before jsonb not null,
  after jsonb not null,
  actor text not null check (length(btrim(actor)) > 0),
  run_ref text not null check (length(btrim(run_ref)) > 0),
  at timestamptz not null default now()
);
create index signal_hold_audit_signal on public.signal_hold_audit (signal_id);
create index signal_hold_audit_company on public.signal_hold_audit (company_id);

alter table public.signal_hold_audit enable row level security;
create policy "admins can read signal hold audit" on public.signal_hold_audit for select to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "service role full access on signal hold audit" on public.signal_hold_audit for all using (auth.role() = 'service_role'::text);
revoke all on public.signal_hold_audit from anon;
revoke truncate, references, trigger on public.signal_hold_audit from authenticated;

-- FREEZE: a frozen company (CB1) is never held or released either
create trigger enforce_company_freeze before insert or update or delete on public.signal_hold_audit for each row execute function public.enforce_company_freeze();
