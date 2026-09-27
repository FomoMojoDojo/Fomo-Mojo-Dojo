-- B2b follow-up (R11 completion + R13, 2026-09-26) — the audit row gains `rule` and `decided_by`.
--
-- WHY THIS EXISTS AS A SECOND MIGRATION. R11 signed the audit payload as carrying source, from, to,
-- notion_page_id, action, rule and decided_by. 20260926170000 shipped the first five and MISSED the
-- last two: `rule` (the sentence decide() returned) and `decided_by` (which branch chose it). That is
-- a gap in what was signed, not a new idea, and R13 makes it load-bearing — a reconciled row has to be
-- distinguishable from a normal completion, and `decided_by = 'reconcile'` is how.
--
-- The two functions are DROPped and recreated rather than CREATE OR REPLACEd: adding parameters makes
-- a NEW signature, so a plain replace would leave the old arity callable alongside the new one. Two
-- overloads of a write path is exactly the ambiguity the two-door design exists to avoid.
--
-- R13 — the planned-row reconciliation. A `planned` row with no partner means a Notion write may have
-- landed while the DB write did not. The next run finds the row ONLY through
-- POST /v1/data_sources/{id}/query, matched by MojoMap ID (never by enumerating a page's children),
-- and then:
--   the row exists AND its Status equals the planned `to`  → the write DID land. Complete it here:
--       link notion_page_id, close the plan, and audit it with decided_by = 'reconcile'.
--   otherwise                                              → close the plan as FAILED, set
--       last_sync_error, and report needs-operator.
-- Never re-push automatically. The sync does not get to guess which of the two happened.

BEGIN;

DROP FUNCTION IF EXISTS public.sync_client_portal_link(uuid, text, text, boolean, text, text, text, boolean, bigint);
DROP FUNCTION IF EXISTS public.sync_fail_notion_write(uuid, text, text, bigint);

CREATE FUNCTION public.sync_client_portal_link(
  p_company_id       uuid,
  p_action           text,
  p_expected_status  text    DEFAULT NULL,
  p_set_client_status boolean DEFAULT false,
  p_next_status      text    DEFAULT NULL,
  p_notion_page_id   text    DEFAULT NULL,
  p_last_notion_status_seen text DEFAULT NULL,
  p_set_map_created  boolean DEFAULT false,
  p_planned_audit_id bigint  DEFAULT NULL,
  -- R11: the sentence the decision returned, and which branch returned it.
  p_rule             text    DEFAULT NULL,
  p_decided_by       text    DEFAULT NULL
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

  SELECT * INTO v_before FROM public.client_portal_links WHERE company_id = p_company_id FOR UPDATE;
  IF p_expected_status IS DISTINCT FROM v_before.client_status THEN
    RETURN jsonb_build_object('ok', false, 'kind', 'stale', 'stored_status', v_before.client_status);
  END IF;

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
      last_sync_error         = NULL,
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
      'rule', p_rule,
      'decided_by', p_decided_by,
      'planned_audit_id', p_planned_audit_id,
      'last_notion_status_seen', v_after.last_notion_status_seen,
      'map_created_set_at', v_after.map_created_set_at),
    'notion-client-sync')
  RETURNING id INTO v_audit;

  IF p_planned_audit_id IS NOT NULL THEN
    UPDATE public.integrity_runs
       SET status = 'completed', admitted = 1,
           excluded_by_rule = excluded_by_rule || jsonb_build_object('closed_by', v_audit, 'closed_as', 'completed')
     WHERE id = p_planned_audit_id AND component = 'client_status_sync' AND status = 'planned';
  END IF;

  RETURN jsonb_build_object('ok', true, 'kind', 'saved', 'audit_id', v_audit,
    'client_status', v_after.client_status, 'map_created_set_at', v_after.map_created_set_at);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_client_portal_link(uuid, text, text, boolean, text, text, text, boolean, bigint, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_client_portal_link(uuid, text, text, boolean, text, text, text, boolean, bigint, text, text) TO service_role;

CREATE FUNCTION public.sync_fail_notion_write(
  p_company_id uuid,
  p_action     text,
  p_error      text,
  p_planned_audit_id bigint DEFAULT NULL,
  p_rule       text DEFAULT NULL,
  p_decided_by text DEFAULT NULL
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
    jsonb_build_object('action', p_action, 'rule', p_rule, 'decided_by', p_decided_by,
                       'planned_audit_id', p_planned_audit_id), 'notion-client-sync')
  RETURNING id INTO v_audit;
  IF p_planned_audit_id IS NOT NULL THEN
    UPDATE public.integrity_runs
       SET status = 'failed', excluded_by_rule = excluded_by_rule || jsonb_build_object('closed_by', v_audit, 'closed_as', 'failed')
     WHERE id = p_planned_audit_id AND component = 'client_status_sync' AND status = 'planned';
  END IF;
  RETURN jsonb_build_object('ok', false, 'kind', 'failed', 'audit_id', v_audit);
END;
$$;
REVOKE ALL ON FUNCTION public.sync_fail_notion_write(uuid, text, text, bigint, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.sync_fail_notion_write(uuid, text, text, bigint, text, text) TO service_role;

COMMENT ON FUNCTION public.sync_client_portal_link(uuid, text, text, boolean, text, text, text, boolean, bigint, text, text) IS
  'B2b (R11 + R13). The SYNC''s write path into client_portal_links: service role only, refuses CB1 / frozen / not-flagged, compare-and-set on the client_status the sync read, writes the sync-owned columns (and client_status only for a pull or a promotion), and writes one client_status_sync audit row carrying source / from / to / notion_page_id / action / rule / decided_by, closing the planned row in the same transaction. decided_by = ''reconcile'' marks a row completed by R13 rather than by a fresh decision.';

COMMIT;
