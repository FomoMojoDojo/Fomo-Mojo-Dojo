-- Allow authenticated users to resolve teammate display names for collaborative run/status UI.
DROP POLICY IF EXISTS "Authenticated users can view profile names" ON public.profiles;
CREATE POLICY "Authenticated users can view profile names"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Backfill profile rows for existing auth users.
INSERT INTO public.profiles (user_id, display_name)
SELECT
  u.id,
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(split_part(u.email, '@', 1)), ''),
    'Team member'
  ) AS display_name
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.user_id IS NULL;

-- Normalize blank profile names.
UPDATE public.profiles p
SET display_name = COALESCE(
  NULLIF(trim(u.raw_user_meta_data->>'display_name'), ''),
  NULLIF(trim(split_part(u.email, '@', 1)), ''),
  'Team member'
)
FROM auth.users u
WHERE u.id = p.user_id
  AND COALESCE(trim(p.display_name), '') = '';
