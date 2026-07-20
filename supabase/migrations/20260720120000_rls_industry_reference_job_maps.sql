-- RLS hardening — industry_reference_job_maps (FD-1 industry-standard job-map
-- reference library). Closes a gap surfaced by the EOV-1 design gate.
--
-- The FD-1 table (20260717060000) shipped with NO row level security at all: no
-- ENABLE, no policies. It postdates the 2026-06-24 RLS hardening batch that
-- covered its published-reference siblings, so it was never swept up. With
-- Supabase's default grants that left unpublished operator drafts readable and
-- the table writable by any authenticated client.
--
-- Mirrors 20260624223156_rls_surface_educational_content.sql exactly — the same
-- published-reference read shape: authenticated may read ONLY signed
-- (is_published = true) rows; all writes are admin-only via public.has_role.
-- Writes today come from the FD-2 generator on the service role, which bypasses
-- RLS and is unaffected.
--
-- Reference content is company-agnostic by construction (no company_id), so
-- there is deliberately no company-membership clause here: the row set is the
-- same for every authenticated reader. That is the honesty guarantee of the
-- standards register, enforced at the database.

ALTER TABLE public.industry_reference_job_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read published reference job maps"
  ON public.industry_reference_job_maps FOR SELECT
  TO authenticated
  USING (is_published = true);

CREATE POLICY "Admins can manage all industry_reference_job_maps"
  ON public.industry_reference_job_maps FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
