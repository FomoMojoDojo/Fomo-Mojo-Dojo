-- Claim State Machine: Phase 3 — claim_events audit log
--
-- Append-only record of every state transition on every claim.
-- Written by the state machine engine (src/lib/claimState/machine.ts)
-- on every forward transition and every regression.
--
-- triggered_by_event: string identifying what caused the transition.
--   Common values:
--     'manual'              — user-initiated forward transition
--     'signal_withdrawal'   — org signal removed → regression to outside_view
--     'signal_contradiction'— supporting signal contradicted → regression
--     'route_stale'         — linked route marked stale → flow→focus regression
--     'migration'           — initial state set by backwards-compat runner
--     'file_proposal_accepted' — file proposal raised diagnose gate
--
-- evidence_delta: jsonb snapshot of what changed at transition time.
--   Shape: { added_signals?, removed_signals?, changed_triangulation? }
--
-- from_state: null only for the initial 'migration' event (no prior state).

CREATE TABLE IF NOT EXISTS public.claim_events (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_id            uuid        NOT NULL REFERENCES public.claims(id)    ON DELETE CASCADE,
  from_state          text        CHECK (from_state IS NULL OR from_state IN ('outside_view', 'diagnose', 'focus', 'flow')),
  to_state            text        NOT NULL CHECK (to_state IN ('outside_view', 'diagnose', 'focus', 'flow', 'retired')),
  triggered_by_event  text        NOT NULL DEFAULT 'manual',
  evidence_delta      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS claim_events_claim_idx
  ON public.claim_events (claim_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS claim_events_company_idx
  ON public.claim_events (company_id, occurred_at DESC);

ALTER TABLE public.claim_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_events'
      AND policyname = 'claim_events company scoped select'
  ) THEN
    CREATE POLICY "claim_events company scoped select"
      ON public.claim_events FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = claim_events.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = claim_events.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_events'
      AND policyname = 'claim_events company scoped insert'
  ) THEN
    CREATE POLICY "claim_events company scoped insert"
      ON public.claim_events FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = claim_events.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = claim_events.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

-- No UPDATE or DELETE policies — claim_events is append-only.
-- Rows are never modified or deleted (soft-delete via claim state only).

COMMENT ON TABLE public.claim_events IS
  'Append-only audit log of every claim state transition. '
  'Written by src/lib/claimState/machine.ts. Never updated or deleted. '
  'Sets up v2 consolidation of strategic_decisions.confidence_movement into claims.';
