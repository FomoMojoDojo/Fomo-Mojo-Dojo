-- ACT-C-1 — the discovered INDUSTRY-NORMATIVE job map (design signed 2026-07-16,
-- ACT_C1_NORM_DISCOVERY_DESIGN.md). This is NOT the client's internal job_steps —
-- it is the public, industry-normative "how this job is typically done in your
-- world," discovered from an INDUSTRY-source pool and generated skeleton-seeded.
-- The two provenances stay PHYSICALLY SEPARATE: nothing here writes job_steps.
--
-- content_sha on both tables is fed ONLY by the TS authority
-- (contentIdentity.ts normalizeForHash + sha256Hex) — there is deliberately NO
-- SQL hash (Postgres POSIX \s diverges from JS \s on Unicode whitespace).

begin;

-- The generated normative step sequence (immutable-per-content).
create table public.normative_job_steps (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  -- The titling market's journey_key (executor context source). A public pmk-*
  -- market when one exists, else the anchor spine ('customer').
  journey_key      text not null,
  executor_context text not null,          -- executor + jtbd snapshot used for the run
  step_number      integer not null,       -- render order (1..N, subset of the 8 checkpoints)
  step_key         text not null check (step_key in
                     ('define','locate','prepare','confirm','execute','monitor','modify','conclude')),
  step_label       text not null,
  description      text not null,
  provenance       text not null default 'industry_normative'
                     check (provenance = 'industry_normative'),
  -- Whether the executor context came from a public pmk-* market or the (possibly
  -- internal_inferred) anchor — C-3 uses this so it never implies the market itself
  -- is publicly confirmed when it's anchor-titled.
  title_source     text not null check (title_source in ('pmk','anchor')),
  source_run_id    text not null,
  content_sha      text not null,          -- sha256(normalizeForHash(step statement)) — TS authority only
  computed_at      timestamptz not null default now(),
  -- Immutable-per-content: identical step content is one row per company.
  unique (company_id, content_sha)
);

create index normative_job_steps_company_idx
  on public.normative_job_steps (company_id, journey_key, step_number);

-- The discovered INDUSTRY-SOURCE pool C-2 will score for per-step Consistency.
-- Shape matches what signalRecurrence already consumes (source text + source_url +
-- syndicated flag) PLUS pre-computed independence fields (registrable_domain, host,
-- content_sha) so C-2 needs no adapter. Independence law (recurrence): distinct
-- registrable_domain, own-domain + syndicated excluded (applied at C-2 score time).
create table public.normative_industry_sources (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  source_run_id     text not null,
  source_url        text,
  host              text,                  -- full hostname (www-stripped)
  registrable_domain text,                 -- the independence unit (registrableDomain())
  source_text       text not null,         -- the discovered claim/snippet C-2 judges
  content_sha       text not null,         -- sha256(normalizeForHash(source_text)) — TS authority only
  syndicated        boolean not null default false,
  computed_at       timestamptz not null default now(),
  -- Immutable-per-content within a run: a source text appears once per run.
  unique (company_id, source_run_id, content_sha)
);

create index normative_industry_sources_company_idx
  on public.normative_industry_sources (company_id, registrable_domain);
create index normative_industry_sources_run_idx
  on public.normative_industry_sources (source_run_id);

commit;
