-- H2 (2026-09-11) — RE-ARM (1) never doubles a deltas chain already running for the company.
--
-- Body is the LIVE function (pg_get_functiondef, md5 44ffe2543f68685c2bba89d4fdcaeb4e before this
-- migration, md5 914e9e764e30c7e919c671dc1a454c51 after) with ONE added NOT EXISTS clause in RE-ARM (1); everything else byte-identical.
-- Proven (rolled back): parented completed child → no post; unparented running child → no post
-- (RED with the new clause removed → one post); no child → one post.
CREATE OR REPLACE FUNCTION public.sweep_stale_chains()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec         RECORD;
  service_key TEXT := current_setting('app.service_role_key', true);
  fn_url      TEXT := current_setting('app.supabase_functions_url', true);
  stale_msg   CONSTANT TEXT := 'This refresh stalled partway and was closed out automatically. It''s safe to run again.';
BEGIN
  -- ── RE-ARM (1): baseline done, deltas never landed, still within the recovery window (UNCHANGED) ──
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
        -- H2 (2026-09-11): PARENT-BLIND for RUNNING rows. refresh-deltas-step attaches by company +
        -- kind + running (its find-or-create is parent-blind), so a re-arm fired while an UNPARENTED
        -- deltas chain is running for the company (the UI path, useDeltaStepRun, sends no parent)
        -- would step that chain from a second isolate — two interleaved self-firing loops on one
        -- chain. No duplicate rows (UNIQUE company_id, content_identity, pairing_kind), but wasted
        -- judge calls and chunk collisions counted against the livelock guard. A chain already running
        -- for the company IS the deltas work this parent is waiting for; never double it.
        AND NOT EXISTS (
          SELECT 1 FROM public.long_runner_runs d2
          WHERE d2.company_id = p.company_id AND d2.run_kind = 'claim_deltas' AND d2.status = 'running'
        )
    LOOP
      PERFORM net.http_post(
        url     := fn_url || '/refresh-deltas-step',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
        -- Gate 1c TYPE FIX (unavoidable, flagged): net.http_post takes `body jsonb`; the `::text` cast
        -- this line carried since 20260808130000 raises
        --   function net.http_post(url => text, headers => jsonb, body => text) does not exist
        -- and, because both RE-ARM branches and the CLOSE share one function, that abort would take
        -- the whole sweep down with it. It never surfaced only because the GUCs were unset and this
        -- branch had never executed — 0 posts across 9,745 cron runs. Gate 1c provisions the GUCs, so
        -- the dormant bug becomes live; correcting the cast is the minimum that keeps the CLOSE branch
        -- working. Behaviour is otherwise UNCHANGED. Proving RE-ARM (1) live remains its own item.
        body    := jsonb_build_object('company_id', rec.company_id::text, 'parent_run_id', rec.parent_id::text)
      );
      RAISE NOTICE '[sweep] re-armed deltas for parent %', rec.parent_id;
    END LOOP;

    -- ── RE-ARM (2): a HELD market_discovery run. NOTHING else resumes one — the stepper deliberately
    --    does not self-fire on a hold, the CLOSE branch below excludes market_discovery, and pg_cron
    --    runs only this function. Before this branch a held run waited unbounded for an operator.
    --
    --    The lock is STRUCTURAL, never temporal, mirroring RE-ARM (1)'s use of the child row's own
    --    existence. NO CLOCK CAN TELL LIVE FROM HELD here: a healthy run has been observed silent for
    --    40 minutes (Lumio, 2026-09-03, 53-min run), so any staleness interval short enough to be
    --    useful would re-fire a live chunk. The 'unconfirmed:' note is written ONLY by the stepper's
    --    markUnconfirmed and is CLEARED by the adopt path when the resumed fire claims the row, so it
    --    marks exactly one re-arm per hold.
    --
    --    Two belts behind it, because a re-armed loop must terminate on its own:
    --      • step_count < max_steps — the ledger ceiling, read from the same jsonb;
    --      • the stepper's NO-PROGRESS guard (Gate 1c) closes the run failed after HOLD_LIMIT=3
    --        consecutive holds at the SAME cursor. The hold path does not increment step_count, so
    --        that guard — not this clause — is what actually bounds a deterministically-dying chunk.
    --    Frozen companies are never posted for: the endpoint refuses them at its first door anyway,
    --    but a sweep should not spend a request finding that out.
    FOR rec IN
      SELECT m.id AS run_id, m.company_id
      FROM public.long_runner_runs m
      JOIN public.companies c ON c.id = m.company_id
      WHERE m.run_kind = 'market_discovery'
        AND m.status = 'running'
        AND m.error_text LIKE 'unconfirmed:%'
        AND coalesce((m.chain_state->>'step_count')::int, 0)
              < coalesce((m.chain_state->>'max_steps')::int, 12)
        AND NOT coalesce(c.frozen, false)
    LOOP
      PERFORM net.http_post(
        url     := fn_url || '/market-discovery-step',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
        body    := jsonb_build_object('company_id', rec.company_id::text)
      );
      RAISE NOTICE '[sweep] re-armed held market discovery %', rec.run_id;
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
$function$;
