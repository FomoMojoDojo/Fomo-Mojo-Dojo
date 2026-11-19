// SP-426 slice 1 — which live signals belong to a SUPERSEDED analysis run? Computed in TypeScript.
//
// The keeper per (company, file) is the newest file_proposals row with processing_state='ready'
// (`status` is the operator's disposition, not readiness). A proposal with file_id NULL is its own
// group — two such rows cannot be shown to be analyses of the same document — so nothing is retired
// on that basis.
//
// EXCLUDED, by ruling: CB1 58b2b15b (SP-426), Edgewood 3dd2cfbb and its twin ed9e7000 (SP-430).
// NEVER TOUCHED, by ruling: live rows whose source_id matches no proposal (SP-431) — they are listed,
// not retired.
//
//   deno run -A scripts/retire-superseded-analyses-dryrun.ts
import { assert } from "https://deno.land/std@0.224.0/assert/assert.ts";

const DB = "supabase_db_dzlgyxcvuwiulgifbmew";
const EXCLUDED = new Set([
  "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc", // CB1 — SP-426
  "3dd2cfbb-0792-4bf1-9cd4-15db9646874b", // Edgewood — SP-430
  "ed9e7000-0000-4000-8000-00000000d4b1", // Edgewood test twin — SP-430
]);

async function psql(sql: string): Promise<string[][]> {
  const p = new Deno.Command("docker", {
    args: ["exec", "-i", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-F", "\t", "-c", sql],
    stdout: "piped", stderr: "piped",
  });
  const { code, stdout, stderr } = await p.output();
  if (code !== 0) throw new Error(new TextDecoder().decode(stderr));
  return new TextDecoder().decode(stdout).split("\n").filter((l) => l.trim() !== "").map((l) => l.split("\t"));
}

// 1. every proposal, so the keeper can be chosen in TS
const props = (await psql(`
  select id, company_id, coalesce(file_id::text,''), coalesce(processing_state,''), created_at
  from public.file_proposals`)).map(([id, company_id, file_id, state, created_at]) =>
    ({ id, company_id, file_id, state, created_at }));

// 2. every LIVE signal that came from an analysis run
const sigs = (await psql(`
  select s.id, s.company_id, coalesce(s.source_id,''), c.name
  from public.signals s join public.companies c on c.id = s.company_id
  where s.source_type = 'uploaded_file' and s.superseded_at is null and s.held_at is null`))
  .map(([id, company_id, source_id, name]) => ({ id, company_id, source_id, name }));

// 3. the keeper per (company, file-or-self), in TS
const keeper = new Map<string, { id: string; created_at: string; ready: boolean }>();
for (const p of props) {
  const group = `${p.company_id}|${p.file_id || p.id}`;
  const cand = { id: p.id, created_at: p.created_at, ready: p.state === "ready" };
  const cur = keeper.get(group);
  const better = !cur || (cand.ready !== cur.ready ? cand.ready : cand.created_at > cur.created_at);
  if (better) keeper.set(group, cand);
}
const keeperIds = new Set([...keeper.values()].map((k) => k.id));
const propById = new Map(props.map((p) => [p.id, p]));

// 4. classify every live analysis-derived signal
const toRetire: Record<string, string[]> = {};
const unmatched: Record<string, string[]> = {};
const kept: Record<string, number> = {};
for (const s of sigs) {
  const label = `${s.name} (${s.company_id.slice(0, 8)})`;
  if (EXCLUDED.has(s.company_id)) { (kept[`EXCLUDED — ${label}`] ??= 0); kept[`EXCLUDED — ${label}`]++; continue; }
  const p = propById.get(s.source_id);
  if (!p) { (unmatched[label] ??= []).push(s.id); continue; }
  if (keeperIds.has(p.id)) { kept[label] = (kept[label] ?? 0) + 1; continue; }
  (toRetire[label] ??= []).push(s.id);
}

console.log("=== TO RETIRE (live rows of a superseded analysis run) ===");
let total = 0;
for (const [co, ids] of Object.entries(toRetire).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(ids.length).padStart(4)}  ${co}`);
  total += ids.length;
}
console.log(`  TOTAL: ${total}`);

console.log("\n=== UNTOUCHED: live rows whose source_id matches no proposal (SP-431) ===");
let unm = 0;
for (const [co, ids] of Object.entries(unmatched).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(ids.length).padStart(4)}  ${co}`);
  unm += ids.length;
}
console.log(`  TOTAL: ${unm}`);

console.log("\n=== KEPT (the winning run), and excluded companies ===");
for (const [co, n] of Object.entries(kept).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${co}`);

// 5. the clearance assertions (SP-434 a)
const names = Object.keys(toRetire);
console.log("\n=== CLEARANCE (a) ===");
console.log(`  companies with rows to retire: ${names.join(", ") || "(none)"}`);
console.log(`  total rows to retire: ${total}`);
for (const co of ["Charter Communications", "Cafe Barra", "Cafe Barra 2", "Edgewood", "Edgewood (test twin)"]) {
  const hit = names.find((n) => n.startsWith(co + " ("));
  console.log(`  ${co}: ${hit ? toRetire[hit].length + " ← MUST BE ZERO" : "0"}`);
}
await Deno.writeTextFile("/tmp/slice1-retire-plan.json", JSON.stringify({ toRetire, unmatched, total }, null, 1));
console.log("\nplan written to /tmp/slice1-retire-plan.json");
