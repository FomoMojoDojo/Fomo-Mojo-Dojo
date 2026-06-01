-- A67: Strategy-alignment evaluation — route columns
-- strategy_alignment: classified at evaluation time, cached on row
-- strategy_alignment_reason: 1-2 sentence LLM-generated rationale
-- strategy_alignment_evaluated_at: when the last evaluation ran

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS strategy_alignment TEXT NULL;

ALTER TABLE public.routes
  DROP CONSTRAINT IF EXISTS routes_strategy_alignment_check;

ALTER TABLE public.routes
  ADD CONSTRAINT routes_strategy_alignment_check
  CHECK (strategy_alignment IN ('aligned', 'off_strategy', 'unknown'));

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS strategy_alignment_reason TEXT NULL;

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS strategy_alignment_evaluated_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS routes_company_alignment_idx
  ON public.routes (company_id, strategy_alignment);
