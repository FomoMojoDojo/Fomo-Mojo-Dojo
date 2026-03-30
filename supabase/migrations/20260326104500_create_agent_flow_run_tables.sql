CREATE TABLE IF NOT EXISTS public.agent_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'hybrid',
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  selected_context_mode text,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT agent_flow_runs_mode_check
    CHECK (mode IN ('public_only', 'uploaded_only', 'hybrid')),
  CONSTRAINT agent_flow_runs_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'partial', 'blocked')),
  CONSTRAINT agent_flow_runs_context_mode_check
    CHECK (
      selected_context_mode IS NULL OR
      selected_context_mode IN ('public_baseline', 'uploaded_only', 'uploaded_evidence_fallback')
    )
);

CREATE INDEX IF NOT EXISTS idx_agent_flow_runs_company_created
  ON public.agent_flow_runs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_flow_runs_status_created
  ON public.agent_flow_runs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_flow_stage_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_flow_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  stage_key text NOT NULL,
  stage_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_text text NOT NULL DEFAULT '',
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_flow_stage_runs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  CONSTRAINT agent_flow_stage_runs_unique_stage
    UNIQUE (run_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_flow_stage_runs_run_order
  ON public.agent_flow_stage_runs(run_id, stage_order);

CREATE INDEX IF NOT EXISTS idx_agent_flow_stage_runs_company_created
  ON public.agent_flow_stage_runs(company_id, created_at DESC);

ALTER TABLE public.agent_flow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_flow_stage_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_flow_runs' AND policyname = 'Admins can manage all agent flow runs'
  ) THEN
    CREATE POLICY "Admins can manage all agent flow runs" ON public.agent_flow_runs FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_flow_runs' AND policyname = 'Users can view own agent flow runs'
  ) THEN
    CREATE POLICY "Users can view own agent flow runs" ON public.agent_flow_runs FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_flow_runs' AND policyname = 'Users can insert own agent flow runs'
  ) THEN
    CREATE POLICY "Users can insert own agent flow runs" ON public.agent_flow_runs FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_flow_runs' AND policyname = 'Users can update own agent flow runs'
  ) THEN
    CREATE POLICY "Users can update own agent flow runs" ON public.agent_flow_runs FOR UPDATE
      TO authenticated USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_flow_stage_runs' AND policyname = 'Admins can manage all agent flow stage runs'
  ) THEN
    CREATE POLICY "Admins can manage all agent flow stage runs" ON public.agent_flow_stage_runs FOR ALL
      TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_flow_stage_runs' AND policyname = 'Users can view own agent flow stage runs'
  ) THEN
    CREATE POLICY "Users can view own agent flow stage runs" ON public.agent_flow_stage_runs FOR SELECT
      TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_flow_stage_runs' AND policyname = 'Users can insert own agent flow stage runs'
  ) THEN
    CREATE POLICY "Users can insert own agent flow stage runs" ON public.agent_flow_stage_runs FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_flow_stage_runs' AND policyname = 'Users can update own agent flow stage runs'
  ) THEN
    CREATE POLICY "Users can update own agent flow stage runs" ON public.agent_flow_stage_runs FOR UPDATE
      TO authenticated USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
