CREATE TABLE IF NOT EXISTS public.positioning_canvases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  competitive_alternatives_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  unique_attributes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  value_for_customer text NOT NULL DEFAULT '',
  best_fit_customers text NOT NULL DEFAULT '',
  market_category text NOT NULL DEFAULT '',
  category_rationale text NOT NULL DEFAULT '',
  current_tagline text NOT NULL DEFAULT '',
  proposed_tagline text NOT NULL DEFAULT '',
  frameworks_used text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS idx_positioning_canvases_company_id
  ON public.positioning_canvases(company_id);

ALTER TABLE public.positioning_canvases ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'positioning_canvases' AND policyname = 'Admins can manage all positioning canvases'
  ) THEN
    CREATE POLICY "Admins can manage all positioning canvases" ON public.positioning_canvases FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'positioning_canvases' AND policyname = 'Users can view own positioning canvases'
  ) THEN
    CREATE POLICY "Users can view own positioning canvases" ON public.positioning_canvases FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'positioning_canvases' AND policyname = 'Users can insert own positioning canvases'
  ) THEN
    CREATE POLICY "Users can insert own positioning canvases" ON public.positioning_canvases FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'positioning_canvases' AND policyname = 'Users can update own positioning canvases'
  ) THEN
    CREATE POLICY "Users can update own positioning canvases" ON public.positioning_canvases FOR UPDATE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'positioning_canvases' AND policyname = 'Users can delete own positioning canvases'
  ) THEN
    CREATE POLICY "Users can delete own positioning canvases" ON public.positioning_canvases FOR DELETE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
