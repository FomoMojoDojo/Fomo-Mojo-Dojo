ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS managed_outcome_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'opportunities_managed_outcome_id_fkey'
      AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
    ADD CONSTRAINT opportunities_managed_outcome_id_fkey
    FOREIGN KEY (managed_outcome_id)
    REFERENCES public.managed_outcomes(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunities_company_managed_outcome
  ON public.opportunities(company_id, managed_outcome_id);

CREATE TABLE IF NOT EXISTS public.solution_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  route_id uuid NULL REFERENCES public.routes(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'improve',
  effort text NOT NULL DEFAULT 'medium',
  confidence integer NOT NULL DEFAULT 0,
  frameworks_used text[] NOT NULL DEFAULT '{}'::text[],
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solution_ideas_category_check CHECK (category IN ('fix', 'improve', 'create')),
  CONSTRAINT solution_ideas_effort_check CHECK (effort IN ('low', 'medium', 'high')),
  CONSTRAINT solution_ideas_confidence_check CHECK (confidence >= 0 AND confidence <= 100)
);

CREATE INDEX IF NOT EXISTS idx_solution_ideas_company_id
  ON public.solution_ideas(company_id);
CREATE INDEX IF NOT EXISTS idx_solution_ideas_opportunity_id
  ON public.solution_ideas(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_solution_ideas_sort
  ON public.solution_ideas(company_id, opportunity_id, sort_order, created_at);

ALTER TABLE public.solution_ideas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_ideas' AND policyname = 'Admins can manage all solution ideas'
  ) THEN
    CREATE POLICY "Admins can manage all solution ideas" ON public.solution_ideas FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_ideas' AND policyname = 'Users can view own solution ideas'
  ) THEN
    CREATE POLICY "Users can view own solution ideas" ON public.solution_ideas FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_ideas' AND policyname = 'Users can insert own solution ideas'
  ) THEN
    CREATE POLICY "Users can insert own solution ideas" ON public.solution_ideas FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_ideas' AND policyname = 'Users can update own solution ideas'
  ) THEN
    CREATE POLICY "Users can update own solution ideas" ON public.solution_ideas FOR UPDATE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_ideas' AND policyname = 'Users can delete own solution ideas'
  ) THEN
    CREATE POLICY "Users can delete own solution ideas" ON public.solution_ideas FOR DELETE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.solution_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  solution_idea_id uuid NOT NULL REFERENCES public.solution_ideas(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  method text NOT NULL DEFAULT '',
  metric text NOT NULL DEFAULT '',
  success_threshold text NOT NULL DEFAULT '',
  timebox text NOT NULL DEFAULT '',
  frameworks_used text[] NOT NULL DEFAULT '{}'::text[],
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solution_tests_company_id
  ON public.solution_tests(company_id);
CREATE INDEX IF NOT EXISTS idx_solution_tests_solution_idea_id
  ON public.solution_tests(solution_idea_id);
CREATE INDEX IF NOT EXISTS idx_solution_tests_sort
  ON public.solution_tests(company_id, solution_idea_id, sort_order, created_at);

ALTER TABLE public.solution_tests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_tests' AND policyname = 'Admins can manage all solution tests'
  ) THEN
    CREATE POLICY "Admins can manage all solution tests" ON public.solution_tests FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_tests' AND policyname = 'Users can view own solution tests'
  ) THEN
    CREATE POLICY "Users can view own solution tests" ON public.solution_tests FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_tests' AND policyname = 'Users can insert own solution tests'
  ) THEN
    CREATE POLICY "Users can insert own solution tests" ON public.solution_tests FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_tests' AND policyname = 'Users can update own solution tests'
  ) THEN
    CREATE POLICY "Users can update own solution tests" ON public.solution_tests FOR UPDATE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'solution_tests' AND policyname = 'Users can delete own solution tests'
  ) THEN
    CREATE POLICY "Users can delete own solution tests" ON public.solution_tests FOR DELETE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
