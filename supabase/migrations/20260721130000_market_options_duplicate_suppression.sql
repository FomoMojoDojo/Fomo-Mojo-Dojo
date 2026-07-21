-- MO-2b (c) — TRUE-duplicate suppression for passing market options.
--
-- Two passing candidates can describe the SAME reading twice. Operator fixtures:
--   COLLAPSE  "Direct care staff" / "seek better working conditions in youth
--             mental health services"
--             vs "Secure better working conditions in youth mental health
--             settings."                                    (Jaccard 0.636)
--   SURVIVE   "Families and caregivers of at-risk youth aged 5-26" /
--             "Support young people in addressing their mental health needs"
--             vs "Ensure emotional well-being for young people."
--                                                            (Jaccard 0.143)
-- Same WHO, different jobs is BREADTH and must survive. Only literal duplicates
-- collapse. Threshold 0.55, operator-confirmed, sits in a wide safe band
-- (0.40-0.63 satisfies both fixtures) and leans high deliberately: under the
-- breadth calibration the costly error is collapsing a NON-duplicate.
--
-- SUPPRESSION, NOT DELETION. A duplicate is a PASSING option — it keeps all
-- three criteria TRUE and rejected_criterion NULL. Its verdict is never
-- rewritten; only its display status changes, and duplicate_of names the sibling
-- that survived so the pair is always walkable. Audit intact.
--
-- RENDER NEEDS NO CHANGE: useMarketOptions already filters status='candidate',
-- so a row moved to 'duplicate' drops off Act A automatically.

ALTER TABLE public.market_options
  ADD COLUMN duplicate_of uuid REFERENCES public.market_options(id) ON DELETE SET NULL;

ALTER TABLE public.market_options DROP CONSTRAINT market_options_status_check;
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_status_check
  CHECK (status = ANY (ARRAY['candidate'::text, 'rejected'::text, 'duplicate'::text]));

-- A duplicate carries a full PASSING verdict — that is the whole point of
-- suppression-not-deletion. Only 'rejected' may name a failing criterion.
ALTER TABLE public.market_options DROP CONSTRAINT market_options_verdict_shape;
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_verdict_shape
  CHECK (
    ((status = ANY (ARRAY['candidate'::text, 'duplicate'::text]))
      AND (criterion_executor_group IS TRUE)
      AND (criterion_odi_form IS TRUE)
      AND (criterion_solution_agnostic IS TRUE)
      AND (rejected_criterion IS NULL))
    OR ((status = 'rejected'::text) AND (rejected_criterion IS NOT NULL))
  );

-- duplicate_of is set if and only if the row is a duplicate: no dangling links,
-- no silently-unlinked suppressions.
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_duplicate_shape
  CHECK (
    ((status = 'duplicate'::text) AND (duplicate_of IS NOT NULL))
    OR ((status <> 'duplicate'::text) AND (duplicate_of IS NULL))
  );
