-- Share strategy cascades and job steps by company membership.
-- Aligns access with company-scoped collaboration (owner/member/admin).

ALTER TABLE IF EXISTS public.strategy_cascades ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.job_steps ENABLE ROW LEVEL SECURITY;

-- Strategy cascades
DROP POLICY IF EXISTS "Admins can manage all strategy cascades" ON public.strategy_cascades;
DROP POLICY IF EXISTS "Users can view own strategy cascades" ON public.strategy_cascades;
DROP POLICY IF EXISTS "Users can insert own strategy cascades" ON public.strategy_cascades;
DROP POLICY IF EXISTS "Users can update own strategy cascades" ON public.strategy_cascades;
DROP POLICY IF EXISTS "Users can delete own strategy cascades" ON public.strategy_cascades;
DROP POLICY IF EXISTS "Users can view company strategy cascades" ON public.strategy_cascades;
DROP POLICY IF EXISTS "Users can insert company strategy cascades" ON public.strategy_cascades;
DROP POLICY IF EXISTS "Users can update company strategy cascades" ON public.strategy_cascades;
DROP POLICY IF EXISTS "Users can delete company strategy cascades" ON public.strategy_cascades;

CREATE POLICY "Admins can manage all strategy cascades"
ON public.strategy_cascades
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view company strategy cascades"
ON public.strategy_cascades
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = strategy_cascades.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = strategy_cascades.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert company strategy cascades"
ON public.strategy_cascades
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = strategy_cascades.company_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = strategy_cascades.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company strategy cascades"
ON public.strategy_cascades
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = strategy_cascades.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = strategy_cascades.company_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = strategy_cascades.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = strategy_cascades.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete company strategy cascades"
ON public.strategy_cascades
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = strategy_cascades.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = strategy_cascades.company_id
      AND cm.user_id = auth.uid()
  )
);

-- Job steps
DROP POLICY IF EXISTS "Admins can manage all job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Admins can view all job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Users can view own job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Users can insert own job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Users can update own job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Users can delete own job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Users can view company job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Users can insert company job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Users can update company job steps" ON public.job_steps;
DROP POLICY IF EXISTS "Users can delete company job steps" ON public.job_steps;

CREATE POLICY "Admins can manage all job steps"
ON public.job_steps
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view company job steps"
ON public.job_steps
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = job_steps.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = job_steps.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert company job steps"
ON public.job_steps
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = job_steps.company_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = job_steps.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company job steps"
ON public.job_steps
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = job_steps.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = job_steps.company_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = job_steps.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = job_steps.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete company job steps"
ON public.job_steps
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = job_steps.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = job_steps.company_id
      AND cm.user_id = auth.uid()
  )
);

