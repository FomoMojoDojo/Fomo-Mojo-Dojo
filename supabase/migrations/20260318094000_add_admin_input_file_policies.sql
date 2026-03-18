-- Allow admin collaborators to manage company input files and related rows
-- even when the underlying inputs were created by another user.

-- input_subitems
DROP POLICY IF EXISTS "Admins can view all subitems" ON public.input_subitems;
CREATE POLICY "Admins can view all subitems"
ON public.input_subitems
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert all subitems" ON public.input_subitems;
CREATE POLICY "Admins can insert all subitems"
ON public.input_subitems
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all subitems" ON public.input_subitems;
CREATE POLICY "Admins can update all subitems"
ON public.input_subitems
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete all subitems" ON public.input_subitems;
CREATE POLICY "Admins can delete all subitems"
ON public.input_subitems
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- input_files
DROP POLICY IF EXISTS "Admins can view all files" ON public.input_files;
CREATE POLICY "Admins can view all files"
ON public.input_files
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can insert all files" ON public.input_files;
CREATE POLICY "Admins can insert all files"
ON public.input_files
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all files" ON public.input_files;
CREATE POLICY "Admins can update all files"
ON public.input_files
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete all files" ON public.input_files;
CREATE POLICY "Admins can delete all files"
ON public.input_files
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- storage.objects (bucket: input-files)
DROP POLICY IF EXISTS "Admins can upload all input files" ON storage.objects;
CREATE POLICY "Admins can upload all input files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'input-files'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins can view all input files" ON storage.objects;
CREATE POLICY "Admins can view all input files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'input-files'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins can update all input files" ON storage.objects;
CREATE POLICY "Admins can update all input files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'input-files'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'input-files'
  AND public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Admins can delete all input files" ON storage.objects;
CREATE POLICY "Admins can delete all input files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'input-files'
  AND public.has_role(auth.uid(), 'admin')
);
