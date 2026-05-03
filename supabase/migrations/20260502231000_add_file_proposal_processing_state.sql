ALTER TABLE public.file_proposals
  ADD COLUMN IF NOT EXISTS processing_state text NOT NULL DEFAULT 'ready'
    CHECK (processing_state IN ('queued', 'running', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS processing_error text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_completed_at timestamptz;

UPDATE public.file_proposals
SET
  processing_state = CASE
    WHEN status = 'pending'
      AND summary = 'Dify analysis queued. Results will appear when processing finishes.'
      THEN 'queued'
    WHEN status = 'pending'
      THEN 'ready'
    ELSE 'ready'
  END,
  processing_error = CASE
    WHEN processing_state = 'failed' THEN processing_error
    ELSE NULL
  END
WHERE processing_state IS DISTINCT FROM CASE
  WHEN status = 'pending'
    AND summary = 'Dify analysis queued. Results will appear when processing finishes.'
    THEN 'queued'
  WHEN status = 'pending'
    THEN 'ready'
  ELSE 'ready'
END
OR processing_error IS NOT NULL;
