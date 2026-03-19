-- Make ODI market definitions and needs visible to collaborators on the same company.
-- Previously these tables were creator-only, which made ODI/JTBD appear "missing" for teammates.

DROP POLICY IF EXISTS "Users can view own odi_market_definitions" ON public.odi_market_definitions;
DROP POLICY IF EXISTS "Users can insert own odi_market_definitions" ON public.odi_market_definitions;
DROP POLICY IF EXISTS "Users can update own odi_market_definitions" ON public.odi_market_definitions;
DROP POLICY IF EXISTS "Users can delete own odi_market_definitions" ON public.odi_market_definitions;

DROP POLICY IF EXISTS "Users can view own odi_needs" ON public.odi_needs;
DROP POLICY IF EXISTS "Users can insert own odi_needs" ON public.odi_needs;
DROP POLICY IF EXISTS "Users can update own odi_needs" ON public.odi_needs;
DROP POLICY IF EXISTS "Users can delete own odi_needs" ON public.odi_needs;

DROP POLICY IF EXISTS "Admins can manage all odi_market_definitions" ON public.odi_market_definitions;
DROP POLICY IF EXISTS "Admins can manage all odi_needs" ON public.odi_needs;
DROP POLICY IF EXISTS "Users can view company odi_market_definitions" ON public.odi_market_definitions;
DROP POLICY IF EXISTS "Users can insert company odi_market_definitions" ON public.odi_market_definitions;
DROP POLICY IF EXISTS "Users can update company odi_market_definitions" ON public.odi_market_definitions;
DROP POLICY IF EXISTS "Users can delete company odi_market_definitions" ON public.odi_market_definitions;
DROP POLICY IF EXISTS "Users can view company odi_needs" ON public.odi_needs;
DROP POLICY IF EXISTS "Users can insert company odi_needs" ON public.odi_needs;
DROP POLICY IF EXISTS "Users can update company odi_needs" ON public.odi_needs;
DROP POLICY IF EXISTS "Users can delete company odi_needs" ON public.odi_needs;

CREATE POLICY "Admins can manage all odi_market_definitions"
ON public.odi_market_definitions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all odi_needs"
ON public.odi_needs
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view company odi_market_definitions"
ON public.odi_market_definitions
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

CREATE POLICY "Users can insert company odi_market_definitions"
ON public.odi_market_definitions
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

CREATE POLICY "Users can update company odi_market_definitions"
ON public.odi_market_definitions
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

CREATE POLICY "Users can delete company odi_market_definitions"
ON public.odi_market_definitions
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

CREATE POLICY "Users can view company odi_needs"
ON public.odi_needs
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

CREATE POLICY "Users can insert company odi_needs"
ON public.odi_needs
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

CREATE POLICY "Users can update company odi_needs"
ON public.odi_needs
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

CREATE POLICY "Users can delete company odi_needs"
ON public.odi_needs
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
