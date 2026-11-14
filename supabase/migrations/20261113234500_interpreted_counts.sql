-- What was extracted, and what the framework pass interpreted (SP-255..SP-257, SP-260; 2026-11-13).
--
-- WHY TWO COUNTS AND NOT A FLAG. The hand-off to the framework pass has a fixed character budget
-- (24,000 — SP-255), and a long document extracts more than fits it. Everything extracted IS stored
-- (SP-257): `file_proposal_extracts` holds every item, and selection into the budget decides only
-- what this pass interpreted. So the row carries both numbers, and the difference between them is a
-- fact about the analysis rather than a defect in it.
--
-- THE FIGURE THAT WAS NOT USED: ~120,000 characters, which I read off `normalizeText`'s old cap as
-- "demonstrably carried" by the framework pass. It never was. The pass FAILED on 2026-11-11 at 51,483
-- and 58,992 characters — a 300 s read timeout, the workflow running 1,555 s against a 1,200 s
-- ceiling. 24,000 is a budget set deliberately, to be confirmed against the slowest node under 240 s
-- and the workflow under 960 s on the Charter 10-Q, and lowered if it misses (SP-255). No ceiling
-- moves either way.
--
-- THIS IS NOT PARTIAL, AND THE DISTINCTION IS LOAD-BEARING (SP-257). Every window of a
-- budget-selected document WAS read, and SP-256's round-robin guarantees every window contributed.
-- `ready-partial` stays for what it means: a window that FAILED, or a document the 400,000-character
-- cap cut (`chars_capped`). A reader who cannot tell those apart cannot trust either.
--
-- RENDERED, BUT ONLY AS AN INFO ICON (SP-260, SP-261, SP-262). When items_interpreted <
-- items_extracted on a ready row, the "Analysis ready" badge carries the app's existing info icon,
-- tooltip and aria-label S-ING-5. Neutral styling, never the warning style — that belongs to S-ING-3
-- and S-ING-4, which describe something that could not be read.

alter table public.file_proposals
  add column if not exists items_extracted integer,
  add column if not exists items_interpreted integer;

comment on column public.file_proposals.items_extracted is
  'SP-257: how many merged extract items this document yielded. Every one of them is stored in file_proposal_extracts. NULL on a row that never ran the chunked pipeline.';
comment on column public.file_proposals.items_interpreted is
  'SP-257: how many of items_extracted the framework pass actually read, after SP-256 round-robin selection into the SP-255 budget. Less than items_extracted is NOT partial — every window was read and every window contributed.';

-- Neither count can exceed the other way round, and neither can be negative. A row with one set and
-- not the other is a half-written record, which is the thing SP-93 was about.
alter table public.file_proposals
  drop constraint if exists check_interpreted_within_extracted;
alter table public.file_proposals
  add constraint check_interpreted_within_extracted check (
    (items_extracted is null and items_interpreted is null)
    or (items_extracted >= 0 and items_interpreted >= 0 and items_interpreted <= items_extracted)
  );

-- ── the model's returned order, stored (SP-256) ──────────────────────────────────────────────────
--
-- SP-256's round-robin ranks on the model's returned order within a window's kind. Rows come back
-- from a database in whatever order it likes, so that ordinal has to be ON the row: re-deriving it
-- later would mean inventing it.
alter table public.file_proposal_extracts
  add column if not exists item_index integer not null default 0;

comment on column public.file_proposal_extracts.item_index is
  'SP-256: this item''s position in the model''s returned order within its window and kind, 0-based. The round-robin takes rank 0 from every window before rank 1 from any, so a 77-section filing is represented end to end rather than from the front.';

alter table public.file_proposal_extracts
  drop constraint if exists file_proposal_extracts_item_index_sane;
alter table public.file_proposal_extracts
  add constraint file_proposal_extracts_item_index_sane check (item_index >= 0);
