
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text DEFAULT '',
  quarter text NOT NULL DEFAULT 'Q1 2026',
  archetype text NOT NULL DEFAULT 'Growth',
  tier integer NOT NULL DEFAULT 2,
  last_updated text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with companies"
ON public.companies FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
