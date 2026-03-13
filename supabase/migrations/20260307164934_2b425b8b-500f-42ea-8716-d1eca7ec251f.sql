CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  outcome text NOT NULL DEFAULT '',
  step_number integer NOT NULL DEFAULT 0,
  step_label text NOT NULL DEFAULT '',
  importance integer NOT NULL DEFAULT 5,
  satisfaction integer NOT NULL DEFAULT 5,
  opportunity_score numeric NOT NULL DEFAULT 0,
  priority_tier text NOT NULL DEFAULT 'monitor',
  journey_key text NOT NULL DEFAULT 'customer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all opportunities" ON public.opportunities FOR ALL
  TO authenticated USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own opportunities" ON public.opportunities FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own opportunities" ON public.opportunities FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own opportunities" ON public.opportunities FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own opportunities" ON public.opportunities FOR DELETE
  TO authenticated USING (auth.uid() = user_id);