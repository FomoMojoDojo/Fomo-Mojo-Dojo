-- Claim State Machine: Phase 5 — strategic_decisions.linked_claim_id
--
-- Links a committed decision to the flow-state claim it represents.
-- Decision §5.5 Option A: keep strategic_decisions unchanged for v1;
-- add this FK so the two models are queryably connected.
--
-- When a claim transitions to flow state, the machine engine will either:
--   a) Link an existing 'committed' strategic_decision via this field, or
--   b) Create a new 'committed' strategic_decision and link it here.
--
-- Sets up v2 consolidation where strategic_decisions is absorbed into
-- the claim state machine as a materialized specialization.

ALTER TABLE public.strategic_decisions
  ADD COLUMN IF NOT EXISTS linked_claim_id uuid
    REFERENCES public.claims(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS strategic_decisions_linked_claim_id_idx
  ON public.strategic_decisions (linked_claim_id)
  WHERE linked_claim_id IS NOT NULL;

COMMENT ON COLUMN public.strategic_decisions.linked_claim_id IS
  'Optional FK to the flow-state claim this decision represents. '
  'Populated by machine.ts when a claim reaches flow state. '
  'Null for decisions created before the claim state machine migration.';
