-- ROW SECURITY on first_read_session_reopens — the reopen audit table (2026-09-28).
--
-- WHY. The CV3 commit (20260927120000) closed first_read_sessions and first_read_responses. It left
-- the table that records WHO reopened a session, and WHY, wide open: RLS disabled, zero policies, and
-- `anon` plus `authenticated` each holding SELECT, INSERT, UPDATE, DELETE and TRUNCATE. The decision
-- was protected; the record of the decision was not. An audit row that any signed-in caller — or an
-- anonymous one — can read, rewrite, delete or TRUNCATE is not an audit row.
--
-- The omission was inherited, not careless: the birth migration (20260803130000, FR-REOPEN-2) says in
-- terms "RLS left off, matching first_read_session_removals". The mirror was faithful and the mirror
-- was wrong. first_read_session_removals (9 rows) still carries the same shape and is NOT touched
-- here — it is its own brief.
--
-- ADMIN ONLY, deliberately narrower than CV3. first_read_sessions and first_read_responses gave
-- company members a company-scoped read. This table gets none, even though it carries company_id and
-- could support the same predicate:
--   * `reason` is the operator's own words about why a client's issued read was pulled back. The
--     Aug 3 recorded-decision law requires it to exist; nothing has ever rendered it client-facing,
--     and a member SELECT policy would be the first thing to make that possible by accident.
--   * `reopened_by` names the admin who decided. That is operator provenance, not client evidence.
-- If a client-facing reopen history is ever wanted, it wants a projection that omits both columns,
-- not a policy over this table.
--
-- WHAT THIS DOES NOT DO:
--   * NO member policy and NO anon policy.
--   * NO change to reopen_first_read_session. It stays SECURITY INVOKER, so from here its audit
--     INSERT runs under the caller's policies — an admin writes through the policy below, and a
--     non-admin was already refused by the function's own has_role check long before the insert.
--     Both refusals now exist, independently.
--   * NO foreign keys added. Their absence is deliberate and documented at birth: "the audit must
--     survive later session/company teardown, exactly like the removals audit".
--   * NO change to the enforce_company_freeze trigger, and none to service_role, which carries
--     rolbypassrls and is unaffected by everything here.
--
-- Policies and grants only. ZERO DML — the table holds 0 rows and this migration does not change that.

ALTER TABLE public.first_read_session_reopens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage all first_read_session_reopens" ON public.first_read_session_reopens;
CREATE POLICY "Admins manage all first_read_session_reopens" ON public.first_read_session_reopens
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- anon gets nothing. RLS with no anon policy already refuses, but the grant goes too: a later policy
-- written for `public` rather than `authenticated` would otherwise silently re-open the table.
REVOKE ALL ON TABLE public.first_read_session_reopens FROM anon;

-- TRUNCATE is NOT subject to row level security — only the grant can stop it. Held by authenticated,
-- it let any signed-in caller empty the audit outright, and TRUNCATE fires no row triggers, so it
-- would leave no trace of having done so.
REVOKE TRUNCATE ON TABLE public.first_read_session_reopens FROM authenticated;
