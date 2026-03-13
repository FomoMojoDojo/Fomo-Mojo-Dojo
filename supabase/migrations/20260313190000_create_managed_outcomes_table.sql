CREATE TABLE IF NOT EXISTS public.managed_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  journey_key text NOT NULL DEFAULT '',
  outcome_title text NOT NULL DEFAULT '',
  outcome_statement text NOT NULL DEFAULT '',
  leading_indicator text NOT NULL DEFAULT '',
  target_direction text NOT NULL DEFAULT '',
  evidence_basis text NOT NULL DEFAULT '',
  confidence integer NOT NULL DEFAULT 0,
  frameworks_used text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, journey_key)
);

CREATE INDEX IF NOT EXISTS idx_managed_outcomes_company_id
  ON public.managed_outcomes(company_id);

ALTER TABLE public.managed_outcomes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'managed_outcomes' AND policyname = 'Admins can manage all managed outcomes'
  ) THEN
    CREATE POLICY "Admins can manage all managed outcomes" ON public.managed_outcomes FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'managed_outcomes' AND policyname = 'Users can view own managed outcomes'
  ) THEN
    CREATE POLICY "Users can view own managed outcomes" ON public.managed_outcomes FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'managed_outcomes' AND policyname = 'Users can insert own managed outcomes'
  ) THEN
    CREATE POLICY "Users can insert own managed outcomes" ON public.managed_outcomes FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'managed_outcomes' AND policyname = 'Users can update own managed outcomes'
  ) THEN
    CREATE POLICY "Users can update own managed outcomes" ON public.managed_outcomes FOR UPDATE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'managed_outcomes' AND policyname = 'Users can delete own managed outcomes'
  ) THEN
    CREATE POLICY "Users can delete own managed outcomes" ON public.managed_outcomes FOR DELETE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
