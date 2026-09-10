-- Gate 1c — RE-ARM (2): resume a HELD market_discovery run.
--
-- THE GAP. When a chunk's fetch returns not-ok and the confirm-poll accounts nothing, the stepper
-- HOLDS: status stays 'running' with an 'unconfirmed:' note, and it deliberately does NOT self-fire
-- (no hot loop on a maybe-alive worker). Nothing then resumed it. The CLOSE branch below excludes
-- market_discovery; pg_cron runs only this function; the stepper is silent by design. A held run
-- waited unbounded for an operator-initiated full_refresh — possibly forever. Gate 1b made the
-- confirm-poll strict (accounted = finished, not touched), which turns a whole class of chunk deaths
-- that used to be waved through into holds, so the state is about to become common: 5 of the fleet's
-- 7 manifests had a chunk death that the old rule advanced past.
--
-- WHY THE PREDICATE IS A MARKER AND NOT A CLOCK. No staleness interval can tell a live chunk from a
-- held one. Lumio's 2026-09-03 run was silent for 40 MINUTES between two judge calls while perfectly
-- healthy (53-min run total). RE-ARM (1)'s 3-to-20-minute window would both re-fire that live run at
-- minute 3 and make any held run older than 20 minutes permanently ineligible. So this branch locks
-- STRUCTURALLY, the way RE-ARM (1) locks on the child row's existence: the 'unconfirmed:' note is
-- written ONLY by the stepper's markUnconfirmed, and is CLEARED by the adopt path when the resumed
-- fire claims the row (market-discovery-step/index.ts). One hold ⇒ one re-arm.
--
-- WHAT BOUNDS THE LOOP. Not this clause. The hold path does not increment step_count, so the
-- step_count < max_steps belt here can never bind on a repeating hold — it only stops a run that
-- exhausted its ceiling some other way. The real bound is the stepper's NO-PROGRESS guard, restored
-- in this same gate (_shared/marketDiscoveryStepper.ts, HOLD_LIMIT = 3): three consecutive holds at
-- the SAME cursor close the run failed with `no_progress at cursor N — market discovery halted`,
-- matching the sibling steppers. That guard existed until 0cb86fb deleted it along with the old
-- no_progress terminal; it was safe to lose only while nothing re-fired a hold. This branch is why it
-- had to come back, and it is the reason the automatic resume terminates.
--
-- TYPE FIX IN RE-ARM (1) — flagged, not silent. net.http_post takes `body jsonb`; the `::text` cast
-- carried since 20260808130000 raises "function net.http_post(...) does not exist". Both re-arms and
-- the CLOSE live in one function, so that abort would take the CLOSE down with it. It never surfaced
-- because the GUCs were unset and RE-ARM (1) had never run: 0 posts across 9,745 cron runs. This gate
-- provisions app.service_role_key / app.supabase_functions_url, which makes the dormant bug live, so
-- the cast is corrected here. RE-ARM (1)'s behaviour is otherwise UNCHANGED and proving it live
-- remains a separate item.
--
-- PROOF (live psql, each inside a rolled-back transaction, 2026-09-10). Two market_discovery rows
-- planted for Edgewood 3dd2cfbb — one 'running' with error_text 'unconfirmed: proof', one 'running'
-- with error_text NULL — then SELECT public.sweep_stale_chains() and count net.http_request_queue.
-- app.supabase_functions_url was SET LOCAL to the discard port for every proof, so no request could
-- reach a real endpoint; delivery itself was proven separately (HTTP 400 "company_id required" from
-- http://kong:8000/functions/v1/market-discovery-step, i.e. reachable and service-role authenticated,
-- not 401 and not a connection error).
--   1. held + live, this predicate            → 1 queued, body {"company_id":"3dd2cfbb-…"}   (the held row only)
--   2. same, company frozen inside the txn    → 0 queued
--   3. same, step_count 12 = max_steps        → 0 queued
--   4. RED: `error_text LIKE 'unconfirmed:%'` clause removed → 2 queued (the live row re-fired too)
-- Every transaction rolled back; net.http_request_queue = 0 rows after each; md5(prosrc) unchanged at
-- e49eec8ffe905e95e94a46472e4a9e7e before this migration was applied. Proof 4 is the red-on-revert:
-- delete the marker clause and a live chunk gets a second isolate on the same ledger row.

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
$$;
