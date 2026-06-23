-- Checkpoint 6 — server-side backstop for the minimal assign-role control.
--
-- Adds workspace.member.assignRole (promoted enforce-now in TS this checkpoint,
-- Steward/admin only) to has_capability, and protects the privileged
-- company_members.role write with RLS. Setting a member's role is a privileged
-- mutation, so it gets a DB backstop (mirrors cp4) — unlike the deferred
-- operational caps. No data changes (policy only); CB1 untouched.

-- (1) has_capability now also adjudicates workspace.member.assignRole. Steward
--     (admin) holds it; NO client role does (it is absent from every client
--     bundle's CASE arm below), so the client branch returns false for it.
CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _cap text, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Global admin (user_roles) => Steward => the governance caps + assignRole.
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN
      _cap IN (
        'governance.proposal.apply',
        'governance.proposal.reject',
        'participation.suggest',
        'workspace.member.assignRole'
      )
    ELSE
      -- Per-company client role bundle. No client role holds assignRole.
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

-- (2) company_members RLS. Today RLS is DISABLED on this table, so a policy alone
--     would be inert — enable it. Readers in app code only ever SELECT their own
--     row (useCapability) or, as admin, list members; the cp4 surface_proposals
--     SELECT policy's EXISTS(company_members ... user_id = auth.uid()) likewise
--     needs self-rows visible. has_capability is SECURITY DEFINER so it keeps
--     seeing all rows regardless.
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- SELECT: a user sees their own membership rows; admin sees all (to list members).
DROP POLICY IF EXISTS "Users see own or admin all company_members" ON public.company_members;
CREATE POLICY "Users see own or admin all company_members"
  ON public.company_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- UPDATE (the privileged role write): only holders of workspace.member.assignRole
--     (Steward/admin in v1). USING + WITH CHECK both gate, so neither the targeted
--     row nor the resulting row escape the capability check.
DROP POLICY IF EXISTS "Assign-role gated company_members update" ON public.company_members;
CREATE POLICY "Assign-role gated company_members update"
  ON public.company_members
  FOR UPDATE
  USING (public.has_capability(auth.uid(), 'workspace.member.assignRole', company_id))
  WITH CHECK (public.has_capability(auth.uid(), 'workspace.member.assignRole', company_id));

-- NOTE: no INSERT/DELETE policy — add-member / remove-member are the deferred
-- invite system (register-only). With RLS enabled they are admin/service-role
-- only, which is the intended v1 posture.
