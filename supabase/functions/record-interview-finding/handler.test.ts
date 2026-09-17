// Gate 2 (operator rulings 2026-09-16) — record-interview-finding refuses before any write, in order:
// no definition (R2, retracted excluded, no fallback) → no step / step 0 → local-model failure (nothing
// written, no template) → dry_run (nothing written) → the RPC once, with the expected shape. And
// Option B: nothing in this function or its shared imports references OpenAI.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fakeDb } from "../_shared/fakeSupabaseForTests.ts";
import { buildProposalUser, handleRecordInterviewFinding, PROPOSAL_SYSTEM, type LocalModelCall } from "./handler.ts";

const COMPANY = "co-gate2";
const DEF = { id: "d-customer", company_id: COMPANY, journey_key: "customer", job_executor: "Families supporting a child in crisis", chooser: "The parent", jtbd: "Find a full continuum of care", retracted_at: null, retracted: false, provenance_type: "internal_inferred", market_register: "internal_inferred" };
const DEF_FUNDER = { ...DEF, id: "d-funder", journey_key: "mkt-funders", job_executor: "Funders supporting youth mental health" };
const DEF_RETRACTED = { ...DEF, id: "d-retracted", journey_key: "mkt-retracted", retracted_at: "2026-09-01T00:00:00Z", retracted: true };
const STEP = { id: "s1", company_id: COMPANY, journey_key: "customer", step_number: 1, step_label: "Define what the family needs" };

// The fake gains an rpc() that records its calls — the write proof counts them.
function seed() {
  const db = fakeDb({
    odi_market_definitions: [structuredClone(DEF), structuredClone(DEF_FUNDER), structuredClone(DEF_RETRACTED)],
    job_steps: [structuredClone(STEP)],
    interview_records: [], odi_needs: [],
    companies: [{ id: COMPANY, created_by: "user-owner" }],
  });
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpc = (fn: string, args: Record<string, unknown>) => {
    rpcCalls.push({ fn, args });
    // apply what the real RPC would: a record + a need
    db.tables.interview_records.push({ id: "rec-new", company_id: COMPANY, ...((args.p_record as Record<string, unknown>) ?? {}) });
    db.tables.odi_needs.push({ id: "need-new", company_id: COMPANY, journey_key: args.p_journey_key, step_number: args.p_step_number, interview_record_id: "rec-new" });
    return Promise.resolve({ data: [{ record_id: "rec-new", need_id: "need-new", reused_record: false }], error: null });
  };
  return { db: Object.assign(db, { rpc }), rpcCalls };
}
const okModel: LocalModelCall = () => Promise.resolve({ ok: true, content: JSON.stringify({ statement: "Minimize the time before a family hears back after intake" }) });
const failModel: LocalModelCall = () => Promise.resolve({ ok: false, err: "connection refused" });
const emptyModel: LocalModelCall = () => Promise.resolve({ ok: true, content: JSON.stringify({ statement: "" }) });
function env() {
  Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sr"); Deno.env.set("SUPABASE_ANON_KEY", "anon");
  Deno.env.set("OLLAMA_BASE_URL", "http://host.docker.internal:11434/v1"); Deno.env.set("OLLAMA_MODEL", "qwen2.5:14b-instruct");
}
const post = (body: Record<string, unknown>) => new Request("http://local/record-interview-finding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const record = (over: Record<string, unknown> = {}) => ({ speaker_role: "client_stakeholder", person_name: "Jordan (test)", interviewed_at: "2026-09-10T17:00:00Z", interviewer: "Bob", consent_basis: "verbal", verbatim: "We lose families in the first week because nobody calls them back.", ...over });
async function run(body: Record<string, unknown>, model: LocalModelCall = okModel) {
  env();
  const { db, rpcCalls } = seed();
  const before = db.snapshot();
  const resp = await handleRecordInterviewFinding(post(body), { createClient: () => db as unknown as never, callLocalModel: model });
  const json = await resp.json();
  return { status: resp.status, json, db, rpcCalls, before };
}
function assertNothingWritten(r: { db: ReturnType<typeof fakeDb>; rpcCalls: unknown[]; before: string }) {
  assertEquals(r.rpcCalls.length, 0, "the RPC must not be called");
  assertEquals(r.db.writes, [], "no direct writes");
  assertEquals(r.db.snapshot(), r.before, "tables byte-identical");
}

Deno.test("a. `{}` → 400 company_id required (boot check)", async () => {
  const r = await run({});
  assertEquals(r.status, 400); assertEquals(r.json.error, "company_id required"); assertNothingWritten(r);
});
Deno.test("b. no definition for the key → 422 no_market_definition, nothing written", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "mkt-unknown", step_number: 1, record: record() });
  assertEquals(r.status, 422); assertEquals(r.json.error, "no_market_definition"); assertNothingWritten(r);
});
Deno.test("b'. a RETRACTED definition counts as none (no fallback to another row)", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "mkt-retracted", step_number: 1, record: record() });
  assertEquals(r.status, 422); assertEquals(r.json.error, "no_market_definition"); assertNothingWritten(r);
});
Deno.test("c. live definition but no step (normative-only / unmapped market) → 422 no_step with the no-map wording", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "mkt-funders", step_number: 1, record: record({ speaker_role: "market_participant", journey_key: "mkt-funders" }) });
  assertEquals(r.status, 422); assertEquals(r.json.error, "no_step");
  assertStringIncludes(r.json.message, "normative"); assertStringIncludes(r.json.message, "generate its job map first"); assertNothingWritten(r);
});
Deno.test("c'. step 0 → 422 no_step (never step 0)", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 0, record: record() });
  assertEquals(r.status, 422); assertEquals(r.json.error, "no_step"); assertStringIncludes(r.json.message, "never step 0"); assertNothingWritten(r);
});
Deno.test("d. model failure → 502 model_unavailable, nothing written, no template", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record() }, failModel);
  assertEquals(r.status, 502); assertEquals(r.json.error, "model_unavailable"); assertStringIncludes(r.json.message, "no template fallback"); assertNothingWritten(r);
});
Deno.test("d'. empty model output → 502 model_unavailable, nothing written", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record() }, emptyModel);
  assertEquals(r.status, 502); assertEquals(r.json.error, "model_unavailable"); assertNothingWritten(r);
});
Deno.test("e. dry_run → the proposal, definition, step; nothing written", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, dry_run: true, record: record() });
  assertEquals(r.status, 200);
  assertEquals(r.json, { ok: true, dry_run: true, proposed_statement: "Minimize the time before a family hears back after intake", model: "qwen2.5:14b-instruct", definition_id: "d-customer", journey_key: "customer", step_number: 1, step_label: STEP.step_label, speaker_role: "client_stakeholder", would_reuse_record: false });
  assertNothingWritten(r);
});
Deno.test("f. success → the RPC once, with the expected shape; the response carries record/need ids", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record({ person_role: "Program director" }) });
  assertEquals(r.status, 200);
  assertEquals(r.rpcCalls.length, 1);
  assertEquals(r.rpcCalls[0].fn, "record_interview_finding");
  assertEquals(r.rpcCalls[0].args, {
    p_company_id: COMPANY, p_user_id: "user-owner", p_journey_key: "customer", p_step_number: 1, p_step_label: STEP.step_label,
    p_statement: "Minimize the time before a family hears back after intake", p_interview_record_id: null,
    p_record: { speaker_role: "client_stakeholder", person_name: "Jordan (test)", person_role: "Program director", journey_key: null, interviewed_at: "2026-09-10T17:00:00Z", interviewer: "Bob", consent_basis: "verbal", verbatim: record().verbatim },
  });
  assertEquals(r.json.record_id, "rec-new"); assertEquals(r.json.need_id, "need-new"); assertEquals(r.json.reused_record, false);
  assertEquals(r.db.writes, [], "no direct table writes — the RPC is the only writer");
});
Deno.test("g. a market_participant record for another market → 422 market_key_mismatch, nothing written", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record({ speaker_role: "market_participant", journey_key: "mkt-funders" }) });
  assertEquals(r.status, 422); assertEquals(r.json.error, "market_key_mismatch"); assertNothingWritten(r);
});
Deno.test("the prompt carries the verbatim, the speaker role, the executor and the step label — and asks for ODI form", () => {
  const user = buildProposalUser({ verbatim: "the quote", speakerRole: "market_participant", executor: "Funders", stepLabel: "Decide where to give" });
  for (const s of ["the quote", "market participant", "Funders", "Decide where to give"]) assertStringIncludes(user, s);
  for (const s of ["Minimize / Reduce / Increase / Improve / Maximize / Avoid", "grounded ONLY in the quote", '{"statement":"..."}']) assertStringIncludes(PROPOSAL_SYSTEM, s);
});

// ── Gate 4: the operator's edited statement (optional `statement` on a non-dry-run call) ────────
const neverModel: LocalModelCall = () => { throw new Error("the model must not be called when a statement is supplied"); };
Deno.test("h. statement supplied → used verbatim (trimmed), the model is NOT called, the RPC carries it, model: null", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record(), statement: "  Reduce the number of days a family waits for a first call back  " }, neverModel);
  assertEquals(r.status, 200);
  assertEquals(r.rpcCalls.length, 1);
  assertEquals(r.rpcCalls[0].args.p_statement, "Reduce the number of days a family waits for a first call back");
  assertEquals(r.json.proposed_statement, "Reduce the number of days a family waits for a first call back");
  assertEquals(r.json.statement_source, "operator"); assertEquals(r.json.model, null);
});
Deno.test("h2. statement absent → the model proposes as before (statement_source: model)", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record() });
  assertEquals(r.status, 200); assertEquals(r.json.statement_source, "model"); assertEquals(r.json.model, "qwen2.5:14b-instruct");
  assertEquals(r.rpcCalls[0].args.p_statement, "Minimize the time before a family hears back after intake");
});
Deno.test("h3. a statement without a direction verb → 422 statement_not_odi, nothing written, model not called", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record(), statement: "Families want a call back within a day" }, neverModel);
  assertEquals(r.status, 422); assertEquals(r.json.error, "statement_not_odi"); assertNothingWritten(r);
});
Deno.test("h4. dry_run ignores a supplied statement (the proposal path runs; nothing written)", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, dry_run: true, record: record(), statement: "Reduce something" });
  assertEquals(r.status, 200); assertEquals(r.json.proposed_statement, "Minimize the time before a family hears back after intake"); assertNothingWritten(r);
});
Deno.test("source guard: the model call sits behind the supplied-statement branch", async () => {
  const src = await Deno.readTextFile(new URL("./handler.ts", import.meta.url).pathname);
  const guard = src.indexOf("suppliedStatement\n      ?");
  const call = src.indexOf("await callLocalModel(");
  assert(guard > 0 && call > guard, "callLocalModel must be reached only through the `suppliedStatement ? … : await callLocalModel(…)` branch");
});

// ── Fold 2: expected_definition_id — the placement the form last saw must still be the placement ──
Deno.test("i. expected_definition_id equal to the resolved definition → the write proceeds", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record(), statement: "Reduce the wait for a call back", expected_definition_id: "d-customer" }, neverModel);
  assertEquals(r.status, 200); assertEquals(r.rpcCalls.length, 1);
});
Deno.test("i2. expected_definition_id ≠ the resolved definition → 409 placement_changed, nothing written, model not called", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, record: record(), statement: "Reduce the wait for a call back", expected_definition_id: "d-stale" }, neverModel);
  assertEquals(r.status, 409); assertEquals(r.json.error, "placement_changed");
  assertEquals(r.json.expected_definition_id, "d-stale"); assertEquals(r.json.definition_id, "d-customer");
  assertNothingWritten(r);
});
Deno.test("i3. dry_run ignores expected_definition_id (it is what a dry run RETURNS)", async () => {
  const r = await run({ company_id: COMPANY, journey_key: "customer", step_number: 1, dry_run: true, record: record(), expected_definition_id: "d-stale" });
  assertEquals(r.status, 200); assertEquals(r.json.definition_id, "d-customer"); assertNothingWritten(r);
});

// ── Option B source guard: the function and everything it imports from _shared ─────────────────
Deno.test("Option B: no OpenAI client, endpoint or key anywhere in this function or its shared imports", async () => {
  const seen = new Set<string>();
  const queue = [new URL("./handler.ts", import.meta.url).pathname, new URL("./index.ts", import.meta.url).pathname];
  const bad = /openaiClient|callOpenAI|OPENAI_API_KEY|api\.openai\.com|modelRouter/; // code-level signals only (prose may name the law)
  while (queue.length) {
    const p = queue.pop()!;
    if (seen.has(p)) continue; seen.add(p);
    const src = await Deno.readTextFile(p);
    assert(!bad.test(src), `${p} references OpenAI`);
    for (const m of src.matchAll(/from\s+"(\.[^"]+\.ts)"/g)) queue.push(new URL(m[1], `file://${p}`).pathname);
  }
  assert(seen.size >= 3, `expected the handler, index and at least one shared import (saw ${seen.size})`);
});
