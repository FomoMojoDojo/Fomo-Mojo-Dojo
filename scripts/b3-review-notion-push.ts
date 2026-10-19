// ── b3 REVIEW PUSH — review rows → one Notion page per URL (R11, operator ruling 2026-10-18). DRY RUN BY DEFAULT. ──
//
//   npx vite-node scripts/b3-review-notion-push.ts -- --company=<uuid> --run-id=<uuid> --plan=<b3plan-r10.tsv>
//       dry run: prints the pages it would create, reads NO token, touches NO network
//   npx vite-node scripts/b3-review-notion-push.ts -- --company=<uuid> --run-id=<uuid> --plan=<tsv> --live
//       creates the pages. Requires the review rows to exist (--from-snapshots --write first) and the
//       allow-listed database: B3_REVIEW_NOTION_DATABASE_ID in backups/client-sync.env, matched against
//       --database-id (or used when --database-id is absent). ANY other id is refused before a token is read.
//
// Why a separate allow-list from notion-client-sync: that client's write guard is bound to the Client
// Portals data source. This push may create pages ONLY under the review database's data source, and may
// send exactly three requests: GET /v1/databases/{allowed} (to learn its data source and properties),
// POST /v1/data_sources/{ds}/query (to refuse a duplicate URL), POST /v1/pages with that data source as parent.
// The operator's two properties, Verdict and Comment, are never written.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAllowedDatabase, notionPageProperties, parsePlanTsv, planRowsFor, REVIEW_DB_PROPERTIES, VERDICT_OPTIONS, type ReviewPagePlan } from "../src/lib/b3Review/review";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(REPO_ROOT, "backups/client-sync.env");
const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";
const NOTION_API_VERSION = "2026-03-11";
const NOTION_BASE = "https://api.notion.com";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const company = arg("company"); const runId = arg("run-id"); const planPath = arg("plan");
const dbIdArg = arg("database-id");
const live = process.argv.includes("--live");
function fail(msg: string, code = 1): never { console.error(`\n✗ ${msg}\n`); process.exit(code); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!company || !UUID.test(company)) fail("required: --company=<uuid>");
if (!runId || !UUID.test(runId)) fail("required: --run-id=<uuid> (the --from-snapshots run)");
if (!planPath) fail("required: --plan=<b3plan-r10.tsv>");

function psql(sql: string, vars: Record<string, string> = {}): string {
  const args = ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA"];
  for (const [k, v] of Object.entries(vars)) args.push("-v", `${k}=${v}`);
  return execFileSync("docker", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
/** Read ONE key from the env file without printing anything. Absent file or key ⇒ null. */
function envValue(key: string): string | null {
  let raw: string;
  try { raw = readFileSync(ENV_PATH, "utf8"); } catch { return null; }
  for (const line of raw.split("\n")) { const t = line.trim(); if (t.startsWith(`${key}=`)) return t.slice(key.length + 1); }
  return null;
}

// ── the allow-list, decided FIRST, before any token is read ───────────────────────────────────────
// The allow-listed database: the env file, or the process env (the guard's seam — it never edits the operator's file).
const allowed = process.env.B3_REVIEW_NOTION_DATABASE_ID ?? envValue("B3_REVIEW_NOTION_DATABASE_ID");
let databaseId: string | null = null;
try {
  databaseId = assertAllowedDatabase(dbIdArg ?? allowed, allowed);
} catch (e) {
  if (live || dbIdArg) fail((e as Error).message, 2);   // a wrong id is refused even in dry run; an unset list only blocks --live
  console.log(`(allow-list) ${(e as Error).message} — dry run continues without a database`);
}

// ── rows: the review rows of this run if they exist, else the plan rows with a pending id ──────────
const coName = psql("select name from companies where id=:'c';", { c: company! });
if (!coName) fail(`no company ${company}`);
const plan = planRowsFor(parsePlanTsv(readFileSync(planPath!, "utf8")), coName);
type RR = { id: string; source_url: string; dependent_signal_ids: string[]; baseline_sha256: string | null; operator_decision: string | null };
const reviewRows: RR[] = JSON.parse(psql(
  `select coalesce(json_agg(json_build_object('id', id, 'source_url', source_url, 'dependent_signal_ids', dependent_signal_ids, 'baseline_sha256', baseline_sha256, 'operator_decision', operator_decision) order by source_url),'[]')
     from outside_recrawl_review where company_id=:'c' and run_id=:'r'::uuid and disposition='b3_from_snapshot';`, { c: company!, r: runId! }) || "[]");
const byUrl = new Map(reviewRows.map((r) => [r.source_url, r]));
const pages: ReviewPagePlan[] = plan.kept.map((p) => ({
  company: coName, url: p.url, snapshot_id: p.snapshot_id, chars: p.chars, at_cap: p.at_cap,
  blanked_rows: byUrl.get(p.url)?.dependent_signal_ids.length ?? p.blanked_rows,
  review_row_id: byUrl.get(p.url)?.id ?? null,
}));
const pending = pages.filter((p) => !p.review_row_id).length;

console.log(`\nB3 REVIEW PUSH${live ? " (LIVE)" : " (DRY-RUN — no Notion call, no token read)"} · ${coName} · run ${runId}`);
console.log(`database: ${databaseId ? databaseId.slice(0, 8) + "…" : "(none allow-listed)"} · pages: ${pages.length} · review rows found: ${reviewRows.length} · pending review ids: ${pending}`);
console.log(`schema: ${Object.values(REVIEW_DB_PROPERTIES).join(" · ")} · Verdict options: ${VERDICT_OPTIONS.join("/")}\n`);
for (const p of pages) {
  console.log(`  ${p.url}`);
  console.log(`    snapshot ${p.snapshot_id.slice(0, 8)}… chars ${p.chars} at_cap ${p.at_cap} blanked_rows ${p.blanked_rows} review_row_id ${p.review_row_id ?? "(pending — run --from-snapshots --write first)"}`);
}
if (!live) { console.log(`\nwrites: 0 (dry-run) · would create ${pages.length} page(s)`); process.exit(0); }

// ── LIVE ─────────────────────────────────────────────────────────────────────────────────────────
if (pending > 0) fail(`live push refused: ${pending} page(s) have no review row yet — run --from-snapshots --write and retry`);
if (!databaseId) fail("live push refused: no allow-listed database", 2);
const token = envValue("NOTION_TOKEN");
if (!token) fail(`${ENV_PATH} has no NOTION_TOKEN`);
let dataSourceId: string | null = null;
async function notion(method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
  // THE allow-list of (method, path): three shapes, nothing else leaves this process.
  const ok = (method === "GET" && path === `/v1/databases/${databaseId}`)
    || (method === "POST" && dataSourceId !== null && path === `/v1/data_sources/${dataSourceId}/query`)
    || (method === "POST" && path === "/v1/pages" && dataSourceId !== null && (body as { parent?: { data_source_id?: string } })?.parent?.data_source_id === dataSourceId);
  if (!ok) throw new Error(`REFUSED by allow-list: ${method} ${path}`);
  const res = await fetch(`${NOTION_BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_API_VERSION, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`notion ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as Record<string, unknown>;
}
const db = await notion("GET", `/v1/databases/${databaseId}`) as { data_sources?: Array<{ id: string }>; properties?: Record<string, unknown> };
dataSourceId = db.data_sources?.[0]?.id ?? null;
if (!dataSourceId) fail("the review database has no data source");
const have = new Set(Object.keys(db.properties ?? {}));
const missing = Object.values(REVIEW_DB_PROPERTIES).filter((p) => !have.has(p));
if (missing.length) fail(`the review database is missing propert${missing.length === 1 ? "y" : "ies"}: ${missing.join(", ")} — create them first`);
const existing = await notion("POST", `/v1/data_sources/${dataSourceId}/query`, { page_size: 100 }) as { results?: Array<{ properties?: Record<string, { title?: Array<{ plain_text?: string }> }> }> };
const existingUrls = new Set((existing.results ?? []).map((r) => r.properties?.[REVIEW_DB_PROPERTIES.url]?.title?.[0]?.plain_text ?? ""));
let created = 0;
for (const p of pages) {
  if (existingUrls.has(p.url)) { console.log(`  skip (page exists) ${p.url}`); continue; }
  const page = await notion("POST", "/v1/pages", { parent: { data_source_id: dataSourceId }, properties: notionPageProperties(p) });
  created++;
  console.log(`  created ${String(page.id)} ${p.url}`);
}
console.log(`\ncreated ${created} page(s)`);
