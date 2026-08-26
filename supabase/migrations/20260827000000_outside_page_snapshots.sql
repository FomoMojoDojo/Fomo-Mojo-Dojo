-- ── outside_page_snapshots (Gate 3 / J1 step 1) ──────────────────────────────
--
-- A general per-content-identity raw-page basis store for OUTSIDE signals, so the
-- shipped E4 substring guard can gate excerpts against real fetched source. It is
-- DELIBERATELY SEPARATE from own_words_page_snapshots — the own-words immutable
-- verbatim guard stays clean and single-purpose; this table carries the outside
-- world, where fetches fail (a 403/404 is itself data that feeds the J2 market-delta
-- gate), so it adds fetch_status + http_status that own-words never needs.
--
-- Content identity = text_sha256 over the SINGLE TS helper (normalizeForHash +
-- sha256Hex, _shared/contentIdentity.ts) — never a SQL/pgcrypto hash — so a stored
-- row's hash recomputes byte-identical in app code. A blocked/gone fetch writes a
-- row with fetch_status + http_status and NULL clean_text (honest absence, never
-- skipped); its text_sha256 is the deterministic hash of the empty-normalized string.
--
-- INERT by construction: no render path reads this table (that is Gate-3 J1 step 2).
-- Writing here drops nothing, supersedes nothing, and touches no render-feeding table.

create type public.outside_fetch_status as enum ('ok', 'blocked', 'gone');

create table public.outside_page_snapshots (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id),
  source_url   text not null,
  signal_id    uuid references public.signals(id),
  clean_text   text,                       -- NULL for blocked/gone (honest absence)
  text_sha256  text not null,              -- TS helper: sha256Hex(normalizeForHash(clean_text ?? ""))
  crawled_at   timestamptz not null default now(),
  run_id       uuid,
  fetch_status public.outside_fetch_status not null,
  http_status  integer
);

-- Idempotency + drift history: same signal + same content → one row (re-run is a
-- no-op via ON CONFLICT DO NOTHING); a later fetch with changed content → a new
-- content-identity → a new row (page drift is preserved, never merged over).
create unique index outside_page_snapshots_identity
  on public.outside_page_snapshots (company_id, signal_id, text_sha256);

create index outside_page_snapshots_company_url
  on public.outside_page_snapshots (company_id, source_url);

-- Freeze defense-in-depth: the same enforce_company_freeze guard on every other
-- company_id table — a frozen company (CB1) can never receive a row here either,
-- independent of the app-level frozen refusal in the fetch pass.
create trigger enforce_company_freeze_outside_page_snapshots
  before insert or update or delete on public.outside_page_snapshots
  for each row execute function public.enforce_company_freeze();
