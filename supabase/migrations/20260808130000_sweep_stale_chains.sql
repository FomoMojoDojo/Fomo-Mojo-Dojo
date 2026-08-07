-- FULL REFRESH G3 — stale-chain sweep (pg_cron + pg_net).
--
-- Shape (c) is headless: a full_refresh chain that dies with no browser watching (an isolate
-- crash before self-firing, or a failed delta-trigger fetch) leaves long_runner_runs rows
-- 'running' forever. This sweep is what NOTICES that. Every ~5 min it:
--   RE-ARM  — a still-recoverable chain (parent running, baseline child COMPLETED, but the delta
--             stage never started / failed) is re-fired via refresh-deltas-step. Idempotent:
--             the stepper's plan skips banked claims, so a re-arm only finishes what's left.
--   CLOSE   — a chain with no terminal write past the TTL is buried: its running rows flip to
--             'failed' with the operator-signed STALE_CHAIN_ERROR. This is also the ultimate
--             bound for a pathological non-progressing loop.
-- The two windows do not overlap (re-arm 3–20 min, close >20 min), so a row is never both
-- re-armed and closed in the same pass.
--
-- One-time setup (already documented for the other scheduled jobs):
--   ALTER DATABASE postgres SET app.service_role_key       = '<service role key>';
--   ALTER DATABASE postgres SET app.supabase_functions_url = '<functions base url>';
-- Local dev: http://host.docker.internal:54321/functions/v1

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.sweep_stale_chains()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec         RECORD;
  service_key TEXT := current_setting('app.service_role_key', true);
  fn_url      TEXT := current_setting('app.supabase_functions_url', true);
  stale_msg   CONSTANT TEXT := 'This refresh stalled partway and was closed out automatically. It''s safe to run again.';
BEGIN
  -- ── RE-ARM: baseline done, deltas never landed, still within the recovery window ──────────
  IF service_key IS NOT NULL AND service_key <> '' AND fn_url IS NOT NULL AND fn_url <> '' THEN
    FOR rec IN
      SELECT p.id AS parent_id, p.company_id
      FROM public.long_runner_runs p
      WHERE p.run_kind = 'full_refresh'
        AND p.status = 'running'
        AND p.started_at < now() - interval '3 minutes'
        AND p.started_at > now() - interval '20 minutes'
        AND EXISTS (
          SELECT 1 FROM public.long_runner_runs b
          WHERE b.parent_run_id = p.id AND b.run_kind = 'public_baseline' AND b.status = 'completed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.long_runner_runs d
          WHERE d.parent_run_id = p.id AND d.run_kind = 'claim_deltas'
            AND d.status IN ('running', 'completed')
        )
    LOOP
      PERFORM net.http_post(
        url     := fn_url || '/refresh-deltas-step',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
        body    := jsonb_build_object('company_id', rec.company_id::text, 'parent_run_id', rec.parent_id::text)::text
      );
      RAISE NOTICE '[sweep] re-armed deltas for parent %', rec.parent_id;
    END LOOP;
  END IF;

  -- ── CLOSE: any running row with no terminal write past the TTL is buried (signed message) ─
  UPDATE public.long_runner_runs
    SET status = 'failed', error_text = stale_msg, finished_at = now(), updated_at = now()
  WHERE status = 'running' AND started_at < now() - interval '20 minutes';
END;
$$;

-- Schedule every 5 minutes (skipped gracefully where pg_cron is absent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron') THEN
    PERFORM cron.unschedule('sweep-stale-chains') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sweep-stale-chains');
    PERFORM cron.schedule('sweep-stale-chains', '*/5 * * * *', 'SELECT public.sweep_stale_chains()');
  END IF;
END $$;
