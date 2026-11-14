-- Per-window extraction, merged by excerpt identity (SP-235, SP-237, SP-239; 2026-11-13).
--
-- WHAT A WINDOW PRODUCES. Extraction ONLY (SP-235): verbatim evidence passages, claims and candidate
-- needs, each with a pointer into the window it came from. No window is ever sent to the framework
-- pass, and the framework pass runs ONCE per document over the merged extract (SP-238).
--
-- THE POINTER IS COMPUTED, NEVER ASSERTED. This is segment.ts's rule 2, which exists because the P6
-- probe asked a local model for character offsets over a 12,000-char window and got 116 spans, 34 of
-- them outside the window or inverted. So the model returns TEXT; the code finds that text in the
-- window and computes char_start/char_end itself. An excerpt the code cannot find verbatim is
-- DISCARDED rather than stored with a guessed pointer — a stored pointer here is always one the code
-- verified against the window.
--
-- IDENTITY IS THE EXCERPT, NOT THE ROW (SP-237). excerpt_sha is sha256(normalizeForHash(text)) through
-- contentIdentity.ts, the one authority. The same sentence found in two windows is TWO rows here —
-- each with its own verified pointer, which is the evidence that it really appears twice — and ONE
-- row in the merged extract, carrying both window refs. The merge is a read over this table
-- (mergeExtracts.ts), not a second stored copy, so there is no second truth to drift.

create table if not exists public.file_proposal_extracts (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.file_proposals(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  chunk_id    uuid not null references public.file_proposal_chunks(id) on delete cascade,
  -- Denormalised from the chunk so the merge can order and report without a join per row.
  window_index integer not null,

  kind        text not null,
  text        text not null,
  -- sha256(normalizeForHash(text)). The merge groups on (kind, excerpt_sha).
  excerpt_sha text not null,

  -- Absolute into the DOCUMENT's extracted text, so an excerpt is traceable to the sidecar exactly as
  -- the excerpt guard already demands — not relative to its window, which would need the chunk row to
  -- be read before the pointer meant anything.
  char_start  integer not null,
  char_end    integer not null,

  created_at  timestamptz not null default now(),

  constraint file_proposal_extracts_kind_known
    check (kind in ('evidence', 'claim', 'need')),
  constraint file_proposal_extracts_range_sane
    check (char_end > char_start and char_start >= 0),
  constraint file_proposal_extracts_sha_shape
    check (excerpt_sha ~ '^[0-9a-f]{64}$'),
  constraint file_proposal_extracts_text_present
    check (length(btrim(text)) > 0),
  -- One row per (window, kind, excerpt): a window that returns the same sentence twice is one row,
  -- and a retry of that window cannot double it.
  constraint file_proposal_extracts_once_per_window
    unique (proposal_id, window_index, kind, excerpt_sha)
);

comment on table public.file_proposal_extracts is
  'SP-235/SP-237: what one window yielded, with a pointer the CODE verified against that window. The merged extract fed to the framework pass is a read over this table grouped by (kind, excerpt_sha) — the same sentence in two windows is one merged row carrying both window refs.';

create index if not exists file_proposal_extracts_by_proposal
  on public.file_proposal_extracts (proposal_id, kind, window_index);
-- The merge's own question: which excerpts does this document hold, across windows?
create index if not exists file_proposal_extracts_by_identity
  on public.file_proposal_extracts (proposal_id, kind, excerpt_sha);

alter table public.file_proposal_extracts enable row level security;

-- NO CLIENT POLICY (as for file_proposal_chunks). Nothing in the app reads an extract row: what a
-- person sees is rendered from the PROPOSAL (SP-183). The writers are dify-analyze-file (service
-- role) and nothing else. When a page needs these rows the policy to add is member-of-company read,
-- the same rule as file_proposals — and not before.
--
-- SP-218: no SECURITY DEFINER function is added here. These grants exist so that a later `grant`
-- cannot be the accident that hands a private document's verbatim passages to the anon key.
revoke all on table public.file_proposal_extracts from public;
revoke all on table public.file_proposal_extracts from anon;
revoke all on table public.file_proposal_extracts from authenticated;
grant select, insert, update, delete on table public.file_proposal_extracts to service_role;
