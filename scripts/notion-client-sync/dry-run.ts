// ── B2a DRY RUN — MojoMap ↔ Notion "Client Portals" status sync. READ-ONLY. WRITES NOTHING. ──────
//
//   npx vite-node scripts/notion-client-sync/dry-run.ts
//
// There is NO --apply and no write code anywhere in B2a. The Notion client is an ALLOW-LIST of
// Notion's read endpoints (src/lib/notionClientSync/readOnlyFetch.ts) and throws on anything else
// before it reaches the network; the Supabase side is read with a service-role client and only ever
// SELECTs. B2b adds the write path, after the operator has read this output.
//
// Language and location: TypeScript run through `npx vite-node`, matching the repo's existing
// operator runners (scripts/rf-channels-dry-run.ts, scripts/first-read-fill.ts,
// scripts/compute-outside-scores.ts), which is what lets this file import the shared pure helpers
// from src/ with the "@/..." alias. The rules and the HTTP allow-list live in
// src/lib/notionClientSync/ rather than here, because vitest.config.ts only collects
// `src/**/*.{test,spec}.{ts,tsx}` — anything under scripts/ is NOT covered by `vitest run`
// (scripts/__tests__/dryrunPromptParity.test.ts is orphaned for exactly this reason). Putting the
// logic under src/ is what makes the write-refusal test part of the 3,587-test gate.
//
// Notion API: version 2026-03-11 (latest, https://developers.notion.com/reference/versioning). Since
// 2025-09-03 rows are queried from a DATA SOURCE, not a database: GET /v1/databases/{id} returns a
// `data_sources` array and rows come from POST /v1/data_sources/{id}/query
// (https://developers.notion.com/reference/query-a-data-source, upgrade guide at
// https://developers.notion.com/docs/upgrade-guide-2025-09-03). That POST is a READ, which is why
// the guard is an allow-list of (method, path) pairs and not simply "no POST".
//
// SECRETS: NOTION_TOKEN and SUPABASE_SERVICE_ROLE_KEY come from backups/client-sync.env (gitignored,
// mode 600). Neither is printed, logged, echoed, or put in a URL.
import { readFileSync } from "node:fs";
import {
  createReadOnlyNotionClient,
  allCallsWereReads,
  NOTION_API_VERSION,
  type RecordedCall,
} from "@/lib/notionClientSync/readOnlyFetch";
import { compareStatusOptions } from "@/lib/notionClientSync/statusOptions";
import {
  decide,
  ignoreReason,
  CB1_FROZEN_ID,
  isClientStatusValue,
  type BaselineFacts,
  type MojoSide,
  type NotionSide,
} from "@/lib/notionClientSync/decide";
import type { ClientStatus } from "@/views/client/workshop/clientPortalStatuses";

const ENV_PATH = "backups/client-sync.env";
const NOTION_DATABASE_ID = "75df0a3f617182c6beb101a61c145212";
const NOTION_DATA_SOURCE_ID = "31af0a3f-6171-83a0-9da8-87337f0ffc6d";

// ── env, without printing anything ───────────────────────────────────────────────────────────────
function loadEnv(): { notionToken: string; supabaseUrl: string; serviceKey: string } {
  let raw: string;
  try {
    raw = readFileSync(ENV_PATH, "utf8");
  } catch {
    throw new Error(`${ENV_PATH} is not readable — the operator writes it (mode 600, gitignored).`);
  }
  const kv = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) kv.set(t.slice(0, i), t.slice(i + 1));
  }
  const need = (k: string) => {
    const v = kv.get(k);
    if (!v) throw new Error(`${ENV_PATH} has no ${k}`); // names the KEY, never a value
    return v;
  };
  return { notionToken: need("NOTION_TOKEN"), supabaseUrl: need("SUPABASE_URL"), serviceKey: need("SUPABASE_SERVICE_ROLE_KEY") };
}

// ── Supabase reads (service role, SELECT only — PostgREST GET) ───────────────────────────────────
async function sbSelect<T>(base: string, key: string, pathAndQuery: string, log: RecordedCall[]): Promise<T> {
  const url = `${base}/rest/v1/${pathAndQuery}`;
  const res = await fetch(url, {
    method: "GET", // the ONLY method this function can send
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  log.push({ method: "GET", path: `/rest/v1/${pathAndQuery.split("?")[0]}`, status: res.status });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase GET ${pathAndQuery.split("?")[0]} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

type CplRow = {
  company_id: string;
  enabled: boolean;
  client_status: ClientStatus | null;
  status_changed_at: string | null;
  last_notion_status_seen: ClientStatus | null;
  last_synced_at: string | null;
  map_created_set_at: string | null;
  notion_page_id: string | null;
};
type CompanyRow = { id: string; name: string; frozen: boolean };
type IntegrityRow = { id: number; ran_at: string; excluded_by_rule: { actor?: string } | null };
type LongRunnerRow = { id: string; company_id: string; run_kind: string; status: string }; // id is a uuid
type BaselineRunRow = { id: number; company_id: string; result_json: { status?: string } | null };

const plain = (rt: unknown): string =>
  Array.isArray(rt) ? rt.map((x: { plain_text?: string }) => x.plain_text ?? "").join("") : "";

function fmt(v: string | null | undefined, dash = "—"): string {
  return v === null || v === undefined || v === "" ? dash : v;
}

async function main() {
  const env = loadEnv();
  const notion = createReadOnlyNotionClient({ token: env.notionToken });
  const sbCalls: RecordedCall[] = [];
  const S = <T,>(q: string) => sbSelect<T>(env.supabaseUrl, env.serviceKey, q, sbCalls);

  console.log("B2a DRY RUN — MojoMap ↔ Notion Client Portals.  READ-ONLY, NO WRITE PATH EXISTS.");
  console.log(`Notion-Version ${NOTION_API_VERSION} · database ${NOTION_DATABASE_ID} · data source ${NOTION_DATA_SOURCE_ID}`);
  console.log("");

  // ── 1. the MojoMap side ────────────────────────────────────────────────────────────────────────
  const cpl = await S<CplRow[]>(
    "client_portal_links?select=company_id,enabled,client_status,status_changed_at,last_notion_status_seen,last_synced_at,map_created_set_at,notion_page_id&enabled=is.true",
  );
  const companies = await S<CompanyRow[]>("companies?select=id,name,frozen");
  const byId = new Map(companies.map((c) => [c.id, c]));
  const knownIds = new Set(companies.map((c) => c.id));

  // CB1 is excluded by id BEFORE anything else, flagged or not.
  const inScope = cpl.filter((r) => r.company_id !== CB1_FROZEN_ID);
  const cb1Flagged = cpl.filter((r) => r.company_id === CB1_FROZEN_ID);
  const flaggedIds = new Set(inScope.map((r) => r.company_id));

  // actor per R8: the newest client_portal_operator_set audit row for that company
  const audits = await S<IntegrityRow[]>(
    "integrity_runs?select=id,surface_id,ran_at,excluded_by_rule&component=eq.client_portal_operator_set&order=id.desc",
  );
  const actorOf = new Map<string, { actor: string; at: string; id: number }>();
  for (const a of audits as unknown as Array<IntegrityRow & { surface_id: string }>) {
    if (!a.surface_id || actorOf.has(a.surface_id)) continue; // ordered desc, so the first is newest
    const actor = a.excluded_by_rule?.actor;
    if (actor) actorOf.set(a.surface_id, { actor, at: a.ran_at, id: a.id });
  }

  // finished-baseline predicate
  const lrr = await S<LongRunnerRow[]>(
    "long_runner_runs?select=id,company_id,run_kind,status&run_kind=eq.public_baseline&status=eq.completed",
  );
  const pbr = await S<BaselineRunRow[]>("public_baseline_runs?select=id,company_id,result_json");
  const baselineOf = (companyId: string): BaselineFacts => {
    const lr = lrr.filter((r) => r.company_id === companyId).map((r) => r.id);
    const pb = pbr.filter((r) => r.company_id === companyId && r.result_json?.status === "ok").map((r) => r.id);
    return { finished: lr.length > 0 && pb.length > 0, longRunnerRunIds: lr, publicBaselineRunIds: pb };
  };

  // ── 2. the Notion side ─────────────────────────────────────────────────────────────────────────
  const db = await notion.get<{ title: unknown; data_sources: Array<{ id: string; name: string }> }>(
    `/v1/databases/${NOTION_DATABASE_ID}`,
  );
  const ds = await notion.get<{ properties: Record<string, { type: string; select?: { options: Array<{ name: string }> } }> }>(
    `/v1/data_sources/${NOTION_DATA_SOURCE_ID}`,
  );

  type NotionPage = {
    id: string;
    last_edited_time: string;
    properties: Record<string, { type: string; title?: unknown; rich_text?: unknown; select?: { name: string } | null }>;
  };
  const pages: NotionPage[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const page = await notion.postRead<{ results: NotionPage[]; has_more: boolean; next_cursor: string | null }>(
      `/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`,
      body,
    );
    pages.push(...page.results);
    cursor = page.has_more ? page.next_cursor ?? undefined : undefined;
  } while (cursor);

  const notionByMojoId = new Map<string, NotionPage>();
  const ignored: Array<{ pageId: string; name: string; mojoId: string; why: string }> = [];
  for (const p of pages) {
    const mojoId = plain(p.properties["MojoMap ID"]?.rich_text).trim();
    const name = plain(p.properties["Name"]?.title) || "(untitled)";
    const why = ignoreReason(mojoId === "" ? null : mojoId, flaggedIds, knownIds);
    if (why === null) {
      notionByMojoId.set(mojoId, p);
      continue;
    }
    const reasonText = {
      "no-mojomap-id": "no MojoMap ID",
      "id-not-flagged": "MojoMap ID names a company that is not flagged (enabled = true)",
      "id-matches-no-company": "MojoMap ID matches no company",
      cb1: "MojoMap ID is CB1, which is never synced",
    }[why];
    ignored.push({ pageId: p.id, name, mojoId: mojoId || "(none)", why: reasonText });
  }

  // ── 3. one row per flagged company ─────────────────────────────────────────────────────────────
  console.log("── FLAGGED COMPANIES (enabled = true) ────────────────────────────────────────────────");
  console.log("");
  const actionCount = new Map<string, number>();
  const sorted = [...inScope].sort((a, b) => (byId.get(a.company_id)?.name ?? "").localeCompare(byId.get(b.company_id)?.name ?? ""));
  for (const r of sorted) {
    const co = byId.get(r.company_id);
    const m: MojoSide = {
      companyId: r.company_id,
      companyName: co?.name ?? "(unknown company)",
      clientStatus: r.client_status,
      statusChangedAt: r.status_changed_at,
      lastNotionStatusSeen: r.last_notion_status_seen,
      lastSyncedAt: r.last_synced_at,
      mapCreatedSetAt: r.map_created_set_at,
    };
    const p = notionByMojoId.get(r.company_id) ?? null;
    const n: NotionSide | null = p
      ? { pageId: p.id, status: p.properties["Status"]?.select?.name ?? null, lastEditedTime: p.last_edited_time }
      : null;
    const b = baselineOf(r.company_id);
    const d = decide(m, n, b);
    actionCount.set(d.action, (actionCount.get(d.action) ?? 0) + 1);

    const a = actorOf.get(r.company_id);
    console.log(`${m.companyName}  [${m.companyId}]${co?.frozen ? "  ** FROZEN **" : ""}`);
    console.log(`  MojoMap status      ${fmt(m.clientStatus, "(not set)")}`);
    console.log(`  status_changed_at   ${fmt(m.statusChangedAt)}`);
    console.log(`  actor (R8)          ${a ? `${a.actor}  (integrity_runs ${a.id}, ${a.at})` : "not recorded (pre-B1a)"}`);
    console.log(`  Notion page         ${n ? n.pageId : "none"}`);
    console.log(`  Notion Status       ${n ? fmt(n.status, "(empty)") : "—"}`);
    console.log(`  last_edited_time    ${n ? n.lastEditedTime : "—"}`);
    console.log(`  last_notion_seen    ${fmt(m.lastNotionStatusSeen, "(NULL — first sync)")}`);
    console.log(`  last_synced_at      ${fmt(m.lastSyncedAt, "(NULL — never synced)")}`);
    console.log(`  map_created_set_at  ${fmt(m.mapCreatedSetAt, "(NULL)")}`);
    console.log(`  finished baseline   ${b.finished}  (long_runner_runs [${b.longRunnerRunIds.join(", ") || "none"}], public_baseline_runs ok [${b.publicBaselineRunIds.join(", ") || "none"}])`);
    console.log(`  ACTION              ${d.action.toUpperCase()}`);
    console.log(`  rule                ${d.rule}`);
    console.log("");
  }

  if (cb1Flagged.length > 0) {
    console.log(`** CB1 (${CB1_FROZEN_ID}) IS FLAGGED and was excluded by id before any read. **`);
    console.log("");
  }

  // ── 4. Notion rows ignored ─────────────────────────────────────────────────────────────────────
  console.log("── NOTION ROWS IGNORED ───────────────────────────────────────────────────────────────");
  if (ignored.length === 0) console.log("  (none)");
  for (const i of ignored) console.log(`  ${i.name.padEnd(24)} page ${i.pageId}  MojoMap ID ${i.mojoId}\n      → ${i.why}`);
  console.log("");

  // ── 5. the status option sets ──────────────────────────────────────────────────────────────────
  const statusProp = ds.properties["Status"];
  const opts = (statusProp?.select?.options ?? []).map((o) => o.name);
  const cmp = compareStatusOptions(opts);
  console.log("── STATUS OPTIONS ────────────────────────────────────────────────────────────────────");
  console.log(`  Notion "Status" property type   ${statusProp?.type ?? "(absent)"}  (must be 'select')`);
  console.log(`  Notion options                  ${JSON.stringify(opts)}`);
  console.log(`  byte-for-byte match             ${cmp.match}`);
  console.log(`  same order                      ${cmp.sameOrder}`);
  if (cmp.missingInNotion.length) console.log(`  missing in Notion               ${JSON.stringify(cmp.missingInNotion)}`);
  if (cmp.extraInNotion.length) console.log(`  extra in Notion                 ${JSON.stringify(cmp.extraInNotion)}`);
  if (cmp.nearMisses.length) console.log(`  NEAR MISSES (case/space)        ${JSON.stringify(cmp.nearMisses)}`);
  const badStatuses = pages
    .map((p) => p.properties["Status"]?.select?.name ?? null)
    .filter((s): s is string => s !== null && !isClientStatusValue(s));
  if (badStatuses.length) console.log(`  rows holding an off-list Status  ${JSON.stringify([...new Set(badStatuses)])}`);
  console.log("");

  // ── 6. the proof ───────────────────────────────────────────────────────────────────────────────
  console.log("── ACTIONS SUMMARY ───────────────────────────────────────────────────────────────────");
  for (const [a, c] of [...actionCount].sort()) console.log(`  ${a.padEnd(16)} ${c}`);
  console.log("");
  console.log("── HTTP CALLS MADE (every one must be a read) ────────────────────────────────────────");
  const all = [...notion.calls, ...sbCalls];
  for (const c of all) console.log(`  ${c.method.padEnd(5)} ${String(c.status).padEnd(4)} ${c.path}`);
  console.log(`  notion calls ${notion.calls.length} · supabase calls ${sbCalls.length}`);
  console.log(`  all Notion calls were allow-listed reads: ${allCallsWereReads(notion.calls)}`);
  console.log(`  all Supabase calls were GET:              ${sbCalls.every((c) => c.method === "GET")}`);
  console.log("");
  console.log("NO WRITE WAS ATTEMPTED — B2a contains no write code. B2b adds it.");
}

main().catch((e) => {
  console.error(`dry run failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
