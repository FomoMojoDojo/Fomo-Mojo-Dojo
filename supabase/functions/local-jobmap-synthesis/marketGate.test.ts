// R1/R2 (operator rulings, 2026-09-15) — planted-failure proofs for the job-map generator's
// market-definition contract.
//   R1 — this generator never writes odi_market_definitions.
//   R2 — every definition read is by (company_id, journey_key), retracted excluded, no
//        fallback to a latest row; a missing definition refuses the run before any write.
// Zero-writes is proven by table snapshots (row content before == after), never by the
// absence of an error. The fake below APPLIES mutations, so a regression that writes shows
// up as a snapshot diff, not as a silently swallowed call.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  NO_MARKET_DEFINITION,
  renderOdiGrounding,
  resolveJourneyDefinitions,
} from "../_shared/marketDefinitionByKey.ts";
import { handleLocalJobmapSynthesis, requiresScopedRunFlags } from "./handler.ts";

type Row = Record<string, unknown>;

// ── In-memory supabase fake ────────────────────────────────────────────────────────────
// Supports the query surface the handler uses up to (and including) the refusal:
// select/eq/is/in/order/limit/maybeSingle/single, and insert/update/delete/upsert which
// mutate `tables` and are logged in `writes`.
function fakeDb(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; op: string }> = [];
  const snapshot = () => JSON.stringify(tables);
  function from(table: string) {
    if (!tables[table]) tables[table] = [];
    const filters: Array<(r: Row) => boolean> = [];
    let orderBy: { col: string; asc: boolean } | null = null;
    let limitN: number | null = null;
    let single = false;
    let op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
    let payload: Row | Row[] | null = null;
    const q: Record<string, unknown> = {};
    const chain = (fn: () => void) => { fn(); return q; };
    q.select = () => q;
    q.eq = (col: string, val: unknown) => chain(() => filters.push((r) => r[col] === val));
    q.neq = (col: string, val: unknown) => chain(() => filters.push((r) => r[col] !== val));
    q.is = (col: string, val: unknown) => chain(() => filters.push((r) => (val === null ? r[col] == null : r[col] === val)));
    q.in = (col: string, vals: unknown[]) => chain(() => filters.push((r) => vals.includes(r[col])));
    q.order = (col: string, o?: { ascending?: boolean }) => chain(() => { orderBy = { col, asc: o?.ascending !== false }; });
    q.limit = (n: number) => chain(() => { limitN = n; });
    q.maybeSingle = () => chain(() => { single = true; });
    q.single = () => chain(() => { single = true; });
    q.insert = (p: Row | Row[]) => chain(() => { op = "insert"; payload = p; });
    q.upsert = (p: Row | Row[]) => chain(() => { op = "upsert"; payload = p; });
    q.update = (p: Row) => chain(() => { op = "update"; payload = p; });
    q.delete = () => chain(() => { op = "delete"; });
    q.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
      try {
        const matching = tables[table].filter((r) => filters.every((f) => f(r)));
        if (op === "select") {
          let rows = [...matching];
          if (orderBy) {
            const { col, asc } = orderBy;
            rows.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
          }
          if (limitN != null) rows = rows.slice(0, limitN);
          const data = single ? (rows[0] ?? null) : rows;
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        }
        writes.push({ table, op });
        if (op === "insert" || op === "upsert") {
          const rows = Array.isArray(payload) ? payload : [payload as Row];
          tables[table].push(...rows.map((r) => ({ id: crypto.randomUUID(), ...r })));
        } else if (op === "update") {
          for (const r of matching) Object.assign(r, payload as Row);
        } else if (op === "delete") {
          tables[table] = tables[table].filter((r) => !matching.includes(r));
        }
        return Promise.resolve({ data: null, error: null }).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    };
    return q;
  }
  return { from, writes, tables, snapshot, auth: { getUser: async () => ({ data: { user: null } }) } };
}

const COMPANY = "co-edgewood-test";
const A = {
  id: "a-customer", company_id: COMPANY, journey_key: "customer",
  job_executor: "Families and caregivers supporting children", chooser: "The parent or guardian",
  jtbd: "Find a full continuum of care for a child in crisis", market_register: "internal_inferred",
  created_at: "2026-06-08T00:00:00Z", updated_at: "2026-06-19T00:00:00Z", retracted_at: null, retracted: false,
};
// The decoy: a NEWER row under a different key (created AND updated later than A).
const B = {
  id: "b-pmk-clinicians", company_id: COMPANY, journey_key: "pmk-new-clinicians-seeking-training",
  job_executor: "New clinicians seeking training and professional growth", chooser: "The clinician",
  jtbd: "New clinicians are trying to find training and progression", market_register: "public_inferred",
  created_at: "2026-09-11T00:00:00Z", updated_at: "2026-09-11T14:24:21Z", retracted_at: null, retracted: false,
};
// A retracted def under 'internal' — R2: retracted counts as none.
const R = {
  id: "r-internal-retracted", company_id: COMPANY, journey_key: "internal",
  job_executor: "Retracted executor", chooser: "x", jtbd: "y", market_register: "internal_inferred",
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-01T00:00:00Z", retracted_at: "2026-09-01T00:00:00Z", retracted: true,
};

function seed() {
  return fakeDb({
    companies: [{ id: COMPANY, name: "Edgewood (test)", website: "", created_by: "user-1", manual_industry_vocab: null }],
    odi_market_definitions: [structuredClone(A), structuredClone(B), structuredClone(R)],
    job_steps: [
      { id: "s1", company_id: COMPANY, journey_key: "customer", step_number: 1, step_label: "x", provenance_type: "internal_inferred" },
      { id: "s2", company_id: COMPANY, journey_key: "internal", step_number: 1, step_label: "y", provenance_type: "internal_inferred" },
    ],
    odi_needs: [{ id: "n1", company_id: COMPANY, journey_key: "customer", desired_outcome: "z" }],
  });
}

// ── (a) Decoy ───────────────────────────────────────────────────────────────────────────
Deno.test("R2 decoy: the run key resolves A, never the newer B; the brief carries A; nothing is written", async () => {
  const db = seed();
  const before = db.snapshot();
  const res = await resolveJourneyDefinitions(db, COMPANY, ["customer"]);
  assert(res.ok, "resolution must succeed for a key with a live definition");
  const got = res.byKey.get("customer");
  assertEquals(got?.id, A.id);
  assertEquals(got?.job_executor, A.job_executor);
  assertEquals(got?.chooser, A.chooser);
  assertEquals(got?.jtbd, A.jtbd);

  const brief = renderOdiGrounding([got!]);
  assertStringIncludes(brief, A.job_executor);
  assertStringIncludes(brief, A.chooser);
  assertStringIncludes(brief, A.jtbd);
  assert(!brief.includes(B.job_executor), "the brief must not carry the decoy's executor");
  assert(!brief.includes(B.jtbd), "the brief must not carry the decoy's jtbd");

  assertEquals(db.writes, [], "R1: resolution performs no writes");
  assertEquals(db.snapshot(), before, "A and B are byte-identical across all columns before and after");
});

// ── (b) Missing definition ──────────────────────────────────────────────────────────────
Deno.test("R2 missing: a key with steps but no live definition (retracted-only) refuses, naming the key", async () => {
  const db = seed();
  const before = db.snapshot();
  const res = await resolveJourneyDefinitions(db, COMPANY, ["internal"]);
  assert(!res.ok);
  assertEquals(res.error, NO_MARKET_DEFINITION);
  assertEquals(res.missing, ["internal"]);
  assertStringIncludes(res.message, "'internal'");
  assertEquals(db.writes, []);
  assertEquals(db.snapshot(), before);
});

// ── (c) Multi-map ───────────────────────────────────────────────────────────────────────
Deno.test("R2 multi-map: one resolvable key + one missing → the whole run refuses", async () => {
  const db = seed();
  const res = await resolveJourneyDefinitions(db, COMPANY, ["customer", "internal"]);
  assert(!res.ok);
  assertEquals(res.missing, ["internal"]);
});

// ── Handler level: the refusal lands before ANY write, across all three tables ──────────
function post(body: Record<string, unknown>) {
  return new Request("http://local/local-jobmap-synthesis", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
function envForHandler() {
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-test");
  Deno.env.set("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1");
}

Deno.test("handler (b): missing definition → 422 no_market_definition, zero writes to definitions/steps/needs", async () => {
  envForHandler();
  const db = seed();
  const before = db.snapshot();
  const resp = await handleLocalJobmapSynthesis(
    post({ company_id: COMPANY, selected_job_maps: [{ journey_key: "internal" }], selected_maps_only: true, require_model: true }),
    { createClient: () => db as unknown as never },
  );
  assertEquals(resp.status, 422);
  const body = await resp.json();
  assertEquals(body.error, NO_MARKET_DEFINITION);
  assertEquals(body.missing_journey_keys, ["internal"]);
  assertStringIncludes(String(body.message), "'internal'");
  assertEquals(db.writes, []);
  assertEquals(db.snapshot(), before);
  assertEquals(db.tables.odi_market_definitions.length, 3);
  assertEquals(db.tables.job_steps.length, 2);
  assertEquals(db.tables.odi_needs.length, 1);
});

Deno.test("handler (c): two keys, one missing → whole run refuses before any write", async () => {
  envForHandler();
  const db = seed();
  const before = db.snapshot();
  const resp = await handleLocalJobmapSynthesis(
    post({ company_id: COMPANY, selected_job_maps: [{ journey_key: "customer" }, { journey_key: "internal" }], selected_maps_only: true, require_model: true }),
    { createClient: () => db as unknown as never },
  );
  assertEquals(resp.status, 422);
  const body = await resp.json();
  assertEquals(body.error, NO_MARKET_DEFINITION);
  assertEquals(body.missing_journey_keys, ["internal"]);
  assertEquals(db.writes, []);
  assertEquals(db.snapshot(), before);
});

// ── Scoped-run flags for market keys ────────────────────────────────────────────────────
Deno.test("a key that is not customer/internal requires selected_maps_only + require_model", async () => {
  assertEquals(requiresScopedRunFlags("customer"), false);
  assertEquals(requiresScopedRunFlags("customer-b2b"), false);
  assertEquals(requiresScopedRunFlags("internal"), false);
  assertEquals(requiresScopedRunFlags("pmk-new-clinicians-seeking-training"), true);
  envForHandler();
  const db = seed();
  const before = db.snapshot();
  const resp = await handleLocalJobmapSynthesis(
    post({ company_id: COMPANY, selected_job_maps: [{ journey_key: B.journey_key }] }),
    { createClient: () => db as unknown as never },
  );
  assertEquals(resp.status, 400);
  const body = await resp.json();
  assertEquals(body.error, "scoped_run_flags_required");
  assertEquals(db.writes, []);
  assertEquals(db.snapshot(), before);
});
