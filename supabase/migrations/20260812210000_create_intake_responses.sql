-- Gate S (2026-08-12) — structured intake capture. One row per submission holds the client's quiz
-- answers as typed data so First Read functions + the Intake page can read them (today they are
-- trapped in the intake markdown blob). company_name/website_url stay on companies; the free-text
-- explicit_strategic_problem still also lands in strategy_problem_statements + seeds Act-1's
-- companies.strategic_problem_brief (empty-only). completion_view (Option B) is NULLABLE: the Cafe
-- Barra backfill has none and the results page may later be simplified.

CREATE TABLE IF NOT EXISTS public.intake_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,

  -- submission identity: hosted mailbox row id (importer) or a dedup key. NULL for direct
  -- launch-site inserts. UNIQUE(company_id, submission_key) dedups re-imports; NULLs are distinct
  -- in a UNIQUE, so multiple NULL-keyed submissions coexist (multi-submission by construction).
  submission_key text,
  source text NOT NULL DEFAULT 'intake',
  submitted_at timestamptz,

  -- the 14 structured quiz fields (verbatim from the launch-site IntakeRequest payload)
  where_stuck text,
  where_stuck_other text,
  decision_slowdowns text[] NOT NULL DEFAULT '{}',
  customer_confidence text,
  last_customer_input text,
  momentum_drag text,
  momentum_drag_other text,
  explicit_strategic_problem text,
  desired_outcome text,
  desired_outcome_other text,
  success_definition text,
  notes text,
  run_initial_public_signal_pass boolean,

  -- nested payloads
  mojo_snapshot jsonb,          -- {starting_mode, primary_friction, customer_truth_signal, top_focus_areas[]}
  completion_view jsonb,        -- Option B: what the client saw on finishing. NULLABLE (absent-tolerant).

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intake_responses_submission_uniq UNIQUE (company_id, submission_key)
);

CREATE INDEX IF NOT EXISTS idx_intake_responses_company_submitted
  ON public.intake_responses(company_id, submitted_at DESC);

ALTER TABLE public.intake_responses ENABLE ROW LEVEL SECURITY;

-- RLS mirrors strategy_problem_statements (20260318123000): admin-manages-all + user-owns-own.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='intake_responses'
    AND policyname='Admins can manage all intake responses') THEN
    CREATE POLICY "Admins can manage all intake responses"
      ON public.intake_responses FOR ALL TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role))
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='intake_responses'
    AND policyname='Users can view own intake responses') THEN
    CREATE POLICY "Users can view own intake responses"
      ON public.intake_responses FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='intake_responses'
    AND policyname='Users can insert own intake responses') THEN
    CREATE POLICY "Users can insert own intake responses"
      ON public.intake_responses FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='intake_responses'
    AND policyname='Users can update own intake responses') THEN
    CREATE POLICY "Users can update own intake responses"
      ON public.intake_responses FOR UPDATE TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='intake_responses'
    AND policyname='Users can delete own intake responses') THEN
    CREATE POLICY "Users can delete own intake responses"
      ON public.intake_responses FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
