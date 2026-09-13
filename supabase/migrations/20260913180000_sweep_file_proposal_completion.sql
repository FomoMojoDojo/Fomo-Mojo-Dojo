-- Completion sweep for file_proposals (2026-09-13).
--
-- DEFECT: dify-analyze-file starts a Dify run and then monitors it from the SAME edge worker
-- (EdgeRuntime.waitUntil, a 5 s poll). The worker has a 400 s wall clock (local CLI and paid plans;
-- 150 s on the free plan). A run that outlives it can never be persisted by the worker that started
-- it: the isolate is killed, the row stays processing_state = 'running' for ever, and the result sits
-- in Dify. Proven on proposal fbcdce0e… (Dify run 428.6 s, isolate killed at 400 s).
--
-- THIS SWEEP IS THE AUTHORITY (ruling 2). It runs from pg_cron every minute, independent of any
-- browser or worker, and reuses the function's own reconciliation door — dify-analyze-file
-- {mode:"sync", proposalId} — which fetches the run by its stored dify_workflow_run_id, persists a
-- succeeded run (persistDifyResult), marks a failed / missing run failed, and leaves a running run
-- alone. Nothing is persisted twice: persistDifyResult claims the row with an atomic
-- processing_state IN ('queued','running') → 'ready' update and runs its side effects only when it
-- won that claim.
--
-- PREDICATE (who gets a sync post):
--   • status <> 'rejected' AND processing_state IN ('queued','running')   — non-terminal
--   • reference time = coalesce(processing_started_at, created_at)
--   • reference < now() - 400 s   — the starting worker is PROVABLY dead (its wall clock has passed),
--                                   so its monitor cannot still be polling; younger rows are in-flight
--                                   and left to that monitor / the page poll
--   • reference > now() - 24 h    — beyond that the row is closed out here (below) rather than posted
--                                   for ever: a bounded sweep never re-enters what it cannot complete
--   The sync body itself decides the outcome from Dify's answer (ready / failed / still running) and
--   marks a row with NO run id failed after its own 180 s grace ("Dify run id missing").
-- CEILING: a non-terminal row older than 24 h is marked failed HERE with the monitor's existing
--   timeout wording (no new client-visible text) — written after the observation, never before.
-- Both branches are no-ops on an already-terminal row: idempotent.

CREATE OR REPLACE FUNCTION public.sweep_file_proposal_completion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec         RECORD;
  service_key TEXT := current_setting('app.service_role_key', true);
  fn_url      TEXT := current_setting('app.supabase_functions_url', true);
  posted      INT := 0;
  closed      INT := 0;
BEGIN
  -- ── CEILING: close out rows that never reached a terminal state within 24 h ──
  UPDATE public.file_proposals
     SET summary = 'Dify background monitor timed out',
         processing_state = 'failed',
         processing_error = 'Dify workflow did not reach a terminal state within the background polling window.',
         processing_completed_at = now()
   WHERE status <> 'rejected'
     AND processing_state IN ('queued', 'running')
     AND coalesce(processing_started_at, created_at) < now() - interval '24 hours';
  GET DIAGNOSTICS closed = ROW_COUNT;

  -- ── RECONCILE: post the function's own sync door for each stranded row ──
  IF service_key IS NOT NULL AND service_key <> '' AND fn_url IS NOT NULL AND fn_url <> '' THEN
    FOR rec IN
      SELECT p.id
        FROM public.file_proposals p
       WHERE p.status <> 'rejected'
         AND p.processing_state IN ('queued', 'running')
         AND coalesce(p.processing_started_at, p.created_at) < now() - interval '400 seconds'
         AND coalesce(p.processing_started_at, p.created_at) > now() - interval '24 hours'
       ORDER BY coalesce(p.processing_started_at, p.created_at)
       LIMIT 20
    LOOP
      PERFORM net.http_post(
        url     := fn_url || '/dify-analyze-file',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
        body    := jsonb_build_object('mode', 'sync', 'proposalId', rec.id::text)
      );
      posted := posted + 1;
    END LOOP;
  END IF;

  IF posted > 0 OR closed > 0 THEN
    RAISE NOTICE '[sweep-file-proposal-completion] posted % sync(s), closed % row(s) past 24h', posted, closed;
  END IF;
END;
$$;

-- Every minute (skipped gracefully where pg_cron is absent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    PERFORM cron.unschedule('sweep-file-proposal-completion') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-file-proposal-completion');
    PERFORM cron.schedule('sweep-file-proposal-completion', '* * * * *', 'SELECT public.sweep_file_proposal_completion()');
  END IF;
END $$;
