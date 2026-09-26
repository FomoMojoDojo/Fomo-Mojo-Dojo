-- B1a (R4–R7, 2026-09-26) — the Client portal section's write path becomes ONE audited RPC.
--
-- WHY. B1 (ecb736cf) shipped the section with three separate PostgREST writes from the browser:
-- an ensureRow upsert, an `enabled` UPDATE and a compare-and-set `client_status` UPDATE. Each was
-- its own implicit transaction, so there was no single "the change" an audit row could be attached
-- to, a failure part-way left half an operator decision committed, and the before-values available
-- to the client came from its last read — `enabled` has no compare-and-set at all, so a
-- client-assembled "from" could name a value that was never stored. The 2026-09-26 trace found the
-- consequence: integrity_runs carries no portal rows, and nothing anywhere records who created or
-- changed any of the nine existing rows.
--
-- R4 — every Confirm writes ONE integrity_runs row: the actor from auth.uid(), and the before/after
-- of both `enabled` and `client_status`, in the SAME transaction as the change, through an
-- admin-only RPC that takes no user id and sets search_path. Same pattern as the first-read marks
-- RPCs (migration 20260921150000, lines 150-288): the actor is never a parameter, the admin check
-- and the frozen check come before anything is written, the payload rides in
-- integrity_runs.excluded_by_rule as jsonb, and the function is REVOKEd from public and GRANTed to
-- authenticated + service_role.
--
-- R5 — NO BACKFILL. The nine rows that exist today get no audit row, ever. Their creation is not
-- recorded and cannot honestly be reconstructed; inventing rows for them would put a guess in the
-- one table that exists to be trusted. B2 reads the absence as "not recorded (pre-B1a)" (R8).
--
-- R6 — a call that would change nothing is REFUSED (check_violation) and writes no audit row. Two
-- shapes: a call that requests nothing (no `enabled`, no status), and a call whose requested values
-- already equal what is stored. The UI only offers Confirm when something is staged, so the second
-- shape is only reachable when another writer moved first; without the refusal R4 would mint audit
-- rows recording no change. Creating an absent row is NOT a no-op: per R-store the absence of a row
-- is itself the record of "never considered for sync", so ending that absence is a change.
--
-- R7 — the admin policy narrows from FOR ALL to SELECT. After this migration the ONLY writers of
-- client_portal_links are set_client_portal_link (an authenticated admin) and the service role
-- (B2's sync). This is what makes the audit trail complete rather than merely present: with a FOR
-- ALL policy an admin browser session could still UPDATE the table directly and leave no row
-- behind. Same shape as first_read_marks, whose migration says it in one line: "No INSERT / UPDATE
-- / DELETE policy for authenticated: the RPCs below (SECURITY DEFINER) are the write path."
--
-- NO SCHEMA CHANGE TO integrity_runs. `component` and `surface_type` carry no CHECK, `status =
-- 'completed'` is already in integrity_runs_status_check, and excluded_by_rule is jsonb and is
-- already used exactly this way by withdraw_first_read_mark. The audit row is:
--   component    'client_portal_operator_set'   (B2's own rows will read 'client_status_sync')
--   surface_type 'client_portal_links'
--   surface_id   the company id — which IS this table's primary key, so no new identifier
--   run_ref      'set_client_portal_link'
--
-- BEHAVIOURAL CHANGE, NAMED: a lost compare-and-set now writes NOTHING. B1 committed the `enabled`
-- half before the status leg ran, so a lost race left half the decision stored. The operator sees
-- the same signed C3 string either way; the difference is that half a decision no longer sticks.
--
-- status_changed_at is still stamped by trg_client_portal_links_stamp_status_changed. This function
-- never sets it: a writer that dates a status change is exactly what that trigger exists to prevent,
-- and the rule holds for the RPC no less than for a browser.

BEGIN;

-- ── the RPC ───────────────────────────────────────────────────────────────────────────────────────
-- Tri-state arguments mirror the component's staging model (ClientPortalSection.tsx:68-69):
--   p_enabled     NULL  = leave `enabled` as it is          (pendingEnabled === null)
--   p_set_status  false = leave `client_status` as it is     (pendingStatus === undefined)
--                 true  = store p_next_status, NULL included (pendingStatus === null clears it)
--   p_expected_status  R-cas: the value the operator READ. NULL means "was not set". It is only
--                      consulted when p_set_status is true.
CREATE OR REPLACE FUNCTION public.set_client_portal_link(
  p_company_id      uuid,
  p_enabled         boolean DEFAULT NULL,
  p_set_status      boolean DEFAULT false,
  p_expected_status text    DEFAULT NULL,
  p_next_status     text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_frozen       boolean;
  v_before       public.client_portal_links%ROWTYPE;
  v_after        public.client_portal_links%ROWTYPE;
  v_row_created  boolean := false;
  v_found        boolean;
  v_want_enabled boolean;
  v_want_status  text;
  v_audit_id     bigint;
  v_now          timestamptz := now();
BEGIN
  -- 1. the actor gate. The actor is auth.uid() and nothing else — no parameter names a user.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'set_client_portal_link: no authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT public.has_role(v_actor, 'admin'::app_role) THEN
    RAISE EXCEPTION 'set_client_portal_link: caller is not an admin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 2. the company must exist and must not be frozen. R-frozen keeps TWO independent gates: this
  --    one, and the enforce_company_freeze trigger on the table itself (and on integrity_runs).
  SELECT frozen INTO v_frozen FROM public.companies WHERE id = p_company_id;
  IF v_frozen IS NULL THEN
    RAISE EXCEPTION 'set_client_portal_link: no company %', p_company_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_frozen THEN
    RAISE EXCEPTION 'set_client_portal_link: company % is a frozen reference fixture', p_company_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 3. the status must be one of the seven signed Notion values, or NULL. The table CHECK would
  --    catch it too; refusing here names the column in the message.
  IF p_set_status AND p_next_status IS NOT NULL
     AND p_next_status NOT IN ('Cold Intake','Web Intake','Map Created','In Progress','Completed','On Hold','Ongoing') THEN
    RAISE EXCEPTION 'set_client_portal_link: client_status % is not one of the seven signed values', p_next_status
      USING ERRCODE = 'check_violation';
  END IF;

  -- 4. R6, first shape: a call that asks for nothing.
  IF p_enabled IS NULL AND NOT p_set_status THEN
    RAISE EXCEPTION 'set_client_portal_link: nothing was requested — no audit row was written'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 5. read the before-state under a lock. FOR UPDATE cannot lock a row that does not exist, so an
  --    absent row is created first (ON CONFLICT DO NOTHING, so two concurrent first-savers cannot
  --    both insert) and then re-read locked.
  SELECT * INTO v_before FROM public.client_portal_links
    WHERE company_id = p_company_id FOR UPDATE;
  v_found := FOUND;
  IF NOT v_found THEN
    INSERT INTO public.client_portal_links (company_id) VALUES (p_company_id)
      ON CONFLICT (company_id) DO NOTHING;
    SELECT * INTO v_before FROM public.client_portal_links
      WHERE company_id = p_company_id FOR UPDATE;
    -- v_row_created is false when the conflict fired, i.e. another writer created it first.
    v_row_created := (v_before.created_at >= v_now);
  END IF;

  v_want_enabled := COALESCE(p_enabled, v_before.enabled);
  v_want_status  := CASE WHEN p_set_status THEN p_next_status ELSE v_before.client_status END;

  -- 6. R-cas, BEFORE anything is written. The row is locked, so unlike B1's unlocked WHERE-clause
  --    predicate this cannot be overtaken between the test and the write. A lost race returns and
  --    writes nothing at all — not the row, not an audit row.
  IF p_set_status AND p_expected_status IS DISTINCT FROM v_before.client_status THEN
    RETURN jsonb_build_object(
      'ok', false, 'kind', 'stale',
      'stored_status', v_before.client_status,
      'row_created', v_row_created);
  END IF;

  -- 7. R6, second shape: the requested values already equal what is stored. An absent row that this
  --    call has just created is never a no-op — ending the absence is the change.
  IF v_found
     AND v_want_enabled IS NOT DISTINCT FROM v_before.enabled
     AND v_want_status  IS NOT DISTINCT FROM v_before.client_status THEN
    RAISE EXCEPTION 'set_client_portal_link: nothing would change — no audit row was written'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 8. ONE update for both columns. status_changed_at is left to the stamp trigger.
  UPDATE public.client_portal_links
     SET enabled = v_want_enabled, client_status = v_want_status
   WHERE company_id = p_company_id
  RETURNING * INTO v_after;

  -- 9. R4's audit row, in this same transaction. excluded_by_rule is the estate's payload carrier
  --    (withdraw_first_read_mark, migration 20260921150000 line 277).
  INSERT INTO public.integrity_runs
    (company_id, component, surface_type, surface_id, ran_at, status,
     examined, admitted, excluded_by_rule, run_ref)
  VALUES (
    p_company_id,
    'client_portal_operator_set',
    'client_portal_links',
    p_company_id,
    v_now,
    'completed',
    1, 1,
    jsonb_build_object(
      'ruling', 'R4 (2026-09-26): every Confirm on the Client portal section writes one audit row — the actor and the before/after of enabled and client_status — in the same transaction as the change.',
      'actor',              v_actor,
      'enabled_from',       v_before.enabled,
      'enabled_to',         v_after.enabled,
      'enabled_changed',    (v_before.enabled IS DISTINCT FROM v_after.enabled),
      'client_status_from', v_before.client_status,
      'client_status_to',   v_after.client_status,
      'status_changed',     (v_before.client_status IS DISTINCT FROM v_after.client_status),
      'status_changed_at',  v_after.status_changed_at,
      'row_created',        v_row_created),
    'set_client_portal_link')
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'ok', true, 'kind', 'saved',
    'company_id',        p_company_id,
    'enabled',           v_after.enabled,
    'client_status',     v_after.client_status,
    'status_changed_at', v_after.status_changed_at,
    'row_created',       v_row_created,
    'audit_id',          v_audit_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_client_portal_link(uuid, boolean, boolean, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.set_client_portal_link(uuid, boolean, boolean, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.set_client_portal_link(uuid, boolean, boolean, text, text) IS
  'B1a (R4, 2026-09-26). The ONE write path for client_portal_links from a browser: sets enabled and/or client_status for one company and writes one integrity_runs audit row (component client_portal_operator_set) in the same transaction. Actor is auth.uid() and must hold admin; a frozen company and a no-op are refused; a lost compare-and-set on client_status writes nothing.';

-- ── R7: the admin policy narrows to SELECT ───────────────────────────────────────────────────────
-- Writes now happen only through set_client_portal_link (SECURITY DEFINER, so it is not subject to
-- these policies) and through the service role (B2). The service-role policy below is UNCHANGED and
-- is deliberately left FOR ALL: B2 owns map_created_set_at, last_synced_at, last_sync_error,
-- last_sync_error_at and last_notion_status_seen, none of which the RPC touches.
DROP POLICY IF EXISTS "Admins can do everything with client_portal_links" ON public.client_portal_links;

CREATE POLICY "Admins can view client_portal_links"
  ON public.client_portal_links
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- "service role full access on client_portal_links" is intentionally untouched.

COMMENT ON TABLE public.client_portal_links IS
  'One row per company flagged for the Notion "Client Portals" sync (B1). companies is never altered; companies.program_phase is a different concept and is never read or written here. B1a (R7): authenticated admins may only SELECT — every browser write goes through set_client_portal_link, which writes an integrity_runs audit row in the same transaction. The service role (B2) writes the sync-owned columns directly.';

COMMIT;
