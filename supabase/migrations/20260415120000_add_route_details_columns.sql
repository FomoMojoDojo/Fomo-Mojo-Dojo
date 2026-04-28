ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS steps_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS why_this_matters_json jsonb NOT NULL DEFAULT '[]'::jsonb;
