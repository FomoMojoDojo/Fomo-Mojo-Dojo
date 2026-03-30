ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS public_source_filters_json jsonb;

UPDATE public.companies
SET public_source_filters_json = '{"exclude_source_types":[],"exclude_domains":[],"include_domains":[]}'::jsonb
WHERE public_source_filters_json IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN public_source_filters_json
  SET DEFAULT '{"exclude_source_types":[],"exclude_domains":[],"include_domains":[]}'::jsonb;

ALTER TABLE public.companies
  ALTER COLUMN public_source_filters_json
  SET NOT NULL;
