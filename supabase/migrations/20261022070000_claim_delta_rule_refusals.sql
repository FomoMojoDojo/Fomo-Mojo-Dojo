-- claim_delta_rule_refusals (operator ruling 2026-10-22, gap quality R1–R3): the finalize code checks refuse a judged
-- public_vs_public pair WITHOUT editing its claim_deltas verdict row. A refusal is one append-only row naming the rule
-- and the reason; a revert is a second row (action 'revert', reverts = the refusal's id). The ACTIVE set is the view
-- below: refuse rows no revert row points at. Readers take an active refusal out of the gap beat through the one
-- admissibility predicate (_shared/relevanceActive.ts isPairAdmissible), exactly like a relevance strike.
--   R1  a specific is disputed only by a competing specific of the same unit      → not_echoed
--   R2  no shared content word: absence is not contradiction                      → not_echoed
--   R3  employer-review host (glassdoor.*, indeed, comparably, kununu, teamblind) → removed
-- Rules: _shared/deltaRuleChecks.ts. Writers: the public-kind delta finalize and scripts/delta-rule-refusals.ts (named
-- mode plan|apply|revert|revert-probe; no default). Every write is preceded by one claim_delta_rule_refusal_audit row.
-- Service role writes; admins read both tables; a company's creator/members read its refusals; anon nothing.

create table public.claim_delta_rule_refusals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delta_id uuid not null,                  -- the claim_deltas row judged (no FK: the finalize's stale sweep re-inserts pair rows)
  content_identity text not null check (length(btrim(content_identity)) > 0),   -- the pair's stable identity (survives the sweep)
  delta_type text not null check (delta_type in ('divergent', 'internally_silent', 'echoed')),
  rule text not null check (rule in ('R1', 'R2', 'R3')),
  outcome text not null check (outcome in ('not_echoed', 'removed')),
  action text not null check (action in ('refuse', 'revert')),
  reverts uuid references public.claim_delta_rule_refusals(id),
  reason text not null check (length(btrim(reason)) > 0),
  detail jsonb not null default '{}'::jsonb,
  rules_version integer not null check (rules_version > 0),
  actor text not null check (length(btrim(actor)) > 0),
  run_ref text not null check (length(btrim(run_ref)) > 0),
  at timestamptz not null default now(),
  check ((rule = 'R3') = (outcome = 'removed')),
  check ((action = 'revert') = (reverts is not null))
);
create index claim_delta_rule_refusals_company on public.claim_delta_rule_refusals (company_id);
create index claim_delta_rule_refusals_identity on public.claim_delta_rule_refusals (company_id, content_identity);
create unique index claim_delta_rule_refusals_one_revert on public.claim_delta_rule_refusals (reverts) where reverts is not null;

create table public.claim_delta_rule_refusal_audit (
  id uuid primary key default gen_random_uuid(),
  refusal_id uuid not null,                -- the refusal (or revert) row this audit row precedes
  company_id uuid not null references public.companies(id) on delete cascade,
  delta_id uuid not null,
  rule text not null check (rule in ('R1', 'R2', 'R3')),
  action text not null check (action in ('refuse', 'revert')),
  before jsonb not null,                   -- { active: bool, delta_row_md5 }
  after jsonb not null,
  actor text not null check (length(btrim(actor)) > 0),
  run_ref text not null check (length(btrim(run_ref)) > 0),
  at timestamptz not null default now()
);
create index claim_delta_rule_refusal_audit_company on public.claim_delta_rule_refusal_audit (company_id);
create index claim_delta_rule_refusal_audit_refusal on public.claim_delta_rule_refusal_audit (refusal_id);

-- APPEND-ONLY: no UPDATE ever; DELETE only under an explicit purge setting (a throwaway company's cleanup).
create or replace function public.claim_delta_rule_refusals_append_only()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception '% is append-only: UPDATE refused (a revert is a new row)', tg_table_name;
  end if;
  if tg_op = 'DELETE' and coalesce(current_setting('app.claim_delta_rule_refusals_purge', true), '') <> 'on' then
    raise exception '% is append-only: DELETE refused (set app.claim_delta_rule_refusals_purge for a throwaway purge)', tg_table_name;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger claim_delta_rule_refusals_append_only before update or delete on public.claim_delta_rule_refusals
  for each row execute function public.claim_delta_rule_refusals_append_only();
create trigger claim_delta_rule_refusal_audit_append_only before update or delete on public.claim_delta_rule_refusal_audit
  for each row execute function public.claim_delta_rule_refusals_append_only();

-- FREEZE: a frozen company (CB1) is never refused or reverted either
create trigger enforce_company_freeze before insert or update or delete on public.claim_delta_rule_refusals for each row execute function public.enforce_company_freeze();
create trigger enforce_company_freeze before insert or update or delete on public.claim_delta_rule_refusal_audit for each row execute function public.enforce_company_freeze();

-- THE ACTIVE SET: a refuse row no revert row points at.
create view public.claim_delta_rule_refusals_active with (security_invoker = true) as
  select r.id, r.company_id, r.delta_id, r.content_identity, r.delta_type, r.rule, r.outcome, r.reason, r.detail, r.rules_version, r.at
  from public.claim_delta_rule_refusals r
  where r.action = 'refuse'
    and not exists (select 1 from public.claim_delta_rule_refusals v where v.reverts = r.id);

alter table public.claim_delta_rule_refusals enable row level security;
alter table public.claim_delta_rule_refusal_audit enable row level security;
create policy "admins can read claim delta rule refusals" on public.claim_delta_rule_refusals for select to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "users can read company claim delta rule refusals" on public.claim_delta_rule_refusals for select to authenticated using (
  exists (select 1 from public.companies c where c.id = claim_delta_rule_refusals.company_id
          and (c.created_by = auth.uid() or exists (select 1 from public.company_members cm where cm.company_id = c.id and cm.user_id = auth.uid()))));
create policy "service role full access on claim delta rule refusals" on public.claim_delta_rule_refusals for all using (auth.role() = 'service_role'::text);
create policy "admins can read claim delta rule refusal audit" on public.claim_delta_rule_refusal_audit for select to authenticated using (public.has_role(auth.uid(), 'admin'::app_role));
create policy "service role full access on claim delta rule refusal audit" on public.claim_delta_rule_refusal_audit for all using (auth.role() = 'service_role'::text);

revoke all on public.claim_delta_rule_refusals from anon;
revoke all on public.claim_delta_rule_refusal_audit from anon;
revoke all on public.claim_delta_rule_refusals_active from anon;
-- destructive-ok: these REVOKE the TRUNCATE privilege (grant layer, F1/F2 2026-09-30); nothing is truncated
revoke insert, update, delete, truncate, references, trigger on public.claim_delta_rule_refusals from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.claim_delta_rule_refusal_audit from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.claim_delta_rule_refusals_active from authenticated;
