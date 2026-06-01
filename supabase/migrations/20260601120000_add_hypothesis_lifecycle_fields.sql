-- Add lifecycle tracking fields to strategic_hypotheses
ALTER TABLE public.strategic_hypotheses
  ADD COLUMN IF NOT EXISTS originating_context text NULL,
  ADD COLUMN IF NOT EXISTS reframed_reason text NULL,
  ADD COLUMN IF NOT EXISTS superseded_by_id uuid NULL
    REFERENCES public.strategic_hypotheses(id) ON DELETE SET NULL;

-- Extend hypothesis_state check constraint to include 'unstable'
-- (drop and re-add — the constraint name is auto-generated from the CREATE TABLE inline check)
ALTER TABLE public.strategic_hypotheses
  DROP CONSTRAINT IF EXISTS strategic_hypotheses_hypothesis_state_check;

ALTER TABLE public.strategic_hypotheses
  ADD CONSTRAINT strategic_hypotheses_hypothesis_state_check
    CHECK (hypothesis_state IN (
      'inferred', 'emerging', 'unstable', 'strengthened',
      'contradicted', 'reframed', 'retired'
    ));

-- Index for superseded_by_id to support lineage graph traversal
CREATE INDEX IF NOT EXISTS idx_strategic_hypotheses_superseded_by
  ON public.strategic_hypotheses(superseded_by_id)
  WHERE superseded_by_id IS NOT NULL;
