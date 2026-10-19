// ── b3 REVIEW DECIDE — the SYSTEM decides by rule; an OPERATOR decision is an override (R11, R18, 2026-10-18). DRY RUN BY DEFAULT. ──
//
//   npx vite-node scripts/b3-review-decide.ts -- --company=<uuid> --run-id=<uuid> --system [--plan=<tsv>]
//       R18: every b3_from_snapshot row of the run is decided BY RULE (src/lib/b3Review/review.ts systemRule):
//       approve when the basis is the newest ok snapshot, html text, not excluded; reject otherwise with the rule
//       named. Rows that carry a Notion page are read first — a Verdict there is an OPERATOR override and wins.
//   npx vite-node scripts/b3-review-decide.ts -- --company=<uuid> --run-id=<uuid> --operator=<review_row_id>:approve|reject
//       an operator decision from the terminal (an override of a system decision is audited).
//   npx vite-node scripts/b3-review-decide.ts -- --company=<uuid> --run-id=<uuid> [--fixture=<pages.json>]
//       the Notion verdicts (or a fixture) as operator decisions, nothing else.
//   … --live   writes with compare-and-set under PRECEDENCE (applyPrecedence): the system never overwrites an operator
//              decision; an operator override of a system decision writes an AUDIT integrity row (from, to, by);
//              one integrity row per run. Without --live every mode prints its plan and writes nothing.
//
// Fixture shape: [{ "page_id": "...", "review_row_id": "<outside_recrawl_review.id>", "verdict": "Approve"|"Reject"|null, "comment": "..." }]
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPrecedence, assertAllowedDatabase, assertAllowedDataSource, decisionOfVerdict, parsePlanTsv, planExcludeOf, planRowsFor, REVIEW_DB_PROPERTIES, SYSTEM_DECIDER, systemRule,
  type DecisionInput, type PrecedencePlan, type ProposedDecision,
} from "../src/lib/b3Review/review";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(REPO_ROOT, "backups/client-sync.env");
const DB_CONTAINER = "supabase_db_dzlgyxcvuwiulgifbmew";
const NOTION_API_VERSION = "2026-03-11";
const NOTION_BASE = "https://api.notion.com";
export const DECIDE_COMPONENT = "r3_outside_review_decide";
export const OVERRIDE_COMPONENT = "r3_outside_review_override";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? null;
const company = arg("company"); const runId = arg("run-id"); const fixture = arg("fixture"); const dbIdArg = arg("database-id"); const planPath = arg("plan");
const systemMode = process.argv.includes("--system");
const operatorArg = arg("operator");
const live = process.argv.includes("--live");
function fail(msg: string, code = 1): never { console.error(`\n✗ ${msg}\n`); process.exit(code); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!company || !UUID.test(company)) fail("required: --company=<uuid>");
if (!runId || !UUID.test(runId)) fail("required: --run-id=<uuid>");
if (live && fixture) fail("--live reads Notion; a --fixture run is dry-run only");
if ([systemMode, !!operatorArg, !!fixture].filter(Boolean).length > 1) fail("name one source: --system, --operator=<row>:<decision>, or --fixture=<json>");

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

// ── the run's rows as they stand ─────────────────────────────────────────────────────────────────
const hasPageCol = psql("select count(*) from information_schema.columns where table_name='outside_recrawl_review' and column_name='notion_page_id';") === "1";
type Row = { id: string; source_url: string; disposition: string; baseline_sha256: string | null; operator_decision: string | null; decided_by: string | null; notion_page_id: string | null };
const rows: Row[] = JSON.parse(psql(
  `select coalesce(json_agg(json_build_object('id', id, 'source_url', source_url, 'disposition', disposition, 'baseline_sha256', baseline_sha256, 'operator_decision', operator_decision, 'decided_by', decided_by, 'notion_page_id', ${hasPageCol ? "notion_page_id" : "null"}) order by source_url),'[]')
     from outside_recrawl_review where company_id=:'c' and run_id=:'r'::uuid;`, { c: company!, r: runId! }) || "[]");
const rowById = new Map(rows.map((r) => [r.id, r]));
const coName = psql("select name from companies where id=:'c';", { c: company! });

// ── operator inputs: Notion verdicts (overrides), a fixture, or --operator ───────────────────────
let operatorInputs: DecisionInput[] = [];
let notionSource = "none";
if (fixture) {
  const raw = JSON.parse(readFileSync(fixture, "utf8")) as Array<Record<string, unknown>>;
  operatorInputs = raw.map((p) => ({ page_id: String(p.page_id ?? ""), review_row_id: String(p.review_row_id ?? ""), verdict: p.verdict == null ? null : String(p.verdict), comment: p.comment == null ? null : String(p.comment) }));
  notionSource = `fixture ${fixture}`;
} else if (operatorArg) {
  const m = /^([0-9a-f-]{36}):(approve|reject)$/i.exec(operatorArg);
  if (!m) fail("--operator=<review_row_id>:approve|reject");
  operatorInputs = [{ page_id: "--operator", review_row_id: m[1], verdict: m[2].toLowerCase() === "approve" ? "Approve" : "Reject", comment: null }];
  notionSource = "--operator";
} else {
  // Notion: the allow-listed data source's pages, read as OPERATOR overrides. In --system mode only the rows that
  // carry a page are looked up (by page id); in the plain mode the whole data source is queried.
  const allowed = process.env.B3_REVIEW_NOTION_DATABASE_ID ?? envValue("B3_REVIEW_NOTION_DATABASE_ID");
  const withPages = rows.filter((r) => r.notion_page_id);
  if (!systemMode || withPages.length > 0) {
    let databaseId: string; let ds: string;
    try { databaseId = assertAllowedDatabase(dbIdArg ?? allowed, allowed); ds = assertAllowedDataSource(process.env.B3_REVIEW_NOTION_DATA_SOURCE_ID ?? envValue("B3_REVIEW_NOTION_DATA_SOURCE_ID")); } catch (e) { fail((e as Error).message, 2); }
    const token = envValue("NOTION_TOKEN");
    if (!token) fail(`${ENV_PATH} has no NOTION_TOKEN`);
    const headers = { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_API_VERSION, "content-type": "application/json" };
    type Pg = { id: string; parent?: { data_source_id?: string }; properties: Record<string, { select?: { name?: string } | null; rich_text?: Array<{ plain_text?: string }> }> };
    const toInput = (pg: Pg): DecisionInput => ({
      page_id: pg.id,
      review_row_id: pg.properties[REVIEW_DB_PROPERTIES.review_row_id]?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? "",
      verdict: pg.properties[REVIEW_DB_PROPERTIES.verdict]?.select?.name ?? null,
      comment: pg.properties[REVIEW_DB_PROPERTIES.comment]?.rich_text?.map((t) => t.plain_text ?? "").join("") ?? null,
    });
    if (systemMode) {
      for (const r of withPages) {
        const res = await fetch(`${NOTION_BASE}/v1/pages/${r.notion_page_id}`, { headers });   // READ
        if (!res.ok) fail(`notion GET page ${r.notion_page_id} -> ${res.status}`);
        const pg = (await res.json()) as Pg;
        const pds = String(pg.parent?.data_source_id ?? "").replace(/-/g, "").toLowerCase();
        if (pds !== ds) fail(`page ${r.notion_page_id} lives in data source ${pds.slice(0, 8)}…, not the allow-listed one`, 2);
        operatorInputs.push({ ...toInput(pg), review_row_id: r.id });
      }
      notionSource = `notion pages (${withPages.length})`;
    } else {
      const dsRes = await fetch(`${NOTION_BASE}/v1/data_sources/${ds}`, { headers });   // READ
      if (!dsRes.ok) fail(`notion GET data source -> ${dsRes.status}`);
      const parentDb = String(((await dsRes.json()) as { parent?: { database_id?: string } }).parent?.database_id ?? "").replace(/-/g, "").toLowerCase();
      if (parentDb !== databaseId) fail(`decide refused: data source belongs to database ${parentDb.slice(0, 8)}…, not the allow-listed ${databaseId.slice(0, 8)}…`, 2);
      const q = await fetch(`${NOTION_BASE}/v1/data_sources/${ds}/query`, { method: "POST", headers, body: JSON.stringify({ page_size: 100 }) });   // READ (a query)
      if (!q.ok) fail(`notion query -> ${q.status}`);
      operatorInputs = (((await q.json()) as { results?: Pg[] }).results ?? []).map(toInput);
      notionSource = "notion data source";
    }
  }
}
operatorInputs = operatorInputs.filter((i) => i.review_row_id);

// ── the plan: every operator input in order (an override, or a refusal), then the system for the rows no operator input touched ──
type Line = { row: Row | null; row_id: string; current: string; source: "operator" | "system"; rule: string; plan: PrecedencePlan; page_id: string | null };
const lines: Line[] = [];
const planExcludeByUrl = new Map<string, string>();
if (planPath) {
  const kept = planRowsFor(parsePlanTsv(readFileSync(planPath, "utf8")), coName);
  for (const r of [...kept.kept, ...kept.excluded]) planExcludeByUrl.set(r.url, planExcludeOf(r));
}
const currentOf = (r: Row | null) => (r ? (r.operator_decision ? `${r.operator_decision} by ${r.decided_by ?? "?"}` : "undecided") : "(no row)");
const touched = new Set<string>();
for (const i of operatorInputs) {
  const r = rowById.get(i.review_row_id) ?? null;
  const page = i.page_id === "--operator" ? (r?.notion_page_id ?? null) : i.page_id;
  if (!r) { lines.push({ row: null, row_id: i.review_row_id, current: "(no row)", source: "operator", rule: `verdict ${i.verdict ?? "(empty)"}`, plan: { action: "refuse", reason: "no review row with this id under this company and run" }, page_id: page }); continue; }
  const decision = decisionOfVerdict(i.verdict);
  if (!decision) { lines.push({ row: r, row_id: r.id, current: currentOf(r), source: "operator", rule: "no verdict", plan: { action: "noop", reason: `Verdict is ${i.verdict ? JSON.stringify(i.verdict) : "empty"} — not decided yet` }, page_id: page }); continue; }
  touched.add(r.id);
  const proposed: ProposedDecision = { decision, by: "operator", source: i.page_id };
  lines.push({ row: r, row_id: r.id, current: currentOf(r), source: "operator", rule: `override: ${i.page_id === "--operator" ? "--operator" : "Notion Verdict " + i.verdict}`, plan: applyPrecedence(r, proposed), page_id: page });
}
if (systemMode) {
  for (const r of rows) {
    if (touched.has(r.id)) continue;
    const snap = JSON.parse(psql(
      `select coalesce(row_to_json(t)::text,'null') from (select text_sha256, clean_text from outside_page_snapshots where company_id=:'c' and source_url=:'u' and fetch_status='ok' and clean_text is not null and length(clean_text)>0 order by crawled_at desc limit 1) t;`, { c: company!, u: r.source_url })) as { text_sha256: string; clean_text: string } | null;
    const verdict = systemRule({ disposition: r.disposition, url: r.source_url, basis_is_newest_ok: !!snap && snap.text_sha256 === r.baseline_sha256, snapshot_text: snap?.clean_text ?? null, plan_exclude: planPath ? (planExcludeByUrl.get(r.source_url) ?? null) : null });
    lines.push({ row: r, row_id: r.id, current: currentOf(r), source: "system", rule: `${verdict.rule} — ${verdict.detail}`, plan: applyPrecedence(r, { decision: verdict.decision, by: "system" }), page_id: r.notion_page_id });
  }
}
const writes = lines.filter((l) => l.plan.action === "write"), overrides = lines.filter((l) => l.plan.action === "override"), refusals = lines.filter((l) => l.plan.action === "refuse"), noops = lines.filter((l) => l.plan.action === "noop");

console.log(`\nB3 REVIEW DECIDE${live ? " (LIVE)" : " (DRY-RUN — writes nothing)"} · ${coName} · run ${runId} · mode ${systemMode ? "--system (" + SYSTEM_DECIDER + ")" : operatorArg ? "--operator" : "operator verdicts"} · operator source ${notionSource}`);
console.log(`rows ${rows.length} · operator inputs ${operatorInputs.length} · would write ${writes.length} · refuse ${refusals.length} · no-op ${noops.length} · override ${overrides.length} · notion_page_id column: ${hasPageCol ? "present" : "ABSENT"}\n`);
for (const l of lines) {
  const p = l.plan;
  const act = p.action === "write" ? `WRITE` : p.action === "override" ? `OVERRIDE` : p.action === "refuse" ? "REFUSE" : "NOOP";
  const tail = p.action === "write" ? ` → ${p.decision} by ${p.decided_by}` : p.action === "override" ? ` ${p.from.decision} (${p.from.by}) → ${p.decision} by ${p.decided_by}` : "";
  const where = l.source === "operator" ? `page ${String(l.page_id ?? "-").slice(0, 8)}…` : `url ${l.row?.source_url.slice(0, 50) ?? ""}`;
  console.log(`  ${act.padEnd(6)} row ${l.row_id.slice(0, 8)}… ${where}${tail}  — ${p.reason}`);
  console.log(`           current: ${l.current} · ${l.source}: ${l.rule}`);
}
if (!live) { console.log(`\nwrites: 0 (dry-run)`); process.exit(0); }

// ── LIVE ─────────────────────────────────────────────────────────────────────────────────────────
if (!hasPageCol) fail("live decide refused: outside_recrawl_review.notion_page_id is absent — apply migration 20261019120000 first");
let applied = 0;
const audits: string[] = [];
const failed: Array<{ review_row_id: string; reason: string }> = [];
for (const l of [...writes, ...overrides]) {
  const p = l.plan; if ((p.action !== "write" && p.action !== "override") || !l.row) continue;
  const isOverride = p.action === "override";
  const n = psql(
    `with upd as (update outside_recrawl_review set operator_decision=:'d', decided_at=now(), decided_by=:'by', notion_page_id=coalesce(nullif(:'p',''), notion_page_id)
        where id=:'id'::uuid and company_id=:'c' and run_id=:'r'::uuid and operator_decision is not distinct from ${isOverride ? ":'cur'" : "null"} and decided_by is not distinct from ${isOverride ? ":'curby'" : "null"} returning 1)
     select count(*) from upd;`, { d: p.decision, by: p.decided_by, p: l.page_id ?? "", id: l.row!.id, c: company!, r: runId!, ...(isOverride ? { cur: p.from.decision, curby: p.from.by } : {}) });
  if (n !== "1") { failed.push({ review_row_id: l.row!.id, reason: `compare-and-set matched ${n} row(s) — the row changed under us` }); continue; }
  applied++;
  if (isOverride) {
    // AUDIT: the system's decision is kept, here, beside what replaced it and who did it
    const id = psql(`with p as (select ${b64Sql({
      company_id: company, component: OVERRIDE_COMPONENT, surface_type: "outside_review", status: "completed", examined: 1, admitted: 1,
      excluded_by_rule: { run_id: runId, review_row_id: l.row!.id, source_url: l.row!.source_url, from: p.from, to: { decision: p.decision, by: p.decided_by, source: l.page_id ?? "--operator" } },
      run_ref: `${OVERRIDE_COMPONENT}_${l.row!.id}_${new Date().toISOString()}`,
    })} j), ins as (insert into integrity_runs (company_id, component, surface_type, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
           select (j->>'company_id')::uuid, j->>'component', j->>'surface_type', now(), j->>'status', (j->>'examined')::int, (j->>'admitted')::int, j->'excluded_by_rule', j->>'run_ref' from p returning id) select id from ins;`);
    audits.push(id);
  }
}
const ledger = psql(
  `with p as (select ${b64Sql({
    company_id: company, component: DECIDE_COMPONENT, surface_type: "outside_review", status: failed.length ? "failed" : "completed",
    examined: rows.length, admitted: applied,
    excluded_by_rule: { run_id: runId, mode: systemMode ? "system" : operatorArg ? "operator" : "verdicts", decider: systemMode ? SYSTEM_DECIDER : "operator", source: notionSource, writes: writes.map((l) => ({ row: l.row_id, decision: (l.plan as { decision: string }).decision, rule: l.rule })), overrides: overrides.map((l) => l.row_id), audit_rows: audits, refused: refusals.map((l) => ({ row: l.row_id, reason: l.plan.reason })), noop: noops.map((l) => ({ row: l.row_id, reason: l.plan.reason })), failed },
    run_ref: `${DECIDE_COMPONENT}_${runId}_${new Date().toISOString()}`,
  })} j),
   ins as (insert into integrity_runs (company_id, component, surface_type, ran_at, status, examined, admitted, excluded_by_rule, run_ref)
           select (j->>'company_id')::uuid, j->>'component', j->>'surface_type', now(), j->>'status', (j->>'examined')::int, (j->>'admitted')::int, j->'excluded_by_rule', j->>'run_ref' from p returning id)
   select id from ins;`);
console.log(`\napplied ${applied} (overrides ${overrides.length}, audit rows ${audits.length}) · failed ${failed.length} · ledger integrity_runs.id = ${ledger}`);
process.exit(failed.length ? 1 : 0);
