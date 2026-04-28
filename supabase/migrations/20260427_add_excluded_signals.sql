ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS excluded_signals_json jsonb NOT NULL DEFAULT '[]';
