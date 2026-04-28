-- Share positioning canvas visibility/editing by company membership.
-- This aligns positioning_canvases with inputs/opportunities company-scoped access.

ALTER TABLE IF EXISTS public.positioning_canvases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all positioning canvases" ON public.positioning_canvases;
DROP POLICY IF EXISTS "Users can view own positioning canvases" ON public.positioning_canvases;
DROP POLICY IF EXISTS "Users can insert own positioning canvases" ON public.positioning_canvases;
DROP POLICY IF EXISTS "Users can update own positioning canvases" ON public.positioning_canvases;
DROP POLICY IF EXISTS "Users can delete own positioning canvases" ON public.positioning_canvases;
DROP POLICY IF EXISTS "Users can view company positioning canvases" ON public.positioning_canvases;
DROP POLICY IF EXISTS "Users can insert company positioning canvases" ON public.positioning_canvases;
DROP POLICY IF EXISTS "Users can update company positioning canvases" ON public.positioning_canvases;
DROP POLICY IF EXISTS "Users can delete company positioning canvases" ON public.positioning_canvases;

CREATE POLICY "Admins can manage all positioning canvases"
ON public.positioning_canvases
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view company positioning canvases"
ON public.positioning_canvases
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = positioning_canvases.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = positioning_canvases.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert company positioning canvases"
ON public.positioning_canvases
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = positioning_canvases.company_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = positioning_canvases.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company positioning canvases"
ON public.positioning_canvases
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = positioning_canvases.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = positioning_canvases.company_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = positioning_canvases.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = positioning_canvases.company_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete company positioning canvases"
ON public.positioning_canvases
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = positioning_canvases.company_id
      AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = positioning_canvases.company_id
      AND cm.user_id = auth.uid()
  )
);

