-- RLS hardening — Group 4: route_decision_events (append-only route-decision audit log).
-- Written by the BROWSER (authenticated client) via insertRouteDecisionEvent on every route
-- select/clear; never read by client or edge (write-only from the app). Enabling RLS with no
-- policy would silently break that logging, so add a company-scoped INSERT policy mirroring
-- routes' predicate (member / created_by / admin; no user_id column here). Add an admin-only
-- SELECT for ops; no general SELECT (nothing reads it today). No UPDATE/DELETE (append-only).

ALTER TABLE public.route_decision_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can insert company route_decision_events"
  ON public.route_decision_events FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = route_decision_events.company_id AND cm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.companies c
               WHERE c.id = route_decision_events.company_id AND c.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can read route_decision_events"
  ON public.route_decision_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
