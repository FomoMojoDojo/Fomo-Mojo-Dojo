-- PCT-1 (public-change-tracking, step 1): PURE ADDITIVE DDL — content-identity +
-- supersede lifecycle columns on opportunities and odi_needs, so the write path can
-- later (PCT-2) reconcile by identity instead of delete+insert. COLUMNS ONLY.
--
-- Council rulings: identity = sha256 of the normalized canonical outcome statement
-- (NOT origin_signal_id); lifecycle mirrors strategic_hypotheses' text+CHECK pattern
-- (status active/superseded). No UNIQUE on content_identity (PCT-2 reconcile dedups);
-- a plain (company_id, content_identity) lookup index only.
--
-- NO BACKFILL: content_identity stays NULL on every existing row. All identity
-- computation lives in ONE place — the shared TS helper (normalizeForHash +
-- sha256Hex, order: lower -> collapse-whitespace -> trim). PCT-2 reconcile computes
-- content_identity via that helper for EVERY row it touches (legacy rows lacking an
-- identity AND new-run rows) in the same pass, lazily populating legacy identities
-- through the single authoritative implementation. We do not maintain a second
-- (SQL) hash to keep in sync. CB1 is trivially untouched: no UPDATE runs here.
--
-- ADDITIVE ONLY: ADD COLUMN / ADD CONSTRAINT / CREATE INDEX. Zero row writes.

-- ── opportunities ──────────────────────────────────────────────────────────
alter table public.opportunities add column if not exists content_identity text;
alter table public.opportunities add column if not exists status text not null default 'active';
alter table public.opportunities add constraint opportunities_status_check check (status in ('active','superseded'));
alter table public.opportunities add column if not exists superseded_by_id uuid;
alter table public.opportunities add column if not exists superseded_reason text;
alter table public.opportunities add column if not exists last_confirmed_run_id text;
alter table public.opportunities add column if not exists source_run_id text;
create index if not exists idx_opportunities_company_content_identity
  on public.opportunities (company_id, content_identity);

-- ── odi_needs (source_run_id already present) ──────────────────────────────
alter table public.odi_needs add column if not exists content_identity text;
alter table public.odi_needs add column if not exists status text not null default 'active';
alter table public.odi_needs add constraint odi_needs_status_check check (status in ('active','superseded'));
alter table public.odi_needs add column if not exists superseded_by_id uuid;
alter table public.odi_needs add column if not exists superseded_reason text;
alter table public.odi_needs add column if not exists last_confirmed_run_id text;
create index if not exists idx_odi_needs_company_content_identity
  on public.odi_needs (company_id, content_identity);
