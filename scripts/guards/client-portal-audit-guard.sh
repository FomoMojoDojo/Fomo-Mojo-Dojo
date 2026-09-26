#!/usr/bin/env bash
# B1a — the Client portal audited write path (R4–R7, 2026-09-26). DB guards against the REAL local
# database, everything inside ONE ROLLED-BACK transaction over THROWAWAY companies (never CB1 / CB2
# / Edgewood / any of the nine live client_portal_links rows). Prints "guard: PASS" or "guard: FAIL …".
#
# Checks (affirmative, PLANT unset):
#   (a) non-admin refused · no authenticated caller refused
#   (b) frozen company refused — the RPC's own check AND the table's enforce_company_freeze trigger
#   (c) first save: the row is created, BOTH columns land, exactly ONE audit row, correct from/to,
#       actor = the admin's uuid, row_created true
#   (d) second save: status only; one more audit row; enabled carried, not rewritten
#   (e) R6: a no-op call refused and NO audit row · a call requesting nothing refused
#   (f) R-cas: a stale expectation returns kind=stale and writes NOTHING — not the row, not an audit row
#   (g) an off-list client_status refused
#   (h) status_changed_at is server-stamped (never an argument) and the four sync-owned columns stay NULL
#   (i) R7: an admin `authenticated` session may SELECT but its UPDATE touches 0 rows and its
#       INSERT/DELETE are refused — the RPC is the only browser write path
#   (j) static: the function is SECURITY DEFINER and carries SET search_path
#   (s) static: the function's UPDATE of client_portal_links sets ONLY enabled and client_status
#
# Plants (each removes one rule INSIDE the transaction; the ROLLBACK restores the function, and the
# caller re-checks its md5 afterwards). Every plant must make this guard FAIL:
#   PLANT=admin          the has_role admin check off            ⇒ a non-admin save succeeds
#   PLANT=jwt            the auth.uid() IS NULL check off        ⇒ an unauthenticated save succeeds
#   PLANT=frozen         the frozen check off + both freeze triggers disabled ⇒ the frozen company gets a row
#   PLANT=noaudit        the audit INSERT retargeted to a sink   ⇒ the columns change with no audit row
#   PLANT=auditfails     the audit row's status violates integrity_runs_status_check.
#                        These two plants run the COUPLING CHECK (k) instead of the suite above,
#                        because what they test is not a rule the RPC enforces but the atomicity of
#                        the change and its audit row. auditfails is therefore the one plant the
#                        correct system SURVIVES: the call must raise and the column change must roll
#                        back with it, so this plant is expected GREEN. Its falsification is the next
#                        line, which must be RED.
#   PLANT=auditswallow   auditfails PLUS an exception handler swallowing the audit INSERT's failure
#                        ⇒ the change survives a failed audit with no audit row. The coupling broken,
#                          and exactly the shape check (k) exists to catch. Expected RED.
#   PLANT=stale          the compare-and-set comparison off      ⇒ a lost race writes
#   PLANT=nochange       the R6 no-op refusal off                ⇒ a Confirm that changes nothing audits
#   PLANT=searchpath     SET search_path dropped from the function ⇒ check (j) fails
#   PLANT=policy         R7 reverted: the FOR ALL admin policy restored
#                        ⇒ a direct admin UPDATE succeeds and writes NO audit row
#
# Run:  source backups/fr-nonadmin.env && bash scripts/guards/client-portal-audit-guard.sh
#       PLANT=admin  source backups/fr-nonadmin.env && bash scripts/guards/client-portal-audit-guard.sh
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
NA=${NONADMIN_ID:-}
[ -n "$NA" ] || { echo "guard: FAIL NONADMIN_ID not set (source backups/fr-nonadmin.env)"; exit 1; }
psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1"; }
ADMIN=$(psqlq "select user_id from user_roles where role='admin' limit 1")
[ -n "$ADMIN" ] || { echo "guard: FAIL no user_roles admin row"; exit 1; }
CO=77777777-7777-4777-8777-777777777777
CO_FROZEN=77777777-7777-4777-8777-777777777778
FN=public.set_client_portal_link

fndef() { psqlq "select pg_get_functiondef('$FN'::regproc)"; }

# ── the plant, applied inside the guard transaction and undone by its ROLLBACK ────────────────────
P=""
case "${PLANT:-}" in
  admin)        P="$(psqlq "select replace(pg_get_functiondef('$FN'::regproc), 'IF NOT public.has_role(v_actor, ''admin''::app_role) THEN', 'IF false THEN')");";;
  jwt)          P="$(psqlq "select replace(pg_get_functiondef('$FN'::regproc), 'IF v_actor IS NULL THEN', 'IF false THEN')");";;
  frozen)       P="$(psqlq "select replace(pg_get_functiondef('$FN'::regproc), 'IF v_frozen THEN', 'IF false THEN')"); alter table public.client_portal_links disable trigger enforce_company_freeze; alter table public.integrity_runs disable trigger enforce_company_freeze;";;
  noaudit)      P="create table public.integrity_runs_plant_sink (like public.integrity_runs including defaults including identity); $(psqlq "select replace(pg_get_functiondef('$FN'::regproc), 'public.integrity_runs', 'public.integrity_runs_plant_sink')");";;
  auditfails)   P="$(psqlq "select replace(pg_get_functiondef('$FN'::regproc), '''completed'',', '''not_a_status'',')");";;
  auditswallow) P="$(psqlq "select replace(replace(replace(pg_get_functiondef('$FN'::regproc), '''completed'',', '''not_a_status'','), '  INSERT INTO public.integrity_runs', '  BEGIN' || chr(10) || '  INSERT INTO public.integrity_runs'), '  RETURNING id INTO v_audit_id;', '  RETURNING id INTO v_audit_id;' || chr(10) || '  EXCEPTION WHEN others THEN v_audit_id := NULL;' || chr(10) || '  END;')");";;
  stale)        P="$(psqlq "select replace(pg_get_functiondef('$FN'::regproc), 'p_expected_status IS DISTINCT FROM v_before.client_status', 'false')");";;
  nochange)     P="$(psqlq "select replace(pg_get_functiondef('$FN'::regproc), 'AND v_want_status  IS NOT DISTINCT FROM v_before.client_status THEN', 'AND false THEN')");";;
  searchpath)   P="$(psqlq "select replace(pg_get_functiondef('$FN'::regproc), 'SET search_path TO ''public'', ''pg_temp''', '')");";;
  policy)       P="create policy \"Admins can do everything with client_portal_links\" on public.client_portal_links for all to authenticated using (has_role(auth.uid(), 'admin'::app_role)) with check (has_role(auth.uid(), 'admin'::app_role));";;
  "")           P="";;
  *)            echo "guard: FAIL unknown PLANT '${PLANT:-}'"; exit 1;;
esac

MD5_BEFORE=$(fndef | md5)

case "${PLANT:-}" in auditfails|auditswallow) MODE=coupling;; *) MODE=suite;; esac

if [ "$MODE" = coupling ]; then
OUT=$(docker exec -i "$PGC" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<SQL 2>&1
BEGIN;
$P
INSERT INTO public.companies (id, name, created_by, frozen)
  VALUES ('$CO', 'GUARD cpl throwaway', '$ADMIN', false);

DO \$guard\$
DECLARE
  v_admin  text := '$ADMIN';
  v_co     uuid := '$CO';
  v_fired  boolean := false;
  v_msg    text := '';
  v_rows   int;
  v_audits int;
BEGIN
  -- (k) R4's ATOMICITY, not one of the RPC's own rules: the audit row and the column change are one
  -- transaction, so an audit INSERT that fails must take the column change down with it. Both plants
  -- break the audit INSERT; only PLANT=auditswallow also breaks the coupling, and that is the one
  -- that must be caught here.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  BEGIN PERFORM public.set_client_portal_link(v_co, true, true, NULL, 'Cold Intake');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT count(*) INTO v_rows   FROM public.client_portal_links WHERE company_id = v_co;
  SELECT count(*) INTO v_audits FROM public.integrity_runs
    WHERE component = 'client_portal_operator_set' AND surface_id = v_co;

  IF NOT v_fired THEN
    RAISE EXCEPTION 'GUARD-FAIL (k1) a failing audit INSERT did NOT abort the call — row(s)=%, audit row(s)=%: the change and its audit row are not one transaction', v_rows, v_audits;
  END IF;
  IF v_rows <> 0 OR v_audits <> 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (k2) a failing audit INSERT left row(s)=%, audit row(s)=% — the column change did not roll back with it', v_rows, v_audits;
  END IF;
  RAISE NOTICE '  ok   (k1) a failing audit INSERT aborts the whole call: %', v_msg;
  RAISE NOTICE '  ok   (k2) and the column change rolls back with it — no row, no audit row';
  RAISE NOTICE 'GUARD ALL GREEN';
END
\$guard\$;
ROLLBACK;
SQL
)
else
OUT=$(docker exec -i "$PGC" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<SQL 2>&1
BEGIN;
$P
-- throwaway companies: one unfrozen, one frozen. Never a live company.
INSERT INTO public.companies (id, name, created_by, frozen)
  VALUES ('$CO', 'GUARD cpl throwaway', '$ADMIN', false),
         ('$CO_FROZEN', 'GUARD cpl throwaway frozen', '$ADMIN', true);

DO \$guard\$
DECLARE
  v_admin      text := '$ADMIN';
  v_nonadmin   text := '$NA';
  v_co         uuid := '$CO';
  v_cofrozen   uuid := '$CO_FROZEN';
  v_fired      boolean;
  v_n          int;
  v_res        jsonb;
  v_row        public.client_portal_links%ROWTYPE;
  v_audit      public.integrity_runs%ROWTYPE;
  v_before_md5 text;
  v_def        text;
  v_msg        text;
BEGIN
  -- Sessions are switched with set_config('role'|'request.jwt.claims', ..., true) — the idiom
  -- supabase/tests/cpl1_client_portal_links.test.sql already uses. No helper function is created.

  -- ── (a) the actor gate ────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_nonadmin, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  v_fired := false;
  BEGIN PERFORM public.set_client_portal_link(v_co, true, true, NULL, 'Cold Intake');
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (a1) a non-admin save was NOT refused'; END IF;
  RAISE NOTICE '  ok   (a1) a non-admin save is refused';

  -- The two halves of the actor gate are NOT independent: has_role(NULL,'admin') is false, so the
  -- admin check alone already refuses an unauthenticated caller. The observable effect of the
  -- auth.uid() IS NULL branch is therefore the DIAGNOSIS: "no authenticated caller" rather than
  -- the misleading "caller is not an admin". That is what this check reads, and what PLANT=jwt moves.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
  v_fired := false; v_msg := '';
  BEGIN PERFORM public.set_client_portal_link(v_co, true, true, NULL, 'Cold Intake');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (a2) a save with no authenticated caller was NOT refused'; END IF;
  IF position('no authenticated caller' in v_msg) = 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (a2b) the refusal does not name the missing caller: %', v_msg;
  END IF;
  RAISE NOTICE '  ok   (a2) a save with no authenticated caller is refused';
  RAISE NOTICE '  ok   (a2b) and the refusal says so, rather than blaming the admin role';

  IF EXISTS (SELECT 1 FROM public.client_portal_links WHERE company_id = v_co) THEN
    RAISE EXCEPTION 'GUARD-FAIL (a3) a refused save still created a row';
  END IF;
  RAISE NOTICE '  ok   (a3) neither refusal created a row';

  -- become the admin for everything below
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- ── (b) R-frozen: two independent gates ───────────────────────────────────
  v_fired := false;
  BEGIN PERFORM public.set_client_portal_link(v_cofrozen, true, true, NULL, 'Cold Intake');
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (b1) a frozen company was NOT refused'; END IF;
  IF EXISTS (SELECT 1 FROM public.client_portal_links WHERE company_id = v_cofrozen) THEN
    RAISE EXCEPTION 'GUARD-FAIL (b2) the frozen company got a row';
  END IF;
  RAISE NOTICE '  ok   (b1) a frozen company is refused';
  RAISE NOTICE '  ok   (b2) and gets no row';

  -- ── (g) an off-list status is refused, before anything is written ─────────
  v_fired := false;
  BEGIN PERFORM public.set_client_portal_link(v_co, true, true, NULL, 'Archived');
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (g1) an off-list client_status was NOT refused'; END IF;
  IF EXISTS (SELECT 1 FROM public.client_portal_links WHERE company_id = v_co) THEN
    RAISE EXCEPTION 'GUARD-FAIL (g2) the off-list refusal still created a row';
  END IF;
  RAISE NOTICE '  ok   (g1) an off-list client_status is refused';
  RAISE NOTICE '  ok   (g2) and creates no row';

  -- ── (e) R6 first shape: a call that requests nothing ─────────────────────
  v_fired := false;
  BEGIN PERFORM public.set_client_portal_link(v_co, NULL, false, NULL, NULL);
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (e1) a call requesting nothing was NOT refused'; END IF;
  IF EXISTS (SELECT 1 FROM public.client_portal_links WHERE company_id = v_co) THEN
    RAISE EXCEPTION 'GUARD-FAIL (e2) a call requesting nothing created a row';
  END IF;
  RAISE NOTICE '  ok   (e1) R6 — a call requesting nothing is refused';
  RAISE NOTICE '  ok   (e2) and creates no row';

  -- ── (c) the first save ───────────────────────────────────────────────────
  v_res := public.set_client_portal_link(v_co, true, true, NULL, 'Cold Intake');
  IF (v_res ->> 'ok') <> 'true' OR (v_res ->> 'kind') <> 'saved' THEN
    RAISE EXCEPTION 'GUARD-FAIL (c1) the first save did not report saved: %', v_res;
  END IF;
  IF (v_res ->> 'row_created') <> 'true' THEN
    RAISE EXCEPTION 'GUARD-FAIL (c2) the first save did not report row_created';
  END IF;
  SELECT * INTO v_row FROM public.client_portal_links WHERE company_id = v_co;
  IF v_row.enabled IS NOT TRUE OR v_row.client_status <> 'Cold Intake' THEN
    RAISE EXCEPTION 'GUARD-FAIL (c3) stored %/%s, expected true/Cold Intake', v_row.enabled, v_row.client_status;
  END IF;
  SELECT count(*) INTO v_n FROM public.integrity_runs
    WHERE component = 'client_portal_operator_set' AND surface_id = v_co;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD-FAIL (c4) % audit row(s) after the first save, expected 1', v_n; END IF;
  SELECT * INTO v_audit FROM public.integrity_runs
    WHERE component = 'client_portal_operator_set' AND surface_id = v_co ORDER BY id DESC LIMIT 1;
  IF v_audit.surface_type <> 'client_portal_links' THEN RAISE EXCEPTION 'GUARD-FAIL (c5) surface_type is %', v_audit.surface_type; END IF;
  IF v_audit.run_ref <> 'set_client_portal_link' THEN RAISE EXCEPTION 'GUARD-FAIL (c6) run_ref is %', v_audit.run_ref; END IF;
  IF v_audit.company_id <> v_co THEN RAISE EXCEPTION 'GUARD-FAIL (c7) company_id is %', v_audit.company_id; END IF;
  IF v_audit.status <> 'completed' THEN RAISE EXCEPTION 'GUARD-FAIL (c8) status is %', v_audit.status; END IF;
  IF (v_audit.excluded_by_rule ->> 'actor') IS DISTINCT FROM v_admin THEN
    RAISE EXCEPTION 'GUARD-FAIL (c9) the audit row names actor %, expected %', v_audit.excluded_by_rule ->> 'actor', v_admin;
  END IF;
  IF (v_audit.excluded_by_rule ->> 'enabled_from') <> 'false'
     OR (v_audit.excluded_by_rule ->> 'enabled_to') <> 'true' THEN
    RAISE EXCEPTION 'GUARD-FAIL (c10) enabled from/to is %/%', v_audit.excluded_by_rule ->> 'enabled_from', v_audit.excluded_by_rule ->> 'enabled_to';
  END IF;
  IF (v_audit.excluded_by_rule -> 'client_status_from') <> 'null'::jsonb
     OR (v_audit.excluded_by_rule ->> 'client_status_to') <> 'Cold Intake' THEN
    RAISE EXCEPTION 'GUARD-FAIL (c11) client_status from/to is %/%', v_audit.excluded_by_rule -> 'client_status_from', v_audit.excluded_by_rule ->> 'client_status_to';
  END IF;
  RAISE NOTICE '  ok   (c1-c3) the first save creates the row and lands both columns';
  RAISE NOTICE '  ok   (c4) exactly ONE audit row';
  RAISE NOTICE '  ok   (c5-c8) component / surface_type / surface_id / run_ref / status as specified';
  RAISE NOTICE '  ok   (c9) the audit row names the admin as actor';
  RAISE NOTICE '  ok   (c10-c11) before/after for enabled and client_status are recorded';

  -- ── (h) status_changed_at stamped; sync-owned columns untouched ───────────
  IF v_row.status_changed_at IS NULL THEN RAISE EXCEPTION 'GUARD-FAIL (h1) status_changed_at was not stamped'; END IF;
  IF v_row.map_created_set_at IS NOT NULL OR v_row.last_synced_at IS NOT NULL
     OR v_row.last_sync_error IS NOT NULL OR v_row.last_sync_error_at IS NOT NULL
     OR v_row.notion_page_id IS NOT NULL OR v_row.last_notion_status_seen IS NOT NULL THEN
    RAISE EXCEPTION 'GUARD-FAIL (h2) the RPC touched a sync-owned column';
  END IF;
  RAISE NOTICE '  ok   (h1) status_changed_at is server-stamped';
  RAISE NOTICE '  ok   (h2) every sync-owned column is still NULL';

  -- ── (d) the second save: status only ─────────────────────────────────────
  v_res := public.set_client_portal_link(v_co, NULL, true, 'Cold Intake', 'In Progress');
  IF (v_res ->> 'kind') <> 'saved' THEN RAISE EXCEPTION 'GUARD-FAIL (d1) the second save did not report saved: %', v_res; END IF;
  SELECT * INTO v_row FROM public.client_portal_links WHERE company_id = v_co;
  IF v_row.enabled IS NOT TRUE THEN RAISE EXCEPTION 'GUARD-FAIL (d2) a status-only save changed enabled'; END IF;
  IF v_row.client_status <> 'In Progress' THEN RAISE EXCEPTION 'GUARD-FAIL (d3) the status is %', v_row.client_status; END IF;
  SELECT count(*) INTO v_n FROM public.integrity_runs
    WHERE component = 'client_portal_operator_set' AND surface_id = v_co;
  IF v_n <> 2 THEN RAISE EXCEPTION 'GUARD-FAIL (d4) % audit row(s) after two saves, expected 2', v_n; END IF;
  SELECT * INTO v_audit FROM public.integrity_runs
    WHERE component = 'client_portal_operator_set' AND surface_id = v_co ORDER BY id DESC LIMIT 1;
  IF (v_audit.excluded_by_rule ->> 'enabled_changed') <> 'false' THEN
    RAISE EXCEPTION 'GUARD-FAIL (d5) a status-only save recorded enabled_changed true';
  END IF;
  IF (v_audit.excluded_by_rule ->> 'client_status_from') <> 'Cold Intake'
     OR (v_audit.excluded_by_rule ->> 'client_status_to') <> 'In Progress' THEN
    RAISE EXCEPTION 'GUARD-FAIL (d6) the second audit row from/to is %/%', v_audit.excluded_by_rule ->> 'client_status_from', v_audit.excluded_by_rule ->> 'client_status_to';
  END IF;
  IF (v_audit.excluded_by_rule ->> 'row_created') <> 'false' THEN
    RAISE EXCEPTION 'GUARD-FAIL (d7) the second save reported row_created';
  END IF;
  RAISE NOTICE '  ok   (d1-d3) a status-only save moves the status and carries enabled';
  RAISE NOTICE '  ok   (d4) one more audit row — two saves, two rows';
  RAISE NOTICE '  ok   (d5-d7) enabled_changed false, from/to correct, row_created false';

  -- ── (e) R6 second shape: the values already stored ───────────────────────
  v_fired := false;
  BEGIN PERFORM public.set_client_portal_link(v_co, true, true, 'In Progress', 'In Progress');
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (e3) R6 — a no-op save was NOT refused'; END IF;
  SELECT count(*) INTO v_n FROM public.integrity_runs
    WHERE component = 'client_portal_operator_set' AND surface_id = v_co;
  IF v_n <> 2 THEN RAISE EXCEPTION 'GUARD-FAIL (e4) R6 — the refused no-op wrote an audit row'; END IF;
  RAISE NOTICE '  ok   (e3) R6 — a no-op save is refused';
  RAISE NOTICE '  ok   (e4) and writes no audit row';

  -- ── (f) R-cas: a stale expectation writes NOTHING ────────────────────────
  SELECT md5(t::text) INTO v_before_md5 FROM public.client_portal_links t WHERE company_id = v_co;
  v_res := public.set_client_portal_link(v_co, false, true, 'Cold Intake', 'On Hold');
  IF (v_res ->> 'ok') <> 'false' OR (v_res ->> 'kind') <> 'stale' THEN
    RAISE EXCEPTION 'GUARD-FAIL (f1) a stale expectation did not report stale: %', v_res;
  END IF;
  IF (v_res ->> 'stored_status') <> 'In Progress' THEN
    RAISE EXCEPTION 'GUARD-FAIL (f2) stale reported stored_status %', v_res ->> 'stored_status';
  END IF;
  IF (SELECT md5(t::text) FROM public.client_portal_links t WHERE company_id = v_co) <> v_before_md5 THEN
    RAISE EXCEPTION 'GUARD-FAIL (f3) a lost race changed the row — B1a: a lost race writes nothing';
  END IF;
  SELECT count(*) INTO v_n FROM public.integrity_runs
    WHERE component = 'client_portal_operator_set' AND surface_id = v_co;
  IF v_n <> 2 THEN RAISE EXCEPTION 'GUARD-FAIL (f4) a lost race wrote an audit row'; END IF;
  RAISE NOTICE '  ok   (f1-f2) a stale expectation returns kind=stale with the stored value';
  RAISE NOTICE '  ok   (f3) the row is byte-unchanged — the enabled half is NOT written (changed from B1)';
  RAISE NOTICE '  ok   (f4) and no audit row is written';

  -- ── (i) R7: the admin may only SELECT ────────────────────────────────────
  SELECT count(*) INTO v_n FROM public.client_portal_links WHERE company_id = v_co;
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD-FAIL (i1) an admin cannot SELECT the row'; END IF;
  UPDATE public.client_portal_links SET enabled = false WHERE company_id = v_co;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD-FAIL (i2) R7 — a direct admin UPDATE touched % row(s)', v_n; END IF;
  DELETE FROM public.client_portal_links WHERE company_id = v_co;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 0 THEN RAISE EXCEPTION 'GUARD-FAIL (i3) R7 — a direct admin DELETE touched % row(s)', v_n; END IF;
  v_fired := false;
  BEGIN INSERT INTO public.client_portal_links (company_id, enabled) VALUES (v_cofrozen, true);
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (i4) R7 — a direct admin INSERT was NOT refused'; END IF;
  SELECT count(*) INTO v_n FROM public.integrity_runs
    WHERE component = 'client_portal_operator_set' AND surface_id = v_co;
  IF v_n <> 2 THEN RAISE EXCEPTION 'GUARD-FAIL (i5) R7 — a direct write slipped in an audit row'; END IF;
  RAISE NOTICE '  ok   (i1) an admin SELECTs the row';
  RAISE NOTICE '  ok   (i2-i4) R7 — a direct admin UPDATE/DELETE touches nothing and INSERT is refused';
  RAISE NOTICE '  ok   (i5) still exactly two audit rows — the RPC is the only write path';

  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', '', true);

  -- ── (j) static: SECURITY DEFINER and SET search_path ─────────────────────
  v_def := pg_get_functiondef('public.set_client_portal_link'::regproc);
  IF position('SECURITY DEFINER' in v_def) = 0 THEN RAISE EXCEPTION 'GUARD-FAIL (j1) the function is not SECURITY DEFINER'; END IF;
  IF position('search_path' in v_def) = 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (j2) the SECURITY DEFINER function has no SET search_path';
  END IF;
  RAISE NOTICE '  ok   (j1-j2) SECURITY DEFINER with SET search_path';

  -- ── (s) static: the UPDATE sets ONLY enabled and client_status ───────────
  IF v_def !~ 'SET enabled = v_want_enabled, client_status = v_want_status' THEN
    RAISE EXCEPTION 'GUARD-FAIL (s1) the function UPDATE does not set exactly enabled + client_status';
  END IF;
  IF v_def ~ 'SET [^;]*(map_created_set_at|last_synced_at|last_sync_error|notion_page_id|last_notion_status_seen|status_changed_at)' THEN
    RAISE EXCEPTION 'GUARD-FAIL (s2) the function UPDATE names a sync-owned column or status_changed_at';
  END IF;
  RAISE NOTICE '  ok   (s1-s2) the function UPDATE sets only enabled and client_status';

  RAISE NOTICE 'GUARD ALL GREEN';
END
\$guard\$;
ROLLBACK;
SQL
)
fi
RC=$?

MD5_AFTER=$(fndef | md5)

echo "$OUT" | LC_ALL=C grep -E '^(NOTICE|psql).*(ok  |GUARD-FAIL|GUARD ALL GREEN)' | sed -E 's/^.*NOTICE: +//; s/^psql:[^ ]+ *//'

if [ "$MD5_BEFORE" != "$MD5_AFTER" ]; then
  echo "guard: FAIL the function body was not restored (md5 $MD5_BEFORE -> $MD5_AFTER)"; exit 1
fi
echo "  ok   (z) the function body is restored md5-identical"

if echo "$OUT" | LC_ALL=C grep -q 'GUARD ALL GREEN'; then
  echo "guard: PASS"; exit 0
fi
echo "$OUT" | LC_ALL=C grep -E 'GUARD-FAIL|ERROR' | head -3
echo "guard: FAIL"; exit 1
