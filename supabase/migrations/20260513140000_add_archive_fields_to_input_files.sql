-- Add soft-archive fields to input_files.
-- Archived files are hidden from active views but not physically deleted.
-- Blobs and storage.objects rows are never touched by archive operations.

ALTER TABLE public.input_files
  ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archived_by    UUID        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS archive_source TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS restored_at   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS restored_by   UUID        DEFAULT NULL;

-- Index for fast active-file queries (the common path).
CREATE INDEX IF NOT EXISTS idx_input_files_active
  ON public.input_files (input_id)
  WHERE archived_at IS NULL;

-- Index for archive queries (less common).
CREATE INDEX IF NOT EXISTS idx_input_files_archived
  ON public.input_files (input_id, archived_at)
  WHERE archived_at IS NOT NULL;
