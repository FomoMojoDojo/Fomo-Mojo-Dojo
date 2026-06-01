-- Phase 70: Strategic Decision Objects
--
-- Introduces strategic_decisions as a first-class object.
-- A decision represents a QUESTION under active evaluation:
--   "Should we standardize onboarding before scaling wholesale?"
--   "Should we narrow positioning toward operational reliability?"
--
-- NOT: a route title, recommendation, project, or task.
-- IS:  a living strategic commitment question with durable state.
--
-- Two orthogonal dimensions per decision:
--   decision_state  → what are we doing with this question
--   confidence_state → how safe is commitment right now
--
-- Decision memory is an append-only jsonb array — compressed strategic evolution,
-- not an audit log. Example entries:
--   "Customer validation weakened the operational-reliability interpretation."
--   "Contradiction pressure stabilized after customer interviews."

-- ─── strategic_decisions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.strategic_decisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Core identity
  title             text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  decision_question text NOT NULL CHECK (char_length(decision_question) BETWEEN 10 AND 400),

  -- Decision state: what are we doing with this question
  -- (non-linear — decisions can weaken, re-open, destabilize)
  decision_state text NOT NULL DEFAULT 'exploratory'
    CHECK (decision_state IN (
      'exploratory',       -- gathering signal; question is open, not yet pressed
      'under_validation',  -- validation activities are explicitly underway
      'stabilizing',       -- signal is converging; question is narrowing
      'commit_ready',      -- sufficient confidence to make the call
      'committed',         -- the call has been made; in operational execution
      'destabilizing',     -- something weakened the basis for this decision
      'reframing',         -- the question itself is shifting
      'retired'            -- closed / no longer active
    )),

  -- Confidence state: how safe is commitment right now
  -- (orthogonal to decision_state — confidence is NOT certainty)
  confidence_state text NOT NULL DEFAULT 'low'
    CHECK (confidence_state IN (
      'low',          -- insufficient signal
      'directional',  -- signal points a direction; not yet grounded
      'building',     -- evidence accumulating across multiple layers
      'strong',       -- multi-layer, validated, customer-grounded
      'contradicted'  -- direct contradicting evidence present
    )),

  -- Narrative: one sentence describing where this decision stands right now
  current_posture text NULL,

  -- Evidence arrays
  -- supporting_evidence:  [{id, statement, source, weight?}]
  -- contradicting_evidence: [{id, statement, source, severity}]
  supporting_evidence    jsonb NOT NULL DEFAULT '[]'::jsonb,
  contradicting_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Validation requirements: [{requirement, status: "open"|"met"|"bypassed"}]
  validation_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Dependency relationships
  blocked_by            text[]  NOT NULL DEFAULT '{}',  -- decision IDs or tension IDs
  affected_positioning  boolean NOT NULL DEFAULT false,
  affected_capabilities text[]  NOT NULL DEFAULT '{}',
  affected_job_steps    text[]  NOT NULL DEFAULT '{}',

  -- Linked objects
  supporting_hypothesis_ids uuid[] NOT NULL DEFAULT '{}',
  active_tension_ids        uuid[] NOT NULL DEFAULT '{}',

  -- Confidence movement history (append-only semantically)
  -- [{at: timestamptz, direction: "strengthening"|"weakening"|"stable", reason, triggered_by?}]
  confidence_movement jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Decision memory: compressed strategic evolution (NOT an audit log)
  -- [{at: timestamptz, entry: text}] — max ~20 entries, older ones compressed out
  decision_memory jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Stale propagation
  stale_dependencies       text[] NOT NULL DEFAULT '{}',
  last_meaningful_change_at timestamptz NULL,

  -- Provenance
  source text NOT NULL DEFAULT 'user_defined'
    CHECK (source IN ('user_defined', 'ai_derived', 'route_promoted')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategic_decisions_company_id_idx
  ON public.strategic_decisions (company_id);

CREATE INDEX IF NOT EXISTS strategic_decisions_state_idx
  ON public.strategic_decisions (company_id, decision_state)
  WHERE decision_state NOT IN ('retired');

CREATE INDEX IF NOT EXISTS strategic_decisions_confidence_idx
  ON public.strategic_decisions (company_id, confidence_state);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_strategic_decisions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER strategic_decisions_updated_at
  BEFORE UPDATE ON public.strategic_decisions
  FOR EACH ROW EXECUTE FUNCTION public.set_strategic_decisions_updated_at();

-- ─── decision_routes (many-to-many junction) ──────────────────────────────────
--
-- Routes are operational expressions of strategic decisions.
-- A single decision may be expressed by many routes.
-- A route may support multiple decisions.
--
-- route_id is text (not uuid FK) to support both real UUID routes
-- and derived-* prefixed routes computed from opportunity data.

CREATE TABLE IF NOT EXISTS public.decision_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.strategic_decisions(id) ON DELETE CASCADE,
  route_id    text NOT NULL,  -- text: supports UUID routes + "derived-{opp_id}" routes

  relationship text NOT NULL DEFAULT 'expression'
    CHECK (relationship IN (
      'expression',      -- this route is an operational expression of the decision
      'validation_path', -- this route validates this decision question
      'contradicting',   -- this route provides contradicting operational pressure
      'prerequisite'     -- this route must progress before the decision can advance
    )),

  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (decision_id, route_id)
);

CREATE INDEX IF NOT EXISTS decision_routes_company_id_idx
  ON public.decision_routes (company_id);

CREATE INDEX IF NOT EXISTS decision_routes_decision_id_idx
  ON public.decision_routes (decision_id);

CREATE INDEX IF NOT EXISTS decision_routes_route_id_idx
  ON public.decision_routes (route_id);

-- ─── council_recommendations: add decision_id ─────────────────────────────────
--
-- Council outputs can now attach to specific decision objects.
-- NULL = legacy / general recommendation (backward compatible).

ALTER TABLE public.council_recommendations
  ADD COLUMN IF NOT EXISTS decision_id uuid NULL
    REFERENCES public.strategic_decisions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS council_recs_decision_id_idx
  ON public.council_recommendations (decision_id)
  WHERE decision_id IS NOT NULL;

-- ─── RLS — strategic_decisions ────────────────────────────────────────────────

ALTER TABLE public.strategic_decisions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategic_decisions'
      AND policyname = 'Admins can manage all strategic_decisions'
  ) THEN
    CREATE POLICY "Admins can manage all strategic_decisions"
      ON public.strategic_decisions FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategic_decisions'
      AND policyname = 'strategic_decisions company scoped select'
  ) THEN
    CREATE POLICY "strategic_decisions company scoped select"
      ON public.strategic_decisions FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = strategic_decisions.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = strategic_decisions.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategic_decisions'
      AND policyname = 'strategic_decisions company scoped insert'
  ) THEN
    CREATE POLICY "strategic_decisions company scoped insert"
      ON public.strategic_decisions FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = strategic_decisions.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = strategic_decisions.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategic_decisions'
      AND policyname = 'strategic_decisions company scoped update'
  ) THEN
    CREATE POLICY "strategic_decisions company scoped update"
      ON public.strategic_decisions FOR UPDATE
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = strategic_decisions.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = strategic_decisions.company_id AND cm.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = strategic_decisions.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = strategic_decisions.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategic_decisions'
      AND policyname = 'strategic_decisions company scoped delete'
  ) THEN
    CREATE POLICY "strategic_decisions company scoped delete"
      ON public.strategic_decisions FOR DELETE
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = strategic_decisions.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = strategic_decisions.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

-- ─── RLS — decision_routes ────────────────────────────────────────────────────

ALTER TABLE public.decision_routes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_routes'
      AND policyname = 'Admins can manage all decision_routes'
  ) THEN
    CREATE POLICY "Admins can manage all decision_routes"
      ON public.decision_routes FOR ALL
      TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_routes'
      AND policyname = 'decision_routes company scoped select'
  ) THEN
    CREATE POLICY "decision_routes company scoped select"
      ON public.decision_routes FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = decision_routes.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = decision_routes.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_routes'
      AND policyname = 'decision_routes company scoped insert'
  ) THEN
    CREATE POLICY "decision_routes company scoped insert"
      ON public.decision_routes FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = decision_routes.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = decision_routes.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_routes'
      AND policyname = 'decision_routes company scoped update'
  ) THEN
    CREATE POLICY "decision_routes company scoped update"
      ON public.decision_routes FOR UPDATE
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = decision_routes.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = decision_routes.company_id AND cm.user_id = auth.uid())
      )
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = decision_routes.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = decision_routes.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'decision_routes'
      AND policyname = 'decision_routes company scoped delete'
  ) THEN
    CREATE POLICY "decision_routes company scoped delete"
      ON public.decision_routes FOR DELETE
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = decision_routes.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = decision_routes.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

COMMENT ON TABLE public.strategic_decisions IS
  'First-class strategic decision objects. Each row represents a commitment question '
  'under active evaluation. decision_state tracks what we are doing with the question; '
  'confidence_state tracks how safe commitment is. NOT workflow tickets — decisions can '
  'weaken, re-open, destabilize, and reframe.';

COMMENT ON TABLE public.decision_routes IS
  'Many-to-many junction between strategic decisions and routes. '
  'Routes are operational expressions of a decision, not the decision itself. '
  'route_id is text to support both UUID routes and derived-* computed routes.';
