-- Add engagement_started_at to companies (nullable, operator-editable, defaults to first baseline run)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS engagement_started_at TIMESTAMPTZ NULL;

-- Backfill from earliest public_baseline_runs.created_at per company
UPDATE public.companies c
SET engagement_started_at = sub.earliest_run
FROM (
  SELECT company_id, MIN(created_at) AS earliest_run
  FROM public.public_baseline_runs
  GROUP BY company_id
) sub
WHERE c.id = sub.company_id
  AND c.engagement_started_at IS NULL;
