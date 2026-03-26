ALTER TABLE public.odi_needs
ADD COLUMN IF NOT EXISTS sort_order integer;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY company_id, tier
      ORDER BY opportunity_score DESC, importance DESC, created_at ASC, id ASC
    ) AS next_sort_order
  FROM public.odi_needs
)
UPDATE public.odi_needs AS n
SET sort_order = ranked.next_sort_order
FROM ranked
WHERE n.id = ranked.id
  AND n.sort_order IS NULL;

UPDATE public.odi_needs
SET sort_order = 0
WHERE sort_order IS NULL;

ALTER TABLE public.odi_needs
ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.odi_needs
ALTER COLUMN sort_order SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_odi_needs_company_tier_sort_order
  ON public.odi_needs(company_id, tier, sort_order);
