-- A65: Adaptive Foundation Refresh — schema foundations
-- Part 1: signals.relevance_state
-- Part 2: surface_proposals table

-- ── Part 1: relevance_state on signals ────────────────────────────────────────
-- Marks signals as strategically irrelevant (not false — just off-direction).
-- Default 'active'; only changed by deliberate operator action.
-- Distinct from excluded_signals_json (companies) which removes wrong-entity
-- signals from analysis entirely.

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS relevance_state TEXT NOT NULL DEFAULT 'active';

ALTER TABLE public.signals
  DROP CONSTRAINT IF EXISTS signals_relevance_state_check;

ALTER TABLE public.signals
  ADD CONSTRAINT signals_relevance_state_check
  CHECK (relevance_state IN ('active', 'deprioritized'));

CREATE INDEX IF NOT EXISTS signals_company_relevance_idx
  ON public.signals (company_id, relevance_state);

-- ── Part 2: surface_proposals table ──────────────────────────────────────────
-- Holds system-generated proposals to update a foundation surface when new
-- evidence suggests a meaningful change. One live (pending) proposal per surface
-- at a time — new proposals supersede pending ones for the same surface.
-- Mirrors file_proposals lifecycle: pending → accepted | rejected | superseded.

CREATE TABLE IF NOT EXISTS public.surface_proposals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  surface_type    TEXT        NOT NULL,
  surface_id      UUID        NULL,
  current_state   JSONB       NOT NULL DEFAULT '{}',
  proposed_state  JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'pending',
  reason          TEXT        NULL,
  created_by      UUID        NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by     UUID        NULL REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ NULL,
  raw_payload     JSONB       NULL,

  CONSTRAINT surface_proposals_surface_type_check
    CHECK (surface_type IN ('positioning', 'cascade', 'route', 'opportunity')),

  CONSTRAINT surface_proposals_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected', 'superseded'))
);

-- "Pending proposals for this company" queries
CREATE INDEX IF NOT EXISTS surface_proposals_company_surface_idx
  ON public.surface_proposals (company_id, surface_type, status);

-- "Is there already a pending proposal for this specific surface row?"
-- Partial index — only covers the supersede-check query path.
CREATE INDEX IF NOT EXISTS surface_proposals_pending_surface_id_idx
  ON public.surface_proposals (surface_type, surface_id)
  WHERE status = 'pending';

-- ── RLS — mirrors file_proposals policies exactly ─────────────────────────────

ALTER TABLE public.surface_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage all surface proposals" ON public.surface_proposals;
CREATE POLICY "Admins can manage all surface proposals"
  ON public.surface_proposals
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users can view company surface proposals" ON public.surface_proposals;
CREATE POLICY "Users can view company surface proposals"
  ON public.surface_proposals
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = surface_proposals.company_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = c.id AND cm.user_id = auth.uid()
        )
      )
  ));

DROP POLICY IF EXISTS "Users can update company surface proposals" ON public.surface_proposals;
CREATE POLICY "Users can update company surface proposals"
  ON public.surface_proposals
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = surface_proposals.company_id
      AND (
        c.created_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members cm
          WHERE cm.company_id = c.id AND cm.user_id = auth.uid()
        )
      )
  ));
