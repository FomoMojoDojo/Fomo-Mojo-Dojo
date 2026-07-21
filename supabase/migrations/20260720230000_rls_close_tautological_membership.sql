-- RLS-1: close the tautological cross-tenant membership hole.
--
-- Sixteen policies across four tables carried a self-comparison in their
-- company_members EXISTS clause:
--
--     EXISTS (SELECT 1 FROM company_members cm
--             WHERE cm.company_id = cm.company_id      -- always true
--               AND cm.user_id = auth.uid())
--
-- cm.company_id = cm.company_id is true for every row, so the EXISTS collapsed
-- to "the caller is a member of ANY company" and never scoped to the row's own
-- company. Any authenticated member of any company could SELECT, UPDATE and
-- DELETE every other company's rows on these tables, and INSERT rows attributed
-- to a company they do not belong to (the with_check side carried the same
-- defect).
--
-- The correct predicate is the one market_options was born with at MO-1:
--
--     EXISTS (SELECT 1 FROM company_members cm
--             WHERE cm.company_id = <table>.company_id
--               AND cm.user_id = auth.uid())
--
-- transcribed verbatim below, keyed to each table's own company_id. Nothing
-- else in these predicates changes: the auth.uid() = user_id term and the
-- companies.created_by term are preserved exactly as they were, and the
-- separate "Admins can manage all ..." ALL policies on each table are left
-- untouched (they already supply the has_role admin path that market_options
-- carries inline).
--
-- No role-tier logic: company_members.role stays unwired, per gate scope.
--
-- Out of scope, queued as RLS-2 (separate design gate, operator ruling needed):
--   deep_dive_analyses "Users can view company deep dive analyses"
--       -- company_id IN (SELECT c.id FROM companies c), an unbounded subquery
--   company_run_locks "Users can view company run locks"          -- qual: true
--   profiles          "Authenticated users can view profile names" -- qual: true
--
-- Policies only. Zero DML.

-- ---------------------------------------------------------------- odi_needs

DROP POLICY IF EXISTS "Users can view company odi_needs" ON public.odi_needs;
CREATE POLICY "Users can view company odi_needs" ON public.odi_needs
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = odi_needs.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = odi_needs.company_id AND cm.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert company odi_needs" ON public.odi_needs;
CREATE POLICY "Users can insert company odi_needs" ON public.odi_needs
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id)
    AND (
      (EXISTS ( SELECT 1 FROM companies c
                WHERE c.id = odi_needs.company_id AND c.created_by = auth.uid()))
      OR (EXISTS ( SELECT 1 FROM company_members cm
                   WHERE cm.company_id = odi_needs.company_id AND cm.user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can update company odi_needs" ON public.odi_needs;
CREATE POLICY "Users can update company odi_needs" ON public.odi_needs
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = odi_needs.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = odi_needs.company_id AND cm.user_id = auth.uid()))
  )
  WITH CHECK (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = odi_needs.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = odi_needs.company_id AND cm.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete company odi_needs" ON public.odi_needs;
CREATE POLICY "Users can delete company odi_needs" ON public.odi_needs
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = odi_needs.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = odi_needs.company_id AND cm.user_id = auth.uid()))
  );

-- ----------------------------------------------- odi_market_definitions

DROP POLICY IF EXISTS "Users can view company odi_market_definitions" ON public.odi_market_definitions;
CREATE POLICY "Users can view company odi_market_definitions" ON public.odi_market_definitions
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = odi_market_definitions.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = odi_market_definitions.company_id AND cm.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert company odi_market_definitions" ON public.odi_market_definitions;
CREATE POLICY "Users can insert company odi_market_definitions" ON public.odi_market_definitions
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id)
    AND (
      (EXISTS ( SELECT 1 FROM companies c
                WHERE c.id = odi_market_definitions.company_id AND c.created_by = auth.uid()))
      OR (EXISTS ( SELECT 1 FROM company_members cm
                   WHERE cm.company_id = odi_market_definitions.company_id AND cm.user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can update company odi_market_definitions" ON public.odi_market_definitions;
CREATE POLICY "Users can update company odi_market_definitions" ON public.odi_market_definitions
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = odi_market_definitions.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = odi_market_definitions.company_id AND cm.user_id = auth.uid()))
  )
  WITH CHECK (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = odi_market_definitions.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = odi_market_definitions.company_id AND cm.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete company odi_market_definitions" ON public.odi_market_definitions;
CREATE POLICY "Users can delete company odi_market_definitions" ON public.odi_market_definitions
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = odi_market_definitions.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = odi_market_definitions.company_id AND cm.user_id = auth.uid()))
  );

-- ---------------------------------------------- council_recommendations

DROP POLICY IF EXISTS "Users can view company council recommendations" ON public.council_recommendations;
CREATE POLICY "Users can view company council recommendations" ON public.council_recommendations
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = council_recommendations.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = council_recommendations.company_id AND cm.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert company council recommendations" ON public.council_recommendations;
CREATE POLICY "Users can insert company council recommendations" ON public.council_recommendations
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id)
    AND (
      (EXISTS ( SELECT 1 FROM companies c
                WHERE c.id = council_recommendations.company_id AND c.created_by = auth.uid()))
      OR (EXISTS ( SELECT 1 FROM company_members cm
                   WHERE cm.company_id = council_recommendations.company_id AND cm.user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can update company council recommendations" ON public.council_recommendations;
CREATE POLICY "Users can update company council recommendations" ON public.council_recommendations
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = council_recommendations.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = council_recommendations.company_id AND cm.user_id = auth.uid()))
  )
  WITH CHECK (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = council_recommendations.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = council_recommendations.company_id AND cm.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete company council recommendations" ON public.council_recommendations;
CREATE POLICY "Users can delete company council recommendations" ON public.council_recommendations
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = council_recommendations.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = council_recommendations.company_id AND cm.user_id = auth.uid()))
  );

-- -------------------------------------------------- council_review_runs

DROP POLICY IF EXISTS "Users can view company council review runs" ON public.council_review_runs;
CREATE POLICY "Users can view company council review runs" ON public.council_review_runs
  FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = council_review_runs.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = council_review_runs.company_id AND cm.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert company council review runs" ON public.council_review_runs;
CREATE POLICY "Users can insert company council review runs" ON public.council_review_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = user_id)
    AND (
      (EXISTS ( SELECT 1 FROM companies c
                WHERE c.id = council_review_runs.company_id AND c.created_by = auth.uid()))
      OR (EXISTS ( SELECT 1 FROM company_members cm
                   WHERE cm.company_id = council_review_runs.company_id AND cm.user_id = auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Users can update company council review runs" ON public.council_review_runs;
CREATE POLICY "Users can update company council review runs" ON public.council_review_runs
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = council_review_runs.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = council_review_runs.company_id AND cm.user_id = auth.uid()))
  )
  WITH CHECK (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = council_review_runs.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = council_review_runs.company_id AND cm.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can delete company council review runs" ON public.council_review_runs;
CREATE POLICY "Users can delete company council review runs" ON public.council_review_runs
  FOR DELETE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (EXISTS ( SELECT 1 FROM companies c
                 WHERE c.id = council_review_runs.company_id AND c.created_by = auth.uid()))
    OR (EXISTS ( SELECT 1 FROM company_members cm
                 WHERE cm.company_id = council_review_runs.company_id AND cm.user_id = auth.uid()))
  );
