-- MO-2b (a) — allow a THIRD, bounded revision attempt on market options.
--
-- Evidence (MO-2 regeneration, donor chain A):
--   attempt 1  42f2b76b  "Community organizations" / "Raise funds for youth
--              mental health programs."
--              -> rejected executor_group: "names an organization"
--   attempt 2  da4ce4e2  "Community members" / "Ensure youth mental health
--              programs are adequately funded."
--              -> rejected solution_agnostic: "offering/purchase-act: names a
--                 program category"
--              exec now PASSES: "It names a role or population that human beings
--              could belong to and is verb-free."
--
-- The coaching FIXED WHO; fixing WHO then exposed a defect in THE JOB. That is a
-- SEQUENTIAL DEFECT, not a loop: each attempt is strictly closer, and a third
-- pass has a real defect left to fix rather than the same one repeating. The
-- two-attempt cap, not the criteria, is what stops the donor market landing.
--
-- Nothing here loosens a judge or a criterion. Attempts 2 and 3 re-enter the
-- SAME full three-criteria judge; a third attempt simply gets to exist.
--
-- BOUNDED, and the bound lives in code (marketOptionSynthesis revise phase):
-- attempt 3 fires ONLY when attempt 2 failed a DIFFERENT criterion than attempt 1
-- (the sequential-defect case) or the SAME criterion for a DIFFERENT reason.
-- Never a 4th — this CHECK is the backstop that makes that structural.
--
-- Audit retention is unchanged: every attempt is stored and linked by
-- revision_of, rejections included. History is history.

ALTER TABLE public.market_options DROP CONSTRAINT market_options_attempt_check;
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_attempt_check
  CHECK (attempt = ANY (ARRAY[1, 2, 3]));

-- attempt 1 is an original (no parent); 2 and 3 are revisions and MUST name the
-- row they rewrite, so a chain is always walkable back to its attempt-1 origin.
ALTER TABLE public.market_options DROP CONSTRAINT market_options_attempt_shape;
ALTER TABLE public.market_options
  ADD CONSTRAINT market_options_attempt_shape
  CHECK (
    ((attempt = 1) AND (revision_of IS NULL))
    OR ((attempt = ANY (ARRAY[2, 3])) AND (revision_of IS NOT NULL))
  );
