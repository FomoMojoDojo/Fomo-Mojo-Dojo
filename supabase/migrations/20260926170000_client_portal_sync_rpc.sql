-- B2b (R8–R11, 2026-09-26) — the SYNC's write path into client_portal_links.
--
-- WHY A SECOND RPC. B1a's set_client_portal_link is the OPERATOR's door: it takes the actor from
-- auth.uid(), demands the admin role, and writes only `enabled` and `client_status`. The sync has no
-- user at all and must write the five sync-owned columns the operator door deliberately never
-- touches. Giving the operator RPC a service-role branch would have meant one function that can act
-- as either principal — exactly the ambiguity B1a's audit trail exists to remove. Two doors, two
-- gates, two components in integrity_runs: nothing can write as the wrong principal.
--
--   set_client_portal_link   auth.uid() + admin   enabled, client_status   client_portal_operator_set
--   sync_client_portal_link  auth.role() = service_role
--                                                 notion_page_id, last_notion_status_seen,
--                                                 last_synced_at, last_sync_error(_at),
--                                                 map_created_set_at, and client_status ONLY for a
--                                                 pull or a promotion                client_status_sync
--
-- R11 — Notion first, DB second, and a PLANNED audit row before each Notion write. The two writes
-- cannot be one transaction, so the run is made re-runnable instead of atomic. sync_plan_notion_write
-- records the intent (status 'planned') BEFORE the Notion call; sync_client_portal_link closes it on
-- success; sync_fail_notion_write closes it on failure. A planned row with no partner means "Notion
-- may already hold this": the next run RE-READS rather than re-pushing. That is the whole reason the
-- planned row exists — without it, a Notion write that succeeded while the DB write failed would be
-- re-pushed forever, and a Map Created promotion would fire twice.
--
-- R-cas — compare-and-set on the MojoMap side: the caller passes the client_status it read, the row
-- is taken FOR UPDATE, and a mismatch refuses with NOTHING written. The operator moving a status
-- between the sync's read and its write is the case this exists for; the sync loses, by design.
--
-- CB1, frozen and enabled = false are each refused before any write, independently of the UI.
--
-- integrity_runs needs no schema change: component and surface_type carry no CHECK, and 'planned',
-- 'completed' and 'failed' are all already in integrity_runs_status_check.

BEGIN;

-- ── the gate shared by the three sync RPCs ───────────────────────────────────────────────────────
-- Service role ONLY. Not "admin or service role": an admin browser session reaching this function
-- would be able to write the sync-owned columns with no actor recorded, which is the hole R7 closed.
CREATE OR REPLACE FUNCTION public.client_portal_sync_gate(p_fn text, p_company_id uuid)
RETURNS public.client_portal_links LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
DECLARE
  v_row    public.client_portal_links%ROWTYPE;
  v_frozen boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION '%: only the service role may run the sync', p_fn USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_company_id = '58b2b15b-bada-4bcd-9c12-b7e66a37d0bc'::uuid THEN
    RAISE EXCEPTION '%: CB1 is never synced', p_fn USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT frozen INTO v_frozen FROM public.companies WHERE id = p_company_id;
  IF v_frozen IS NULL THEN
    RAISE EXCEPTION '%: no company %', p_fn, p_company_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_frozen THEN
    RAISE EXCEPTION '%: company % is a frozen reference fixture', p_fn, p_company_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_row FROM public.client_portal_links WHERE company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '%: company % has no client_portal_links row', p_fn, p_company_id USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT v_row.enabled THEN
    RAISE EXCEPTION '%: company % is not flagged for sync (enabled = false)', p_fn, p_company_id USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.client_portal_sync_gate(text, uuid) FROM public;

-- ── R11 step 1: record the intent BEFORE the Notion write ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_plan_notion_write(
  p_company_id uuid,
  p_action     text,
  p_from       text DEFAULT NULL,
  p_to         text DEFAULT NULL,
  p_notion_page_id text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.client_portal_links%ROWTYPE;
  v_id  bigint;
BEGIN
  v_row := public.client_portal_sync_gate('sync_plan_notion_write', p_company_id);
  INSERT INTO public.integrity_runs
    (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
  VALUES (p_company_id, 'client_status_sync', 'client_portal_links', p_company_id, now(), 'planned', 1, 0,
    jsonb_build_object(
      'ruling', 'R11 (2026-09-26): the intent is recorded before the Notion write, so a Notion write that succeeded while the DB write failed is re-read on the next run and never re-pushed blindly.',
      'action', p_action, 'from', p_from, 'to', p_to, 'notion_page_id', p_notion_page_id),
    'notion-client-sync')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_plan_notion_write(uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_plan_notion_write(uuid, text, text, text, text) TO service_role;

-- ── R11 step 2: the DB write, closing the planned row in the SAME transaction ─────────────────────
-- p_expected_status is R-cas. p_set_client_status says whether client_status moves at all: true for a
-- pull and for a promotion, false for a push, a create or a seed — a push must never rewrite the
-- value it is pushing, and a create must not touch the status the operator chose.
CREATE OR REPLACE FUNCTION public.sync_client_portal_link(
  p_company_id       uuid,
  p_action           text,
  p_expected_status  text    DEFAULT NULL,
  p_set_client_status boolean DEFAULT false,
  p_next_status      text    DEFAULT NULL,
  p_notion_page_id   text    DEFAULT NULL,
  p_last_notion_status_seen text DEFAULT NULL,
  p_set_map_created  boolean DEFAULT false,
  p_planned_audit_id bigint  DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_before public.client_portal_links%ROWTYPE;
  v_after  public.client_portal_links%ROWTYPE;
  v_now    timestamptz := now();
  v_audit  bigint;
BEGIN
  v_before := public.client_portal_sync_gate('sync_client_portal_link', p_company_id);

  IF p_action NOT IN ('create','create-at-map-created','push','pull','seed-seen','map-created') THEN
    RAISE EXCEPTION 'sync_client_portal_link: % is not a sync action', p_action USING ERRCODE = 'check_violation';
  END IF;

  -- lock the row, then R-cas against what the sync read.
  SELECT * INTO v_before FROM public.client_portal_links WHERE company_id = p_company_id FOR UPDATE;
  IF p_expected_status IS DISTINCT FROM v_before.client_status THEN
    RETURN jsonb_build_object('ok', false, 'kind', 'stale', 'stored_status', v_before.client_status);
  END IF;

  -- Map Created is set ONCE and never backward.
  IF p_set_map_created AND v_before.map_created_set_at IS NOT NULL THEN
    RAISE EXCEPTION 'sync_client_portal_link: map_created_set_at is already set for % — the promotion fires once', p_company_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.client_portal_links SET
      client_status           = CASE WHEN p_set_client_status THEN p_next_status ELSE client_status END,
      notion_page_id          = COALESCE(p_notion_page_id, notion_page_id),
      last_notion_status_seen = p_last_notion_status_seen,
      last_synced_at          = v_now,
      map_created_set_at      = CASE WHEN p_set_map_created THEN v_now ELSE map_created_set_at END,
      last_sync_error         = NULL,   -- a success clears the previous failure
      last_sync_error_at      = NULL
    WHERE company_id = p_company_id
  RETURNING * INTO v_after;

  INSERT INTO public.integrity_runs
    (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
  VALUES (p_company_id, 'client_status_sync', 'client_portal_links', p_company_id, v_now, 'completed', 1, 1,
    jsonb_build_object(
      'source', CASE p_action WHEN 'pull' THEN 'notion'
                              WHEN 'push' THEN 'mojomap'
                              WHEN 'map-created' THEN 'map_created'
                              WHEN 'create-at-map-created' THEN 'map_created'
                              ELSE 'create' END,
      'from', v_before.client_status,
      'to',   v_after.client_status,
      'notion_page_id', v_after.notion_page_id,
      'action', p_action,
      'planned_audit_id', p_planned_audit_id,
      'last_notion_status_seen', v_after.last_notion_status_seen,
      'map_created_set_at', v_after.map_created_set_at),
    'notion-client-sync')
  RETURNING id INTO v_audit;

  -- close the planned row so the next run does not read it as an unfinished Notion write
  IF p_planned_audit_id IS NOT NULL THEN
    UPDATE public.integrity_runs
       SET status = 'completed', admitted = 1,
           excluded_by_rule = excluded_by_rule || jsonb_build_object('closed_by', v_audit)
     WHERE id = p_planned_audit_id AND component = 'client_status_sync' AND status = 'planned';
  END IF;

  RETURN jsonb_build_object('ok', true, 'kind', 'saved', 'audit_id', v_audit,
    'client_status', v_after.client_status, 'map_created_set_at', v_after.map_created_set_at);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_client_portal_link(uuid, text, text, boolean, text, text, text, boolean, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_client_portal_link(uuid, text, text, boolean, text, text, text, boolean, bigint) TO service_role;

-- ── R11: per-company failure isolation ───────────────────────────────────────────────────────────
-- One company's failure must never stop the others, so the failure is RECORDED and the run carries on.
CREATE OR REPLACE FUNCTION public.sync_fail_notion_write(
  p_company_id uuid,
  p_action     text,
  p_error      text,
  p_planned_audit_id bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_now   timestamptz := now();
  v_audit bigint;
BEGIN
  PERFORM public.client_portal_sync_gate('sync_fail_notion_write', p_company_id);
  UPDATE public.client_portal_links
     SET last_sync_error = left(p_error, 500), last_sync_error_at = v_now
   WHERE company_id = p_company_id;
  INSERT INTO public.integrity_runs
    (company_id, component, surface_type, surface_id, ran_at, status, examined, admitted, error, excluded_by_rule, run_ref)
  VALUES (p_company_id, 'client_status_sync', 'client_portal_links', p_company_id, v_now, 'failed', 1, 0,
    left(p_error, 500),
    jsonb_build_object('action', p_action, 'planned_audit_id', p_planned_audit_id), 'notion-client-sync')
  RETURNING id INTO v_audit;
  IF p_planned_audit_id IS NOT NULL THEN
    UPDATE public.integrity_runs
       SET status = 'failed', excluded_by_rule = excluded_by_rule || jsonb_build_object('closed_by', v_audit)
     WHERE id = p_planned_audit_id AND component = 'client_status_sync' AND status = 'planned';
  END IF;
  RETURN jsonb_build_object('ok', false, 'kind', 'failed', 'audit_id', v_audit);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_fail_notion_write(uuid, text, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_fail_notion_write(uuid, text, text, bigint) TO service_role;

COMMENT ON FUNCTION public.sync_client_portal_link(uuid, text, text, boolean, text, text, text, boolean, bigint) IS
  'B2b (R11). The SYNC''s write path into client_portal_links: service role only, refuses CB1 / frozen / not-flagged, compare-and-set on the client_status the sync read, writes the sync-owned columns (and client_status only for a pull or a promotion), and writes one client_status_sync audit row in the same transaction, closing the planned row.';

COMMIT;
