-- Gate B commit 2a, C2-3 + C2-3b (operator rulings R20 + R21, signed 2026-09-20): transcript files and
-- transcript records are closed to company members — admin (has_role) and the service role only.
--   R20  the three NON-admin storage.objects policies for bucket input-files gain
--        NOT EXISTS (input_files f WHERE f.file_path = objects.name AND f.is_interview); admin policies unchanged.
--   R21  interview_records SELECT for members is limited to rows with input_file_id IS NULL (the hand-entered
--        quote path, whose INSERT … RETURNING needs it); upload records (input_file_id NOT NULL) read only under
--        "Admins can manage all interview_records" and the service role. No split table, no view.
-- Non-destructive: ALTER POLICY only; nothing moves.
BEGIN;
ALTER POLICY "Users can view company input files" ON storage.objects
  USING (
    (bucket_id = 'input-files'::text)
    AND (
      ((storage.foldername(name))[1] = (auth.uid())::text)
      OR (EXISTS (
        SELECT 1 FROM public.input_files f JOIN public.inputs i ON i.id = f.input_id
        WHERE f.file_path = objects.name
          AND (i.user_id = auth.uid()
               OR (i.company_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = i.company_id AND c.created_by = auth.uid()))
               OR (i.company_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = i.company_id AND cm.user_id = auth.uid())))
      ))
    )
    AND NOT EXISTS (SELECT 1 FROM public.input_files f WHERE f.file_path = objects.name AND f.is_interview)
  );
ALTER POLICY "Users can view own input files" ON storage.objects
  USING (
    (bucket_id = 'input-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)
    AND NOT EXISTS (SELECT 1 FROM public.input_files f WHERE f.file_path = objects.name AND f.is_interview)
  );
ALTER POLICY "Users can delete own input files" ON storage.objects
  USING (
    (bucket_id = 'input-files'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)
    AND NOT EXISTS (SELECT 1 FROM public.input_files f WHERE f.file_path = objects.name AND f.is_interview)
  );
ALTER POLICY "Users can view company interview_records" ON public.interview_records
  USING (
    input_file_id IS NULL
    AND (
      (auth.uid() = created_by)
      OR (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = interview_records.company_id AND c.created_by = auth.uid()))
      OR (EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = interview_records.company_id AND cm.user_id = auth.uid()))
    )
  );
COMMENT ON POLICY "Users can view company interview_records" ON public.interview_records IS 'R21 (2026-09-20): members read hand-entered quote records only (input_file_id IS NULL); upload records are admin + service role.';
COMMIT;
