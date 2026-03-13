CREATE TABLE IF NOT EXISTS public.research_artifact_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  baseline_run_id bigint REFERENCES public.public_baseline_runs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'saved',
  mojo_score integer,
  evidence_status text,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifacts_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_artifact_runs_company_id
  ON public.research_artifact_runs(company_id);

CREATE INDEX IF NOT EXISTS idx_research_artifact_runs_created_at
  ON public.research_artifact_runs(created_at DESC);

ALTER TABLE public.research_artifact_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'research_artifact_runs' AND policyname = 'Admins can manage all research artifact runs'
  ) THEN
    CREATE POLICY "Admins can manage all research artifact runs" ON public.research_artifact_runs FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'research_artifact_runs' AND policyname = 'Users can view own research artifact runs'
  ) THEN
    CREATE POLICY "Users can view own research artifact runs" ON public.research_artifact_runs FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'research_artifact_runs' AND policyname = 'Users can insert own research artifact runs'
  ) THEN
    CREATE POLICY "Users can insert own research artifact runs" ON public.research_artifact_runs FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
