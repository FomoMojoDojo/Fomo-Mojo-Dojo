-- baseline_synthesis_parse_failures — durable capture of a claude_websearch synthesis PARSE FAILURE.
--
-- WHY (probe 2026-09-01): Sonos's stage-1 baseline threw "could not parse JSON from final text block"
-- from a STOCHASTIC malformed-JSON emission; the raw was log-only and the container logs were gone, so
-- the failure class could not be classified from a captured artifact (3/3 re-probes parsed clean). This
-- table makes that class NEVER log-dependent again: on parse-null, public-baseline persists the raw
-- final text + stop_reason + block census + attempt number, keyed to the failing ledger run row, so it
-- is SELECT-queryable afterwards. Both attempts of the one transport-level retry persist a row.
--
-- Additive only. NO FK on company_id or ledger_run_id, ON PURPOSE (mirrors long_runner_runs): this is a
-- forensic ledger that must survive company teardown + container churn; the ids are bare scoping cols,
-- never cascade edges. Written ONLY by the edge function via the service role (bypasses RLS); READ by
-- company members / admins via RLS, mirroring the long_runner_runs poll predicate.

CREATE TABLE IF NOT EXISTS public.baseline_synthesis_parse_failures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,                         -- NO FK: survives teardown + churn
  ledger_run_id   uuid,                                  -- soft ref to long_runner_runs.id (prunable; no FK)
  attempt_n       int  NOT NULL,                         -- 1 = first parse failure, 2 = post-retry failure
  model           text,
  stop_reason     text,                                  -- e.g. end_turn (NOT max_tokens — that is its own error)
  block_census    jsonb,                                 -- { total_blocks, block_types[], text_block_count, text_block_lengths[] }
  usage           jsonb,                                 -- the response's usage object (input/output tokens, tool use)
  raw_final_text  text,                                  -- the exact final text block that failed parseJsonObjectDefensive
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Forensic lookup: newest failures for a company, and by ledger run.
CREATE INDEX IF NOT EXISTS idx_bspf_company_created
  ON public.baseline_synthesis_parse_failures(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bspf_ledger_run
  ON public.baseline_synthesis_parse_failures(ledger_run_id);

ALTER TABLE public.baseline_synthesis_parse_failures ENABLE ROW LEVEL SECURITY;

-- Company-scoped SELECT for members/admins (mirrors long_runner_runs). No client write policy —
-- server-only writes go through the service role and bypass RLS.
CREATE POLICY "Members can read company baseline parse failures"
  ON public.baseline_synthesis_parse_failures FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.company_members cm
            WHERE cm.company_id = baseline_synthesis_parse_failures.company_id AND cm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.companies c
               WHERE c.id = baseline_synthesis_parse_failures.company_id AND c.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
