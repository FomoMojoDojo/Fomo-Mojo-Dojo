-- long_runner_runs — self-owned durable run-status ledger for long-running edge
-- functions whose wall-clock can exceed the 150s edge-isolate response wall.
--
-- WHY: public-baseline is atomic (one discovery sweep, one synthesis call, one
-- terminal insert). When the 150s wall cuts the browser, the isolate finishes
-- behind the cut and lands its write — but the client had no durable status row
-- to distinguish "succeeded behind the cut" from "timed out / failed" (the
-- lying-spinner gap, proven twice via the SIAA/Wasabi births). This table is that
-- row: written `running` at invocation entry, updated `completed`/`failed` at
-- exit, on EVERY caller (the 5 direct client callers AND the run-agent-flow /
-- run-public-research wrappers) — so the client polls truth instead of the spinner.
--
-- NO foreign key on company_id, ON PURPOSE (mirrors test_removals / claim_removals):
-- the run-status ledger must SURVIVE company teardown + container churn. company_id
-- is a bare scoping column, never a cascade edge. Written ONLY by edge functions via
-- the service role (bypasses RLS); READ by the client poll, company-scoped via RLS.
--
-- run_kind is a discriminator: 'public_baseline' today; 'route_conditions' (piece #3,
-- the chunked conditions loop) will reuse this same table with target_count/done_count
-- tracking chunk progress. No new table per long-runner.

CREATE TABLE IF NOT EXISTS public.long_runner_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_kind      text NOT NULL,
  company_id    uuid NOT NULL,                          -- NO FK: survives teardown + churn
  status        text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed')),
  target_count  int  NOT NULL DEFAULT 1,
  done_count    int  NOT NULL DEFAULT 0,
  request_id    text,
  error_text    text,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Poll lookup: newest row for a company+kind.
CREATE INDEX IF NOT EXISTS idx_long_runner_runs_company_kind_started
  ON public.long_runner_runs(company_id, run_kind, started_at DESC);

-- RLS: company-scoped SELECT for the client poll, mirroring public_baseline_runs'
-- predicate (no user_id column here). No client write policy — server-only writes go
-- through the service role and are unaffected by RLS.
ALTER TABLE public.long_runner_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read company long_runner_runs"
  ON public.long_runner_runs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = long_runner_runs.company_id AND cm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.companies c
               WHERE c.id = long_runner_runs.company_id AND c.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
