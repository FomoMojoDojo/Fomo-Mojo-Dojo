ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS selected_route_id uuid,
  ADD COLUMN IF NOT EXISTS selected_route_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_route_updated_at timestamptz;
