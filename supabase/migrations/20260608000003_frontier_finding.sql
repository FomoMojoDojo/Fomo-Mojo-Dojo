-- Frontier finding (2c, write-side): the single most load-bearing strategic bet a
-- company holds that nothing outside or customer-side has tested yet — MINED from the
-- company's own org-band signal, not invented. Stored as a finding (kind='frontier')
-- so the Next Turn is always finding-anchored and the count-template can drop (2b
-- follow-up). One per company, refreshed each run; co-exists with real findings.

-- 1. Additive: allow the new 'frontier' kind.
ALTER TABLE public.findings DROP CONSTRAINT findings_kind_check;
ALTER TABLE public.findings ADD CONSTRAINT findings_kind_check
  CHECK (kind IN ('observation','watch_out','frontier'));

-- 2. One frontier per company. Partial unique (origin_signal_id is NULL for a mined
--    frontier, so the (company_id, origin_signal_id) unique can't dedup it). The miner
--    upserts on this key: refresh body+beats+origin_run_id, PRESERVE status (a resolved
--    frontier stays resolved).
CREATE UNIQUE INDEX IF NOT EXISTS findings_one_frontier_per_company
  ON public.findings (company_id) WHERE kind = 'frontier';

-- 3. Resolver ranking: kind-priority watch_out(3) > frontier(2) > observation(1), then
--    recency. A real watch_out still leads (e.g. IAQM's fraud risk over its frontier);
--    a frontier leads over bare observations and is the pick when it's the only finding.
CREATE OR REPLACE FUNCTION public.find_primary_finding(p_company_id uuid)
RETURNS SETOF public.findings
LANGUAGE sql STABLE AS $$
  WITH chosen AS (
    SELECT f.*
    FROM public.operator_primary_selection ops
    JOIN public.findings f ON f.id = ops.item_id
    WHERE ops.company_id = p_company_id
      AND ops.domain = 'finding'
      AND f.status = 'open'
    LIMIT 1
  )
  SELECT * FROM chosen
  UNION ALL
  (
    SELECT f.*
    FROM public.findings f
    WHERE f.company_id = p_company_id
      AND f.status = 'open'
      AND NOT EXISTS (SELECT 1 FROM chosen)
    ORDER BY
      CASE f.kind WHEN 'watch_out' THEN 3 WHEN 'frontier' THEN 2 ELSE 1 END DESC,
      f.origin_run_id DESC NULLS LAST,
      f.created_at DESC,
      f.id DESC
    LIMIT 1
  );
$$;
