-- The section counts a person sees, ON THE ROW (SP-183, SP-242, SP-244; 2026-11-13).
--
-- WHY ON THE ROW AND NOT COUNTED FROM THE CHUNKS. SP-183: what a person sees is rendered from the
-- proposal row. `file_proposal_chunks` has no client policy and is not readable by a page, and
-- counting it in the browser would make "{n} of {m} sections analyzed" depend on a second query that
-- can fail on its own — a progress line that disappears while the work continues is worse than none.
--
-- THE THREE TERMINAL STATES (SP-242) ARE READABLE FROM THESE THREE NUMBERS PLUS chars_capped:
--   ready          sections_failed = 0 and chars_capped is not true
--   ready-partial  sections_failed > 0  (S-ING-3)  OR chars_capped  (S-ING-4)
--   failed         processing_state = 'failed' — no window succeeded, or the framework pass failed
-- A partial NEVER reads as plain ready, which is why the count is a column and not a derived guess.
--
-- AND BUDGET SELECTION IS NOT ONE OF THEM (SP-257). items_interpreted < items_extracted leaves the
-- state `ready`: every section was read and SP-256's round-robin guarantees every section contributed.
-- It shows as an info icon (SP-260, S-ING-5), never as a partial.

alter table public.file_proposals
  add column if not exists sections_total integer,
  add column if not exists sections_ready integer,
  add column if not exists sections_failed integer;

comment on column public.file_proposals.sections_total is
  'SP-244: how many windows this document was split into. 1 for a document that fits one window — and a one-window document shows NO section counts at all (S-ING-2/S-ING-3 require m > 1). NULL on a row that never ran the chunked pipeline.';
comment on column public.file_proposals.sections_ready is
  'SP-244: windows that completed extraction.';
comment on column public.file_proposals.sections_failed is
  'SP-241, SP-242: windows that failed after their retries. > 0 on a ready row means ready-partial, and S-ING-3 renders beside the badge.';

-- All three or none: a row that knows one and not the others renders a false fraction, which is the
-- exact half-truth SP-93 was about. And neither part can exceed the whole.
alter table public.file_proposals
  drop constraint if exists check_section_counts_coherent;
alter table public.file_proposals
  add constraint check_section_counts_coherent check (
    (sections_total is null and sections_ready is null and sections_failed is null)
    or (
      sections_total > 0
      and sections_ready >= 0 and sections_failed >= 0
      and sections_ready + sections_failed <= sections_total
    )
  );
