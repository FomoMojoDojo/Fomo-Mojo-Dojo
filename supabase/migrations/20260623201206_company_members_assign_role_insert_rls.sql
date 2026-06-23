-- Add-a-member (the small honest version): an admin/Steward can add an EXISTING
-- user to a company. Backed by a company_members INSERT policy gated by the cp6
-- capability — the EXACT predicate shape the cp6 role-UPDATE policy uses, so
-- INSERT (add) and UPDATE (set-role) are gated identically.
--
-- Today company_members has SELECT + UPDATE policies but NO INSERT policy, so
-- non-superuser INSERT is denied by default. This adds the one INSERT path.
-- Remove/DELETE stays deferred (no DELETE policy). No new RPC.

DROP POLICY IF EXISTS "Assign-role gated company_members insert" ON public.company_members;
CREATE POLICY "Assign-role gated company_members insert"
  ON public.company_members
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_capability(auth.uid(), 'workspace.member.assignRole', company_id));
