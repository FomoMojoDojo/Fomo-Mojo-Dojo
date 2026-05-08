-- file_id is not meaningful for mojo_analysis runs which are not tied to an uploaded file
ALTER TABLE public.file_proposals ALTER COLUMN file_id DROP NOT NULL;
