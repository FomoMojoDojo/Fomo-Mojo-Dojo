
-- Drop overly permissive policies
DROP POLICY "Authenticated users can insert pages" ON public.methodology_pages;
DROP POLICY "Authenticated users can update pages" ON public.methodology_pages;
DROP POLICY "Authenticated users can delete pages" ON public.methodology_pages;
DROP POLICY "Authenticated users can view all pages" ON public.methodology_pages;

-- Replace with admin-only policies
CREATE POLICY "Admins can insert pages"
ON public.methodology_pages FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update pages"
ON public.methodology_pages FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete pages"
ON public.methodology_pages FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can view all pages"
ON public.methodology_pages FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
