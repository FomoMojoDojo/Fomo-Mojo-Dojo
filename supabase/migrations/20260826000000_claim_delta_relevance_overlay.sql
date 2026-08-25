-- RELEVANCE BACKSTOP (2026-08-26) — a reversible OVERLAY on claim_deltas that records a
-- verdict-level relevance judgment BESIDE the existing verbatim-span check. The delta
-- verdict (delta_type echoed/divergent) is NEVER altered; these columns are a separate,
-- machine-authored annotation that the render/count layer reads to exclude a CONFIRMED
-- (echoed) row whose paired source is orthogonal to the specific claim assertion.
--
-- Why an overlay and not a re-roll: claim_deltas is INSERT-only + keep-or-DELETE reconcile,
-- and generation is deterministic (temp0/seed42) — a DELETE does not stick, the next
-- generate-claim-deltas run recreates the identical verdict. Overturning must therefore be
-- a new recorded STATE the keep-path preserves, exactly like operator_disposition. This is
-- that state; it is distinct from operator_disposition (operator-only) — relevance_verdict
-- is written only by the backstop.
--
-- ALL columns are nullable with NO default value written to existing rows (NULL = not yet
-- judged), so this is purely additive. Frozen CB1 (58b2b15b) has ZERO rows in claim_deltas
-- (verified) and is never written by the backstop regardless — no CB1 write, and an all-NULL
-- column addition cannot perturb a data fingerprint over a table where CB1 has no rows.
ALTER TABLE public.claim_deltas
  ADD COLUMN IF NOT EXISTS relevance_verdict text,
  ADD COLUMN IF NOT EXISTS relevance_reason text,
  ADD COLUMN IF NOT EXISTS relevance_span text,
  ADD COLUMN IF NOT EXISTS relevance_model text,
  ADD COLUMN IF NOT EXISTS relevance_provider text,
  ADD COLUMN IF NOT EXISTS relevance_judged_at timestamptz;

-- relevance_verdict is a closed vocabulary: 'relevant' | 'orthogonal' | NULL (unjudged).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'claim_deltas_relevance_verdict_check'
  ) THEN
    ALTER TABLE public.claim_deltas
      ADD CONSTRAINT claim_deltas_relevance_verdict_check
      CHECK (relevance_verdict IS NULL OR relevance_verdict IN ('relevant', 'orthogonal'));
  END IF;
END $$;
