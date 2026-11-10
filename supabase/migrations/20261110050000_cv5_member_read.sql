-- CV5 member read (operator ruling U2–U4, signed 2026-11-09). CV5 is "a client signs in and sees only
-- their own company, landing on its current phase". The client-view investigation of 2026-11-09 found
-- three things between that sentence and the rows, and this migration is all three.
--
-- U2 — SEVEN RELATIONS CARRIED NO ROW SECURITY AT ALL. signal_recurrence_verdicts, excerpt_verifications,
-- claim_deltas, public_reads, outside_page_snapshots, market_lens and finding_recurrence had
-- relrowsecurity = false with SELECT, INSERT, UPDATE and DELETE granted to authenticated — so ANY
-- signed-in account, with no membership and no admin row, could read and write every company's rows.
-- Measured with the no-membership throwaway before this migration: 28126 / 2267 / 1819 / 161 / 788 /
-- 110 / 109 rows, the whole fleet, 44 companies. That is the only item in the CV5 set whose exposure
-- was already live rather than prospective, which is why it leads.
--
-- U3 — companies WAS ADMIN-ONLY. "Admins can do everything with companies" was the one policy, so a
-- member could not read the row naming their own company. useCompany (src/hooks/useCompany.tsx:199)
-- selects companies unfiltered and leans on RLS, so a member saw "0 companies" and every surface
-- keyed to an active company fell through. This is the gate the rest of CV5 stands on.
--
-- U4 — THREE TABLES WERE AUTHOR-SCOPED ONLY. intake_responses, managed_outcomes and
-- strategy_problem_statements admitted a reader on auth.uid() = user_id alone, so a client read only
-- rows they had personally authored — never their company's. Diagnose slice 1 reads all three.
--
-- THE SHAPE, AND WHERE IT COMES FROM. Every policy below is one expression with three arms — admin OR
-- company member OR companies.created_by — copied from "Members can read company long_runner_runs",
-- the single-policy variant already in use on the 21 tables that were correct. The owner arm is not
-- ornamental: 16 of 44 companies carry a non-admin created_by.
--
-- claim_delta_rule_refusals_active IS DELIBERATELY ABSENT. The investigation first listed it among the
-- open relations because the view's own relrowsecurity is false and authenticated holds SELECT on it.
-- It is already walled: the view is security_invoker = true over claim_delta_rule_refusals, which has
-- had RLS and this same three-arm shape since 20261022070000. Superuser reads 27 rows; both throwaways
-- read 0. Nothing to do, and a policy on a view would have been an error.
--
-- WHY NO SERVICE-ROLE POLICIES. service_role holds rolbypassrls, so the 108 function files built from
-- SUPABASE_SERVICE_ROLE_KEY are immune to everything here — already proven in practice by the 21
-- tables that have carried RLS all along while those same functions wrote them. Of the 27 function
-- files that reference SUPABASE_ANON_KEY, exactly two touch any of the seven
-- (interview-parser/handler.ts, infer-interview-market/handler.ts) and both use the anon client only
-- to identify the caller, with every table read on the service-role client. No edge-function read or
-- write of these relations runs as authenticated.
--
-- THE ONE BROWSER WRITE. src/hooks/useStrategicDelta.ts:509-514 updates claim_deltas.operator_disposition
-- and operator_seen_at from the browser — the only browser write to any of the seven. Its surface
-- (StrategicDirectionDelta.tsx, under ClientRefinePreviewExtractsView) is AdminModeRoute-gated, so it
-- gets an admin-only UPDATE policy and keeps its UPDATE grant. The other six keep no write path at all:
-- RLS with a SELECT-only policy refuses writes, and the grant layer below refuses them a second time.
--
-- TRIGGERS (V2, verified 2026-11-10). Three triggers on or around these tables run with INVOKER
-- rights, so a read inside one is subject to RLS and could narrow silently. NONE OF THE THREE READS
-- ANY OF THE SEVEN:
--   * claim_deltas_cascade_reason (BEFORE on claims, companies) reads NOTHING — its whole body is a
--     set_config of app.delta_removal_reason. It matched a grep for 'claim_deltas' on its own NAME.
--   * excerpt_verifications_immutable (BEFORE DELETE OR UPDATE on excerpt_verifications) reads
--     nothing either; it raises. And no authenticated caller can fire it at all: the grant layer
--     above refuses first, and with the grant restored RLS still refuses, because this migration
--     adds no DELETE or UPDATE policy. Both locks must be removed before the trigger is even reached.
--   * apply_relevance_override (BEFORE INSERT OR UPDATE on claim_deltas) does read one table —
--     claim_delta_relevance_overrides — which already carried this same three-arm policy ("members
--     and admins read relevance overrides") before today. Its only authenticated caller is an ADMIN:
--     INSERT on claim_deltas is revoked from authenticated above, and UPDATE is admin-only by the
--     policy below, so the path that fires it reads through the admin arm and is never narrowed.
-- claim_deltas_delete_audit and set_relevance_override are SECURITY DEFINER owned by postgres
-- (rolbypassrls) and are unaffected.

-- ── U2 · the seven ────────────────────────────────────────────────────────────────────────────────
alter table public.signal_recurrence_verdicts enable row level security;
alter table public.excerpt_verifications enable row level security;
alter table public.claim_deltas enable row level security;
alter table public.public_reads enable row level security;
alter table public.outside_page_snapshots enable row level security;
alter table public.market_lens enable row level security;
alter table public.finding_recurrence enable row level security;

create policy "Members can read company signal_recurrence_verdicts" on public.signal_recurrence_verdicts for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = signal_recurrence_verdicts.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = signal_recurrence_verdicts.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Members can read company excerpt_verifications" on public.excerpt_verifications for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = excerpt_verifications.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = excerpt_verifications.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Members can read company claim_deltas" on public.claim_deltas for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = claim_deltas.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = claim_deltas.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Members can read company public_reads" on public.public_reads for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = public_reads.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = public_reads.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Members can read company outside_page_snapshots" on public.outside_page_snapshots for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = outside_page_snapshots.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = outside_page_snapshots.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Members can read company market_lens" on public.market_lens for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = market_lens.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = market_lens.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));

create policy "Members can read company finding_recurrence" on public.finding_recurrence for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = finding_recurrence.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = finding_recurrence.company_id and c.created_by = auth.uid())
  or public.has_role(auth.uid(), 'admin'::app_role));

-- The operator disposition write (useStrategicDelta.ts:509-514), admin-only, on claim_deltas alone.
create policy "Admins update claim_deltas" on public.claim_deltas for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- Grant layer, second lock (the F1/F2 2026-09-30 discipline): authenticated keeps SELECT on all seven
-- and UPDATE on claim_deltas only. Everything else goes, so a future policy mistake cannot re-open a
-- write path by itself.
revoke all on public.signal_recurrence_verdicts from anon;
revoke all on public.excerpt_verifications from anon;
revoke all on public.claim_deltas from anon;
revoke all on public.public_reads from anon;
revoke all on public.outside_page_snapshots from anon;
revoke all on public.market_lens from anon;
revoke all on public.finding_recurrence from anon;
-- destructive-ok: these REVOKE the TRUNCATE privilege (grant layer, F1/F2 2026-09-30); nothing is truncated
revoke insert, update, delete, truncate, references, trigger on public.signal_recurrence_verdicts from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.excerpt_verifications from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.public_reads from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.outside_page_snapshots from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.market_lens from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.finding_recurrence from authenticated;
revoke insert, delete, truncate, references, trigger on public.claim_deltas from authenticated;

-- ── U3 · companies ────────────────────────────────────────────────────────────────────────────────
-- "Admins can do everything with companies" (cmd ALL) is untouched and still covers admins. companies
-- is keyed by id, not company_id, and carries no user_id — so the member arm joins on id and the owner
-- arm reads created_by directly.
create policy "Members can read own company" on public.companies for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = companies.id and cm.user_id = auth.uid())
  or created_by = auth.uid());

-- ── U4 · the three author-scoped tables ───────────────────────────────────────────────────────────
-- SELECT only, as signed. The existing author policies ("Users can view own intake responses", "Users
-- can view own managed outcomes", "Users can view own strategy problem statements") and the existing
-- admin ALL policies all stand; this is a fourth door, not a replacement. All three carry company_id
-- and user_id with zero nulls.
create policy "Members can read company intake_responses" on public.intake_responses for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = intake_responses.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = intake_responses.company_id and c.created_by = auth.uid()));

create policy "Members can read company managed_outcomes" on public.managed_outcomes for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = managed_outcomes.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = managed_outcomes.company_id and c.created_by = auth.uid()));

create policy "Members can read company strategy_problem_statements" on public.strategy_problem_statements for select to authenticated using (
  exists (select 1 from public.company_members cm where cm.company_id = strategy_problem_statements.company_id and cm.user_id = auth.uid())
  or exists (select 1 from public.companies c where c.id = strategy_problem_statements.company_id and c.created_by = auth.uid()));
