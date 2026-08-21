-- GATE (2026-08-22): the per-company First Read fill runner's ledger. One row per company per
-- step, recording started/finished, row counts before/after, and the outcome
-- (ran | skipped:<reason> | failed:<error>). Additive; the runner NEVER writes a frozen company
-- (CB1) or the empty dup (916ce5f4), so no frozen row can appear here. No trigger needed — the
-- runner self-excludes; the DB freeze trigger still independently guards every real content table.
CREATE TABLE IF NOT EXISTS public.first_read_fill_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_batch    text NOT NULL,                          -- one id per runner invocation
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  step         text NOT NULL,                          -- own_words|recurrence|deltas_public|open_questions|status_conflict|score
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  rows_before  integer,
  rows_after   integer,
  outcome      text NOT NULL                           -- ran | skipped:<reason> | failed:<error>
);
CREATE INDEX IF NOT EXISTS idx_frfr_company ON public.first_read_fill_runs(company_id);
CREATE INDEX IF NOT EXISTS idx_frfr_batch   ON public.first_read_fill_runs(run_batch);
