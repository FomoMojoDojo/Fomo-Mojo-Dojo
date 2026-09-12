-- validation_state on the Base tables (operator ruling 2, 2026-09-12).
--
-- The Output tables (job_steps, odi_needs, routes, managed_outcomes — 20260508180000) and
-- strategic_hypotheses (20260509150000) already carry validation_state with the vocabulary
-- unvalidated | directional | validated | contradicted. The three Base tables gain the SAME column,
-- same check, same default. NO writer and NO backfill: what it means to "check" a strategy statement,
-- a positioning statement or a market definition is a later ruling — every Base row honestly reads
-- 'unvalidated' until then.

ALTER TABLE public.strategy_cascades
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_state IN ('unvalidated','directional','validated','contradicted'));

ALTER TABLE public.positioning_canvases
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_state IN ('unvalidated','directional','validated','contradicted'));

ALTER TABLE public.odi_market_definitions
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_state IN ('unvalidated','directional','validated','contradicted'));

COMMENT ON COLUMN public.strategy_cascades.validation_state IS
  'unvalidated | directional | validated | contradicted — no writer yet (Base check semantics are a later ruling).';
COMMENT ON COLUMN public.positioning_canvases.validation_state IS
  'unvalidated | directional | validated | contradicted — no writer yet (Base check semantics are a later ruling).';
COMMENT ON COLUMN public.odi_market_definitions.validation_state IS
  'unvalidated | directional | validated | contradicted — no writer yet (Base check semantics are a later ruling).';
