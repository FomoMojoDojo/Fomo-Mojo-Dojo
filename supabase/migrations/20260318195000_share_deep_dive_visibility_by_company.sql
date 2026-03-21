-- Make deep-dive analysis visibility consistent for all viewers of a company.
-- Keeps author visibility for legacy/null-company rows.
DROP POLICY IF EXISTS "Users can view own analyses" ON public.deep_dive_analyses;
DROP POLICY IF EXISTS "Users can view company deep dive analyses" ON public.deep_dive_analyses;

CREATE POLICY "Users can view company deep dive analyses"
ON public.deep_dive_analyses
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR (
    company_id IS NOT NULL
    AND company_id IN (
      SELECT c.id
      FROM public.companies c
    )
  )
);
