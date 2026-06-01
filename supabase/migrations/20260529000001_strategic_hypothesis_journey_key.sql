-- Add journey_key to strategic_hypotheses and extend hypothesis_kind to include inferred_journey.

ALTER TABLE public.strategic_hypotheses
  ADD COLUMN IF NOT EXISTS journey_key text NULL;

-- Extend hypothesis_kind CHECK to include 'inferred_journey'.
-- Drop existing constraint first (cannot ALTER CHECK in-place in Postgres).
ALTER TABLE public.strategic_hypotheses
  DROP CONSTRAINT IF EXISTS strategic_hypotheses_hypothesis_kind_check;

ALTER TABLE public.strategic_hypotheses
  ADD CONSTRAINT strategic_hypotheses_hypothesis_kind_check
    CHECK (hypothesis_kind IN (
      'directional_hypothesis',
      'inferred_tension',
      'candidate_assumption',
      'inferred_journey'
    ));

-- Index for journey_key lookups (only for non-null values).
CREATE INDEX IF NOT EXISTS idx_strategic_hypotheses_journey_key
  ON public.strategic_hypotheses (company_id, journey_key)
  WHERE journey_key IS NOT NULL;
