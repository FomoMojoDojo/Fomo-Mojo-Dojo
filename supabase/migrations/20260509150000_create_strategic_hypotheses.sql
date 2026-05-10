CREATE TABLE IF NOT EXISTS public.strategic_hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  hypothesis_key text NOT NULL,
  statement text NOT NULL,
  hypothesis_kind text NOT NULL CHECK (hypothesis_kind IN (
    'directional_hypothesis','inferred_tension','candidate_assumption'
  )),
  hypothesis_state text NOT NULL DEFAULT 'inferred' CHECK (hypothesis_state IN (
    'inferred','emerging','strengthened','contradicted','reframed','retired'
  )),
  topic text NULL,
  confidence text NOT NULL DEFAULT 'low' CHECK (confidence IN ('high','medium','low')),
  validation_state text NOT NULL DEFAULT 'unvalidated' CHECK (validation_state IN (
    'unvalidated','directional','validated','contradicted'
  )),
  what_must_be_true jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_run_id text NULL,
  reframed_from_hypothesis_id uuid NULL REFERENCES public.strategic_hypotheses(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_strategic_hypotheses_company_key
  ON public.strategic_hypotheses(company_id, hypothesis_key);
CREATE INDEX IF NOT EXISTS idx_strategic_hypotheses_company_id
  ON public.strategic_hypotheses(company_id);
CREATE INDEX IF NOT EXISTS idx_strategic_hypotheses_state
  ON public.strategic_hypotheses(company_id, hypothesis_state);
CREATE INDEX IF NOT EXISTS idx_strategic_hypotheses_kind
  ON public.strategic_hypotheses(company_id, hypothesis_kind);
CREATE INDEX IF NOT EXISTS idx_strategic_hypotheses_source_run
  ON public.strategic_hypotheses(company_id, source_run_id);

ALTER TABLE public.strategic_hypotheses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategic_hypotheses' AND policyname = 'Admins can manage all strategic hypotheses'
  ) THEN
    CREATE POLICY "Admins can manage all strategic hypotheses"
      ON public.strategic_hypotheses FOR ALL
      TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'strategic_hypotheses' AND policyname = 'Users can manage company strategic hypotheses'
  ) THEN
    CREATE POLICY "Users can manage company strategic hypotheses"
      ON public.strategic_hypotheses FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = strategic_hypotheses.company_id
            AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = strategic_hypotheses.company_id
            AND cm.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.companies c
          WHERE c.id = strategic_hypotheses.company_id
            AND c.created_by = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = strategic_hypotheses.company_id
            AND cm.user_id = auth.uid()
        )
      );
  END IF;
END $$;
