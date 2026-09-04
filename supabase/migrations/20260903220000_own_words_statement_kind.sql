-- OWN-WORDS ADMISSION CRITERION (operator ruling 2026-09-03): statement kind + declared eligibility.
--
-- A "you say" statement is a claim that POSITIONS. The own-words judge now answers ONE typed question
-- (kind ∈ positioning, offer, audience, proof, instruction, slogan, location, policy, story, recruiting,
-- other + a reason) inside its existing call; the extractor records it on the candidate ledger and stamps
-- the minted claim. declared_eligible = kind ∈ {positioning, offer, audience, proof}.
-- Existing 486 own_words claims: statement_kind NULL, declared_eligible TRUE (default) — INERT until the
-- retype backfill (retype-own-words, dry-run first, operator-reviewed) sets both from the judged kind.
-- Nothing is deleted or rewritten by this criterion. Additive; applied with psql -f (repo convention).

-- ── candidate ledger: the judge's typed answer at birth ───────────────────────────────────────
alter table public.own_words_candidates
  add column judge_kind text,
  add column judge_kind_reason text,
  add constraint own_words_candidates_judge_kind_check check (
    judge_kind is null or judge_kind in ('positioning','offer','audience','proof','instruction','slogan','location','policy','story','recruiting','other')
  );

-- FREEZE: attach explicitly (RB-2 lesson).
create trigger enforce_company_freeze
  before insert or update or delete on public.own_words_candidates
  for each row execute function public.enforce_company_freeze();

-- ── claims: the mark ─────────────────────────────────────────────────────────────────────────
alter table public.claims
  add column statement_kind text,
  add column declared_eligible boolean not null default true,
  add constraint claims_statement_kind_check check (
    statement_kind is null or statement_kind in ('positioning','offer','audience','proof','instruction','slogan','location','policy','story','recruiting','other')
  );
create index claims_own_words_ineligible_idx
  on public.claims (company_id) where claim_type = 'own_words' and not declared_eligible;

-- ── retype audit: one row per applied change (the backfill's paper trail) ─────────────────────
create table public.own_words_retypes (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null,               -- NO FK: survives teardown + churn
  claim_id       uuid not null,
  run_id         uuid not null,
  from_kind      text,
  to_kind        text,
  from_eligible  boolean not null,
  to_eligible    boolean not null,
  reason         text not null,
  applied_at     timestamptz not null default now(),
  applied_by     text not null default coalesce(auth.uid()::text, session_user::text)
);
create index own_words_retypes_company_idx on public.own_words_retypes (company_id, applied_at desc);
alter table public.own_words_retypes enable row level security;
create policy "members and admins read own words retypes"
  on public.own_words_retypes for select
  to authenticated
  using (
    exists (select 1 from public.company_members cm where cm.company_id = own_words_retypes.company_id and cm.user_id = auth.uid())
    or exists (select 1 from public.companies c where c.id = own_words_retypes.company_id and c.created_by = auth.uid())
    or public.has_role(auth.uid(), 'admin'::app_role)
  );
-- No client insert/update/delete policy: the service-role backfill is the only writer.
create trigger enforce_company_freeze
  before insert or update or delete on public.own_words_retypes
  for each row execute function public.enforce_company_freeze();
