-- FULL REFRESH G3 (amend 3) — extend the stale-chain sweep's CLOSE exclusion for market discovery.
--
-- Market discovery now HOLDS non-terminal on a slow-but-alive worker (the gap_pairs 504 class, brought
-- to discovery). When a chunk's fetch returns not-ok, the stepper confirm-polls the worker's persisted
-- writes; if nothing has landed within the window it leaves the market_discovery ledger row 'running'
-- with an 'unconfirmed:' note (NOT failed — the local 70b judge may still be writing) and does NOT
-- self-fire. A later re-fire (the fill's manifest predicate, or the operator's manual control) resumes
-- from the persisted cursor, idempotent by content identity.
--
-- That non-terminal 'running' row would be false-failed by the 20-min CLOSE. Exclude it:
--   • market_discovery — the self-chaining discovery stepper's chain row. It legitimately outlives the
--                        20-min TTL: a full manifest is minutes-to-tens-of-minutes on local llama3:70b,
--                        and an unconfirmed HOLD parks it 'running' until a resume. Terminal discipline
--                        lives in the stepper (max-steps + no-progress→unconfirmed) and in banked
--                        verdicts (a crash resumes zero-re-judge); recovery is a re-fire, never a STALE
--                        close. Genuine dead chains of OTHER run_kinds are still closed.
--
-- Guard (proven live, STEP 4): a stale 'running' market_discovery row >20 min SURVIVES the sweep, while
-- a stale 'running' row of a NON-excluded kind (>20 min) is still closed to 'failed'.

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
  --    non-terminal fill markers, the legitimately-long recurrence chains, AND market discovery (which
  --    holds 'running' on a maybe-alive worker / spans the TTL by design). ──
  UPDATE public.long_runner_runs
    SET status = 'failed', error_text = stale_msg, finished_at = now(), updated_at = now()
  WHERE status = 'running'
    AND started_at < now() - interval '20 minutes'
    AND run_kind NOT IN (
      'fr_open_questions', 'fr_public_gap_pairs',           -- handoff / unconfirmed markers
      'fr_signal_recurrence', 'recurrence_step', 'signal_recurrence',  -- recurrence hand-off + long chains
      'market_discovery'                                    -- self-chaining + unconfirmed HOLD (maybe-alive worker)
    );
END;
$$;
