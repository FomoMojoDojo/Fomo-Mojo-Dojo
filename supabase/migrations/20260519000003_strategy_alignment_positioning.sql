-- A68: Strategy-alignment evaluation — positioning_canvases columns
-- Mirror A67's routes columns exactly.

ALTER TABLE public.positioning_canvases
  ADD COLUMN IF NOT EXISTS strategy_alignment TEXT NULL;

ALTER TABLE public.positioning_canvases
  DROP CONSTRAINT IF EXISTS positioning_canvases_strategy_alignment_check;

ALTER TABLE public.positioning_canvases
  ADD CONSTRAINT positioning_canvases_strategy_alignment_check
  CHECK (strategy_alignment IN ('aligned', 'off_strategy', 'unknown'));

ALTER TABLE public.positioning_canvases
  ADD COLUMN IF NOT EXISTS strategy_alignment_reason TEXT NULL;

ALTER TABLE public.positioning_canvases
  ADD COLUMN IF NOT EXISTS strategy_alignment_evaluated_at TIMESTAMPTZ NULL;
