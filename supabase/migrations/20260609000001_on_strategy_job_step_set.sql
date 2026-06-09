-- Persisted on-strategy job-step set (queue item 2, approach A: text key, no job_step_sets
-- table). Extends the Findings primary primitive (operator_primary_selection) to the
-- 'job_step_set' domain, whose set identity is journey_key (text) — not a uuid. Adds a
-- resolver that makes the operator pin the single authority and demotes the heuristic to
-- fallback-only (the heuristic now lives ONLY here, mirroring the JS deriveInitiativeContext).

-- 1. item_key (text) for domains keyed by text (job_step_set → journey_key). item_id stays
--    uuid for findings. item_id is no longer universally required; a per-domain CHECK enforces
--    the right key per domain. Existing finding rows already have item_id, so no backfill.
ALTER TABLE public.operator_primary_selection ADD COLUMN IF NOT EXISTS item_key text NULL;
ALTER TABLE public.operator_primary_selection ALTER COLUMN item_id DROP NOT NULL;
ALTER TABLE public.operator_primary_selection ADD CONSTRAINT operator_primary_selection_key_per_domain
  CHECK (
    (domain <> 'finding'       OR item_id  IS NOT NULL) AND
    (domain <> 'job_step_set'  OR item_key IS NOT NULL)
  );

-- 2. Resolver: the pinned journey_key when a domain='job_step_set' row exists AND that set
--    still has job_steps for the company; otherwise the heuristic rank (count + economic+2 +
--    customer-prefix+2 + non-generic+3; default 'customer'). Mirrors scoring/mojoScore.ts
--    deriveInitiativeContext — this SQL is now the single home for the DB-resolved choice.
CREATE OR REPLACE FUNCTION public.resolve_primary_job_step_set(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE AS $$
DECLARE
  pinned text;
  heuristic text;
BEGIN
  -- Operator pin wins, but only if the pinned set still has job_steps (else stale → fall back).
  SELECT ops.item_key INTO pinned
  FROM public.operator_primary_selection ops
  WHERE ops.company_id = p_company_id
    AND ops.domain = 'job_step_set'
    AND EXISTS (
      SELECT 1 FROM public.job_steps js
      WHERE js.company_id = p_company_id AND js.journey_key = ops.item_key
    )
  LIMIT 1;
  IF pinned IS NOT NULL THEN
    RETURN pinned;
  END IF;

  -- Heuristic fallback (same weighting as the JS heuristic being demoted).
  SELECT key INTO heuristic FROM (
    SELECT
      js.journey_key AS key,
      count(*)
      + CASE WHEN lower(string_agg(COALESCE(js.journey_title,'') || ' ' || COALESCE(js.journey_subtitle,''), ' '))
               ~ '(revenue|investment|investor|funding|capital|contract|pipeline)' THEN 2 ELSE 0 END
      + CASE WHEN js.journey_key LIKE 'customer-%' THEN 2 ELSE 0 END
      + CASE WHEN js.journey_key <> 'customer' THEN 3 ELSE 0 END AS score
    FROM public.job_steps js
    WHERE js.company_id = p_company_id AND COALESCE(js.journey_key, '') <> ''
    GROUP BY js.journey_key
    ORDER BY score DESC, js.journey_key ASC
    LIMIT 1
  ) ranked;

  RETURN COALESCE(heuristic, 'customer');
END;
$$;
