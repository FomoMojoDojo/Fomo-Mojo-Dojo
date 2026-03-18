CREATE TABLE IF NOT EXISTS public.strategy_problem_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  statement text NOT NULL,
  source text NOT NULL DEFAULT 'client',
  status text NOT NULL DEFAULT 'open',
  reconciliation_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_problem_statements_source_check
    CHECK (source IN ('client', 'intake', 'company', 'public', 'evidence')),
  CONSTRAINT strategy_problem_statements_status_check
    CHECK (status IN ('open', 'reconciled'))
);

CREATE INDEX IF NOT EXISTS idx_strategy_problem_statements_company_id
  ON public.strategy_problem_statements(company_id);

ALTER TABLE public.strategy_problem_statements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'strategy_problem_statements'
      AND policyname = 'Admins can manage all strategy problem statements'
  ) THEN
    CREATE POLICY "Admins can manage all strategy problem statements"
      ON public.strategy_problem_statements FOR ALL
      TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'strategy_problem_statements'
      AND policyname = 'Users can view own strategy problem statements'
  ) THEN
    CREATE POLICY "Users can view own strategy problem statements"
      ON public.strategy_problem_statements FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'strategy_problem_statements'
      AND policyname = 'Users can insert own strategy problem statements'
  ) THEN
    CREATE POLICY "Users can insert own strategy problem statements"
      ON public.strategy_problem_statements FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'strategy_problem_statements'
      AND policyname = 'Users can update own strategy problem statements'
  ) THEN
    CREATE POLICY "Users can update own strategy problem statements"
      ON public.strategy_problem_statements FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'strategy_problem_statements'
      AND policyname = 'Users can delete own strategy problem statements'
  ) THEN
    CREATE POLICY "Users can delete own strategy problem statements"
      ON public.strategy_problem_statements FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
