-- integrity_runs: admins read every company's integrity records (2026-09-16).
--
-- Finding (no-evidence-record gate, cfe7f63a): the only client SELECT policy on integrity_runs is
-- "users can view company integrity runs" — creator OR company_member — with no admin clause, unlike
-- odi_needs / interview_records ("Admins can manage all …" = has_role(auth.uid(), 'admin'::app_role)).
-- An admin who is neither creator nor member reads ZERO rows, so every record-gated surface
-- (evidence_presence, first_read_outside_score, drift …) renders as "unknown" for admins on companies
-- created by another user.
--
-- This adds a SELECT-only PERMISSIVE policy in the same shape as the existing admin policies. It ORs
-- with the member policy; it does not rewrite it. No INSERT / UPDATE / DELETE policy changes — the
-- writers of integrity_runs are edge functions under the service role, and that stays the only write path.
create policy "Admins can view all integrity_runs"
  on public.integrity_runs
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));
