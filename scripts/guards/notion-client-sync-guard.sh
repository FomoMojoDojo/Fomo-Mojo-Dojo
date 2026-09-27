#!/usr/bin/env bash
# B2b — the Notion client sync (R8–R11, 2026-09-26). Two halves, both plantable:
#
#   DB HALF      the three sync RPCs against the REAL local database, everything inside ONE
#                ROLLED-BACK transaction over a THROWAWAY company (never CB1 / CB2 / Edgewood / any
#                of the nine live client_portal_links rows).
#   SCRIPT HALF  executePlan() against an INJECTED FAKE Notion and a fake RPC — no network, no DB.
#                This is where R11's failure isolation and planned-row rule are exercised.
#
# DB checks:
#   (a) only the service role may run the sync — an authenticated admin is refused on all three RPCs
#   (b) CB1 refused · a frozen company refused · a company with enabled = false refused
#   (c) a create-at-map-created writes both columns, map_created_set_at, ONE client_status_sync audit
#       row, and closes the planned row
#   (d) R-cas: a stale p_expected_status returns kind=stale and writes NOTHING
#   (e) the promotion fires once — a second p_set_map_created is refused
#   (f) a failure records last_sync_error / last_sync_error_at and a 'failed' audit row
#   (g) static: all three RPCs are SECURITY DEFINER with SET search_path
#
# SCRIPT checks:
#   (h) R9: a create with any other parent is refused, and a patch on a page whose re-read parent is
#       another data source is refused — the PATCH is never sent
#   (i) R11 failure isolation: one company's Notion failure is recorded and the OTHERS still complete
#   (j) R13 reconciliation: a planned row whose Notion row LANDED completes with no Notion write and
#       decided_by 'reconcile'; one that did NOT land closes as failed and needs-operator. Neither
#       ever plans a Notion call.
#
# Plants (each removes one rule; the ROLLBACK or the restore puts it back, and the caller re-checks
# every function body's md5). Every plant must make this guard FAIL:
#   PLANT=nonservice   the auth.role() = 'service_role' check off   ⇒ an admin browser can sync
#   PLANT=cb1          the CB1 check off                            ⇒ CB1 is synced
#   PLANT=frozen       the frozen check off + freeze triggers off    ⇒ a frozen company is written
#   PLANT=disabled     the enabled check off                         ⇒ an unflagged company is synced
#   PLANT=stale        the R-cas comparison off                      ⇒ a stale expectation writes
#   PLANT=noaudit      the audit INSERT retargeted to a sink         ⇒ columns change with no audit row
#   PLANT=twice        the map_created_set_at once-only check off     ⇒ the promotion fires twice
#   PLANT=searchpath   SET search_path dropped from the RPCs          ⇒ check (g) fails
#   PLANT=allowlist    R9's parent checks removed from writeFetch.ts  ⇒ check (h) fails (SOURCE plant,
#                                                                      restored md5-identical)
#   PLANT=noisolation  the per-company try/catch removed from execute.ts ⇒ check (i) fails (SOURCE)
#   PLANT=reconcile-landed   the landed branch made to re-push instead of completing  ⇒ (j1) fails (SOURCE)
#   PLANT=reconcile-missing  the not-landed branch made to re-push instead of failing ⇒ (j2) fails (SOURCE)
#
# Run:  source backups/fr-nonadmin.env && bash scripts/guards/notion-client-sync-guard.sh
#       PLANT=stale source backups/fr-nonadmin.env && bash scripts/guards/notion-client-sync-guard.sh
set -uo pipefail
PGC=${PGC:-supabase_db_dzlgyxcvuwiulgifbmew}
REPO=$(cd "$(dirname "$0")/../.." && pwd)
cd "$REPO"
psqlq() { docker exec -i "$PGC" psql -U postgres -d postgres -At -c "$1"; }
ADMIN=$(psqlq "select user_id from user_roles where role='admin' limit 1")
[ -n "$ADMIN" ] || { echo "guard: FAIL no user_roles admin row"; exit 1; }
CO=66666666-6666-4666-8666-666666666666            # throwaway, flagged
CO_FROZEN=66666666-6666-4666-8666-666666666667     # throwaway, frozen
CO_OFF=66666666-6666-4666-8666-666666666668        # throwaway, enabled = false
CB1=58b2b15b-bada-4bcd-9c12-b7e66a37d0bc
GATE=public.client_portal_sync_gate
SYNC=public.sync_client_portal_link
PLAN=public.sync_plan_notion_write
FAILFN=public.sync_fail_notion_write

fndef() { psqlq "select pg_get_functiondef('$1'::regproc)"; }
md5all() { { fndef "$GATE"; fndef "$SYNC"; fndef "$PLAN"; fndef "$FAILFN"; } | md5; }
SRC_W=src/lib/notionClientSync/writeFetch.ts
SRC_E=src/lib/notionClientSync/execute.ts
SRC_P=src/lib/notionClientSync/plan.ts
srcmd5() { { cat "$SRC_W"; cat "$SRC_E"; cat "$SRC_P"; } | md5; }

# ── plants ────────────────────────────────────────────────────────────────────────────────────────
P=""; SRC_PLANTED=""
case "${PLANT:-}" in
  nonservice) P="$(psqlq "select replace(pg_get_functiondef('$GATE'::regproc), 'IF auth.role() IS DISTINCT FROM ''service_role'' THEN', 'IF false THEN')");";;
  cb1)        P="$(psqlq "select replace(pg_get_functiondef('$GATE'::regproc), 'IF p_company_id = ''58b2b15b-bada-4bcd-9c12-b7e66a37d0bc''::uuid THEN', 'IF false THEN')");";;
  frozen)     P="$(psqlq "select replace(pg_get_functiondef('$GATE'::regproc), 'IF v_frozen THEN', 'IF false THEN')"); alter table public.client_portal_links disable trigger enforce_company_freeze; alter table public.integrity_runs disable trigger enforce_company_freeze;";;
  disabled)   P="$(psqlq "select replace(pg_get_functiondef('$GATE'::regproc), 'IF NOT v_row.enabled THEN', 'IF false THEN')");";;
  stale)      P="$(psqlq "select replace(pg_get_functiondef('$SYNC'::regproc), 'IF p_expected_status IS DISTINCT FROM v_before.client_status THEN', 'IF false THEN')");";;
  noaudit)    P="create table public.ir_sink (like public.integrity_runs including defaults including identity); $(psqlq "select replace(pg_get_functiondef('$SYNC'::regproc), 'INSERT INTO public.integrity_runs', 'INSERT INTO public.ir_sink')");";;
  twice)      P="$(psqlq "select replace(pg_get_functiondef('$SYNC'::regproc), 'IF p_set_map_created AND v_before.map_created_set_at IS NOT NULL THEN', 'IF false THEN')");";;
  searchpath) P="$(psqlq "select replace(pg_get_functiondef('$SYNC'::regproc), 'SET search_path TO ''public'', ''pg_temp''', '')");";;
  allowlist)  SRC_PLANTED="$SRC_W";;
  noisolation) SRC_PLANTED="$SRC_E";;
  reconcile-landed)  SRC_PLANTED="$SRC_P";;
  reconcile-missing) SRC_PLANTED="$SRC_P";;
  "")         ;;
  *)          echo "guard: FAIL unknown PLANT '${PLANT:-}'"; exit 1;;
esac

MD5_BEFORE=$(md5all); SRC_MD5_BEFORE=$(srcmd5)

# source plants are applied to the file and restored at the end, md5-checked
if [ -n "$SRC_PLANTED" ]; then
  cp "$SRC_PLANTED" "/tmp/gplant.$$.orig"
  case "${PLANT:-}" in
    allowlist)
      python3 - "$SRC_W" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding="utf-8").read()
s=s.replace('  if (parent.data_source_id !== dataSourceId) {','  if (false) {')
s=s.replace('''      if (page.parent?.type !== "data_source_id" || page.parent.data_source_id !== opts.dataSourceId) {''','''      if (false) {''')
open(p,"w",encoding="utf-8").write(s)
PY
      ;;
    noisolation)
      python3 - "$SRC_E" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding="utf-8").read()
# the catch no longer records the failure and no longer lets the loop continue
s=s.replace('      if (msg === STALE_SENTINEL) continue; // already reported; not a failure','      if (msg === STALE_SENTINEL) continue;\n      throw e;')
open(p,"w",encoding="utf-8").write(s)
PY
      ;;
    reconcile-landed)
      python3 - "$SRC_P" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding="utf-8").read()
mark='      steps: [\n        {\n          kind: "rpc",\n          fn: "sync_client_portal_link",'
push='      steps: [\n        { kind: "notion", op: "createRow", label: "RE-PUSH (planted)", args: { name: m.companyName, mojoMapId: m.companyId, status: planned.to } },\n        {\n          kind: "rpc",\n          fn: "sync_client_portal_link",'
assert mark in s
open(p,"w",encoding="utf-8").write(s.replace(mark,push,1))
PY
      ;;
    reconcile-missing)
      python3 - "$SRC_P" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding="utf-8").read()
mark='    steps: [\n      {\n        kind: "rpc",\n        fn: "sync_fail_notion_write",'
push='    steps: [\n      { kind: "notion", op: "createRow", label: "RE-PUSH (planted)", args: { name: m.companyName, mojoMapId: m.companyId, status: planned.to } },\n      {\n        kind: "rpc",\n        fn: "sync_fail_notion_write",'
assert mark in s
open(p,"w",encoding="utf-8").write(s.replace(mark,push,1))
PY
      ;;
  esac
fi

FAILED=0
note() { echo "  ok   $1"; }
bad()  { echo "  FAIL $1"; FAILED=1; }

# ── DB half ───────────────────────────────────────────────────────────────────────────────────────
DBOUT=$(docker exec -i "$PGC" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 <<SQL 2>&1
BEGIN;
$P
INSERT INTO public.companies (id, name, created_by, frozen) VALUES
  ('$CO',        'GUARD b2b throwaway',        '$ADMIN', false),
  ('$CO_FROZEN', 'GUARD b2b throwaway frozen', '$ADMIN', false),
  ('$CO_OFF',    'GUARD b2b throwaway off',    '$ADMIN', false);
-- The frozen throwaway gets its row BEFORE it is frozen, on purpose. enforce_company_freeze would
-- refuse the insert afterwards, and without a row the gate refuses at "has no client_portal_links
-- row" and never reaches its frozen check — so PLANT=frozen would pass for the wrong reason.
INSERT INTO public.client_portal_links (company_id, enabled, client_status) VALUES
  ('$CO', true, 'Cold Intake'),
  ('$CO_FROZEN', true, 'Cold Intake'),
  ('$CO_OFF', false, 'Cold Intake');
UPDATE public.companies SET frozen = true WHERE id = '$CO_FROZEN';

DO \$g\$
DECLARE
  v_admin text := '$ADMIN';
  v_co uuid := '$CO'; v_fz uuid := '$CO_FROZEN'; v_off uuid := '$CO_OFF'; v_cb1 uuid := '$CB1';
  v_fired boolean; v_n int; v_res jsonb; v_row public.client_portal_links%ROWTYPE;
  v_plan bigint; v_md5 text; v_def text; v_msg text;
BEGIN
  -- (a) service role only
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  FOR v_n IN 1..3 LOOP
    v_fired := false;
    BEGIN
      IF v_n = 1 THEN PERFORM public.sync_plan_notion_write(v_co, 'create', NULL, 'Map Created', NULL);
      ELSIF v_n = 2 THEN PERFORM public.sync_client_portal_link(v_co, 'seed-seen', 'Cold Intake');
      ELSE PERFORM public.sync_fail_notion_write(v_co, 'push', 'boom', NULL); END IF;
    EXCEPTION WHEN others THEN v_fired := true; END;
    IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (a%) an authenticated admin ran a sync RPC', v_n; END IF;
  END LOOP;
  -- become the service role. auth.role() reads the JWT CLAIM, not the Postgres role, so the claim is
  -- what has to change; the Postgres role is irrelevant to a SECURITY DEFINER function.
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  PERFORM set_config('role', 'postgres', true);
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'GUARD-FAIL (a0) the guard could not become the service role — auth.role() is %', auth.role();
  END IF;
  RAISE NOTICE '  ok   (a) all three sync RPCs refuse an authenticated admin — service role only';

  -- (b) CB1 / frozen / not flagged. CB1 is ITSELF frozen, so with the CB1 branch removed the frozen
  -- branch still refuses it — the two are not independent. What the CB1 branch uniquely provides is
  -- the DIAGNOSIS, and that is the load-bearing property: CB1 is refused AS CB1, so the refusal would
  -- still stand if CB1 ever stopped being frozen. So the message is what is asserted.
  v_fired := false; v_msg := '';
  BEGIN PERFORM public.sync_client_portal_link(v_cb1, 'seed-seen', NULL);
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (b1) CB1 was synced'; END IF;
  IF position('CB1 is never synced' in v_msg) = 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (b1b) CB1 was refused, but not AS CB1: %', v_msg;
  END IF;

  v_fired := false; v_msg := '';
  BEGIN PERFORM public.sync_client_portal_link(v_fz, 'seed-seen', 'Cold Intake');
  EXCEPTION WHEN others THEN v_fired := true; v_msg := SQLERRM; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (b2) a frozen company was synced'; END IF;
  IF position('frozen reference fixture' in v_msg) = 0 THEN
    RAISE EXCEPTION 'GUARD-FAIL (b2b) the frozen company was refused, but not for being frozen: %', v_msg;
  END IF;
  SELECT * INTO v_row FROM public.client_portal_links WHERE company_id = v_fz;
  IF v_row.last_synced_at IS NOT NULL OR v_row.notion_page_id IS NOT NULL THEN
    RAISE EXCEPTION 'GUARD-FAIL (b2c) the frozen company row was written';
  END IF;

  v_fired := false;
  BEGIN PERFORM public.sync_client_portal_link(v_off, 'seed-seen', 'Cold Intake');
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (b3) an unflagged company was synced'; END IF;
  RAISE NOTICE '  ok   (b1) CB1 is refused, and refused AS CB1 rather than merely as a frozen row';
  RAISE NOTICE '  ok   (b2) a frozen company is refused, for being frozen, and nothing is written to it';
  RAISE NOTICE '  ok   (b3) a company with enabled = false is refused';

  -- (c) the happy path: create-at-map-created
  v_plan := public.sync_plan_notion_write(v_co, 'create-at-map-created', 'Cold Intake', 'Map Created', NULL);
  SELECT count(*) INTO v_n FROM public.integrity_runs WHERE id = v_plan AND status = 'planned';
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD-FAIL (c1) the planned row was not written'; END IF;
  v_res := public.sync_client_portal_link(v_co, 'create-at-map-created', 'Cold Intake', true, 'Map Created',
             'notion-page-1', 'Map Created', true, v_plan);
  IF (v_res ->> 'ok') <> 'true' THEN RAISE EXCEPTION 'GUARD-FAIL (c2) the sync did not report ok: %', v_res; END IF;
  SELECT * INTO v_row FROM public.client_portal_links WHERE company_id = v_co;
  IF v_row.client_status <> 'Map Created' OR v_row.map_created_set_at IS NULL
     OR v_row.notion_page_id <> 'notion-page-1' OR v_row.last_notion_status_seen <> 'Map Created'
     OR v_row.last_synced_at IS NULL THEN
    RAISE EXCEPTION 'GUARD-FAIL (c3) the row is wrong after the sync: %/%/%/%', v_row.client_status, v_row.map_created_set_at, v_row.notion_page_id, v_row.last_notion_status_seen;
  END IF;
  SELECT count(*) INTO v_n FROM public.integrity_runs
    WHERE component = 'client_status_sync' AND surface_id = v_co AND status = 'completed';
  IF v_n <> 2 THEN RAISE EXCEPTION 'GUARD-FAIL (c4) expected 2 completed rows (the audit + the closed plan), got %', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.integrity_runs WHERE id = v_plan AND status = 'completed';
  IF v_n <> 1 THEN RAISE EXCEPTION 'GUARD-FAIL (c5) the planned row was not closed'; END IF;
  RAISE NOTICE '  ok   (c) create-at-map-created writes both columns, map_created_set_at, one audit row, and closes the plan';

  -- (d) R-cas: a stale expectation writes nothing
  SELECT md5(t::text) INTO v_md5 FROM public.client_portal_links t WHERE company_id = v_co;
  SELECT count(*) INTO v_n FROM public.integrity_runs WHERE component = 'client_status_sync' AND surface_id = v_co;
  v_res := public.sync_client_portal_link(v_co, 'push', 'Cold Intake');  -- stored is now 'Map Created'
  IF (v_res ->> 'kind') <> 'stale' THEN RAISE EXCEPTION 'GUARD-FAIL (d1) a stale expectation did not report stale: %', v_res; END IF;
  IF (SELECT md5(t::text) FROM public.client_portal_links t WHERE company_id = v_co) <> v_md5 THEN
    RAISE EXCEPTION 'GUARD-FAIL (d2) a stale expectation changed the row';
  END IF;
  IF (SELECT count(*) FROM public.integrity_runs WHERE component = 'client_status_sync' AND surface_id = v_co) <> v_n THEN
    RAISE EXCEPTION 'GUARD-FAIL (d3) a stale expectation wrote an audit row';
  END IF;
  RAISE NOTICE '  ok   (d) R-cas — a stale expected status returns stale and writes NOTHING';

  -- (e) the promotion fires once
  v_fired := false;
  BEGIN PERFORM public.sync_client_portal_link(v_co, 'map-created', 'Map Created', true, 'Map Created', NULL, 'Map Created', true, NULL);
  EXCEPTION WHEN others THEN v_fired := true; END;
  IF NOT v_fired THEN RAISE EXCEPTION 'GUARD-FAIL (e) map_created_set_at was set twice'; END IF;
  RAISE NOTICE '  ok   (e) the Map Created promotion is refused a second time';

  -- (f) failure isolation records itself
  v_plan := public.sync_plan_notion_write(v_co, 'push', 'Map Created', 'On Hold', 'notion-page-1');
  PERFORM public.sync_fail_notion_write(v_co, 'push', 'Notion 502 boom', v_plan);
  SELECT * INTO v_row FROM public.client_portal_links WHERE company_id = v_co;
  IF v_row.last_sync_error IS NULL OR v_row.last_sync_error_at IS NULL THEN
    RAISE EXCEPTION 'GUARD-FAIL (f1) a failure did not record last_sync_error';
  END IF;
  SELECT count(*) INTO v_n FROM public.integrity_runs
    WHERE component = 'client_status_sync' AND surface_id = v_co AND status = 'failed';
  IF v_n <> 2 THEN RAISE EXCEPTION 'GUARD-FAIL (f2) expected 2 failed rows (the failure + the closed plan), got %', v_n; END IF;
  RAISE NOTICE '  ok   (f) a failure records last_sync_error and a failed audit row, and closes the plan';

  -- (g) static
  FOR v_def IN SELECT pg_get_functiondef(x::regproc) FROM (VALUES ('$SYNC'),('$PLAN'),('$FAILFN')) AS t(x) LOOP
    IF position('SECURITY DEFINER' in v_def) = 0 THEN RAISE EXCEPTION 'GUARD-FAIL (g1) an RPC is not SECURITY DEFINER'; END IF;
    IF position('search_path' in v_def) = 0 THEN RAISE EXCEPTION 'GUARD-FAIL (g2) an RPC has no SET search_path'; END IF;
  END LOOP;
  RAISE NOTICE '  ok   (g) all three RPCs are SECURITY DEFINER with SET search_path';

  RAISE NOTICE 'DB HALF GREEN';
END
\$g\$;
ROLLBACK;
SQL
)
echo "$DBOUT" | LC_ALL=C grep -E 'NOTICE' | sed -E 's/^.*NOTICE: +//' | LC_ALL=C grep -v 'DB HALF GREEN'
echo "$DBOUT" | LC_ALL=C grep -q 'DB HALF GREEN' || { echo "$DBOUT" | LC_ALL=C grep -E 'GUARD-FAIL|ERROR' | head -2; FAILED=1; }

# ── SCRIPT half: executePlan + the R9 gates against fakes ─────────────────────────────────────────
DRIVER=$(mktemp /tmp/b2b-driver.XXXXXX.ts)
cat > "$DRIVER" <<'TS'
import { assertCreateParent, createNotionWriteClient, WriteRefusedError } from "@/lib/notionClientSync/writeFetch";
import { executePlan, type Writer } from "@/lib/notionClientSync/execute";
import { reconcilePlan, planSteps } from "@/lib/notionClientSync/plan";
import { decide, type MojoSide } from "@/lib/notionClientSync/decide";

const DS = "31af0a3f-6171-83a0-9da8-87337f0ffc6d";
const OTHER = "ce841712-c5c7-4565-ba16-f37d450ec80f";
const fails: string[] = [];
const ok = (m: string) => console.log(`  ok   ${m}`);
const bad = (m: string) => { fails.push(m); console.log(`  FAIL ${m}`); };

// (h) R9's two parent gates
try { assertCreateParent({ parent: { type: "data_source_id", data_source_id: OTHER } }, DS); bad("(h1) a create with another data source as parent was ACCEPTED"); }
catch (e) { if (e instanceof WriteRefusedError) ok("(h1) a create with another data source as parent is refused"); else bad("(h1) wrong error: " + String(e)); }

let patchSent = false;
const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = new URL(String(input)); const m = init?.method ?? "GET";
  if (m === "PATCH") patchSent = true;
  if (m === "GET") return new Response(JSON.stringify({ id: "p1", last_edited_time: "t", parent: { type: "data_source_id", data_source_id: OTHER } }), { status: 200 });
  return new Response(JSON.stringify({ id: "p1" }), { status: 200 });
}) as unknown as typeof fetch;
const w = createNotionWriteClient({ token: "t", dataSourceId: DS, fetchImpl: fakeFetch });
try { await w.patchStatus("3b2f0a3f-6171-807b-81e4-d3649ffbf0c3", "On Hold"); bad("(h2) a patch on a FOREIGN page was ACCEPTED"); }
catch (e) { if (e instanceof WriteRefusedError && !patchSent) ok("(h2) a patch on a page whose re-read parent is another data source is refused, and the PATCH is never sent"); else bad("(h2) " + (patchSent ? "the PATCH was sent" : "wrong error: " + String(e))); }

// (i) R11 failure isolation: company 2 of 3 fails at Notion; 1 and 3 must still complete
const mk = (id: string, name: string): MojoSide => ({ companyId: id, companyName: name, clientStatus: "Cold Intake", statusChangedAt: "t", lastNotionStatusSeen: null, lastSyncedAt: null, mapCreatedSetAt: null, notionPageId: null });
const B = { finished: true, longRunnerRunIds: ["x"], publicBaselineRunIds: [1] };
const work = ["a", "b", "c"].map((k, i) => {
  const m = mk(`0000000${i}-0000-4000-8000-00000000000${i}`, `co-${k}`);
  return { companyId: m.companyId, companyName: m.companyName, action: "create-at-map-created", steps: planSteps(decide(m, null, B), m, null) };
});
const rpcLog: string[] = [];
const writer: Writer = {
  createRow: async (a) => { if (a.name === "co-b") throw new Error("Notion 502 injected"); return { pageId: "pg-" + a.name }; },
  patchStatus: async () => {},
};
const rpc = async (fn: string, args: Record<string, unknown>) => {
  rpcLog.push(`${fn}:${String(args.p_company_id).slice(-1)}`);
  if (fn === "sync_plan_notion_write") return 900;
  if (fn === "sync_client_portal_link") return { ok: true, kind: "saved", audit_id: 901 };
  return { ok: false, kind: "failed", audit_id: 902 };
};
// executePlan must NOT throw: a company's failure belongs to that company. If it escapes, the run
// died instead of isolating — which is what PLANT=noisolation removes, so name it rather than crash.
let out: Awaited<ReturnType<typeof executePlan>> = [];
try { out = await executePlan(work, { writer, rpc }); }
catch (e) { bad(`(i0) executePlan THREW instead of isolating one company's failure: ${e instanceof Error ? e.message : String(e)}`); }
const done = out.filter((o) => o.result === "done").map((o) => o.company);
const failed = out.filter((o) => o.result === "FAILED").map((o) => o.company);
if (done.length === 2 && done.includes("co-a") && done.includes("co-c") && failed.length === 1 && failed[0] === "co-b") ok("(i1) one company's Notion failure is isolated — the other two still complete");
else bad(`(i1) isolation broken: done=${JSON.stringify(done)} failed=${JSON.stringify(failed)}`);
if (rpcLog.includes("sync_fail_notion_write:1")) ok("(i2) the failed company recorded itself through sync_fail_notion_write (last_sync_error)");
else bad(`(i2) no failure was recorded: ${JSON.stringify(rpcLog)}`);

// (j) R13 reconciliation — neither outcome may ever plan a Notion call
const pm: MojoSide = mk("43c95754-ea3f-41f0-87e7-7f23da53a382", "Lumio");
const PLANNED = { id: 6400, action: "create-at-map-created", to: "Map Created" };
const landedN = { pageId: "pg-landed", status: "Map Created", lastEditedTime: "t" };

const rl = reconcilePlan(pm, landedN, PLANNED);
const rlArgs = rl.steps[0]?.args as Record<string, unknown> | undefined;
if (rl.action === "reconcile-completed" && !rl.steps.some((x) => x.kind === "notion") && rl.steps.length === 1
    && rlArgs?.p_decided_by === "reconcile" && rlArgs?.p_notion_page_id === "pg-landed" && rlArgs?.p_planned_audit_id === 6400) {
  ok("(j1) a planned row whose Notion row LANDED completes from what was read — no Notion write, page linked, plan closed, decided_by reconcile");
} else {
  bad(`(j1) the landed branch is wrong: action=${rl.action} notionSteps=${rl.steps.filter((x) => x.kind === "notion").length} steps=${rl.steps.length}`);
}

for (const [label, nn] of [["no row", null], ["a different Status", { pageId: "p", status: "On Hold", lastEditedTime: "t" }]] as Array<[string, typeof landedN | null]>) {
  const rf = reconcilePlan(pm, nn, PLANNED);
  const notionSteps = rf.steps.filter((x) => x.kind === "notion").length;
  const isFail = rf.steps.length === 1 && rf.steps[0].kind === "rpc" && rf.steps[0].fn === "sync_fail_notion_write";
  if (rf.action === "reconcile-failed" && notionSteps === 0 && isFail && /NEEDS OPERATOR/.test(rf.rule)) {
    ok(`(j2) a planned row that did NOT land (${label}) closes as failed and needs-operator — no Notion write`);
  } else {
    bad(`(j2) the not-landed branch (${label}) is wrong: action=${rf.action} notionSteps=${notionSteps} isFail=${isFail}`);
  }
}

console.log(fails.length === 0 ? "SCRIPT HALF GREEN" : "SCRIPT HALF RED");
TS
SCRIPTOUT=$(npx vite-node "$DRIVER" 2>&1)
rm -f "$DRIVER"
echo "$SCRIPTOUT" | LC_ALL=C grep -E '^  (ok|FAIL) ' || true
echo "$SCRIPTOUT" | LC_ALL=C grep -q 'SCRIPT HALF GREEN' || { echo "$SCRIPTOUT" | LC_ALL=C grep -vE '^  (ok|FAIL) |Experimental|trace-warnings' | head -3; FAILED=1; }

# ── restore and verify ────────────────────────────────────────────────────────────────────────────
if [ -n "$SRC_PLANTED" ]; then cp "/tmp/gplant.$$.orig" "$SRC_PLANTED"; rm -f "/tmp/gplant.$$.orig"; fi
MD5_AFTER=$(md5all); SRC_MD5_AFTER=$(srcmd5)
[ "$MD5_BEFORE" = "$MD5_AFTER" ] || { echo "  FAIL (z1) an RPC body was not restored"; FAILED=1; }
[ "$SRC_MD5_BEFORE" = "$SRC_MD5_AFTER" ] || { echo "  FAIL (z2) a source file was not restored"; FAILED=1; }
[ $FAILED -eq 0 ] && echo "  ok   (z) every RPC body and source file is restored md5-identical"

[ $FAILED -eq 0 ] && { echo "guard: PASS"; exit 0; }
echo "guard: FAIL"; exit 1
