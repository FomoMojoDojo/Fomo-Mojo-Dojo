-- File analysis METHODOLOGY VERSION + EXTRACTION SHAPE (operator rulings 2026-09-14, signed 1b / 1c).
--
-- analysis_version — the criterion_version precedent: a methodology change is stamped, never re-rolled.
--   1 = the June–September wiring: the five framework nodes read Grounding's summary in place of the file,
--       absences ("missing_information") could land in a finding's evidence, no excerpt guard on uploads.
--   2 = frameworks read file_text with Grounding's read alongside; missing_information never reaches a
--       framework; Torres gap findings carry empty evidence; the E4 excerpt guard runs on the upload path.
--   The DEFAULT is the backfill: every existing proposal reads 1 the instant the column lands — no row edited.
-- analysis_workflow_id — the Dify published workflow id the run actually used (traceable to the exact graph,
--   committed under supabase/dify-workflows/). NULL on priors: unknown at the time, never backfilled.
-- extraction_* — what the parser actually read (ruling 8): characters of text, images it did NOT read
--   (no OCR exists), pages where known, and the parser path. NULL on priors.
ALTER TABLE public.file_proposals
  ADD COLUMN IF NOT EXISTS analysis_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS analysis_workflow_id text,
  ADD COLUMN IF NOT EXISTS extraction_chars integer,
  ADD COLUMN IF NOT EXISTS extraction_images integer,
  ADD COLUMN IF NOT EXISTS extraction_pages integer,
  ADD COLUMN IF NOT EXISTS extraction_source text;

COMMENT ON COLUMN public.file_proposals.analysis_version IS 'File-analysis methodology version (2026-09-14): 1 = frameworks read Grounding''s summary; 2 = frameworks read the file, absence cannot attest, excerpt guard on uploads. Default is the backfill; never re-rolled.';
COMMENT ON COLUMN public.file_proposals.analysis_workflow_id IS 'Dify published workflow id used by the run (see supabase/dify-workflows/). NULL on runs before the stamp existed.';
COMMENT ON COLUMN public.file_proposals.extraction_chars IS 'Characters of text the parser read (ruling 8, 2026-09-14).';
COMMENT ON COLUMN public.file_proposals.extraction_images IS 'Images in the document the parser did NOT read — no OCR exists (ruling 8 / 10).';
COMMENT ON COLUMN public.file_proposals.extraction_pages IS 'Pages, where the format knows them (PDF). NULL otherwise.';
COMMENT ON COLUMN public.file_proposals.extraction_source IS 'Parser path: local_parser_mammoth | local_parser_pdfjs | local_text_reader | unsupported.';
