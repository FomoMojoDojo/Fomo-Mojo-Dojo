-- APPEND-ONLY on first_read_session_reopens — the reopen audit table (2026-09-30).
--
-- WHY. 20260928120000 enabled RLS here and gave admins a single FOR ALL policy. That closed the table
-- to members and to anon, which was the whole of that brief, but it left an admin able to UPDATE or
-- DELETE a reopen row: the record of who reopened a client's issued read, and why, could be edited or
-- erased by the same authority that wrote it. 20260930090000 then made the REMOVAL audit append-only
-- and, in doing so, left the two audit tables asymmetric — removals could not be amended, reopens
-- could. This closes that gap. An audit row an admin can rewrite is not an audit row, and the fact
-- that only admins can reach it is not the same as no one being able to change it.
--
-- READ + RECORD, not the removals shape (RO2). The removals audit needs NO write policy at all,
-- because its only writer is a BEFORE DELETE trigger that runs SECURITY DEFINER as postgres and is
-- therefore admitted with zero INSERT policies present. reopen_first_read_session is different and
-- stays different: it is SECURITY INVOKER (RO2, unchanged here), so its audit INSERT runs under the
-- CALLER's policies. The caller is always an admin — the function's own has_role gate raises for
-- everyone else, proven for the member, the non-member and anon before this migration was written —
-- but an admin with no INSERT policy would be refused by RLS and every reopen would fail. So this
-- table takes two policies where removals takes one:
--   * "Admins read first_read_session_reopens"   — SELECT, so an admin can inspect the audit.
--   * "Admins record first_read_session_reopens" — INSERT, which is what the RPC's own insert rides.
-- and NO UPDATE or DELETE policy, for any role. Recording is permitted; amending is not.
--
-- WHY NOT make the RPC SECURITY DEFINER and drop the INSERT policy, mirroring removals exactly: that
-- would change reopen_first_read_session, which RO2 forbids and which is a much larger blast radius —
-- the function also UPDATEs first_read_sessions over a GUC-gated transition edge, and running that
-- update as postgres would move it out from under first_read_sessions' own policies. INVOKER plus a
-- narrow INSERT policy keeps every write this function makes inside the caller's authority.
--
-- WHAT THIS DOES NOT DO:
--   * NO DML. The table holds 0 rows and this migration does not change that (RO3).
--   * NO change to reopen_first_read_session — not its body, not its security label, not its owner,
--     not its search_path (RO2).
--   * NO change to first_read_session_removals, to first_read_sessions or first_read_responses
--     policies, or to the enforce_company_freeze trigger on this table.
--   * NO change for anon, which 20260928120000 already revoked entirely and which gains nothing here.
--   * NO foreign keys added. Their absence is deliberate and documented at birth (20260803130000):
--     the audit must survive later session and company teardown.
--   * service_role is untouched; it carries rolbypassrls and is unaffected by everything here.

-- The FOR ALL policy goes. Dropped by name, then replaced by the two narrow ones.
DROP POLICY IF EXISTS "Admins manage all first_read_session_reopens" ON public.first_read_session_reopens;

DROP POLICY IF EXISTS "Admins read first_read_session_reopens" ON public.first_read_session_reopens;
CREATE POLICY "Admins read first_read_session_reopens" ON public.first_read_session_reopens
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins record first_read_session_reopens" ON public.first_read_session_reopens;
CREATE POLICY "Admins record first_read_session_reopens" ON public.first_read_session_reopens
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- authenticated keeps SELECT and INSERT; every amending verb goes at the grant layer too, so
-- append-only holds independently of the policy set.
--   * UPDATE / DELETE: refused by absent policy AND by absent grant.
--   * TRUNCATE: NOT subject to row level security — only the grant can stop it, and it fires no row
--     triggers, so an emptied audit would leave no trace of having been emptied. (20260928120000
--     already revoked it; repeated here so this migration alone states the full end state.)
--   * REFERENCES / TRIGGER: no app role has business attaching constraints or triggers to an audit table.
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.first_read_session_reopens FROM authenticated;
