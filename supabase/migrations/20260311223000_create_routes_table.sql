CREATE TABLE IF NOT EXISTS public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  category text NOT NULL DEFAULT 'improve',
  title text NOT NULL DEFAULT '',
  short_description text NOT NULL DEFAULT '',
  pts_value numeric NOT NULL DEFAULT 0,
  effort text NOT NULL DEFAULT 'medium',
  type text NOT NULL DEFAULT 'Improve',
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routes_company_id ON public.routes(company_id);
CREATE INDEX IF NOT EXISTS idx_routes_sort_order ON public.routes(company_id, sort_order);

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'routes' AND policyname = 'Admins can manage all routes'
  ) THEN
    CREATE POLICY "Admins can manage all routes" ON public.routes FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'routes' AND policyname = 'Users can view own routes'
  ) THEN
    CREATE POLICY "Users can view own routes" ON public.routes FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'routes' AND policyname = 'Users can insert own routes'
  ) THEN
    CREATE POLICY "Users can insert own routes" ON public.routes FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'routes' AND policyname = 'Users can update own routes'
  ) THEN
    CREATE POLICY "Users can update own routes" ON public.routes FOR UPDATE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'routes' AND policyname = 'Users can delete own routes'
  ) THEN
    CREATE POLICY "Users can delete own routes" ON public.routes FOR DELETE
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;
