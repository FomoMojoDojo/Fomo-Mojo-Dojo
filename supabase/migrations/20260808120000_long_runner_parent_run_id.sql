-- FULL REFRESH G2 — link chained runs.
--
-- A parent run_kind='full_refresh' row owns child stage rows (the public_baseline row and the
-- claim_deltas row). parent_run_id points a child at its parent; NULL for standalone runs and
-- for the parent itself. Self-referential, ON DELETE SET NULL so pruning a parent never erases
-- a child's own history. Back-compat: every existing row stays NULL (no chain).

ALTER TABLE public.long_runner_runs
  ADD COLUMN IF NOT EXISTS parent_run_id uuid
  REFERENCES public.long_runner_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_long_runner_runs_parent_run_id
  ON public.long_runner_runs (parent_run_id)
  WHERE parent_run_id IS NOT NULL;
