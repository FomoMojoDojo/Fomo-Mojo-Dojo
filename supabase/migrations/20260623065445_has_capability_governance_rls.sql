-- Checkpoint 4 — server-side RLS enforcement for the GOVERNANCE capabilities.
--
-- Mirrors the client-side 3a split (apply / reject / suggest) in Postgres. The
-- capability bundles are defined in TS (src/lib/capabilities.ts, ROLE_BUNDLES);
-- this function MUST encode the SAME bundle->governance-cap logic. A parity test
-- (src/lib/capabilityParity.test.ts) proves TS and SQL never diverge — the
-- JS-vs-Postgres divergence guard.
--
-- Scope: ONLY the three governance caps are adjudicated server-side this
-- checkpoint (operator decision). Operational caps stay client-gated. has_capability
-- returns false for any cap outside the governance set — that is its current domain.
--
-- Role -> governance-cap truth table (must match TS ROLE_BUNDLES):
--   admin/Steward (user_roles)  apply=T reject=T suggest=T
--   sponsor                     apply=T reject=T suggest=F
--   decision_owner              apply=T reject=T suggest=F
--   contributor                 apply=F reject=F suggest=T
--   participant                 apply=F reject=F suggest=T
--   member (legacy -> Participant) apply=F reject=F suggest=T
--   observer / unknown / null   apply=F reject=F suggest=F

CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _cap text, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Global admin (user_roles) => Steward => all three governance caps.
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN
      _cap IN ('governance.proposal.apply', 'governance.proposal.reject', 'participation.suggest')
    ELSE
      -- Per-company client role bundle (governance caps only).
      EXISTS (
        SELECT 1 FROM public.company_members cm
        WHERE cm.company_id = _company_id
          AND cm.user_id = _user_id
          AND _cap = ANY (
            CASE cm.role
              WHEN 'sponsor'        THEN ARRAY['governance.proposal.apply', 'governance.proposal.reject']
              WHEN 'decision_owner' THEN ARRAY['governance.proposal.apply', 'governance.proposal.reject']
              WHEN 'contributor'    THEN ARRAY['participation.suggest']
              WHEN 'participant'    THEN ARRAY['participation.suggest']
              WHEN 'member'         THEN ARRAY['participation.suggest']  -- legacy alias -> Participant
              ELSE                       ARRAY[]::text[]                 -- observer / unknown
            END
          )
      )
  END
$function$;

-- ── surface_proposals RLS rewrite ────────────────────────────────────────────
-- Fixes the inverted gap: previously any member could UPDATE->accepted (approve)
-- but members had NO INSERT (could not propose). Now capability-keyed.
-- SELECT (reads open, v1) and the admin-all policy are left intact.

-- (z) SELECT — repair a latent bug. The prior policy wrapped its membership check
--     inside EXISTS(SELECT FROM companies ...), and companies has RLS enabled with
--     only an admin policy, so the subquery returned zero rows for every non-admin
--     => no member could ever read surface_proposals (and UPDATE needs the row to be
--     SELECT-visible, which silently blocked the capability gate for ALL non-admins).
--     Replace with a direct membership check against company_members (RLS disabled,
--     so it does NOT re-inherit the companies coupling). Scope: a company's own
--     members may read that company's proposals. Admin retains all (separate policy).
--     This is NOT new read-gating — it fixes a broken read so reads work for members.
DROP POLICY IF EXISTS "Users can view company surface proposals" ON public.surface_proposals;
DROP POLICY IF EXISTS "Members can view company surface proposals" ON public.surface_proposals;
CREATE POLICY "Members can view company surface proposals"
  ON public.surface_proposals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = surface_proposals.company_id
        AND cm.user_id = auth.uid()
    )
  );

-- (a) INSERT — propose, gated by participation.suggest.
DROP POLICY IF EXISTS "Members can propose company surface proposals" ON public.surface_proposals;
CREATE POLICY "Members can propose company surface proposals"
  ON public.surface_proposals
  FOR INSERT
  WITH CHECK (public.has_capability(auth.uid(), 'participation.suggest', company_id));

-- (b) UPDATE — replace the backwards member-update policy. Targetable by company
--     members; the RESULTING status gates on the matching capability:
--       -> accepted   requires governance.proposal.apply
--       -> rejected   requires governance.proposal.reject
--       -> anything else (pending / superseded, the propose lane) requires suggest
DROP POLICY IF EXISTS "Users can update company surface proposals" ON public.surface_proposals;
DROP POLICY IF EXISTS "Members can review company surface proposals" ON public.surface_proposals;
CREATE POLICY "Members can review company surface proposals"
  ON public.surface_proposals
  FOR UPDATE
  USING (
    -- has_capability is SECURITY DEFINER → RLS-immune. Using an inline EXISTS on
    -- company_members here instead would make USING depend on that table's own RLS
    -- (a footgun), so target-ability is decided by holding ANY governance cap; the
    -- WITH CHECK below enforces the specific cap for the resulting status.
    public.has_capability(auth.uid(), 'participation.suggest', company_id)
    OR public.has_capability(auth.uid(), 'governance.proposal.apply', company_id)
    OR public.has_capability(auth.uid(), 'governance.proposal.reject', company_id)
  )
  WITH CHECK (
    CASE status
      WHEN 'accepted' THEN public.has_capability(auth.uid(), 'governance.proposal.apply', company_id)
      WHEN 'rejected' THEN public.has_capability(auth.uid(), 'governance.proposal.reject', company_id)
      ELSE                 public.has_capability(auth.uid(), 'participation.suggest', company_id)
    END
  );
