
-- Create job_steps table for company-specific journey steps
CREATE TABLE public.job_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  journey_key TEXT NOT NULL DEFAULT 'customer',
  journey_title TEXT NOT NULL DEFAULT '',
  journey_subtitle TEXT NOT NULL DEFAULT '',
  step_number INTEGER NOT NULL DEFAULT 1,
  step_label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  designed BOOLEAN NOT NULL DEFAULT false,
  has_gap BOOLEAN NOT NULL DEFAULT false,
  gap_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.job_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own job steps"
  ON public.job_steps FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own job steps"
  ON public.job_steps FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own job steps"
  ON public.job_steps FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own job steps"
  ON public.job_steps FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all job steps"
  ON public.job_steps FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all job steps"
  ON public.job_steps FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
