-- A55: Create a dedicated service-role identity in auth.users.
-- UUID: 1a27cf29-554a-46e9-bab8-0e238f9dc088 (stable — used as SERVICE_ROLE_UUID in edge functions)
-- Email: system@mojomap.internal (non-deliverable internal identity)
-- This row satisfies the inputs.user_id FK to auth.users for system-generated writes.
-- ON CONFLICT DO NOTHING makes this safe to rerun.
INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  email_confirmed_at,
  raw_user_meta_data,
  raw_app_meta_data,
  created_at,
  updated_at
)
VALUES (
  '1a27cf29-554a-46e9-bab8-0e238f9dc088',
  'service_role',
  'service_role',
  'system@mojomap.internal',
  NOW(),
  '{"display_name": "MojoMap System", "is_service_account": true}'::jsonb,
  '{"provider": "service_role", "providers": ["service_role"]}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
