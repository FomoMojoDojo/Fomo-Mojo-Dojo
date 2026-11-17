-- S4 (2026-11-16): what a spreadsheet's read left out, so the surfaces can say so.
--   columns_withheld  how many columns were withheld as personal details before analysis (S-ING-8 when > 0)
--   rows_capped       per sheet whose 5,000-row cap bit: [{"sheet": …, "read": n, "total": m}] (S-ING-6)
--   page_unit         may now also be 'sheet' — a workbook's sheets ride pages_read / pages_total (S-ING-1c)
-- Written by dify-analyze-file from the parser's withheld_columns / rows_capped / page_unit, at birth and on
-- every re-read. NULL on rows from before S4.
alter table public.file_proposals add column if not exists columns_withheld integer;
alter table public.file_proposals add column if not exists rows_capped jsonb;
alter table public.file_proposals drop constraint if exists file_proposals_columns_withheld_nonneg;
alter table public.file_proposals add constraint file_proposals_columns_withheld_nonneg check (columns_withheld is null or columns_withheld >= 0);
alter table public.file_proposals drop constraint if exists file_proposals_page_unit_check;
alter table public.file_proposals add constraint file_proposals_page_unit_check check (page_unit is null or page_unit in ('page', 'slide', 'sheet'));
