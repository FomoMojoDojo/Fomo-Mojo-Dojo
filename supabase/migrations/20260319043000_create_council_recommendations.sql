CREATE TABLE IF NOT EXISTS public.council_review_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  summary text NOT NULL DEFAULT '',
  source_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommendation_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.council_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.council_review_runs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  recommendation text NOT NULL,
  rationale text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'strategy',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  confidence integer NOT NULL DEFAULT 60 CHECK (confidence >= 0 AND confidence <= 100),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'ignored')),
  source_basis text NOT NULL DEFAULT 'all_company_context',
  source_context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_note text,
  decided_at timestamptz,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_council_review_runs_company_created
  ON public.council_review_runs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_council_recommendations_company_status
  ON public.council_recommendations(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_council_recommendations_run
  ON public.council_recommendations(run_id);

ALTER TABLE public.council_review_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.council_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all council review runs" ON public.council_review_runs;
DROP POLICY IF EXISTS "Users can view company council review runs" ON public.council_review_runs;
DROP POLICY IF EXISTS "Users can insert company council review runs" ON public.council_review_runs;
DROP POLICY IF EXISTS "Users can update company council review runs" ON public.council_review_runs;
DROP POLICY IF EXISTS "Users can delete company council review runs" ON public.council_review_runs;

CREATE POLICY "Admins can manage all council review runs"
ON public.council_review_runs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view company council review runs"
ON public.council_review_runs
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert company council review runs"
ON public.council_review_runs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = company_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company council review runs"
ON public.council_review_runs
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = company_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete company council review runs"
ON public.council_review_runs
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = company_id
      AND cm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can manage all council recommendations" ON public.council_recommendations;
DROP POLICY IF EXISTS "Users can view company council recommendations" ON public.council_recommendations;
DROP POLICY IF EXISTS "Users can insert company council recommendations" ON public.council_recommendations;
DROP POLICY IF EXISTS "Users can update company council recommendations" ON public.council_recommendations;
DROP POLICY IF EXISTS "Users can delete company council recommendations" ON public.council_recommendations;

CREATE POLICY "Admins can manage all council recommendations"
ON public.council_recommendations
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view company council recommendations"
ON public.council_recommendations
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert company council recommendations"
ON public.council_recommendations
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = company_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company council recommendations"
ON public.council_recommendations
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = company_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete company council recommendations"
ON public.council_recommendations
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = company_id
      AND cm.user_id = auth.uid()
  )
);
