-- GATE (Commit B, 2026-08-21): the outside Mojo Score persists the EXACT input set it scored.
-- Each snapshot records, per micro-move, the ids it counted (signal ids for record_strength /
-- coverage / freshness; delta ids for echo_integrity / differentiation; the distinct source_type
-- values coverage saw). Birth-stamped with the snapshot row, never updated. Additive, idempotent;
-- ADD COLUMN is catalog-only → CB1 (frozen) rows untouched (NULL ledger).
ALTER TABLE public.mojo_scores
  ADD COLUMN IF NOT EXISTS input_ledger jsonb;
