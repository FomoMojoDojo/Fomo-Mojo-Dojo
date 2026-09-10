-- Gate 4b — market_candidate_outcomes: the per-candidate ruling, made durable.
--
-- THE GAP. The discovery worker has always known exactly what happened to every candidate: its
-- results[] array carries outcome, judge_reasons, the reframed jtbd and the journey key. All of it
-- was returned in the HTTP response and then thrown away. Three consequences, all measured in Gate 3:
--   • the surface cannot say why a group is absent — the beat renders defs, and a candidate that was
--     rejected or folded leaves no row to render;
--   • the rejection census could tie only 9 of 20 rulings to an executor, because a rejection after a
--     reframe keys on the REFRAMED identity and the reframed text was stored nowhere;
--   • a rail-dropped candidate (rejected_buyer) banks nothing but a step_perspective_verdicts row, so
--     it is not "decided" and is re-judged on every replay forever — Lumio #5 is the live case.
--
-- WHY A TABLE AND NOT chain_state.outcomes[]. The deciding reason is the freeze boundary:
-- long_runner_runs carries NO enforce_company_freeze trigger (87 tables do; that is not one of them),
-- while market_discovery_verdicts, odi_market_definitions, market_lens and integrity_runs all do.
-- These rows are evidence and the client surface renders them, so they must sit inside the boundary
-- that stops a frozen company being written. The trigger is added below in this same migration — it
-- is not inherited. Corroborating: the admin front door already SELECTs chain_state for every company
-- (companiesInventory.ts), so outcomes there would be paid for on every page load by a page that
-- needs none of it; and chain_state is rewritten wholesale by persistProgress on every chunk, so a
-- ruling stored there could be dropped by a bug in an unrelated writer. A row keyed by content
-- identity, insert-only in spirit, obeys the same law the verdict store already obeys.
--
-- IDENTITY. original_identity = marketIdentity(job_executor, original_jtbd) — the key the decided
-- clause looks up, and the one thing that is stable across a reframe (the reframe holds the executor
-- fixed and replaces the jtbd). reframed_identity is the key the gate-(b)/(c) verdicts actually carry;
-- it is NULL when no reframe was attempted, and NULL on backfilled rows where the reframed text is not
-- retrievable — which is the honest value, and is exactly the 11-of-20 census gap.
--
-- UNIQUE (run_id, candidate_index) makes the write idempotent under chunk re-judging: the worker
-- upserts, so a chunk that re-runs overwrites its own row rather than duplicating it.

create table public.market_candidate_outcomes (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  run_id                uuid not null references public.long_runner_runs(id) on delete cascade,
  candidate_index       int  not null,                    -- 1-based, position in chain_state.candidates
  job_executor          text not null,
  relationship_kind     text,
  original_jtbd         text not null,
  original_identity     text not null,
  reframed_jtbd         text,
  reframed_identity     text,
  outcome               text not null check (outcome in (
                          'accepted_active','accepted_deferred','deduped',
                          'rejected_solution','rejected_buyer','error','already_decided')),
  judge_reasons         jsonb not null default '{}'::jsonb,
  dedup_target_identity text,
  journey_key           text,
  -- TRUE = reconstructed after the fact from banked verdicts, perspective rows and chunk timing,
  -- not written by the run that made the ruling. The Gate-3 backfill is all reconstructed=true.
  -- Anything auditing judge behaviour should exclude these; the beat may render them, because the
  -- reason text they carry is the judge's own words.
  reconstructed         boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (run_id, candidate_index)
);

create index market_candidate_outcomes_company_idx
  on public.market_candidate_outcomes (company_id);
create index market_candidate_outcomes_identity_idx
  on public.market_candidate_outcomes (company_id, original_identity);
create index market_candidate_outcomes_outcome_idx
  on public.market_candidate_outcomes (company_id, outcome);

-- The freeze boundary. Not inherited — every company_id-bearing table attaches this itself.
create trigger enforce_company_freeze
  before insert or delete or update on public.market_candidate_outcomes
  for each row execute function enforce_company_freeze();

alter table public.market_candidate_outcomes enable row level security;

create policy "service role full access on market_candidate_outcomes"
  on public.market_candidate_outcomes
  using (auth.role() = 'service_role');

-- The beat reads these rows in the browser as the signed-in operator, exactly as it reads the market
-- defs beside them, so admins need SELECT.
create policy "Admins can read market_candidate_outcomes"
  on public.market_candidate_outcomes for select to authenticated
  using (has_role(auth.uid(), 'admin'::app_role));
