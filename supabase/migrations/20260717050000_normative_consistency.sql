-- ACT-C-2 — per-step CONSISTENCY (the 5th C, measured). Scores each discovered
-- normative step (normative_job_steps) by how many INDEPENDENT industry sources
-- (normative_industry_sources) attest it, reusing the signalRecurrence machinery
-- re-scoped to the FINDING↔SOURCE (R1) shape: the step is a fixed anchor judged
-- against each source independently (NO union-find) and rolled up by DISTINCT
-- registrable_domain.
--
-- These are MIRRORS of the finding machinery, never the finding tables:
-- signal_recurrence_verdicts / finding_recurrence stay untouched. content_sha /
-- *_identity columns are fed ONLY by the TS authority (normalizeForHash +
-- sha256Hex) — no SQL hash.

begin;

-- Frozen step↔source attestation verdicts (mirror signal_recurrence_verdicts).
-- Insert-only, never re-rolled; frozen by content-keyed pair_identity so an
-- identical (step, source) judged in one run is cached across runs.
create table public.normative_step_source_verdicts (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  source_run_id   text not null,
  step_id         uuid not null references public.normative_job_steps(id) on delete cascade,
  source_id       uuid not null references public.normative_industry_sources(id) on delete cascade,
  pair_identity   text not null,          -- sha256('nrmstep|'<step_sha>'|'<source_sha>) — TS authority
  step_identity   text not null,          -- step content_sha
  source_identity text not null,          -- source content_sha
  verdict         text not null check (verdict in ('attested','not_attested')),
  judge_model     text not null,
  judge_reason    text not null,
  candidate_basis text not null,          -- shared_tokens:N
  created_at      timestamptz not null default now(),
  unique (company_id, pair_identity)
);
create index normative_step_source_verdicts_company_idx
  on public.normative_step_source_verdicts (company_id, source_run_id);
create index normative_step_source_verdicts_step_idx
  on public.normative_step_source_verdicts (step_id);

-- Derived per-step distinct-domain rollup (mirror finding_recurrence). Rebuilt in
-- place at finalize (insert / update-on-change / delete). NO cluster — per step.
create table public.normative_step_recurrence (
  id                  uuid primary key default gen_random_uuid(),
  step_id             uuid not null references public.normative_job_steps(id) on delete cascade,
  company_id          uuid not null references public.companies(id) on delete cascade,
  source_run_id       text not null,
  distinct_host_count integer not null default 0,
  host_list           jsonb not null default '[]'::jsonb,
  verdict_count       integer not null default 0,
  computed_at         timestamptz not null default now(),
  unique (step_id)
);
create index normative_step_recurrence_company_idx
  on public.normative_step_recurrence (company_id, source_run_id);

-- Orphan-prune audit (the claim_removals / condition_removals discipline: every
-- delete leaves an audit row, never a silent delete). An orphan = an industry
-- source whose source_run_id matches no normative_job_steps map.
create table public.normative_source_removals (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  source_run_id      text not null,
  removed_source_id  uuid not null,        -- no FK: the row is being deleted
  registrable_domain text,
  content_sha        text,
  reason             text not null,
  removed_at         timestamptz not null default now()
);
create index normative_source_removals_company_idx
  on public.normative_source_removals (company_id, source_run_id);

commit;
