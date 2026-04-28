ALTER TABLE public.opportunities
ADD COLUMN IF NOT EXISTS parent_opportunity_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'opportunities_parent_opportunity_id_fkey'
      AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
    ADD CONSTRAINT opportunities_parent_opportunity_id_fkey
    FOREIGN KEY (parent_opportunity_id)
    REFERENCES public.opportunities(id)
    ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'opportunities_parent_not_self'
      AND conrelid = 'public.opportunities'::regclass
  ) THEN
    ALTER TABLE public.opportunities
    ADD CONSTRAINT opportunities_parent_not_self
    CHECK (parent_opportunity_id IS NULL OR parent_opportunity_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunities_company_tree
  ON public.opportunities(company_id, managed_outcome_id, parent_opportunity_id, opportunity_score DESC);
