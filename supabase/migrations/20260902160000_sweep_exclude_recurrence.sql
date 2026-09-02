-- FULL REFRESH G3 (amend 2) — extend the stale-chain sweep's CLOSE exclusion for signal-recurrence.
--
-- The recurrence fill kind adds long-running run_kinds that legitimately exceed the 20-min CLOSE TTL:
--   • recurrence_step      — the self-chaining recurrence stepper's chain row. A full pair corpus
--                            (~1865 for Geniant) runs ~78 min to hours; the row's started_at is fixed
--                            at chain start, so the sweep would false-fail an in-progress run.
--   • signal_recurrence    — the generate-signal-recurrence worker's own progress ledger, which spans
--                            the same run (its finalize closes it; the sweep must not pre-empt that).
--   • fr_signal_recurrence — the fill's fire-and-forget HAND-OFF marker (non-terminal 'running' by
--                            design; the stepper writes it back on terminal).
-- Terminal discipline for these lives in the stepper (max-steps + no-progress) and in banked verdicts
-- (a crash resumes zero-re-judge on the next fire); a crashed chain is recovered by a manual re-fire,
-- never by a false STALE close. Genuine dead chains of OTHER run_kinds are still closed.

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
  --    non-terminal fill markers AND the legitimately-long recurrence chains. ──
  UPDATE public.long_runner_runs
    SET status = 'failed', error_text = stale_msg, finished_at = now(), updated_at = now()
  WHERE status = 'running'
    AND started_at < now() - interval '20 minutes'
    AND run_kind NOT IN (
      'fr_open_questions', 'fr_public_gap_pairs',           -- handoff / unconfirmed markers
      'fr_signal_recurrence', 'recurrence_step', 'signal_recurrence'  -- recurrence hand-off + long chains
    );
END;
$$;
