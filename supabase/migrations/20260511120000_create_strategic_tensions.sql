-- Strategic tensions: unresolved strategic conflicts with downstream implications.
--
-- A tension is NOT a problem, recommendation, or route.
-- It IS an unresolved conflict between systems (customer evidence vs org capability,
-- positioning claims vs validation state, route commitments vs confidence levels).
--
-- Derived tensions are computed at runtime and never stored here.
-- This table holds: user-defined tensions + AI-surfaced tensions approved for persistence.

CREATE TABLE IF NOT EXISTS public.strategic_tensions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Core content
  statement    text NOT NULL CHECK (char_length(statement) BETWEEN 1 AND 300),
  detail       text,

  -- Lifecycle
  status       text NOT NULL DEFAULT 'unresolved'
                 CHECK (status IN (
                   'emerging', 'strengthening', 'unresolved', 'splitting',
                   'reframed', 'weakened', 'resolved', 'retired'
                 )),

  -- Signal quality
  confidence   numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  pressure     text NOT NULL DEFAULT 'medium'
                 CHECK (pressure IN ('low', 'medium', 'high', 'critical')),

  -- Source classification
  source       text NOT NULL DEFAULT 'user_defined'
                 CHECK (source IN (
                   'route_conflict', 'customer_positioning_mismatch',
                   'capability_positioning_mismatch', 'confidence_instability',
                   'commitment_blocked', 'unvalidated_scale_pressure',
                   'need_route_gap', 'hypothesis_contradiction',
                   'over_concentration', 'user_defined'
                 )),

  -- Relationship arrays (foreign key IDs stored as text arrays for flexibility)
  affected_routes       text[] NOT NULL DEFAULT '{}',
  affected_needs        text[] NOT NULL DEFAULT '{}',
  affected_positioning  boolean NOT NULL DEFAULT false,
  affected_strategy     boolean NOT NULL DEFAULT false,

  -- Commitment blocking
  blocked_commitments       text[] NOT NULL DEFAULT '{}',
  is_commitment_blocker     boolean NOT NULL DEFAULT false,

  -- Resolution intelligence
  resolution_signals        text[] NOT NULL DEFAULT '{}',
  validation_requirements   text[] NOT NULL DEFAULT '{}',
  current_interpretation    text,
  reframed_from             uuid REFERENCES public.strategic_tensions(id) ON DELETE SET NULL,

  -- Provenance
  created_from text NOT NULL DEFAULT 'user_defined'
                 CHECK (created_from IN ('derived', 'stored', 'user_defined', 'ai_suggested')),

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS strategic_tensions_company_id_idx
  ON public.strategic_tensions (company_id);

CREATE INDEX IF NOT EXISTS strategic_tensions_status_idx
  ON public.strategic_tensions (company_id, status)
  WHERE status NOT IN ('resolved', 'retired');

CREATE INDEX IF NOT EXISTS strategic_tensions_pressure_idx
  ON public.strategic_tensions (company_id, pressure)
  WHERE pressure IN ('high', 'critical');

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_strategic_tensions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER strategic_tensions_updated_at
  BEFORE UPDATE ON public.strategic_tensions
  FOR EACH ROW EXECUTE FUNCTION public.set_strategic_tensions_updated_at();

-- RLS
ALTER TABLE public.strategic_tensions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tensions for their companies"
  ON public.strategic_tensions FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Users can insert tensions for their companies"
  ON public.strategic_tensions FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Users can update tensions for their companies"
  ON public.strategic_tensions FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE created_by = auth.uid()
    )
  );

CREATE POLICY "Users can delete tensions for their companies"
  ON public.strategic_tensions FOR DELETE
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE created_by = auth.uid()
    )
  );

COMMENT ON TABLE public.strategic_tensions IS
  'Unresolved strategic conflicts with downstream implications. '
  'Derived tensions are computed at runtime; this table holds persisted tensions only.';
