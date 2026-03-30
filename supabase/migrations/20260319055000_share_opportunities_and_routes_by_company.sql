-- Ensure opportunities/routes visibility is company-scoped (owner/member/admin),
-- not limited to only the row creator.

ALTER TABLE IF EXISTS public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.routes ENABLE ROW LEVEL SECURITY;

-- Opportunities
DROP POLICY IF EXISTS "Admins can manage all opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can view own opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can insert own opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can update own opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can delete own opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can view company opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can insert company opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can update company opportunities" ON public.opportunities;
DROP POLICY IF EXISTS "Users can delete company opportunities" ON public.opportunities;

CREATE POLICY "Admins can manage all opportunities"
ON public.opportunities
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view company opportunities"
ON public.opportunities
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = opportunities.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = opportunities.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert company opportunities"
ON public.opportunities
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = opportunities.company_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = opportunities.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company opportunities"
ON public.opportunities
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = opportunities.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = opportunities.company_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = opportunities.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = opportunities.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete company opportunities"
ON public.opportunities
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = opportunities.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = opportunities.company_id
      AND cm.user_id = auth.uid()
  )
);

-- Routes
DROP POLICY IF EXISTS routes_select ON public.routes;
DROP POLICY IF EXISTS routes_insert ON public.routes;
DROP POLICY IF EXISTS routes_update ON public.routes;
DROP POLICY IF EXISTS routes_delete ON public.routes;
DROP POLICY IF EXISTS "Admins can manage all routes" ON public.routes;

CREATE POLICY "Admins can manage all routes"
ON public.routes
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY routes_select
ON public.routes
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = routes.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = routes.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY routes_insert
ON public.routes
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = routes.company_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = routes.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY routes_update
ON public.routes
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = routes.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = routes.company_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = routes.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = routes.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY routes_delete
ON public.routes
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = routes.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = routes.company_id
      AND cm.user_id = auth.uid()
  )
);
