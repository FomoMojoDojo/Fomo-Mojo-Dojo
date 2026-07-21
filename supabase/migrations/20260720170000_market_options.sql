-- MO-1 — ODI-form MARKET OPTIONS.
--
-- A market option is a HYPOTHESIS about a market this company may serve, stated
-- in strict ODI form: an EXECUTOR (a group of people) + a JOB (verb + object of
-- the verb + contextual clarifier). Options are generated from the outside
-- record and judged by three independent criteria before they may be stored as
-- candidates.
--
-- WHY A NEW TABLE (operator ruling 2026-07-20): odi_market_definitions holds
-- BLENDED statements — its birth prompt instructs the generator to fold WHO and
-- JOB into one job_executor clause — and its rows are protected by
-- birth-immutability guards (provenance + register). Options are therefore NEW
-- rows in a NEW table. Nothing in this migration reads, mutates, or references
-- odi_market_definitions; existing rows are never touched.
--
-- ══ PROOF LAW: OPTIONS ARE HYPOTHESES, STRUCTURALLY ═══════════════════════════
-- proof_tier is pinned to 'hypothesis' by CHECK. There is deliberately no
-- 'selected' / 'promoted' / 'on_strategy' value and no is_primary column: an
-- option CANNOT be stored as a settled market, so no future code path can
-- auto-promote one or render ON-STRATEGY language off this table. Promotion is
-- the choose/promotion arc's job and will be an explicit, separate act.
--
-- proof tier and provenance are ORTHOGONAL axes. market_register records where
-- the option was derived FROM (the outside record); provenance_type records how
-- it came to exist (a synthesized hypothesis). Neither confers standing —
-- proof_tier does, and it is frozen at 'hypothesis'.
--
-- ══ NEGATIVE CACHE FROM BIRTH ════════════════════════════════════════════════
-- Judge-REJECTED candidates are stored too (status='rejected'), so a re-run
-- never re-pays the model tax on a candidate already ruled out. This is the
-- freeze-on-reject lesson from claim_delta_rejections (20260712100000), applied
-- at birth rather than retrofitted. First verdict binds; the key is
-- content_identity alone; models are provenance only and never part of the key;
-- no TTL. Content change self-invalidates (new identity => cache miss).

create table public.market_options (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,

  -- The two halves. SEPARATE columns by law: the client render decomposes an
  -- option only from these, never by parsing one blended string.
  executor_statement   text not null,   -- a GROUP OF PEOPLE
  job_statement        text not null,   -- verb + object of verb + contextual clarifier
  basis                text,            -- why this option, from the generator

  status               text not null check (status in ('candidate', 'rejected')),

  -- Judge metadata — three INDEPENDENT criteria, all must pass to be a
  -- candidate. Judging short-circuits, so criteria after the first failure are
  -- legitimately null: null = never ran, false = ran and failed.
  criterion_executor_group        boolean,
  criterion_executor_reason       text,
  criterion_odi_form              boolean,
  criterion_odi_form_reason       text,
  criterion_solution_agnostic     boolean,
  criterion_solution_agnostic_reason text,
  rejected_criterion   text check (rejected_criterion in ('executor_group', 'odi_form', 'solution_agnostic')),

  -- Cross-run dedup + negative cache key. Computed by the single TS authority
  -- (_shared/contentIdentity.ts) — never recomputed in SQL.
  content_identity     text not null,

  -- ── CACHE-INVALIDATION RULE ─────────────────────────────────────────────
  -- A verdict is only valid for the criteria that produced it. When ANY
  -- criterion's definition changes, MO1_CRITERIA_VERSION is bumped and every
  -- prior verdict stops counting as banked — the option is re-judged under the
  -- new criteria and lands as a NEW row at the new version. Old rows are kept:
  -- history is history, and a rejection's audit trail must survive a criteria
  -- change.
  --
  -- This exists because criterion (1) was tightened (v1 -> v2: the executor
  -- must now also be VERB-FREE) and two options had already been banked as
  -- passing under v1. Without versioning those stale passes would have ridden
  -- forever behind a content-identity cache hit.
  --
  -- v1: executor is a group of people | ODI form | solution-agnostic
  -- v2: v1 + executor must be VERB-FREE (no job content embedded in WHO)
  criteria_version     int not null default 1,

  proof_tier           text not null default 'hypothesis'
                         check (proof_tier = 'hypothesis'),          -- the wall
  market_register      text not null default 'public_inferred'
                         check (market_register in ('public_inferred', 'publicly_declared', 'internal_inferred', 'internal_declared')),
  provenance_type      provenance_type_enum not null default 'internal_hypothesis',

  -- ── ONE refinement cycle ────────────────────────────────────────────────
  -- A rejected candidate gets exactly ONE rewrite: the generator is handed the
  -- candidate plus the judge's NAMED failing criterion and rationale, and the
  -- revision re-enters the FULL three-criteria judge. Both attempts are stored
  -- and linked, so a rejection is always auditable back to what was tried.
  -- attempt is capped at 2 by CHECK: there is no second cycle, structurally.
  -- Still-failing revisions are stored rejected and never displayed.
  attempt              int not null default 1 check (attempt in (1, 2)),
  revision_of          uuid references public.market_options(id) on delete cascade,

  gen_model            text not null,
  judge_model          text,
  run_id               uuid,            -- long_runner_runs.id; nullable (no FK: ledger rows are prunable)
  created_at           timestamptz not null default now(),

  -- A stored verdict can never be incoherent: a candidate passed all three and
  -- names no rejected criterion; a rejection names exactly which criterion bit.
  constraint market_options_verdict_shape check (
    (status = 'candidate'
      and criterion_executor_group is true
      and criterion_odi_form is true
      and criterion_solution_agnostic is true
      and rejected_criterion is null)
    or
    (status = 'rejected' and rejected_criterion is not null)
  ),

  -- A first attempt revises nothing; a revision must name its original.
  constraint market_options_attempt_shape check (
    (attempt = 1 and revision_of is null)
    or (attempt = 2 and revision_of is not null)
  ),

  -- Dedup + negative cache: one verdict per option content, per company, PER
  -- CRITERIA VERSION. A revision carries its OWN content identity, so it is
  -- judged on its own merits while the original's rejection stays frozen.
  -- Including criteria_version is what lets a criteria change re-judge the same
  -- content without destroying the earlier verdict.
  unique (company_id, content_identity, criteria_version)
);

create index market_options_company_status_idx
  on public.market_options (company_id, status);

-- One rewrite per original — the cap on the refinement cycle, enforced.
create unique index market_options_one_revision_per_original
  on public.market_options (revision_of) where revision_of is not null;

-- ══ RLS AT BIRTH ═════════════════════════════════════════════════════════════
-- Standing check: any table born after the 2026-06-24 hardening batch carries
-- RLS in its own migration. (FD-1 shipped without it and needed a follow-up fix
-- — 20260720120000.)
--
-- NOTE — the membership predicate below is written CORRECTLY and deliberately
-- does NOT copy the sibling tables' version. odi_market_definitions, odi_needs,
-- council_recommendations and council_review_runs all carry
-- `cm.company_id = cm.company_id` — a self-comparison that is always true,
-- which makes those policies admit any member of ANY company. That is a
-- cross-tenant hole in those four tables and is reported separately; it is not
-- reproduced here.
--
-- Writes are service-role only (the generator). No client write policy: the
-- service role bypasses RLS, and no user should hand-author a judged option.

alter table public.market_options enable row level security;

create policy "Users can view company market_options"
  on public.market_options for select
  to authenticated
  using (
    exists (
      select 1 from public.companies c
      where c.id = market_options.company_id and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.company_members cm
      where cm.company_id = market_options.company_id and cm.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
  );

create policy "Admins can manage all market_options"
  on public.market_options for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
