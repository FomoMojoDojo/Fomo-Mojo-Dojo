CREATE TABLE public.odi_market_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  job_executor text NOT NULL DEFAULT '',
  chooser text NOT NULL DEFAULT '',
  jtbd text NOT NULL DEFAULT '',
  source_path text NOT NULL DEFAULT 'public_research',
  frameworks_used text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

CREATE TABLE public.odi_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tier text NOT NULL DEFAULT 'want',
  desired_outcome text NOT NULL DEFAULT '',
  journey_key text NOT NULL DEFAULT 'customer',
  step_number integer NOT NULL DEFAULT 0,
  step_label text NOT NULL DEFAULT '',
  importance integer NOT NULL DEFAULT 0,
  satisfaction integer NOT NULL DEFAULT 0,
  opportunity_score integer NOT NULL DEFAULT 0,
  service_state text NOT NULL DEFAULT 'served',
  source_path text NOT NULL DEFAULT 'public_research',
  frameworks_used text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_odi_market_definitions_company_id ON public.odi_market_definitions(company_id);
CREATE INDEX idx_odi_needs_company_id ON public.odi_needs(company_id);
CREATE INDEX idx_odi_needs_tier ON public.odi_needs(company_id, tier);

ALTER TABLE public.odi_market_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odi_needs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own odi_market_definitions"
  ON public.odi_market_definitions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own odi_market_definitions"
  ON public.odi_market_definitions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own odi_market_definitions"
  ON public.odi_market_definitions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own odi_market_definitions"
  ON public.odi_market_definitions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own odi_needs"
  ON public.odi_needs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own odi_needs"
  ON public.odi_needs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own odi_needs"
  ON public.odi_needs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own odi_needs"
  ON public.odi_needs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
