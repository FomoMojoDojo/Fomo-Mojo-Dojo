-- Routes relevance_state: mirrors signals pattern from A65.
-- Default 'active' so all existing rows remain queryable without a data migration.
-- Deprioritized routes are excluded from live analysis but retained for audit.

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS relevance_state TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS routes_relevance_state_check;

ALTER TABLE public.routes
  ADD CONSTRAINT routes_relevance_state_check
  CHECK (relevance_state IN ('active', 'deprioritized'));

CREATE INDEX IF NOT EXISTS routes_company_relevance_idx
  ON public.routes (company_id, relevance_state);
