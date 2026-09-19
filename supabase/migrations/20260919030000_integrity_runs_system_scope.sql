-- integrity_runs: SYSTEM-SCOPE rows are legal only when flagged (operator ruling M, signed 2026-09-19;
-- pulled forward from gate 1a's migration window). A company-agnostic act — publishing a reference job
-- map, a reference-map generation — needs an audit row that belongs to no company. Until now
-- company_id was NOT NULL, so such acts could not be audited at all (2026-09-18 reports).
--
--   * company_id becomes nullable;
--   * system_scope boolean NOT NULL DEFAULT false — the explicit flag;
--   * CHECK (company_id IS NOT NULL OR system_scope): a row without a company is legal ONLY when it is
--     flagged system scope, so a dropped company id on an ordinary writer still fails loudly.
--
-- model_calls is NOT changed (ruling M). Readers: every src/edge reader filters .eq("company_id", …), a
-- NULL row never matches; the members' RLS SELECT policy joins companies on company_id, so a NULL row is
-- visible to admins and the service role only (census in the 2026-09-19 report).
alter table public.integrity_runs alter column company_id drop not null;
alter table public.integrity_runs add column if not exists system_scope boolean not null default false;
alter table public.integrity_runs
  add constraint integrity_runs_company_or_system_scope check (company_id is not null or system_scope);
comment on column public.integrity_runs.system_scope is
  'true only for company-agnostic audit rows (reference job maps); with company_id NULL. CHECK integrity_runs_company_or_system_scope.';
