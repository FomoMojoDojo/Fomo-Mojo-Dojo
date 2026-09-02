-- FULL REFRESH G3 (amend) — the stale-chain sweep must NOT false-fail intentional non-terminal markers.
--
-- Two first_read_fill chain-kind ledger rows are 'running' BY DESIGN, not because a chain died:
--   • fr_open_questions   — a fire-and-forget HAND-OFF to open-questions-step (the stepper's own
--                           'open_questions' row is the truth). The stepper now writes this row back to
--                           completed/failed on its terminal (by run_id), but a planned-empty race or a
--                           stepper death can still leave it 'running'.
--   • fr_public_gap_pairs — the UNCONFIRMED 504 marker (the public-delta worker may have finished
--                           server-side; the truth is the first_read_gap_pairs integrity row). There is
--                           no async writer to close it — a re-invoke's first-fill check resolves it.
-- The original CLOSE clause flipped EVERY 'running' row past the 20-min TTL to 'failed', which would
-- brand these markers as failures. Exclude them explicitly. The steppers' OWN chain rows
-- ('open_questions', 'claim_deltas', 'market_discovery', 'full_refresh', 'public_baseline') are NOT
-- excluded — a genuinely dead chain is still closed. RE-ARM is unchanged.

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
  -- ── RE-ARM: baseline done, deltas never landed, still within the recovery window (UNCHANGED) ──
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

  -- ── CLOSE: any running row with no terminal write past the TTL is buried — EXCEPT the intentional
  --    non-terminal fill markers (fr_open_questions hand-off, fr_public_gap_pairs unconfirmed). ──
  UPDATE public.long_runner_runs
    SET status = 'failed', error_text = stale_msg, finished_at = now(), updated_at = now()
  WHERE status = 'running'
    AND started_at < now() - interval '20 minutes'
    AND run_kind NOT IN ('fr_open_questions', 'fr_public_gap_pairs');
END;
$$;
