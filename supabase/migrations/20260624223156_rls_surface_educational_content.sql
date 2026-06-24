-- RLS hardening — Group 2: surface_educational_content (global UI help text).
-- Read by useSurfaceEducation on authenticated, login-gated surfaces only (no public/
-- pre-login route renders it). The hook already filters is_published = true. No client or
-- edge writes (seed/migration-managed). Enable RLS with an authenticated published-read
-- policy + admin-manage for writes; closes the anon read/modify hole and hides unpublished
-- drafts from non-admins.

ALTER TABLE public.surface_educational_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read published educational content"
  ON public.surface_educational_content FOR SELECT
  TO authenticated
  USING (is_published = true);

CREATE POLICY "Admins can manage all surface_educational_content"
  ON public.surface_educational_content FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
