ALTER TABLE public.managed_outcomes
  ADD COLUMN IF NOT EXISTS direction text,
  ADD COLUMN IF NOT EXISTS metric text,
  ADD COLUMN IF NOT EXISTS "object" text,
  ADD COLUMN IF NOT EXISTS context text,
  ADD COLUMN IF NOT EXISTS "constraint" text,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

UPDATE public.managed_outcomes
SET direction = CASE
  WHEN lower(trim(coalesce(target_direction, ''))) IN ('increase', 'reduce', 'improve', 'maximize', 'minimize', 'avoid')
    THEN lower(trim(target_direction))
  WHEN lower(trim(coalesce(outcome_statement, ''))) ~ '^(increase|reduce|improve|maximize|minimize|avoid)\b'
    THEN substring(lower(trim(outcome_statement)) from '^(increase|reduce|improve|maximize|minimize|avoid)')
  ELSE 'increase'
END
WHERE coalesce(trim(direction), '') = '';

UPDATE public.managed_outcomes
SET metric = coalesce(
  nullif(trim(metric), ''),
  nullif(trim(leading_indicator), ''),
  nullif(trim(outcome_statement), ''),
  'Leading indicator not yet defined'
)
WHERE coalesce(trim(metric), '') = '';

UPDATE public.managed_outcomes
SET "object" = coalesce(
  nullif(trim("object"), ''),
  nullif(trim(regexp_replace(coalesce(outcome_statement, ''), '^(increase|reduce|improve|maximize|minimize|avoid)\s+', '', 'i')), ''),
  nullif(trim(outcome_title), ''),
  'reliable progress'
)
WHERE coalesce(trim("object"), '') = '';

UPDATE public.managed_outcomes
SET context = coalesce(
  nullif(trim(context), ''),
  CASE
    WHEN lower(trim(coalesce(journey_key, ''))) = 'customer' THEN 'target customers in the customer journey'
    WHEN lower(trim(coalesce(journey_key, ''))) = 'revenue' THEN 'qualified demand in the revenue journey'
    WHEN lower(trim(coalesce(journey_key, ''))) = 'operations' THEN 'delivery teams in the operations journey'
    WHEN trim(coalesce(journey_key, '')) <> '' THEN trim(journey_key) || ' journey participants'
    ELSE null
  END,
  'target customers'
)
WHERE coalesce(trim(context), '') = '';

UPDATE public.managed_outcomes
SET "constraint" = nullif(trim("constraint"), '')
WHERE "constraint" IS NOT NULL;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY company_id
      ORDER BY
        CASE WHEN is_primary THEN 0 ELSE 1 END,
        confidence DESC,
        updated_at DESC,
        created_at DESC,
        id
    ) AS rn
  FROM public.managed_outcomes
)
UPDATE public.managed_outcomes mo
SET is_primary = (ranked.rn = 1)
FROM ranked
WHERE ranked.id = mo.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_outcomes_one_primary_per_company
  ON public.managed_outcomes(company_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_managed_outcomes_company_primary
  ON public.managed_outcomes(company_id, is_primary, journey_key, created_at DESC);
