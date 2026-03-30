-- Share input artifacts by company owner/member scope (not only row user_id).
-- This keeps file visibility consistent for collaborators working in the same company.

-- inputs
DROP POLICY IF EXISTS "Users can view own inputs" ON public.inputs;
DROP POLICY IF EXISTS "Users can insert own inputs" ON public.inputs;
DROP POLICY IF EXISTS "Users can update own inputs" ON public.inputs;
DROP POLICY IF EXISTS "Users can delete own inputs" ON public.inputs;
DROP POLICY IF EXISTS "Users can view company inputs" ON public.inputs;
DROP POLICY IF EXISTS "Users can insert company inputs" ON public.inputs;
DROP POLICY IF EXISTS "Users can update company inputs" ON public.inputs;
DROP POLICY IF EXISTS "Users can delete company inputs" ON public.inputs;

CREATE POLICY "Users can view company inputs"
ON public.inputs
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = inputs.company_id
        AND c.created_by = auth.uid()
    )
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = inputs.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can insert company inputs"
ON public.inputs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    company_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = inputs.company_id
        AND c.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = inputs.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update company inputs"
ON public.inputs
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = inputs.company_id
        AND c.created_by = auth.uid()
    )
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = inputs.company_id
        AND cm.user_id = auth.uid()
    )
  )
)
WITH CHECK (
  auth.uid() = user_id
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = inputs.company_id
        AND c.created_by = auth.uid()
    )
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = inputs.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete company inputs"
ON public.inputs
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.companies c
      WHERE c.id = inputs.company_id
        AND c.created_by = auth.uid()
    )
  )
  OR (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = inputs.company_id
        AND cm.user_id = auth.uid()
    )
  )
);

-- input_subitems
DROP POLICY IF EXISTS "Users can view own subitems" ON public.input_subitems;
DROP POLICY IF EXISTS "Users can insert own subitems" ON public.input_subitems;
DROP POLICY IF EXISTS "Users can update own subitems" ON public.input_subitems;
DROP POLICY IF EXISTS "Users can delete own subitems" ON public.input_subitems;
DROP POLICY IF EXISTS "Users can view company subitems" ON public.input_subitems;
DROP POLICY IF EXISTS "Users can insert company subitems" ON public.input_subitems;
DROP POLICY IF EXISTS "Users can update company subitems" ON public.input_subitems;
DROP POLICY IF EXISTS "Users can delete company subitems" ON public.input_subitems;

CREATE POLICY "Users can view company subitems"
ON public.input_subitems
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_subitems.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "Users can insert company subitems"
ON public.input_subitems
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_subitems.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "Users can update company subitems"
ON public.input_subitems
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_subitems.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_subitems.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "Users can delete company subitems"
ON public.input_subitems
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_subitems.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

-- input_files
DROP POLICY IF EXISTS "Users can view own files" ON public.input_files;
DROP POLICY IF EXISTS "Users can insert own files" ON public.input_files;
DROP POLICY IF EXISTS "Users can update own files" ON public.input_files;
DROP POLICY IF EXISTS "Users can delete own files" ON public.input_files;
DROP POLICY IF EXISTS "Users can view company files" ON public.input_files;
DROP POLICY IF EXISTS "Users can insert company files" ON public.input_files;
DROP POLICY IF EXISTS "Users can update company files" ON public.input_files;
DROP POLICY IF EXISTS "Users can delete company files" ON public.input_files;

CREATE POLICY "Users can view company files"
ON public.input_files
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_files.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "Users can insert company files"
ON public.input_files
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_files.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "Users can update company files"
ON public.input_files
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_files.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_files.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

CREATE POLICY "Users can delete company files"
ON public.input_files
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.inputs i
    WHERE i.id = input_files.input_id
      AND (
        i.user_id = auth.uid()
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.companies c
            WHERE c.id = i.company_id
              AND c.created_by = auth.uid()
          )
        )
        OR (
          i.company_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.company_members cm
            WHERE cm.company_id = i.company_id
              AND cm.user_id = auth.uid()
          )
        )
      )
  )
);

-- storage.objects (input-files bucket): allow company-scoped reads by mapping object path to input_files.file_path
DROP POLICY IF EXISTS "Users can view company input files" ON storage.objects;

CREATE POLICY "Users can view company input files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'input-files'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.input_files f
      JOIN public.inputs i ON i.id = f.input_id
      WHERE f.file_path = storage.objects.name
        AND (
          i.user_id = auth.uid()
          OR (
            i.company_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.companies c
              WHERE c.id = i.company_id
                AND c.created_by = auth.uid()
            )
          )
          OR (
            i.company_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.company_members cm
              WHERE cm.company_id = i.company_id
                AND cm.user_id = auth.uid()
            )
          )
        )
    )
  )
);
