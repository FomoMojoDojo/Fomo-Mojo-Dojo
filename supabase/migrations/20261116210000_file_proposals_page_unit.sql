-- S6 (2026-11-16): what pages_read / pages_total count. A PowerPoint's slides ride the same pair as a
-- PDF's pages; the surfaces then say "slides" (S-ING-1b) instead of "pages" (S-ING-1). Written by
-- dify-analyze-file from the parser's page_unit, at birth and on every re-read. NULL on a row from before
-- S6, which the surfaces read as pages — every such row is a PDF or has no pages at all.
alter table public.file_proposals add column if not exists page_unit text;
alter table public.file_proposals drop constraint if exists file_proposals_page_unit_check;
alter table public.file_proposals add constraint file_proposals_page_unit_check check (page_unit is null or page_unit in ('page', 'slide'));
