-- S2 (2026-11-16): how many pages of a file were read by text recognition (Apple Vision).
-- Written by dify-analyze-file from the parser's ocr_pages, at birth and on every re-read, beside
-- pages_read / pages_total. NULL on a row from before S2 (its truth was never recorded); 0 when the read
-- used no recognition. The surfaces render S-ING-7 ("Some pages were scanned images…") when it is > 0.
alter table public.file_proposals add column if not exists ocr_pages integer;
alter table public.file_proposals drop constraint if exists file_proposals_ocr_pages_nonneg;
alter table public.file_proposals add constraint file_proposals_ocr_pages_nonneg check (ocr_pages is null or ocr_pages >= 0);
