
-- Store AI-generated deep dive analyses per area per user
CREATE TABLE public.deep_dive_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  area_key text NOT NULL,
  why_it_matters text NOT NULL DEFAULT '',
  what_we_found text NOT NULL DEFAULT '',
  what_good_looks_like text NOT NULL DEFAULT '',
  path_forward jsonb NOT NULL DEFAULT '[]'::jsonb,
  holding_back jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, area_key)
);

ALTER TABLE public.deep_dive_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own analyses"
  ON public.deep_dive_analyses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analyses"
  ON public.deep_dive_analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analyses"
  ON public.deep_dive_analyses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
