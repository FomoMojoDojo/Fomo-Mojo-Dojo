-- Re-align all company score fields from authoritative score artifacts and shared projection formula.
-- This is safe/idempotent and intended to correct repeated manual-apply drift.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS mojo_score integer;

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS potential_score integer;

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS projected_score integer;

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS last_scored_at timestamptz;

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS area_scores_json jsonb;

WITH normalized AS (
  SELECT
    c.id,
    COALESCE(
      NULLIF(c.area_scores_json #>> '{outputs,mojo_score}', '')::numeric,
      c.mojo_score::numeric
    ) AS mojo_raw
  FROM public.companies c
),
calc AS (
  SELECT
    n.id,
    ROUND(GREATEST(0, LEAST(100, COALESCE(n.mojo_raw, 0))))::int AS mojo_score,
    ROUND(
      GREATEST(
        0,
        LEAST(
          100,
          GREATEST(0, LEAST(100, COALESCE(n.mojo_raw, 0))) +
          LEAST(22, (100 - GREATEST(0, LEAST(100, COALESCE(n.mojo_raw, 0)))) * 0.35)
        )
      )
    )::int AS potential_score
  FROM normalized n
),
projected AS (
  SELECT
    c.id,
    c.mojo_score,
    c.potential_score,
    ROUND(
      GREATEST(
        0,
        LEAST(
          100,
          GREATEST(
            c.potential_score + 10,
            c.mojo_score + LEAST(42, (100 - c.mojo_score) * 0.62)
          )
        )
      )
    )::int AS projected_score
  FROM calc c
)
UPDATE public.companies c
SET
  mojo_score = p.mojo_score,
  potential_score = p.potential_score,
  projected_score = p.projected_score,
  last_scored_at = COALESCE(c.last_scored_at, NOW()),
  area_scores_json = CASE
    WHEN c.area_scores_json IS NULL THEN c.area_scores_json
    ELSE jsonb_set(
      jsonb_set(
        jsonb_set(c.area_scores_json, '{outputs,mojo_score}', to_jsonb(p.mojo_score), true),
        '{outputs,potential_score}',
        to_jsonb(p.potential_score),
        true
      ),
      '{outputs,projected_score}',
      to_jsonb(p.projected_score),
      true
    )
  END
FROM projected p
WHERE c.id = p.id
  AND (
    c.mojo_score IS DISTINCT FROM p.mojo_score
    OR c.potential_score IS DISTINCT FROM p.potential_score
    OR c.projected_score IS DISTINCT FROM p.projected_score
    OR (
      c.area_scores_json IS NOT NULL
      AND (
        c.area_scores_json #>> '{outputs,mojo_score}' IS DISTINCT FROM p.mojo_score::text
        OR c.area_scores_json #>> '{outputs,potential_score}' IS DISTINCT FROM p.potential_score::text
        OR c.area_scores_json #>> '{outputs,projected_score}' IS DISTINCT FROM p.projected_score::text
      )
    )
  );
