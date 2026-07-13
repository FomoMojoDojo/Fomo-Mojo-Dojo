-- condition_removals — app-level audit for route conditions removed by a genuine
-- re-roll supersede (content-identity changed), plus the legs that orphaned as a result.
--
-- WHY app-level and not a trigger (the CH-0 inversion): a route condition is a jsonb
-- array element inside routes.what_would_have_to_be_true, removed via a routes UPDATE —
-- there is NO row DELETE event to hang a BEFORE DELETE trigger on (unlike tests, which
-- are real rows → CH-0's tests_delete_audit trigger). And the removal must be keyed by
-- content-identity, which is the single contentIdentity authority (TS sha256(normalize)) —
-- re-implementing that hash in SQL is forbidden (Postgres \s diverges on Unicode). So the
-- audit is written by generate-route-conditions' reconcile, using the SAME contentIdentity.
--
-- NO foreign key on company_id OR route_id, ON PURPOSE (mirrors test_removals): the audit
-- must SURVIVE company + route teardown and container churn. Both are bare scoping columns,
-- never cascade edges. A re-rolled-away condition leaves a permanent trace here even after
-- the route (or the whole company) is gone.
--
-- Written ONLY by the edge reconcile via the service role (bypasses RLS); READ company-
-- scoped by the client (residual/orphan surfaces), mirroring public_baseline_runs.

CREATE TABLE IF NOT EXISTS public.condition_removals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL,                 -- NO FK: survives teardown + churn
  route_id            uuid NOT NULL,                 -- NO FK: survives route teardown
  condition_identity  text NOT NULL,                 -- contentIdentity(removed condition text)
  condition_text      text NOT NULL,                 -- verbatim snapshot of the removed condition
  reason              text NOT NULL,                 -- e.g. 'condition_rerolled'
  actor               text NOT NULL,                 -- e.g. 'generate-route-conditions'
  affected_leg_ids    uuid[] NOT NULL DEFAULT '{}',  -- legs orphaned/declared by this supersede
  removed_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_condition_removals_company
  ON public.condition_removals(company_id, removed_at DESC);
CREATE INDEX IF NOT EXISTS idx_condition_removals_route
  ON public.condition_removals(route_id, removed_at DESC);

ALTER TABLE public.condition_removals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read company condition_removals"
  ON public.condition_removals FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = condition_removals.company_id AND cm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.companies c
               WHERE c.id = condition_removals.company_id AND c.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
