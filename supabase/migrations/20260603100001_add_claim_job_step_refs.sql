-- Claim State Machine: Phase 2 — claim_job_step_refs junction table
--
-- Links claims to the customer job map steps they relate to.
-- Each claim may reference zero or more job_steps rows.
-- Populated during migration from odi_needs.journey_key + step_number lookups;
-- rows that have no matching job_steps entry are skipped and logged for
-- manual reconciliation (see migration runner report).
--
-- Design decision §5.4 Option A: junction table with full FK constraints.

CREATE TABLE IF NOT EXISTS public.claim_job_step_refs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  claim_id    uuid        NOT NULL REFERENCES public.claims(id)    ON DELETE CASCADE,
  job_step_id uuid        NOT NULL REFERENCES public.job_steps(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Prevent duplicate links
CREATE UNIQUE INDEX IF NOT EXISTS claim_job_step_refs_unique_idx
  ON public.claim_job_step_refs (claim_id, job_step_id);

CREATE INDEX IF NOT EXISTS claim_job_step_refs_company_idx
  ON public.claim_job_step_refs (company_id);

CREATE INDEX IF NOT EXISTS claim_job_step_refs_job_step_idx
  ON public.claim_job_step_refs (job_step_id);

ALTER TABLE public.claim_job_step_refs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_job_step_refs'
      AND policyname = 'claim_job_step_refs company scoped select'
  ) THEN
    CREATE POLICY "claim_job_step_refs company scoped select"
      ON public.claim_job_step_refs FOR SELECT
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = claim_job_step_refs.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = claim_job_step_refs.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_job_step_refs'
      AND policyname = 'claim_job_step_refs company scoped insert'
  ) THEN
    CREATE POLICY "claim_job_step_refs company scoped insert"
      ON public.claim_job_step_refs FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = claim_job_step_refs.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = claim_job_step_refs.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'claim_job_step_refs'
      AND policyname = 'claim_job_step_refs company scoped delete'
  ) THEN
    CREATE POLICY "claim_job_step_refs company scoped delete"
      ON public.claim_job_step_refs FOR DELETE
      USING (
        EXISTS (SELECT 1 FROM public.companies c
                WHERE c.id = claim_job_step_refs.company_id AND c.created_by = auth.uid())
        OR EXISTS (SELECT 1 FROM public.company_members cm
                   WHERE cm.company_id = claim_job_step_refs.company_id AND cm.user_id = auth.uid())
      );
  END IF;
END $$;

COMMENT ON TABLE public.claim_job_step_refs IS
  'Junction table: claim → job_steps. A claim may relate to zero or more '
  'customer job map steps. Populated from odi_needs.journey_key + step_number '
  'lookups during migration; gaps logged in runner report for reconciliation.';
