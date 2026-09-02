-- long_runner_runs.chain_state — DB-persisted manifest/cursor for a self-chaining stepper.
--
-- FIRST-FILL AUTO-CHAIN (operator ruling 2026-09-01): the market-discovery stepper self-chains ONE
-- model phase per isolate, so its plan/candidate MANIFEST and cursor must survive an isolate death —
-- a mid-chunk cut is then RESUMABLE by the next fire (DB is truth), never a stuck 'running' lie. The
-- manifest is persisted ON the market_discovery ledger row itself (this generic jsonb column), so no
-- sidecar table and no join. Shape (market_discovery):
--   { candidates: jsonb[], cursor: int, chunk_size: int, step_count: int, max_steps: int }
-- Additive + nullable: every existing ledger row and reader is unaffected (NULL = no chain state).

ALTER TABLE public.long_runner_runs
  ADD COLUMN IF NOT EXISTS chain_state jsonb;

COMMENT ON COLUMN public.long_runner_runs.chain_state IS
  'Self-chaining stepper state (e.g. market_discovery): persisted manifest + cursor + step_count + max_steps. NULL for non-stepper rows.';
