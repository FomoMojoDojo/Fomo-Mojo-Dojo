-- A long document is read whole and split into windows (SP-231..SP-234; 2026-11-13).
--
-- WHY. Two caps cut every read, and only one of them had ever been discussed. PDF_PAGE_CAP stopped a
-- PDF at 30 pages; normalizeText stopped EVERY path at 120,000 characters and appended the literal
-- string "[truncated]" into the text, which nothing read. Measured on the Charter Q3 2026 10-Q, a
-- public filing already on this stack: 77 pages and 166,259 characters whole, against 64,470 under
-- the page cap — the analysis on record covers 39% of the document. Lifting only the page cap would
-- have handed the character cap a 166k document and lost a further 28% of it, just as quietly.
--
-- WHAT THIS ADDS.
--   1. file_proposals.chars_capped — whether the one remaining cap (400,000 characters) actually
--      dropped text. An explicit flag, not an inference: the parser also compacts whitespace, so
--      `chars_total > chars` is true of nearly every document and would mark them all partial
--      (the 10-Q read whole: chars_total 166,259, chars 161,039, every one of those 5,220 characters
--      compaction and not one of them lost content).
--   2. file_proposal_chunks — one row per window, with the HALF-OPEN character range the code cut it
--      at, so a later stage can re-slice the exact text it was given rather than trust an offset a
--      model asserted. Measured: that 10-Q becomes 17 windows of 2,967..11,891 characters with
--      exact coverage; the earnings release becomes 6.
--
-- WHY A CHARACTER RANGE AND NOT A LINE RANGE, as interview_passages uses. SP-234 requires that every
-- character of the read text belong to exactly ONE window, and a line range cannot express that: the
-- local parser joins a PDF page's text items with single spaces, so A PDF PAGE IS ONE LINE and a
-- 77-page filing has 77 of them. The windower (supabase/functions/_shared/documentWindows.ts) is the
-- one authority for the cut, and coverageFailures() there is the predicate the ingest path, the unit
-- tests and ingest-chunking-guard all ask.

-- ── 1. the cap, said on the row ──────────────────────────────────────────────────────────────────
alter table public.file_proposals
  add column if not exists chars_capped boolean;

comment on column public.file_proposals.chars_capped is
  'SP-231: true when the 400,000-character extraction cap actually dropped text from this document. NULL on rows written before the flag existed, and on a failed extraction. NEVER inferred from chars_total vs extraction_chars — those also differ by whitespace compaction, which loses nothing.';

-- ── 2. one row per window ────────────────────────────────────────────────────────────────────────
create table if not exists public.file_proposal_chunks (
  id          uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.file_proposals(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  -- 0-based, document order. Unique per proposal: a window is identified by where it is.
  window_index integer not null,
  -- Half-open [char_start, char_end) into the extracted text as the sidecar holds it, so
  -- text.slice(char_start, char_end) IS this window. The code computed both; no model asserted them.
  char_start  integer not null,
  char_end    integer not null,
  -- sha256(normalizeForHash(window text)) through contentIdentity.ts, the single identity authority.
  sha256      text not null,
  -- A single block longer than the cap: SP-232 forbids cutting inside a paragraph, so an over-long
  -- one gets a window of its own and says so here rather than silently breaking the cap.
  oversize    boolean not null default false,
  status      text not null default 'pending',
  attempts    integer not null default 0,
  error_code  text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  completed_at timestamptz,

  constraint file_proposal_chunks_one_per_index unique (proposal_id, window_index),
  constraint file_proposal_chunks_range_sane check (char_end > char_start and char_start >= 0),
  constraint file_proposal_chunks_index_sane check (window_index >= 0),
  constraint file_proposal_chunks_sha_shape check (sha256 ~ '^[0-9a-f]{64}$'),
  -- The same four states a proposal has, for the same reason: a reader must be able to tell waiting
  -- from running from done from failed without consulting a second column.
  constraint file_proposal_chunks_status_known
    check (status in ('pending', 'running', 'ready', 'failed'))
);

comment on table public.file_proposal_chunks is
  'SP-233: one row per window of a document''s extracted text. The character range is the pointer and the code cut it; coverage over a proposal is exact by construction (SP-234) and ingest-chunking-guard proves it on a generated document with a plant that drops a window.';

create index if not exists file_proposal_chunks_by_proposal
  on public.file_proposal_chunks (proposal_id, window_index);

-- The queue's own question: which window of the document in flight is still waiting?
create index if not exists file_proposal_chunks_waiting
  on public.file_proposal_chunks (proposal_id, window_index)
  where status in ('pending', 'running');

alter table public.file_proposal_chunks enable row level security;

-- NO CLIENT POLICY (SP-233). Nothing in the app reads a chunk row today: what a person sees is
-- rendered from the PROPOSAL (SP-183), and SP-244's "{n} of {m} sections analyzed" is counted onto the
-- proposal rather than read from here. The writers are dify-analyze-file (service role) and the
-- sweeps (SECURITY DEFINER), and both bypass RLS. When a page does need these rows, the policy to add
-- is member-of-company read, the same rule as file_proposals — and not before.

-- SP-218: the privileges, said out loud. No SECURITY DEFINER function is added by this migration;
-- the grants below are the table's, and they exist so that a future `grant` cannot be the accident
-- that exposes a document's text offsets to the anon key.
revoke all on table public.file_proposal_chunks from public;
revoke all on table public.file_proposal_chunks from anon;
revoke all on table public.file_proposal_chunks from authenticated;
grant select, insert, update, delete on table public.file_proposal_chunks to service_role;
