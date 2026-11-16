#!/usr/bin/env node
// ── THE EDGEWOOD TEST TWIN (D4b, 2026-11-16) ─────────────────────────────────────────────────────────
//
// Edgewood (3dd2cfbb) is a real client about to receive real documents. The workspace specs and the
// pinned checks were written against its data, so they move to a TWIN: a held fixture company holding a
// copy of Edgewood's test-relevant rows with every id remapped. After the twin exists, no test, guard or
// spec reads or writes Edgewood; scripts/edgewood-unchanged.sh is the one reader, and it only compares.
//
//   node scripts/twin/build-edgewood-twin.mjs            dry run: what would be copied, table by table
//   node scripts/twin/build-edgewood-twin.mjs --apply    build the twin (refused if it already exists)
//   node scripts/twin/build-edgewood-twin.mjs --verify   compare per-table counts, Edgewood vs twin
//   --twin-id <uuid>   build a different twin (a rebuild never deletes the old one: E2, born held, never deleted)
//
// READ-ONLY ON EDGEWOOD: every read runs in a read-only transaction. The write is one transaction on the
// twin, under session_replication_role = replica so no trigger fires (no freeze trigger, no cron hook,
// no net.http_post) and the rows land exactly as read.
//
// WHAT IS COPIED: every public table holding Edgewood rows by company_id, plus the child tables with no
// company_id of their own that hang off them by foreign key (input_files, input_subitems, …), minus the
// EXCLUDED list below. Ids: every single-uuid primary key gets a new uuid, derived deterministically
// from (twin id, old id), and EVERY occurrence of an old id anywhere in a copied row — foreign keys, uuid
// arrays, ids inside jsonb — is rewritten to its new id. public_baseline_runs' bigint ids are drawn from
// its own sequence and the three bigint columns that reference it are rewritten.
// Storage is NOT copied: no spec opens an Edgewood file. Each twin input_files.file_path gains the
// prefix zz-edgewood-twin/, so nothing reached through the twin can open Edgewood's objects.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PGC = process.env.PGC || "supabase_db_dzlgyxcvuwiulgifbmew";
const SOURCE = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
const args = process.argv.slice(2);
const TWIN = args.includes("--twin-id") ? args[args.indexOf("--twin-id") + 1] : "ed9e7000-0000-4000-8000-00000000d4b1";
const TWIN_NAME = "Edgewood (test twin)";
const HOLD = "D4b:edgewood_test_twin";
const PATH_PREFIX = "zz-edgewood-twin/";
const MODE = args.includes("--apply") ? "apply" : args.includes("--verify") ? "verify" : "dry";

// Not copied, each with its reason. Ledgers and audit trails record what HAPPENED to Edgewood, not what
// it IS; run-control rows would hand a sweep work; access grants would give Edgewood's members the twin.
const EXCLUDED = new Map([
  ["model_calls", "ledger: model spend"],
  ["integrity_runs", "audit: gate decisions"],
  ["long_runner_runs", "run control: sweep_stale_chains acts on it"],
  ["operator_primary_selection_audit", "audit"],
  ["provenance_remints", "audit: restamp history"],
  ["signal_voice_restamps", "audit: restamp history"],
  ["signal_hold_audit", "audit"],
  ["ingest_single_flight", "run control: the file-analysis single flight"],
  ["company_members", "access grant: Edgewood's members must not gain the twin"],
  ["client_portal_links", "access grant: a portal link is a credential"],
]);

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

function psql(sql, { readOnly = true } = {}) {
  const pre = readOnly ? ["-c", "set default_transaction_read_only = on;"] : [];
  return execFileSync("docker", ["exec", "-i", PGC, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", ...pre, "-c", sql],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 }).split("\n").filter((l) => l !== "" && l !== "SET");
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
function newId(oldId) {
  const h = createHash("md5").update(`${TWIN}:${oldId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ── 1. the table set ────────────────────────────────────────────────────────────────────────────
const companyTables = psql(`select c.table_name from information_schema.columns c
  join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
  where c.table_schema='public' and c.column_name='company_id' and c.table_name <> 'companies' order by 1`);
const fks = psql(`select c.conrelid::regclass::text || '|' || c.confrelid::regclass::text || '|' ||
    (select string_agg(a.attname, ',') from pg_attribute a where a.attrelid=c.conrelid and a.attnum = any(c.conkey)) || '|' ||
    (select string_agg(a.attname, ',') from pg_attribute a where a.attrelid=c.confrelid and a.attnum = any(c.confkey))
  from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace`)
  .map((l) => { const [child, parent, cols, pcols] = l.split("|"); return { child: child.replace(/^public\./, ""), parent: parent.replace(/^public\./, ""), cols, pcols }; });
const hasCompany = new Set(companyTables);

const meta = (table) => {
  const cols = psql(`select column_name || '|' || coalesce(is_generated,'') || '|' || coalesce(identity_generation,'') || '|' || data_type
    from information_schema.columns where table_schema='public' and table_name=${q(table)} order by ordinal_position`)
    .map((l) => { const [name, gen, ident, type] = l.split("|"); return { name, gen, ident, type }; });
  const pk = psql(`select string_agg(a.attname, ',') from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = ${q("public." + table)}::regclass and i.indisprimary`)[0] ?? "";
  return { cols, pk };
};

// ── 2. read (read-only) ─────────────────────────────────────────────────────────────────────────
const rowsByTable = new Map();
const readJson = (table, where) => psql(`select row_to_json(t)::text from public.${table} t where ${where}`).map((l) => JSON.parse(l));
for (const t of companyTables) {
  if (EXCLUDED.has(t)) continue;
  const rows = readJson(t, `t.company_id::text = ${q(SOURCE)}`);
  if (rows.length) rowsByTable.set(t, rows);
}
// child tables with no company_id, by foreign key, to a fixed point
for (let changed = true; changed;) {
  changed = false;
  for (const fk of fks) {
    if (hasCompany.has(fk.child) || EXCLUDED.has(fk.child) || fk.child === "companies") continue;
    const parentRows = rowsByTable.get(fk.parent);
    if (!parentRows || fk.cols.includes(",")) continue;
    const ids = [...new Set(parentRows.map((r) => r[fk.pcols]).filter((v) => v != null))];
    if (!ids.length) continue;
    const got = readJson(fk.child, `t.${fk.cols}::text in (${ids.map(q).join(",")})`);
    const have = rowsByTable.get(fk.child) ?? [];
    const seen = new Set(have.map((r) => JSON.stringify(r)));
    const add = got.filter((r) => !seen.has(JSON.stringify(r)));
    if (add.length) { rowsByTable.set(fk.child, [...have, ...add]); changed = true; }
  }
}
const company = readJson("companies", `t.id::text = ${q(SOURCE)}`)[0];

const summary = [...rowsByTable.entries()].map(([t, r]) => `${t}=${r.length}`);
const total = [...rowsByTable.values()].reduce((n, r) => n + r.length, 0);

if (MODE === "verify") {
  let bad = 0;
  for (const [t, rows] of rowsByTable) {
    const twin = hasCompany.has(t)
      ? Number(psql(`select count(*) from public.${t} where company_id::text = ${q(TWIN)}`)[0])
      : null;
    if (twin !== null && twin !== rows.length) { console.log(`  DIFF ${t}: edgewood ${rows.length}, twin ${twin}`); bad++; }
  }
  const held = psql(`select coalesce(fixture_hold,'') from public.companies where id = ${q(TWIN)}`)[0];
  console.log(held ? `twin ${TWIN} held '${held}'` : `twin ${TWIN} MISSING or not held`);
  console.log(bad === 0 && held ? `verify: PASS ${rowsByTable.size} tables, ${total} rows match` : `verify: FAIL ${bad} table(s) differ`);
  process.exit(bad === 0 && held ? 0 : 1);
}

console.log(`source ${SOURCE} → twin ${TWIN} (${TWIN_NAME}, held '${HOLD}')`);
console.log(`excluded: ${[...EXCLUDED.entries()].map(([t, why]) => `${t} (${why})`).join("; ")}`);
console.log(`copy ${rowsByTable.size} tables, ${total} rows: ${summary.join(" ")}`);
if (MODE === "dry") { console.log("dry run — nothing written (pass --apply)"); process.exit(0); }

// ── 3. map ──────────────────────────────────────────────────────────────────────────────────────
// A twin that already holds rows is never rebuilt in place (pass --twin-id for a new one). A twin
// company row with NO rows — a build that failed after the row existed — is filled, never deleted (E2).
const twinExists = psql(`select count(*) from public.companies where id = ${q(TWIN)}`)[0] !== "0";
if (twinExists) {
  const held = [...rowsByTable.keys()].filter((t) => hasCompany.has(t))
    .reduce((n, t) => n + Number(psql(`select count(*) from public.${t} where company_id::text = ${q(TWIN)}`)[0]), 0);
  if (held > 0) {
    console.error(`refused: twin ${TWIN} already holds ${held} row(s) — a twin is never rebuilt in place (pass --twin-id for a new one)`);
    process.exit(1);
  }
  console.log(`twin ${TWIN} exists with no rows — filling it`);
}
const idMap = new Map([[SOURCE, TWIN]]);
const metas = new Map();
for (const t of rowsByTable.keys()) {
  const m = meta(t); metas.set(t, m);
  const pkCol = m.pk && !m.pk.includes(",") ? m.cols.find((c) => c.name === m.pk) : null;
  if (pkCol && pkCol.type === "uuid") for (const r of rowsByTable.get(t)) if (r[m.pk]) idMap.set(r[m.pk], newId(r[m.pk]));
}
// Rows of the EXCLUDED tables are not copied, but a copied row may still name one (a candidate outcome's
// run_id names a long-runner run). Those ids are remapped too, so a twin row never points back at an
// Edgewood row — the reference simply dangles inside the twin — and no unique key collides.
for (const t of EXCLUDED.keys()) {
  if (!hasCompany.has(t)) continue;
  const m = meta(t);
  const pkCol = m.pk && !m.pk.includes(",") ? m.cols.find((c) => c.name === m.pk) : null;
  if (!pkCol || pkCol.type !== "uuid") continue;
  for (const id of psql(`select ${m.pk}::text from public.${t} where company_id::text = ${q(SOURCE)}`)) idMap.set(id, newId(id));
}
// A table whose primary key IS company_id (client_portal_links, company_run_locks) put SOURCE into the
// loops above; the company id maps to the twin and to nothing else.
idMap.set(SOURCE, TWIN);
// bigint ids of public_baseline_runs, from its own sequence, and the three columns that reference it
const runMap = new Map();
for (const r of rowsByTable.get("public_baseline_runs") ?? []) {
  runMap.set(Number(r.id), Number(psql(`select nextval(pg_get_serial_sequence('public.public_baseline_runs','id'))`, { readOnly: false })[0]));
}
const RUN_REFS = { research_review_runs: "baseline_run_id", research_artifact_runs: "baseline_run_id", findings: "origin_run_id", public_baseline_runs: "id" };
const pathMap = new Map();
for (const r of rowsByTable.get("input_files") ?? []) if (r.file_path) pathMap.set(r.file_path, PATH_PREFIX + r.file_path);

const remap = (table, row) => {
  let s = JSON.stringify(row).replace(UUID_RE, (u) => idMap.get(u) ?? u);
  for (const [o, n] of pathMap) s = s.split(JSON.stringify(o).slice(1, -1)).join(JSON.stringify(n).slice(1, -1));
  const out = JSON.parse(s);
  const rc = RUN_REFS[table];
  if (rc && out[rc] != null && runMap.has(Number(out[rc]))) out[rc] = runMap.get(Number(out[rc]));
  return out;
};

// ── 4. write (one transaction, triggers off) ────────────────────────────────────────────────────
const twinCompany = { ...remap("companies", company), id: TWIN, name: TWIN_NAME, fixture_hold: HOLD, frozen: false };
const sqlFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "twin-")), "twin.sql");
const insertOf = (table, rows) => {
  const m = metas.get(table) ?? meta(table);
  const cols = m.cols.filter((c) => c.gen !== "ALWAYS" && c.ident !== "ALWAYS").map((c) => `"${c.name}"`).join(", ");
  const tag = "$twin_" + createHash("md5").update(table).digest("hex").slice(0, 8) + "$";
  return `insert into public.${table} (${cols}) overriding system value select ${cols} from jsonb_populate_recordset(null::public.${table}, ${tag}${JSON.stringify(rows)}${tag}::jsonb);\n`;
};
let sql = "begin;\nset local session_replication_role = replica;\n" + (twinExists ? "" : insertOf("companies", [twinCompany]));
for (const [t, rows] of rowsByTable) {
  const mapped = rows.map((r) => remap(t, r));
  // every copied row with a company lands on the twin — checked before anything is written
  const stray = mapped.filter((r) => "company_id" in r && r.company_id !== TWIN).length;
  if (stray) { console.error(`refused: ${stray} ${t} row(s) would land on a company other than the twin`); process.exit(1); }
  sql += insertOf(t, mapped);
}
sql += "commit;\n";
fs.writeFileSync(sqlFile, sql);
execFileSync("bash", ["-c", `docker exec -i ${PGC} psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 < ${sqlFile}`], { stdio: "inherit", maxBuffer: 1024 * 1024 * 1024 });
fs.rmSync(path.dirname(sqlFile), { recursive: true, force: true });
console.log(`built: ${rowsByTable.size} tables, ${total} rows + the company row; ${idMap.size - 1} uuids and ${runMap.size} run ids remapped; ${pathMap.size} file paths prefixed`);
