-- Route→Claim link: unique index guard
--
-- Ensures each claim_id appears at most once across routes.
-- One claim → one primary route. Null routes are excluded (partial index).
-- Must exist before the machine.ts writer populates claim_id values.

CREATE UNIQUE INDEX IF NOT EXISTS routes_claim_id_unique
  ON public.routes (claim_id)
  WHERE claim_id IS NOT NULL;
