-- CV3 (signed 2026-09-27) — ROW SECURITY on first_read_sessions and first_read_responses.
--
-- WHY. The 2026-09-27 read-only census found both tables with row level security DISABLED and zero
-- policies, while `anon` and `authenticated` each held SELECT, INSERT, UPDATE, DELETE and TRUNCATE.
-- Every one of the seventeen browser access sites runs under a signed-in user JWT, so until now any
-- authenticated caller could read, rewrite, delete or TRUNCATE every company's first-read sessions
-- and every client verdict in first_read_responses, and an anonymous caller could do the same. The
-- verdicts are the ONE client-attested record the product holds (8 of the 8 rows that exist are
-- source='client_attested'); they were the least protected rows in the schema.
--
-- The hole was invisible to the RLS-1 / RLS-2 audits (migrations 20260720230000 and 20260721170000)
-- because those swept the predicates of tables that HAD policies. A table with no policies at all
-- has no predicate to audit. first_read_sessions and first_read_responses were born (20260722130000
-- first_read_schema) without the ALTER TABLE ... ENABLE ROW LEVEL SECURITY the rest of the estate
-- carries, and nothing since has looked.
--
-- THE MODEL, unchanged from the RLS-2 ruling: client members see ONLY their own company; FMD admins
-- see everything; no creator-only scoping. This commit adds the read half of that for these two
-- tables and nothing more.
--
-- WHAT THIS DOES NOT DO — deliberately, each its own later gate:
--   * NO member INSERT / UPDATE / DELETE policy. Members get read only. Today every first-read write
--     site is an operator affordance behind AdminGuard and all five user_roles rows are admin, so the
--     admin ALL policy keeps every existing path working and no UI changes. A member write path needs
--     an actor column first (see below), so it cannot be designed here.
--   * NO actor column. Neither table records WHO wrote a row: first_read_sessions has `presenter
--     text` and no user reference, first_read_responses has no actor at all. That is why the member
--     predicate is company-scoped rather than authorship-scoped — company_id is the only thing on
--     these rows that can carry a tenant boundary. Adding an audited actor is a separate commit.
--   * NO change to reopen_first_read_session. It stays SECURITY INVOKER, so from this commit forward
--     it runs under the caller's policies: an admin reopens as before, a member is refused by the
--     absence of an UPDATE policy rather than by anything inside the function. That is the intended
--     shape — the tenant boundary belongs in one place.
--   * NO change to the triggers (first_read_sessions_transition, first_read_sessions_delete_audit,
--     first_read_responses_freeze, enforce_company_freeze). They are SECURITY INVOKER and keep
--     enforcing the state machine and the freeze exactly as they did. Note the consequence, which is
--     correct: enforce_company_freeze reads public.companies, which is admin-only, so under a member
--     JWT its frozen lookup returns NULL and the write falls through to the RLS refusal below. A
--     member write is refused either way; an admin write is unaffected.
--   * NO change to service_role. service_role carries rolbypassrls, so the five edge-function access
--     sites (generate-first-read-proposal, feed-first-read-corrections) are untouched by everything
--     here. Their grants are left exactly as they are.
--
-- Policies and grants only. ZERO DML — not one first-read row is read, written or deleted.

-- ── 1. first_read_sessions ───────────────────────────────────────────────────
ALTER TABLE public.first_read_sessions ENABLE ROW LEVEL SECURITY;

-- The admin backstop, the same shape every other table in the estate carries.
DROP POLICY IF EXISTS "Admins manage all first_read_sessions" ON public.first_read_sessions;
CREATE POLICY "Admins manage all first_read_sessions" ON public.first_read_sessions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Read only, own company only. company_members' own SELECT policy already admits a member to their
-- own membership rows (user_id = auth.uid()), so this subquery resolves under a member JWT.
DROP POLICY IF EXISTS "Members read own company first_read_sessions" ON public.first_read_sessions;
CREATE POLICY "Members read own company first_read_sessions" ON public.first_read_sessions
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_members.company_id FROM public.company_members
      WHERE company_members.user_id = auth.uid()
    )
  );

-- ── 2. first_read_responses ──────────────────────────────────────────────────
ALTER TABLE public.first_read_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage all first_read_responses" ON public.first_read_responses;
CREATE POLICY "Admins manage all first_read_responses" ON public.first_read_responses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Members read own company first_read_responses" ON public.first_read_responses;
CREATE POLICY "Members read own company first_read_responses" ON public.first_read_responses
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT company_members.company_id FROM public.company_members
      WHERE company_members.user_id = auth.uid()
    )
  );

-- ── 3. Grants ────────────────────────────────────────────────────────────────
-- anon gets nothing. RLS with no anon policy already returns zero rows and refuses every write, but
-- the grant is removed too: a future policy written for `public` rather than `authenticated` would
-- otherwise silently re-open the table to anonymous callers.
REVOKE ALL ON TABLE public.first_read_sessions FROM anon;
REVOKE ALL ON TABLE public.first_read_responses FROM anon;

-- TRUNCATE is NOT subject to row level security — a policy cannot stop it, only the grant can. It
-- was held by both anon (removed above) and authenticated, which meant any signed-in caller could
-- empty either table outright and bypass the delete-audit trigger while doing it (TRUNCATE fires no
-- row triggers). authenticated has no lawful use for it.
REVOKE TRUNCATE ON TABLE public.first_read_sessions FROM authenticated;
REVOKE TRUNCATE ON TABLE public.first_read_responses FROM authenticated;
