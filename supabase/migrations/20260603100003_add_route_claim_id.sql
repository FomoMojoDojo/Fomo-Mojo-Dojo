-- Claim State Machine: Phase 4 — routes.claim_id
--
-- Links each route to its backing flow-state claim.
-- One route = one primary claim. Nullable: routes without a corresponding
-- claim continue to work unchanged (the routes page does not read this field).
--
-- Populated by the migration runner and by the state machine engine when
-- a claim transitions to flow state.

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS claim_id uuid
    REFERENCES public.claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS routes_claim_id_idx
  ON public.routes (claim_id)
  WHERE claim_id IS NOT NULL;

COMMENT ON COLUMN public.routes.claim_id IS
  'Optional FK to the claims row that backs this route. '
  'A flow-state claim is expressed as a route; this field closes the loop. '
  'Null for routes that predate the claim state machine migration.';
