-- RLS hardening — Group 3: public_baseline_runs (public baseline research; live-read).
-- Written ONLY by edge functions via the service role (bypasses RLS). READ by the client
-- (usePublicBaseline + a realtime subscription, useStrategicDelta, JobSteps), always scoped
-- to the user's company. Enable RLS with a company-scoped SELECT policy mirroring routes'
-- predicate (no user_id column here). No client write policy — server-only writes are
-- unaffected by RLS. Realtime respects RLS, so the SELECT policy keeps the subscription working.

ALTER TABLE public.public_baseline_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read company public_baseline_runs"
  ON public.public_baseline_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = public_baseline_runs.company_id AND cm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.companies c
               WHERE c.id = public_baseline_runs.company_id AND c.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
