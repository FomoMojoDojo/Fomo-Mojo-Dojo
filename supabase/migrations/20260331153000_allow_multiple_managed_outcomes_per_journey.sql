-- Allow multiple desired outcomes per journey so teams can compare and select alternatives.
ALTER TABLE public.managed_outcomes
  DROP CONSTRAINT IF EXISTS managed_outcomes_company_id_journey_key_key;

CREATE INDEX IF NOT EXISTS idx_managed_outcomes_company_journey_created
  ON public.managed_outcomes(company_id, journey_key, created_at DESC);
