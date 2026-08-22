-- GATE (2026-08-22): a client-facing "what differs" conflict explanation per DIVERGENT pair. The
-- existing judge_reason explains the VERDICT ("public statement contradicts declared mission of X") —
-- circular, it names that a conflict exists, not what each side claims. This additive field stores a
-- freshly generated one-liner grounded to the pair's two texts (declared claim + contra excerpt),
-- judged for grounding before it is stored. judge_reason is LEFT INTACT (not overwritten). No backfill
-- (all rows start NULL); the generator writes only accepted, grounded explanations. CB1 (58b2b15b) is
-- never written — the generator excludes it AND the enforce_company_freeze trigger on claim_deltas
-- refuses any write whose company is frozen.
ALTER TABLE public.claim_deltas
  ADD COLUMN IF NOT EXISTS conflict_explanation text,
  ADD COLUMN IF NOT EXISTS conflict_explanation_model text,
  ADD COLUMN IF NOT EXISTS conflict_explanation_grounded boolean;
