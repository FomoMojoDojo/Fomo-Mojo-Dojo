-- A partial read says it is partial (SP-93, SP-94; 2026-11-13).
--
-- WHY. The PDF path reads the first 30 pages of a document and has always recorded
-- `extraction_pages` as the DOCUMENT's page count, so a 77-page filing stored "77 pages" for a
-- 30-page read and every surface above it said "Analysis ready" with nothing on the screen saying
-- that pages 31-77 were never opened. The cap stays for now — lifting it before chunking exists
-- would turn documents that analyse today into documents that fail — so what changes is that the
-- read becomes VISIBLE: the parser now returns pages_read beside pages_total, and these columns
-- are where that truth is kept.
--
-- `extraction_pages` KEEPS its meaning (the document's count). It is not reinterpreted, because
-- reinterpreting it would silently restate every row written before today.
--
-- Additive and reversible: three nullable columns, no default, NO BACKFILL. Existing rows stay
-- NULL and render nothing new, because for those rows the truth was never recorded and guessing it
-- now would be the same dishonesty in the other direction. No row is read, written or altered.
alter table public.file_proposals
  add column if not exists pages_read integer,
  add column if not exists pages_total integer,
  add column if not exists chars_total integer;

comment on column public.file_proposals.pages_read is
  'Pages this extraction actually opened. NULL where the format has no pages, or for rows written before 2026-11-13.';
comment on column public.file_proposals.pages_total is
  'Pages the document has. Equal to pages_read when nothing was capped; NULL as above.';
comment on column public.file_proposals.chars_total is
  'Characters before the parser char cap, over the pages that were read. NULL as above.';

-- The two page numbers are one fact, so a row may not carry a read larger than the document, nor a
-- read without the total it is a fraction of. NULL on both sides stays legal — that is the
-- un-recorded past. A row that knows one number and not the other would render a false fraction.
alter table public.file_proposals
  add constraint check_pages_read_within_total
    check (
      (pages_read is null and pages_total is null)
      or (pages_read is not null and pages_total is not null and pages_read >= 0 and pages_read <= pages_total)
    );
