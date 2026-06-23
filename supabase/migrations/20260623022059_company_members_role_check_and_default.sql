-- Checkpoint 2 — company_members.role CHECK constraint + default reconcile.
-- Capability-first permission layer (client family, defined in checkpoint 1 /
-- src/lib/capabilities.ts): sponsor / decision_owner / contributor / participant /
-- observer. Schema only — NO handler / hook / RLS change.
--
-- 'member' is RETAINED in the CHECK as a tolerated legacy alias. The frozen CB1
-- reference fixture (Cafe Barra, 58b2b15b-bada-4bcd-9c12-b7e66a37d0bc) holds 4
-- 'member' rows that must stay byte-identical, so they are deliberately NOT
-- updated. The checkpoint-1 resolver (clientRoleToBundle) already maps stored
-- 'member' -> Participant, so those rows resolve to the correct bundle. 'member'
-- may be dropped from the CHECK once CB1 is rebuilt with named roles.

-- (a) Normalize the disposable Edgewood test fixture ONLY. Scoped by company_id
--     (never a blanket UPDATE). CB1's id intentionally does not appear here.
UPDATE public.company_members
   SET role = 'participant'
 WHERE role = 'member'
   AND company_id = '3dd2cfbb-0792-4bf1-9cd4-15db9646874b';  -- Edgewood Center

-- (b) Reconcile the column default from 'member' to the named Participant value.
ALTER TABLE public.company_members
  ALTER COLUMN role SET DEFAULT 'participant';

-- (c) Constrain role to the named client family (+ 'member' legacy alias, see header).
--     UPDATE precedes this so no existing row violates the constraint mid-migration.
ALTER TABLE public.company_members
  ADD CONSTRAINT company_members_role_check
  CHECK (role IN ('sponsor', 'decision_owner', 'contributor', 'participant', 'observer', 'member'));

COMMENT ON CONSTRAINT company_members_role_check ON public.company_members IS
  'Client role family (capability layer, checkpoint 1). ''member'' is a retained legacy alias for the frozen CB1 fixture rows (resolver maps it to Participant); drop once CB1 is rebuilt.';
