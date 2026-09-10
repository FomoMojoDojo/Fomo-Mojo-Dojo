-- Gate E1 — pin integrity: a job-step-set choice must name a set that exists.
--
-- WHAT WENT WRONG. operator_primary_selection.item_key is bare text with no FK and no validation, and
-- the writer upserts whatever key the surface was viewing. On 2026-07-28 an operator pinned
-- 'dmk-families-and-caregivers-of-at-risk-youth' for Edgewood — a MARKET-DEFINITION key. No job_steps
-- row has ever carried a dmk- key, for Edgewood or anyone, so the pin was invalid the moment it was
-- written and stayed that way for six weeks. Nothing detected it: both resolvers treat a pin whose set
-- is missing as "no choice", silently, and chosen_by is NULL on all 8 fleet pins so not even the actor
-- is recorded. A choice is a decision moment; it must be recorded, and it must be about something real.
--
-- (a) THE TRIGGER — refuse the write, don't repair it later. A pin naming a set with no job_steps is
--     rejected at insert/update. Scoped to domain='job_step_set': the 'finding' domain keys on item_id
--     against a different table and is untouched.
-- (b) THE AUDIT — every set/clear is a row. cleared_stale is written by the read path when a pin's set
--     has since disappeared (the trigger cannot see a later DELETE of the steps); cleared_operator is a
--     deliberate un-choosing. The table is append-only in spirit: nothing here is ever updated.
-- (c) DROP resolve_primary_job_step_set. It has NO runtime caller — no rpc() anywhere in src/ or
--     supabase/functions/ — yet it returns a bare text key that cannot be told apart from a real
--     choice: operator pin → heuristic score → the literal 'customer'. Three comments still name it as
--     the authority (mojoScore.ts, research-company) and are false. The TS resolveChosenSet is the
--     single authority and returns null, never a heuristic. Dropping it removes the last thing in the
--     system that can answer "which set is on strategy" with a guess.

create table public.operator_primary_selection_audit (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  domain     text not null,
  item_key   text,
  action     text not null check (action in ('set','cleared_stale','cleared_operator')),
  actor      text,
  reason     text,
  at         timestamptz not null default now()
);
create index operator_primary_selection_audit_company_idx
  on public.operator_primary_selection_audit (company_id, at desc);

create trigger enforce_company_freeze
  before insert or delete or update on public.operator_primary_selection_audit
  for each row execute function enforce_company_freeze();

alter table public.operator_primary_selection_audit enable row level security;
create policy "service role full access on operator_primary_selection_audit"
  on public.operator_primary_selection_audit using (auth.role() = 'service_role');
create policy "Admins manage operator_primary_selection_audit"
  on public.operator_primary_selection_audit to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create or replace function public.enforce_job_step_set_pin_exists()
returns trigger language plpgsql as $$
begin
  if new.domain <> 'job_step_set' then
    return new;
  end if;
  if new.item_key is null or btrim(new.item_key) = '' then
    raise exception 'a job-step-set choice needs a set key';
  end if;
  if not exists (
    select 1 from public.job_steps js
    where js.company_id = new.company_id and js.journey_key = new.item_key
  ) then
    raise exception 'cannot choose "%" — this company has no job steps in that set', new.item_key;
  end if;
  return new;
end;
$$;

create trigger enforce_job_step_set_pin_exists
  before insert or update on public.operator_primary_selection
  for each row execute function public.enforce_job_step_set_pin_exists();

drop function if exists public.resolve_primary_job_step_set(uuid);
