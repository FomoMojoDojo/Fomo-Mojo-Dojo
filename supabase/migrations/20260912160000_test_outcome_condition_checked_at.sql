-- Test outcome + condition checked_at (operator rulings 1–2, 2026-09-12): the two signals that make
-- validation_state = 'contradicted' producible in production.
--
-- 1. tests.outcome — a STRUCTURED outcome beside the free-text write-up. tests.result keeps its meaning
--    (the human write-up) and is never parsed. Nullable, default null: no test has an outcome until one
--    is recorded. No backfill.
--
-- 2. Route conditions live as elements of routes.what_would_have_to_be_true (jsonb array, WrapCond).
--    checked_at is recorded ON THE ELEMENT, not as a column: a condition has no row and no stable
--    identity of its own (re-rolls reconcile by text), so a per-condition timestamp can only live beside
--    its own satisfied_flag. Semantics — checked_at null ⇒ never checked (satisfied_flag meaningless);
--    checked_at set + satisfied_flag true ⇒ checked and satisfied; checked_at set + satisfied_flag false
--    ⇒ CHECKED AND NOT SATISFIED. No DDL is needed for the element; the column comment records the
--    contract so the shape is discoverable from the schema. No writer in this brief.

ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS outcome text
    CHECK (outcome IS NULL OR outcome IN ('passed','failed','inconclusive'));

COMMENT ON COLUMN public.tests.outcome IS
  'passed | failed | inconclusive | NULL (not recorded). Structured outcome; tests.result stays the free-text write-up and is never parsed.';

COMMENT ON COLUMN public.routes.what_would_have_to_be_true IS
  'jsonb array of WrapCond {condition, satisfied_flag, evidence_refs?, checked_at?, ...}. checked_at (ISO timestamp) on an element: null ⇒ never checked; set + satisfied_flag=true ⇒ checked and satisfied; set + satisfied_flag=false ⇒ checked and NOT satisfied.';
