-- Phase 26: extend strategy_assumptions with lifecycle statuses and relationship fields.
-- All changes are additive — existing rows retain their current status and get null/empty defaults.

BEGIN;

-- 1. Widen the status constraint to include Phase 26 lifecycle values.
ALTER TABLE public.strategy_assumptions
  DROP CONSTRAINT IF EXISTS strategy_assumptions_status_check;

ALTER TABLE public.strategy_assumptions
  ADD CONSTRAINT strategy_assumptions_status_check
  CHECK (status IN (
    -- Phase 23 originals (kept for backwards compatibility)
    'untested', 'validating', 'validated', 'invalidated',
    -- Phase 26 additions
    'emerging', 'directional', 'strengthening', 'unstable', 'contradicted', 'reframed', 'retired'
  ));

-- 2. Add relationship and reframing fields (all additive).
ALTER TABLE public.strategy_assumptions
  ADD COLUMN IF NOT EXISTS prior_statement         text,
  ADD COLUMN IF NOT EXISTS reframed_from_id        uuid REFERENCES public.strategy_assumptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invalidated_reason      text,
  ADD COLUMN IF NOT EXISTS supporting_evidence     jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contradicting_evidence  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_tension_ids     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS affected_route_ids      text[] NOT NULL DEFAULT '{}';

COMMIT;
