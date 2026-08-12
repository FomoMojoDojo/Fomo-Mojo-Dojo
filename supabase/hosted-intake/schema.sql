-- ============================================================================
-- HOSTED INTAKE — "dumb mailbox" schema (Fix B, design gate 2026-08-12).
--
-- This file is applied to a SEPARATE hosted Supabase project (mojomap-intake),
-- NOT the local/main project. That project exists only to receive raw intake
-- submissions from the public marketing form. It deliberately has NO companies
-- table and no pipeline — it is structurally unable to touch company records.
-- ALL company matching + pipeline writes happen locally, in the importer.
--
-- Access model (R3): RLS enabled with ZERO policies -> the table is reachable
-- ONLY by the service role. The hosted receiver fn inserts with the service-role
-- key (bypasses RLS); the local importer reads/updates with the hosted project's
-- service-role key (held as a LOCAL secret). No anon/authenticated access ever.
-- ============================================================================

create table if not exists public.intake_submissions (
  -- identity
  id                  uuid        primary key default gen_random_uuid(),

  -- timing
  received_at         timestamptz not null    default now(),  -- server clock (authoritative)
  submitted_at        timestamptz,                            -- payload.submitted_at (client clock)

  -- the raw submission, verbatim (the receiver stores it untouched)
  payload             jsonb       not null,

  -- provenance
  source              text        not null    default 'marketing-form',
  source_ip           inet,
  user_agent          text,

  -- dedup (R4): sha256(submitted_at | website_url | explicit_strategic_problem).
  -- Nullable so out-of-band inserts (e.g. the Cafe Barra email backfill) may skip it.
  dedup_key           text,

  -- import state machine. status is written AFTER the importer's work, so a crash
  -- leaves a re-runnable non-terminal state. 'failed' is the terminal a failure sets.
  status              text        not null    default 'pending'
                        check (status in ('pending','importing','imported','failed','skipped')),
  status_detail       text,                                   -- error text / import notes
  processed_at        timestamptz,                            -- set on reaching a terminal state

  -- informational ONLY — the real company row lives in the LOCAL project.
  -- Deliberately NO foreign key (there is no companies table on this project).
  imported_company_id uuid
);

-- Partial UNIQUE: a re-fired submission (same dedup_key) is rejected at INSERT
-- with a 23505 the receiver turns into {duplicate:true}. Null dedup_key rows are
-- exempt (backfill).
create unique index if not exists intake_submissions_dedup_key_uniq
  on public.intake_submissions (dedup_key)
  where dedup_key is not null;

-- Importer scans pending rows oldest-first.
create index if not exists intake_submissions_status_idx
  on public.intake_submissions (status, received_at);

-- Service-role only: enable RLS, define NO policies. (RLS on + zero policies =
-- default-deny for anon/authenticated; the service role bypasses RLS entirely.)
alter table public.intake_submissions enable row level security;
