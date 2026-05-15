-- Claim State Machine: Phase 1 — Extend claims table
--
-- Adds first-class state machine attributes to the existing claims table.
-- All columns are additive (no drops, no renames).
--
-- New columns:
--   state           — the four-phase claim lifecycle state
--   action_category — populated at Flow transition (fix/improve/create)
--   need_statement  — ODI-formatted statement for need claims only
--
-- Default: existing rows land in 'outside_view'. The migration runner
-- (src/lib/claimState/migration/runner.ts) will infer correct states from
-- existing evidence and promote rows accordingly.

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'outside_view'
    CHECK (state IN ('outside_view', 'diagnose', 'focus', 'flow')),
  ADD COLUMN IF NOT EXISTS action_category text
    CHECK (action_category IS NULL OR action_category IN ('fix', 'improve', 'create')),
  ADD COLUMN IF NOT EXISTS need_statement text;

-- Index for state distribution queries (used by stateDistributionToBand shim)
CREATE INDEX IF NOT EXISTS claims_company_state_idx
  ON public.claims (company_id, state);

COMMENT ON COLUMN public.claims.state IS
  'Claim lifecycle state: outside_view → diagnose → focus → flow. '
  'Regressions are automatic (evidence withdrawal / staleness). '
  'Forward transitions require gate checks (see src/lib/claimState/gates.ts).';

COMMENT ON COLUMN public.claims.action_category IS
  'Populated when claim reaches flow state. Mirrors the linked route.category. '
  'Null for outside_view, diagnose, focus claims.';

COMMENT ON COLUMN public.claims.need_statement IS
  'ODI-formatted statement for claim_type IN (customer_outcome, unmet_need). '
  'Format: verb + object of verb + contextual clarifier. '
  'Distinct from statement (plain language); null for non-need claims.';
