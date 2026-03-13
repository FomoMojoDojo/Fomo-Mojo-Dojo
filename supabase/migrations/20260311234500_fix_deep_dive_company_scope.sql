ALTER TABLE public.deep_dive_analyses
DROP CONSTRAINT IF EXISTS deep_dive_analyses_user_id_area_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS deep_dive_analyses_user_company_area_key
ON public.deep_dive_analyses(user_id, company_id, area_key);
