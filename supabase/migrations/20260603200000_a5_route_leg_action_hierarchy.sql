-- ── A5 Phase 1 — Route/Leg/Action Hierarchy + MojoScore schema ───────────────
--
-- All changes are additive. No drops, no renames, no data loss.
-- Existing routes rows gain nullable columns and default values only.
-- The `level` column defaults to 'leg' so existing rows remain usable
-- without requiring a data migration to unlock schema validity.
--
-- Objects introduced:
--   public.desired_outcomes        — one primary destination per engagement
--   public.tests                   — learning structures on actions
--   public.mojo_scores             — explainable forward-motion score (history)
--   routes.level                   — 'route' | 'leg' | 'action'
--   routes.parent_id               — FK to routes(id) for hierarchy
--   routes.primary_desired_outcome_id  — FK to desired_outcomes(id)
--   routes.secondary_desired_outcome_ids — uuid[]
--   routes.rejected_alternatives   — jsonb [{alternative_title, rejection_reason, considered_at}]
--   routes.what_would_have_to_be_true  — jsonb [{condition, satisfied_flag, evidence_refs}]
--
-- Idempotency: each statement is wrapped in a DO block that checks
-- whether the object already exists before creating it.

-- ── 1. desired_outcomes table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.desired_outcomes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  statement           text NOT NULL,
  importance_score    integer,
  satisfaction_score  integer,
  metric              text,
  is_primary          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Constraint: at most one is_primary=true per company
CREATE UNIQUE INDEX IF NOT EXISTS desired_outcomes_one_primary_per_company
  ON public.desired_outcomes (company_id)
  WHERE is_primary = true;

-- RLS (same pattern as routes: owner + member access)
ALTER TABLE public.desired_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "desired_outcomes_owner_access" ON public.desired_outcomes
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE created_by = auth.uid()
      UNION
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- ── 2. Extend routes table ────────────────────────────────────────────────────

-- level: 'route' (top-level journey) | 'leg' (waypoint) | 'action' (specific move)
-- Defaults to 'leg' so the existing 10 rows remain valid without a data migration.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'routes' AND column_name = 'level'
  ) THEN
    ALTER TABLE public.routes
      ADD COLUMN level text NOT NULL DEFAULT 'leg'
        CHECK (level IN ('route', 'leg', 'action'));
  END IF;
END $$;

-- parent_id: FK to routes(id) for hierarchy. Null on top-level routes.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'routes' AND column_name = 'parent_id'
  ) THEN
    ALTER TABLE public.routes
      ADD COLUMN parent_id uuid REFERENCES public.routes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- primary_desired_outcome_id: the destination this route is navigating toward
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'routes' AND column_name = 'primary_desired_outcome_id'
  ) THEN
    ALTER TABLE public.routes
      ADD COLUMN primary_desired_outcome_id uuid REFERENCES public.desired_outcomes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- secondary_desired_outcome_ids: supplementary outcomes this route also serves
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'routes' AND column_name = 'secondary_desired_outcome_ids'
  ) THEN
    ALTER TABLE public.routes
      ADD COLUMN secondary_desired_outcome_ids uuid[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- rejected_alternatives: WRAP "Widen" element — routes considered but declined
-- Shape: [{alternative_title: text, rejection_reason: text, considered_at: ISO date}]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'routes' AND column_name = 'rejected_alternatives'
  ) THEN
    ALTER TABLE public.routes
      ADD COLUMN rejected_alternatives jsonb NOT NULL DEFAULT '[]';
  END IF;
END $$;

-- what_would_have_to_be_true: WRAP "Reality-test" + "Attain distance" element
-- Shape: [{condition: text, satisfied_flag: boolean, evidence_refs: uuid[]}]
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'routes' AND column_name = 'what_would_have_to_be_true'
  ) THEN
    ALTER TABLE public.routes
      ADD COLUMN what_would_have_to_be_true jsonb NOT NULL DEFAULT '[]';
  END IF;
END $$;

-- ── 3. tests table (learning structures on actions) ───────────────────────────
--
-- An action (routes row with level='action') can have multiple tests.
-- Tests are the WRAP "Reality-test" artifact at the action level.

CREATE TABLE IF NOT EXISTS public.tests (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  action_id                 uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  hypothesis                text NOT NULL,
  expected_positive_signal  text NOT NULL,
  expected_negative_signal  text NOT NULL,
  result                    text,
  evidence_refs             uuid[] NOT NULL DEFAULT '{}',
  no_test_needed            boolean NOT NULL DEFAULT false,
  no_test_needed_reason     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tests_owner_access" ON public.tests
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE created_by = auth.uid()
      UNION
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- ── 4. mojo_scores table ──────────────────────────────────────────────────────
--
-- One row per computation. History is preserved — never overwritten.
-- The `latest` view / query filters to MAX(computed_at) per company.
-- This is distinct from the legacy `mojo_score` in area_scores_json,
-- which is controlled by the old scoring function and remains unchanged.

CREATE TABLE IF NOT EXISTS public.mojo_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  computed_at         timestamptz NOT NULL DEFAULT now(),
  total_score         numeric(5,2) NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
  component_scores    jsonb NOT NULL DEFAULT '{}',
  explanation         jsonb NOT NULL DEFAULT '{}',
  methodology_version text NOT NULL DEFAULT 'v1'
);

CREATE INDEX IF NOT EXISTS mojo_scores_company_computed_at
  ON public.mojo_scores (company_id, computed_at DESC);

ALTER TABLE public.mojo_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mojo_scores_owner_access" ON public.mojo_scores
  USING (
    company_id IN (
      SELECT id FROM public.companies WHERE created_by = auth.uid()
      UNION
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );
