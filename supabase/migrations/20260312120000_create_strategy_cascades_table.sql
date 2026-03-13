CREATE TABLE IF NOT EXISTS public.strategy_cascades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  winning_aspiration text NOT NULL DEFAULT '',
  where_to_play text NOT NULL DEFAULT '',
  how_to_win text NOT NULL DEFAULT '',
  capabilities_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  management_systems_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  assumptions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  frameworks_used text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_strategy_cascades_company_id
  ON public.strategy_cascades(company_id);

ALTER TABLE public.strategy_cascades ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategy_cascades' AND policyname = 'Admins can manage all strategy cascades'
  ) THEN
    CREATE POLICY "Admins can manage all strategy cascades" ON public.strategy_cascades FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategy_cascades' AND policyname = 'Users can view own strategy cascades'
  ) THEN
    CREATE POLICY "Users can view own strategy cascades" ON public.strategy_cascades FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategy_cascades' AND policyname = 'Users can insert own strategy cascades'
  ) THEN
    CREATE POLICY "Users can insert own strategy cascades" ON public.strategy_cascades FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategy_cascades' AND policyname = 'Users can update own strategy cascades'
  ) THEN
    CREATE POLICY "Users can update own strategy cascades" ON public.strategy_cascades FOR UPDATE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategy_cascades' AND policyname = 'Users can delete own strategy cascades'
  ) THEN
    CREATE POLICY "Users can delete own strategy cascades" ON public.strategy_cascades FOR DELETE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
