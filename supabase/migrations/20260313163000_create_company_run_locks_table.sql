CREATE TABLE IF NOT EXISTS public.company_run_locks (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  operation text NOT NULL,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_company_run_locks_expires_at
  ON public.company_run_locks(expires_at);

ALTER TABLE public.company_run_locks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_run_locks' AND policyname = 'Admins can manage all company run locks'
  ) THEN
    CREATE POLICY "Admins can manage all company run locks" ON public.company_run_locks FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'company_run_locks' AND policyname = 'Users can view company run locks'
  ) THEN
    CREATE POLICY "Users can view company run locks" ON public.company_run_locks FOR SELECT
      TO authenticated USING (true);
  END IF;
END $$;
