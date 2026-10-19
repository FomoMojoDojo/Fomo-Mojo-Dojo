// ── b3 REVIEW DECIDE — Notion Verdict → operator_decision, compare-and-set (R11, 2026-10-18). DRY RUN BY DEFAULT. ──
//
//   npx vite-node scripts/b3-review-decide.ts -- --company=<uuid> --run-id=<uuid> --fixture=<pages.json>
//       dry run against a FIXTURE (no Notion call): prints what it would write
//   npx vite-node scripts/b3-review-decide.ts -- --company=<uuid> --run-id=<uuid>
//       dry run against Notion (reads the allow-listed database's pages; writes nothing)
//   … --live     writes operator_decision / decided_at / decided_by 'operator' / notion_page_id by review row id,
//                compare-and-set: a row already decided differently is REFUSED, never overwritten; one integrity row per run.
//
// Fixture shape: [{ "page_id": "...", "review_row_id": "<outside_recrawl_review.id>", "verdict": "Approve"|"Reject"|null, "comment": "..." }]
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAllowedDatabase, assertAllowedDataSource, planDecisions, REVIEW_DB_PROPERTIES, type DecisionInput, type ReviewRowState } from "../src/lib/b3Review/review";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(REPO_ROOT, "backups/client-sync.env");
const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";
const NOTION_API_VERSION = "2026-03-11";
const NOTION_BASE = "https://api.notion.com";
export const DECIDE_COMPONENT = "r3_outside_review_decide";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const company = arg("company"); const runId = arg("run-id"); const fixture = arg("fixture"); const dbIdArg = arg("database-id");
const live = process.argv.includes("--live");
function fail(msg: string, code = 1): never { console.error(`\n✗ ${msg}\n`); process.exit(code); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!company || !UUID.test(company)) fail("required: --company=<uuid>");
if (!runId || !UUID.test(runId)) fail("required: --run-id=<uuid>");
if (live && fixture) fail("--live reads Notion; a --fixture run is dry-run only");

function psql(sql: string, vars: Record<string, string> = {}): string {
  const args = ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  return execFileSync("docker", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
const b64Sql = (obj: unknown): string => `convert_from(decode('${Buffer.from(JSON.stringify(obj), "utf8").toString("base64")}','base64'),'utf8')::jsonb`;
function envValue(key: string): string | null {
  let raw: string;
  try { raw = readFileSync(ENV_PATH, "utf8"); } catch { return null; }
  for (const line of raw.split("\n")) { const t = line.trim(); if (t.startsWith(`${key}=`)) return t.slice(key.length + 1); }
  return null;
}

// ── verdict source: fixture (dry-run only) or the allow-listed Notion database ────────────────────
let inputs: DecisionInput[];
if (fixture) {
  const raw = JSON.parse(readFileSync(fixture, "utf8")) as Array<Record<string, unknown>>;
  inputs = raw.map((p) => ({ page_id: String(p.page_id ?? ""), review_row_id: String(p.review_row_id ?? ""), verdict: p.verdict == null ? null : String(p.verdict), comment: p.comment == null ? null : String(p.comment) }));
} else {
  // The allow-listed database: the env file, or the process env (the guard's seam — it never edits the operator's file).
  const allowed = process.env.B3_REVIEW_NOTION_DATABASE_ID ?? envValue("B3_REVIEW_NOTION_DATABASE_ID");
  let databaseId: string;
  try { databaseId = assertAllowedDatabase(dbIdArg ?? allowed, allowed); } catch (e) { fail((e as Error).message, 2); }
  let ds: string;
  try { ds = assertAllowedDataSource(process.env.B3_REVIEW_NOTION_DATA_SOURCE_ID ?? envValue("B3_REVIEW_NOTION_DATA_SOURCE_ID")); } catch (e) { fail((e as Error).message, 2); }
  const token = envValue("NOTION_TOKEN");
  if (!token) fail(`${ENV_PATH} has no NOTION_TOKEN`);
  const headers = { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_API_VERSION, "content-type": "application/json" };
  // READ: the data source must belong to the allow-listed database
  const dsRes = await fetch(`${NOTION_BASE}/v1/data_sources/${ds}`, { headers });
  if (!dsRes.ok) fail(`notion GET data source -> ${dsRes.status}`);
  const parentDb = String(((await dsRes.json()) as { parent?: { database_id?: string } }).parent?.database_id ?? "").replace(/-/g, "").toLowerCase();
  if (parentDb !== databaseId) fail(`decide refused: data source belongs to database ${parentDb.slice(0, 8)}…, not the allow-listed ${databaseId.slice(0, 8)}…`, 2);
  const q = await fetch(`${NOTION_BASE}/v1/data_sources/${ds}/query`, { method: "POST", headers, body: JSON.stringify({ page_size: 100 }) });   // READ (a query)
  if (!q.ok) fail(`notion query -> ${q.status}`);
  type Pg = { id: string; properties: Record<string, { select?: { name?: string } | null; rich_text?: Array<{ plain_text?: string }> }> };
  const results = ((await q.json()) as { results?: Pg[] }).results ?? [];
  inputs = results.map((pg) => ({
    page_id: pg.id,
    review_row_id: pg.properties[REVIEW_DB_PROPERTIES.review_row_id]?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? "",
    verdict: pg.properties[REVIEW_DB_PROPERTIES.verdict]?.select?.name ?? null,
    comment: pg.properties[REVIEW_DB_PROPERTIES.comment]?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? null,
  }));
}
inputs = inputs.filter((i) => i.review_row_id);

// ── the rows as they stand (this company, this run) ───────────────────────────────────────────────
const hasPageCol = psql("select count(*) from information_schema.columns where table_name='outside_recrawl_review' and column_name='notion_page_id';") === "1";
const ids = [...new Set(inputs.map((i) => i.review_row_id))].filter((id) => UUID.test(id));
const rows: ReviewRowState[] = ids.length === 0 ? [] : JSON.parse(psql(
  `select coalesce(json_agg(json_build_object('id', id, 'operator_decision', operator_decision, 'decided_by', decided_by, 'notion_page_id', ${hasPageCol ? "notion_page_id" : "null"})),'[]')
     from outside_recrawl_review where company_id=:'c' and run_id=:'r'::uuid and id = any(array(select jsonb_array_elements_text(${b64Sql(ids)}))::uuid[]);`, { c: company!, r: runId! }) || "[]");
const plan = planDecisions(inputs, new Map(rows.map((r) => [r.id, r])));
const writes = plan.filter((p) => p.action === "write"); const refusals = plan.filter((p) => p.action === "refuse"); const noops = plan.filter((p) => p.action === "noop");

console.log(`\nB3 REVIEW DECIDE${live ? " (LIVE)" : " (DRY-RUN — writes nothing)"} · company ${company} · run ${runId} · source ${fixture ? "fixture " + fixture : "notion"}`);
console.log(`verdicts read: ${inputs.length} · rows found: ${rows.length} · would write ${writes.length} · refuse ${refusals.length} · no-op ${noops.length} · notion_page_id column: ${hasPageCol ? "present" : "ABSENT (migration 20261019120000 not applied)"}\n`);
for (const p of plan) console.log(`  ${p.action.toUpperCase().padEnd(6)} row ${p.review_row_id.slice(0, 8)}… page ${p.page_id.slice(0, 8)}…${p.action === "write" ? ` → ${p.decision}` : ""}  — ${p.reason}`);
if (!live) { console.log(`\nwrites: 0 (dry-run)`); process.exit(0); }

// ── LIVE: compare-and-set per row, then ONE integrity row ────────────────────────────────────────
if (!hasPageCol) fail("live decide refused: outside_recrawl_review.notion_page_id is absent — apply migration 20261019120000 first");
let applied = 0;
const failed: Array<{ review_row_id: string; reason: string }> = [];
for (const w of writes) {
  if (w.action !== "write") continue;
  const n = psql(
    `with upd as (update outside_recrawl_review set operator_decision=:'d', decided_at=now(), decided_by='operator', notion_page_id=:'p'
        where id=:'id'::uuid and company_id=:'c' and run_id=:'r'::uuid and (operator_decision is null or operator_decision=:'d') returning 1)
     select count(*) from upd;`, { d: w.decision, p: w.page_id, id: w.review_row_id, c: company!, r: runId! });
  if (n === "1") applied++; else failed.push({ review_row_id: w.review_row_id, reason: `compare-and-set matched ${n} row(s)` });
}
const ledger = psql(
  `with p as (select ${b64Sql({
    company_id: company, component: DECIDE_COMPONENT, surface_type: "outside_review", status: failed.length ? "failed" : "completed",
    examined: inputs.length, admitted: applied,
    excluded_by_rule: { run_id: runId, source: "notion", writes: writes.map((w) => w.review_row_id), refused: refusals, noop: noops.map((n) => n.review_row_id), failed },
    run_ref: `${DECIDE_COMPONENT}_${runId}_${new Date().toISOString()}`,
  })} j),
   ins as (insert into integrity_runs (company_id, component, surface_type, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
           select (j->>'company_id')::uuid, j->>'component', j->>'surface_type', now(), j->>'status', (j->>'examined')::int, (j->>'admitted')::int, j->'excluded_by_rule', j->>'run_ref' from p returning id)
   select id from ins;`);
console.log(`\napplied ${applied} · failed ${failed.length} · ledger integrity_runs.id = ${ledger}`);
process.exit(failed.length ? 1 : 0);
