-- Who-you-serve job statements, goal-not-means rule (operator ruling R1–R4, 2026-09-22).
--
-- The market pipeline versions its CRITERION on the verdict rows (market_discovery_verdicts.criterion_version,
-- carried inside the verdict key), but a written definition row has never said which criterion produced it — so
-- after a bump there is no way to tell, from the row alone, whether it was judged under the old rule or the new
-- one. The reference job map solved the same problem by stamping taxonomy_version on the STEP row; this is that
-- stamp for market definitions.
--
-- NULL means "written before the stamp existed" and stays NULL: no backfill, no inference. The first read does
-- not render this column (R4) — it is provenance for the operator and for the next criterion bump.
BEGIN;

ALTER TABLE public.odi_market_definitions
  ADD COLUMN criterion_version integer;

COMMENT ON COLUMN public.odi_market_definitions.criterion_version IS
  'The solution-agnostic criterion version (solutionAgnosticJudge.ts CRITERION_VERSION) under which this row was judged and written. NULL = written before the stamp (2026-09-22); never backfilled. Not rendered on the first read.';

COMMIT;
