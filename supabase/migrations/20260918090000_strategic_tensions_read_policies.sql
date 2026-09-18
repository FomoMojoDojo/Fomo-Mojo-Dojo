-- strategic_tensions: admins and company members read tensions (2026-09-17 census; migration dated 09-18 queue).
--
-- Finding: the only SELECT policy on strategic_tensions is "Users can view tensions for their companies" —
-- company_id IN (companies WHERE created_by = auth.uid()) — CREATOR-ONLY. Neither an admin nor a company member
-- who did not create the company reads a single row, and the table gates a client-visible surface
-- (FlowCommitSheet). odi_needs / interview_records read as creator OR company_members and carry an admin clause.
--
-- This adds two SELECT-only PERMISSIVE policies (they OR with the creator policy; nothing is rewritten):
--   "Admins can view all strategic_tensions"          — has_role(auth.uid(), 'admin'::app_role), same shape as
--                                                        the 2026-09-16 integrity_runs admin policy;
--   "Company members can view strategic_tensions"     — EXISTS company_members cm ON (company_id, user_id),
--                                                        the exact member clause of odi_needs' view policy.
-- The creator policy is untouched. No INSERT / UPDATE / DELETE policy changes (a write-policy widening needs
-- its own ruling). One table per RLS brief.
create policy "Admins can view all strategic_tensions"
  on public.strategic_tensions
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

create policy "Company members can view strategic_tensions"
  on public.strategic_tensions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.company_members cm
      where cm.company_id = strategic_tensions.company_id and cm.user_id = auth.uid()
    )
  );
