-- RLS hardening — Group 1: server-only tables.
-- step_perspective_verdicts (LLM judge-verdict cache) and competitor_discovery_runs
-- (competitor research results) are written ONLY by edge functions using the service
-- role, which bypasses RLS. No client code reads or writes either table. Enabling RLS
-- with only an admin-manage policy closes the anon/authenticated hole (anon now matches
-- no policy -> denied) without affecting the service-role writes.

ALTER TABLE public.step_perspective_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitor_discovery_runs  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all step_perspective_verdicts"
  ON public.step_perspective_verdicts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all competitor_discovery_runs"
  ON public.competitor_discovery_runs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
