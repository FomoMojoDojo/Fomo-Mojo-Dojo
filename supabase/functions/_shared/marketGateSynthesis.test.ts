// R3 (operator ruling, 2026-09-15) — the per-set synthesizers obey the same law as the
// job-map generator: the market definition is read by (company_id, journey_key), retracted
// excluded, with NO fallback to a latest row. A key with steps but no live definition
// refuses with no_market_definition before any write; a key with a definition proceeds to
// generation carrying THAT definition. Zero-writes is proven by table snapshots.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fakeDb } from "./fakeSupabaseForTests.ts";
import { NO_MARKET_DEFINITION } from "./marketDefinitionByKey.ts";
import { generateOpportunitiesForSet } from "./opportunitySynthesis.ts";
import { generateConditionsForSet } from "./stepConditionsSynthesis.ts";

const COMPANY = "co-gate2-test";
const OLLAMA = "http://host.docker.internal:11434/v1";
const A = {
  id: "a-customer", company_id: COMPANY, journey_key: "customer",
  job_executor: "Families and caregivers supporting children", chooser: "The parent",
  jtbd: "Find a full continuum of care", market_register: "internal_inferred",
  created_at: "2026-06-08T00:00:00Z", updated_at: "2026-06-19T00:00:00Z", retracted_at: null, retracted: false,
};
// Newer, different key, live — the row the old fallback would have picked for 'internal'.
const B = {
  id: "b-pmk", company_id: COMPANY, journey_key: "pmk-new-clinicians",
  job_executor: "New clinicians seeking training", chooser: "The clinician", jtbd: "Find training and progression",
  market_register: "public_inferred", created_at: "2026-09-11T00:00:00Z", updated_at: "2026-09-11T14:24:21Z",
  retracted_at: null, retracted: false,
};
const step = (key: string, n: number) => ({
  id: `${key}-s${n}`, company_id: COMPANY, journey_key: key, step_number: n, step_label: `Step ${n} of ${key}`,
  description: "d", evidence_basis: "e", provenance_type: "internal_derived", user_id: "user-1",
});
function seed() {
  return fakeDb({
    companies: [{ id: COMPANY, name: "Gate2 Co", created_by: "user-1" }],
    odi_market_definitions: [structuredClone(A), structuredClone(B)],
    job_steps: [step("customer", 1), step("customer", 2), step("internal", 1), step("internal", 2)],
    odi_needs: [],
    step_conditions: [],
  });
}

// The model is never reached on a refusal; on the success path we prove the gate was
// PASSED by making the first model call throw a sentinel that names the definition it
// was handed (read from the request body).
function stubFetch(sentinel: string) {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
    const body = String(init?.body ?? "");
    throw new Error(`${sentinel}::${body}`);
  }) as typeof fetch;
  return () => { globalThis.fetch = original; };
}

for (const [name, run] of [
  ["opportunitySynthesis", (db: ReturnType<typeof fakeDb>, key: string) =>
    generateOpportunitiesForSet({ supabase: db, companyId: COMPANY, journeyKey: key, ollamaUrl: OLLAMA, write: true, runId: "t", nowIso: "2026-09-15T00:00:00Z" })],
  ["stepConditionsSynthesis", (db: ReturnType<typeof fakeDb>, key: string) =>
    generateConditionsForSet({ supabase: db, companyId: COMPANY, journeyKey: key, ollamaUrl: OLLAMA, nowIso: "2026-09-15T00:00:00Z", runId: "t" })],
] as const) {
  Deno.test(`${name}: steps but no live definition → no_market_definition, zero writes (no fallback to the newer row)`, async () => {
    const db = seed();
    const before = db.snapshot();
    const restore = stubFetch("MODEL_MUST_NOT_BE_REACHED");
    try {
      const res = await run(db, "internal");
      assert(!res.ok, "must refuse");
      assert("skipped" in res, `expected a structured skip, got ${JSON.stringify(res)}`);
      assertEquals(res.skipped, NO_MARKET_DEFINITION);
      assertStringIncludes(String((res as { message?: string }).message ?? ""), "'internal'");
    } finally { restore(); }
    assertEquals(db.writes, []);
    assertEquals(db.snapshot(), before);
  });

  Deno.test(`${name}: a key with a live definition passes the gate carrying THAT definition`, async () => {
    const db = seed();
    const before = db.snapshot();
    const restore = stubFetch("MODEL_REACHED");
    let thrown = "";
    try {
      const res = await run(db, "customer");
      thrown = JSON.stringify(res);
    } catch (e) {
      thrown = String((e as Error).message);
    } finally { restore(); }
    assertStringIncludes(thrown, "MODEL_REACHED", "generation must be reached for a key with a live definition");
    assertStringIncludes(thrown, A.job_executor, "the brief must carry the keyed definition");
    assert(!thrown.includes(B.job_executor), "the brief must not carry the newer decoy");
    assertEquals(db.writes, [], "no write before the model answers");
    assertEquals(db.snapshot(), before);
  });
}
