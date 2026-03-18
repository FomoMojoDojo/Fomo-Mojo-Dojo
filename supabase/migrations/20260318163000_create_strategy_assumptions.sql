CREATE TABLE IF NOT EXISTS public.strategy_assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assumption text NOT NULL,
  source text NOT NULL DEFAULT 'client',
  status text NOT NULL DEFAULT 'untested',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategy_assumptions_source_check
    CHECK (source IN ('client', 'intake', 'company', 'public', 'evidence')),
  CONSTRAINT strategy_assumptions_status_check
    CHECK (status IN ('untested', 'validating', 'validated', 'invalidated'))
);

CREATE INDEX IF NOT EXISTS idx_strategy_assumptions_company_id
  ON public.strategy_assumptions(company_id);

ALTER TABLE public.strategy_assumptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'strategy_assumptions'
      AND policyname = 'Admins can manage all strategy assumptions'
  ) THEN
    CREATE POLICY "Admins can manage all strategy assumptions"
      ON public.strategy_assumptions FOR ALL
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
      AND tablename = 'strategy_assumptions'
      AND policyname = 'Users can view own strategy assumptions'
  ) THEN
    CREATE POLICY "Users can view own strategy assumptions"
      ON public.strategy_assumptions FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'strategy_assumptions'
      AND policyname = 'Users can insert own strategy assumptions'
  ) THEN
    CREATE POLICY "Users can insert own strategy assumptions"
      ON public.strategy_assumptions FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'strategy_assumptions'
      AND policyname = 'Users can update own strategy assumptions'
  ) THEN
    CREATE POLICY "Users can update own strategy assumptions"
      ON public.strategy_assumptions FOR UPDATE
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
      AND tablename = 'strategy_assumptions'
      AND policyname = 'Users can delete own strategy assumptions'
  ) THEN
    CREATE POLICY "Users can delete own strategy assumptions"
      ON public.strategy_assumptions FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
