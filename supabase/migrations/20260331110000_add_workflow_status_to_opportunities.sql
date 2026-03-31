ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS workflow_status text;

UPDATE public.opportunities
SET workflow_status = CASE
  WHEN priority_tier = 'focus' THEN 'in_progress'
  WHEN priority_tier = 'monitor' THEN 'planned'
  ELSE 'parked'
END
WHERE workflow_status IS NULL OR btrim(workflow_status) = '';

ALTER TABLE public.opportunities
ALTER COLUMN workflow_status SET DEFAULT 'planned';

ALTER TABLE public.opportunities
ALTER COLUMN workflow_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'opportunities_workflow_status_check'
      AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
    ADD CONSTRAINT opportunities_workflow_status_check
    CHECK (workflow_status IN ('in_progress', 'planned', 'parked'));
  END IF;
END $$;
