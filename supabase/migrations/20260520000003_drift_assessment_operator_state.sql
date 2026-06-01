-- A79a: Operator state columns on surface_drift_assessments
-- operator_seen_at  — set idempotently when operator first opens the detail panel
-- accepted_as_aligned_at — set when operator accepts a drifting surface as still aligned

ALTER TABLE public.surface_drift_assessments
  ADD COLUMN IF NOT EXISTS operator_seen_at      TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS accepted_as_aligned_at TIMESTAMPTZ NULL;

-- Supports A79b's inbox query: "unresolved drift for this company"
CREATE INDEX IF NOT EXISTS idx_drift_assessments_unresolved
  ON public.surface_drift_assessments (company_id, drift_state)
  WHERE accepted_as_aligned_at IS NULL;
