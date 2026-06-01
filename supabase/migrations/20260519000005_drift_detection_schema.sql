-- A75: Drift detection schema
-- Part 1: evidence baseline columns on the 4 surface tables
-- Part 2: surface_drift_assessments table

-- ── Part 1 — Evidence baseline columns ──────────────────────────────────────

ALTER TABLE public.strategy_cascades
  ADD COLUMN IF NOT EXISTS evidence_baseline_signal_ids JSONB NULL,
  ADD COLUMN IF NOT EXISTS evidence_baseline_captured_at TIMESTAMPTZ NULL;

ALTER TABLE public.positioning_canvases
  ADD COLUMN IF NOT EXISTS evidence_baseline_signal_ids JSONB NULL,
  ADD COLUMN IF NOT EXISTS evidence_baseline_captured_at TIMESTAMPTZ NULL;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS evidence_baseline_signal_ids JSONB NULL,
  ADD COLUMN IF NOT EXISTS evidence_baseline_captured_at TIMESTAMPTZ NULL;

ALTER TABLE public.odi_needs
  ADD COLUMN IF NOT EXISTS evidence_baseline_signal_ids JSONB NULL,
  ADD COLUMN IF NOT EXISTS evidence_baseline_captured_at TIMESTAMPTZ NULL;

-- ── Part 2 — surface_drift_assessments table ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.surface_drift_assessments (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  surface_type        TEXT        NOT NULL,
  surface_id          UUID        NOT NULL,
  drift_score         NUMERIC     NOT NULL,
  drift_state         TEXT        NOT NULL,
  llm_confirmation    TEXT        NULL,
  assessment_basis    JSONB       NULL,
  last_assessed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT check_drift_surface_type CHECK (
    surface_type IN ('positioning', 'cascade', 'route', 'opportunity')
  ),
  CONSTRAINT check_drift_state CHECK (
    drift_state IN ('aligned', 'slight_drift', 'material_drift')
  )
);

-- "What's the drift state for this surface?" — primary badge query
CREATE INDEX IF NOT EXISTS surface_drift_assessments_surface_idx
  ON public.surface_drift_assessments (company_id, surface_type, surface_id);

-- "Which surfaces haven't been assessed lately?" — scheduler query
CREATE INDEX IF NOT EXISTS surface_drift_assessments_assessed_at_idx
  ON public.surface_drift_assessments (last_assessed_at);

-- "Show all drifting surfaces" — partial index
CREATE INDEX IF NOT EXISTS surface_drift_assessments_drifting_idx
  ON public.surface_drift_assessments (company_id, surface_type)
  WHERE drift_state IN ('slight_drift', 'material_drift');

-- ── RLS — mirrors surface_proposals policies exactly ─────────────────────────

ALTER TABLE public.surface_drift_assessments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all surface drift assessments" ON public.surface_drift_assessments;
CREATE POLICY "Admins can manage all surface drift assessments"
  ON public.surface_drift_assessments
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view company surface drift assessments" ON public.surface_drift_assessments;
CREATE POLICY "Users can view company surface drift assessments"
  ON public.surface_drift_assessments
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = surface_drift_assessments.company_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = c.id AND cm.user_id = auth.uid()
        )
      )
  ));

DROP POLICY IF EXISTS "Users can update company surface drift assessments" ON public.surface_drift_assessments;
CREATE POLICY "Users can update company surface drift assessments"
  ON public.surface_drift_assessments
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = surface_drift_assessments.company_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = c.id AND cm.user_id = auth.uid()
        )
      )
  ));
