// infer-interview-market — Gate B commit 2b guards (R19–R35, 2026-09-21), model-free: the fake client applies
// inserts/updates to in-memory tables and logs every write; the fake transport answers per window from a
// script and records what it was asked; the clock is injected (R32). Fixtures are throwaway strings written
// here — never a real transcript. Every guard below has a named plant in the comments of its test.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPrompt, CALL_SITE, COMPONENT, cutWindows, handleInferInterviewMarket, INFERENCE_MODEL, isOperatorPlaced, type ModelReply, NUM_CTX, promptNotFullyRead, sha256HexText, tally, truncationSize, VERIFIED_OLLAMA_VERSIONS, WINDOW_CHARS } from "./handler.ts";

type Row = Record<string, unknown>;
const CO = "co-2b"; const ADMIN = "user-admin"; const MEMBER = "user-member"; const SR = "service-role-key";
const FIXTURE_LINE = "FIXTURE transcript line (not a real interview) — speaker A says a thing about a market.\n";
const fixtureText = (lines: number) => FIXTURE_LINE.repeat(lines);
/** 88-char lines → 136 per 12,000-char window; N × LPW lines cut into exactly N windows. */
const LPW = Math.floor(WINDOW_CHARS / FIXTURE_LINE.length);

function fake(seed: { records: Row[]; companies?: Row[]; defs?: Row[]; lens?: Row[]; roles?: Row[]; runs?: Row[] }, opts: { user?: string | null; refuseRecordWrite?: boolean; operatorMeanwhile?: boolean } = {}) {
  const tables: Record<string, Row[]> = {
    companies: (seed.companies ?? [{ id: CO, frozen: false }]).map((r) => ({ ...r })),
    interview_records: seed.records.map((r) => ({ ...r })),
    odi_market_definitions: (seed.defs ?? [
      { company_id: CO, journey_key: "mkt-a", job_executor: "Executor A", jtbd: "Job A", retracted_at: null },
      { company_id: CO, journey_key: "mkt-b", job_executor: "Executor B", jtbd: "Job B", retracted_at: null },
      { company_id: CO, journey_key: "mkt-c", job_executor: "Executor C", jtbd: "Job C", retracted_at: null },
      { company_id: CO, journey_key: "internal", job_executor: "Ops", jtbd: "Internal", retracted_at: null },
      { company_id: CO, journey_key: "mkt-old", job_executor: "Old", jtbd: "Old", retracted_at: "2026-09-01T00:00:00Z" },
      { company_id: CO, journey_key: "mkt-deferred", job_executor: "Deferred executor", jtbd: "Deferred job", retracted_at: null }, // R45: live definition, deferred lens
      { company_id: CO, journey_key: "mkt-nolens", job_executor: "No-lens executor", jtbd: "No-lens job", retracted_at: null }, // R45: live definition, no lens row
    ]).map((r) => ({ ...r })),
    market_lens: (seed.lens ?? [
      { company_id: CO, journey_key: "mkt-a", title: "Market A title", portfolio_state: "active" },
      { company_id: CO, journey_key: "mkt-b", title: "Market B title", portfolio_state: "active" },
      { company_id: CO, journey_key: "mkt-c", title: "Market C title", portfolio_state: "active" },
      { company_id: CO, journey_key: "internal", title: "Internal Operations", portfolio_state: "active" },
      { company_id: CO, journey_key: "mkt-deferred", title: "Deferred market title", portfolio_state: "deferred" },
    ]).map((r) => ({ ...r })),
    user_roles: (seed.roles ?? [{ user_id: ADMIN, role: "admin" }]).map((r) => ({ ...r })),
    integrity_runs: (seed.runs ?? []).map((r) => ({ ...r })),
    model_calls: [],
  };
  let nextRunId = 1000 + tables.integrity_runs.length;
  const writes: Array<{ table: string; op: string; payload?: Row }> = [];
  let recordReads = 0;
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]; let op: "select" | "insert" | "update" = "select"; let payload: Row | null = null; let single = false;
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    const run = () => {
      if (op === "insert") {
        const row = { ...(table === "integrity_runs" ? { id: nextRunId++ } : { id: `new-${table}-${tables[table].length + 1}` }), ...payload! };
        tables[table].push(row); writes.push({ table, op, payload: row }); return { data: single ? row : [row], error: null };
      }
      if (op === "update") {
        if (table === "interview_records" && opts.refuseRecordWrite) return { data: null, error: { message: "planted record write refusal" } };
        for (const r of rows) { const live = tables[table].find((x) => x.id === r.id); if (live) Object.assign(live, payload!); }
        writes.push({ table, op, payload: payload! }); return { data: null, error: null };
      }
      if (table === "interview_records") {
        recordReads += 1;
        // the plant for "operator placed meanwhile": the SECOND read of the record shows an operator placement
        if (opts.operatorMeanwhile && recordReads === 2) { for (const live of tables.interview_records) Object.assign(live, { market_state: "placed", journey_key: "mkt-c", market_basis: [...(live.market_basis as unknown[]), { kind: "operator_override", journey_key: "mkt-c" }] }); rows = [...tables.interview_records]; }
      }
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      is: (c: string, v: unknown) => chain((r) => r.filter((x) => (v === null ? x[c] == null : x[c] === v))),
      limit: (n: number) => chain((r) => r.slice(0, n)),
      insert: (p: Row) => { op = "insert"; payload = p; return b; },
      update: (p: Row) => { op = "update"; payload = p; return b; },
      maybeSingle: () => { single = true; return Promise.resolve(run()); },
      single: () => { single = true; return Promise.resolve(run()); },
      then: (res: (v: unknown) => unknown) => Promise.resolve(run()).then(res),
    });
    return b;
  };
  const client = { from, auth: { getUser: () => Promise.resolve({ data: { user: opts.user === undefined ? { id: ADMIN } : (opts.user ? { id: opts.user } : null) } }) } };
  return { client, tables, writes };
}
function record(extra: Row = {}, lines = 3): Row {
  return { id: "rec-1", company_id: CO, speaker_role: "market_participant", verbatim: fixtureText(lines), text_sha256: "", market_state: "unplaced", journey_key: null, market_basis: [{ kind: "original", result: "none" }], retracted_at: null, input_file_id: "f-1", ...extra };
}
async function seeded(extra: Row = {}, lines = 3) {
  const r = record(extra, lines);
  if (!r.text_sha256) r.text_sha256 = await sha256HexText(String(r.verbatim));
  return r;
}
function env(ollama = "http://host.docker.internal:11434") { Deno.env.set("SUPABASE_URL", "http://127.0.0.1:54321"); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SR); Deno.env.set("SUPABASE_ANON_KEY", "anon"); Deno.env.set("OLLAMA_SYNDICATION_BASE_URL", ollama); }
function post(body: Record<string, unknown>, auth: "user" | "service" | "none" = "user") {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth === "user") headers.Authorization = "Bearer user-jwt"; if (auth === "service") headers.Authorization = `Bearer ${SR}`;
  return new Request("http://local/infer-interview-market", { method: "POST", headers, body: JSON.stringify(body) });
}
/** A scripted transport: one reply (or throw) per window, in order; records the calls. */
function transport(script: Array<{ key?: string | null; reason?: string; throws?: string; raw?: string; ms?: number; promptTokens?: number } | null>, clock?: { t: number }) {
  const calls: Array<{ baseUrl: string; model: string; user: string; system: string }> = [];
  const callModel = (args: { baseUrl: string; model: string; system: string; user: string }): Promise<ModelReply> => {
    calls.push({ baseUrl: args.baseUrl, model: args.model, user: args.user, system: args.system });
    const step = script[calls.length - 1] ?? null;
    if (clock && step?.ms) clock.t += step.ms;
    if (!step || step.throws) return Promise.reject(new Error(step?.throws ?? "no scripted reply"));
    const content = step.raw ?? JSON.stringify({ market_key: step.key ?? null, reason: step.reason ?? "fixture reason" });
    return Promise.resolve({ content, prompt_eval_count: step.promptTokens ?? 3900, eval_count: 50 });
  };
  return { calls, callModel };
}
let VERSION = "0.34.0"; // the verified runtime unless a test says otherwise
async function run(f: ReturnType<typeof fake>, t: ReturnType<typeof transport>, body: Record<string, unknown> = { company_id: CO, interview_record_id: "rec-1" }, auth: "user" | "service" | "none" = "user", clock?: { t: number }) {
  env();
  const resp = await handleInferInterviewMarket(post(body, auth), { createClient: () => f.client as never, callModel: t.callModel as never, readVersion: () => Promise.resolve(VERSION), now: () => (clock ? clock.t : 1_000_000) });
  return { status: resp.status, json: await resp.json() as Record<string, unknown> };
}
const runsOf = (f: ReturnType<typeof fake>) => f.tables.integrity_runs.filter((r) => r.component === COMPONENT);
const basisOf = (f: ReturnType<typeof fake>) => f.tables.interview_records[0].market_basis as Row[];

Deno.test("boot: {} → 400 company_id required; interview_record_id required", async () => {
  const f = fake({ records: [] }); const t = transport([]);
  assertEquals((await run(f, t, {})).json.error, "company_id required");
  assertEquals((await run(f, t, { company_id: CO })).json.error, "interview_record_id required");
  assertEquals(t.calls.length, 0);
});

Deno.test("(a) no JWT → 401; a non-admin user → 403; nothing inferred, no model call, no rows (plant: the user_roles check removed → the member runs)", async () => {
  const f = fake({ records: [await seeded()] }); const t = transport([{ key: "mkt-a" }]);
  const none = await run(f, t, undefined, "none");
  assertEquals(none.status, 401); assertEquals(none.json.error, "no_authenticated_caller");
  const g = fake({ records: [await seeded()] }, { user: MEMBER });
  const member = await run(g, t);
  assertEquals(member.status, 403); assertEquals(member.json.error, "not_admin");
  assertEquals(t.calls.length, 0); assertEquals(f.writes.length + g.writes.length, 0);
});

Deno.test("(a) the service role and an admin JWT are both accepted; the actor is recorded on the run row, never taken from the body", async () => {
  const f = fake({ records: [await seeded()] }); const t = transport([{ key: "mkt-a" }]);
  const admin = await run(f, t, { company_id: CO, interview_record_id: "rec-1", actor: "spoofed" });
  assertEquals(admin.status, 200);
  assertEquals((runsOf(f)[0].excluded_by_rule as Row).actor, { kind: "user", id: ADMIN });
  const g = fake({ records: [await seeded()] }); const u = transport([{ key: "mkt-a" }]);
  const svc = await run(g, u, undefined, "service");
  assertEquals(svc.status, 200);
  assertEquals((runsOf(g)[0].excluded_by_rule as Row).actor, { kind: "service_role" });
});

Deno.test("(b) a frozen company → 403 before any model call (companies.frozen is the truth)", async () => {
  const f = fake({ records: [await seeded()], companies: [{ id: CO, frozen: true }] }); const t = transport([{ key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 403); assertEquals(r.json.error, "frozen_company"); assertEquals(t.calls.length, 0); assertEquals(f.writes.length, 0);
});

Deno.test("(c) a stakeholder record → 409; (d) a retracted record → 409; no model call, no rows", async () => {
  const s = fake({ records: [await seeded({ speaker_role: "client_stakeholder", market_state: "per_item" })] }); const t = transport([{ key: "mkt-a" }]);
  const a = await run(s, t); assertEquals(a.status, 409); assertEquals(a.json.error, "stakeholder_record");
  const w = fake({ records: [await seeded({ retracted_at: "2026-09-20T15:23:49Z" })] });
  const b = await run(w, t); assertEquals(b.status, 409); assertEquals(b.json.error, "record_withdrawn");
  const h = fake({ records: [await seeded({ input_file_id: null })] }); // a hand-entered (capture-form) record is never inferred
  const c = await run(h, t); assertEquals(c.status, 409); assertEquals(c.json.error, "not_upload_record");
  assertEquals(t.calls.length, 0); assertEquals(s.writes.length + w.writes.length + h.writes.length, 0);
});

Deno.test("(e) a record currently placed by the operator → 409 operator_placed, unchanged; (R23) an UNPLACED record with override history is eligible", async () => {
  const placed = await seeded({ market_state: "placed", journey_key: "mkt-b", market_basis: [{ kind: "original", result: "none" }, { kind: "operator_override", journey_key: "mkt-b" }] });
  const f = fake({ records: [placed] }); const t = transport([{ key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 409); assertEquals(r.json.error, "operator_placed"); assertEquals(t.calls.length, 0);
  assertEquals(f.tables.interview_records[0].journey_key, "mkt-b"); assertEquals((f.tables.interview_records[0].market_basis as Row[]).length, 2);
  // R23: history says the operator once placed it, but it is unplaced NOW → eligible
  const unplaced = await seeded({ market_state: "unplaced", journey_key: null, market_basis: [{ kind: "original", result: "none" }, { kind: "operator_override", journey_key: "mkt-b" }, { kind: "operator_override", journey_key: null }] });
  const g = fake({ records: [unplaced] }); const u = transport([{ key: "mkt-a" }]);
  const ok = await run(g, u);
  assertEquals(ok.status, 200); assertEquals(ok.json.result, "placed"); assertEquals(u.calls.length, 1);
  assert(isOperatorPlaced(placed)); assert(!isOperatorPlaced(unplaced));
});

Deno.test("(f) text_sha256 mismatch → 409, a failed integrity row, no model call, the record untouched", async () => {
  const f = fake({ records: [await seeded({ text_sha256: "0".repeat(64) })] }); const t = transport([{ key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 409); assertEquals(r.json.error, "text_hash_mismatch"); assertEquals(t.calls.length, 0);
  const runs = runsOf(f); assertEquals(runs.length, 1); assertEquals(runs[0].status, "failed"); assertEquals(runs[0].error, "text_hash_mismatch");
  assertEquals(basisOf(f).length, 1);
  assert(!JSON.stringify(runs[0]).includes("FIXTURE transcript"), "the ledger never carries text");
});

Deno.test("(g) windows: ≤ 12,000 chars cut at line boundaries; an over-long line is hard-cut; three windows → three calls, each ledgered", async () => {
  const w = cutWindows(FIXTURE_LINE.repeat(400)); // 400 × 88 chars = 35,200 → 3 windows (136 + 136 + 128 lines), each ending on a newline
  assert(w.length === 3 && w.every((x) => x.length <= WINDOW_CHARS && x.endsWith("\n")));
  assertEquals(w.map((x) => x.length), [LPW * 88, LPW * 88, (400 - 2 * LPW) * 88]);
  assertEquals(w.join(""), FIXTURE_LINE.repeat(400));
  const long = cutWindows("x".repeat(WINDOW_CHARS * 2 + 5) + "\n" + "tail\n");
  assertEquals(long.map((x) => x.length), [WINDOW_CHARS, WINDOW_CHARS, 6, 5]);
  const f = fake({ records: [await seeded({}, 3 * LPW)] }); const t = transport([{ key: "mkt-a" }, { key: "mkt-a" }, { key: "mkt-b" }]);
  const r = await run(f, t);
  assertEquals(r.status, 200); assertEquals(r.json.windows_total, 3); assertEquals(t.calls.length, 3);
  const calls = f.tables.model_calls; assertEquals(calls.length, 3);
  for (const c of calls) { assertEquals(c.provider, "ollama"); assertEquals(c.model, INFERENCE_MODEL); assertEquals(c.call_site, CALL_SITE); assertEquals(c.prompt_tokens, 3900); assertEquals(c.completion_tokens, 50); assertEquals(c.usd, null); assertEquals(c.run_id, null); }
  for (const c of t.calls) { assertEquals(c.baseUrl, "http://host.docker.internal:11434"); assertEquals(c.model, INFERENCE_MODEL); assertStringIncludes(c.user, "- mkt-a: Market A title"); assert(!c.user.includes("internal"), "R34: internal never a candidate"); assert(!c.user.includes("mkt-old"), "a retracted definition never a candidate"); assert(!c.user.includes("mkt-deferred") && !c.user.includes("mkt-nolens"), "R45: deferred / no-lens never a candidate"); }
});

Deno.test("(h) strict majority places: A,A,B → placed A (M3 title from the lens); every run appends ONE basis entry; the planned row ends completed with admitted 1", async () => {
  const f = fake({ records: [await seeded({}, 3 * LPW)] }); const t = transport([{ key: "mkt-a" }, { key: "mkt-a" }, { key: "mkt-b" }]);
  const r = await run(f, t);
  assertEquals(r.json.result, "placed"); assertEquals(r.json.journey_key, "mkt-a"); assertEquals(r.json.market_title, "Market A title");
  const rec = f.tables.interview_records[0]; assertEquals(rec.market_state, "placed"); assertEquals(rec.journey_key, "mkt-a");
  const basis = basisOf(f); assertEquals(basis.length, 2); assertEquals(basis[0], { kind: "original", result: "none" });
  const e = basis[1]; assertEquals(e.kind, "inference"); assertEquals(e.result, "placed"); assertEquals(e.journey_key, "mkt-a"); assertEquals(e.votes, { "mkt-a": 2, "mkt-b": 1 }); assertEquals(e.named, 3);
  assertEquals((e.windows as Row[]).map((w) => w.reason), ["fixture reason", "fixture reason", "fixture reason"]); // stored (never rendered — R35)
  assert(!JSON.stringify(e).match(/confiden/i), "no confidence word anywhere");
  const runs = runsOf(f); assertEquals(runs.length, 1); assertEquals(runs[0].status, "completed"); assertEquals(runs[0].admitted, 1); assertEquals((runs[0].excluded_by_rule as Row).windows_done, 3);
  assert(!JSON.stringify(runs[0]).includes("fixture reason") && !JSON.stringify(runs[0]).includes("FIXTURE transcript"), "the integrity row carries counts and keys only");
});

Deno.test("(i) a tie (A,B) and no majority (A,A,B,B / A,B,C) and all-none stay 'not inferred' — unplaced, journey_key null, one entry appended each run", async () => {
  for (const script of [[{ key: "mkt-a" }, { key: "mkt-b" }], [{ key: "mkt-a" }, { key: "mkt-a" }, { key: "mkt-b" }, { key: "mkt-b" }], [{ key: "mkt-a" }, { key: "mkt-b" }, { key: "mkt-c" }], [{ key: null }, { key: null }]]) {
    const f = fake({ records: [await seeded({}, LPW * script.length)] }); const t = transport(script);
    const r = await run(f, t);
    assertEquals(r.status, 200); assertEquals(r.json.result, "not_inferred"); assertEquals(r.json.journey_key, null);
    const rec = f.tables.interview_records[0]; assertEquals(rec.market_state, "unplaced"); assertEquals(rec.journey_key, null);
    const basis = basisOf(f); assertEquals(basis.length, 2); assertEquals(basis[1].result, "not_inferred");
    assertEquals(runsOf(f)[0].status, "completed"); assertEquals(runsOf(f)[0].admitted, 0);
  }
});

Deno.test("(j) a key outside the list is invalid = counted as none, never an error: A, bogus, A → placed A (named 2); the invalid key is kept on the window", async () => {
  const f = fake({ records: [await seeded({}, 3 * LPW)] }); const t = transport([{ key: "mkt-a" }, { key: "mkt-zzz" }, { key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 200); assertEquals(r.json.result, "placed"); assertEquals(r.json.named, 2);
  const w = (basisOf(f)[1].windows as Row[])[1]; assertEquals(w.status, "ok"); assertEquals(w.market_key, null); assertEquals(w.invalid_key, "mkt-zzz");
  assertEquals(f.tables.model_calls.length, 3);
});

Deno.test("(k) R33: an errored window fails the run — recorded as an error (not none), later windows never called, nothing placed, entry appended, planned row failed", async () => {
  const f = fake({ records: [await seeded({}, 3 * LPW)] }); const t = transport([{ key: "mkt-a" }, { throws: "ollama HTTP 500: planted" }, { key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 422); assertEquals(r.json.error, "window_error"); assertEquals(t.calls.length, 2);
  const rec = f.tables.interview_records[0]; assertEquals(rec.market_state, "unplaced"); assertEquals(rec.journey_key, null);
  const e = basisOf(f)[1]; assertEquals(e.result, "failed"); assertEquals(e.failure_reason, "window_error"); assertEquals((e.windows as Row[])[1].status, "error"); assertEquals((e.windows as Row[])[1].market_key, null);
  assertEquals(runsOf(f)[0].status, "failed"); assertEquals(runsOf(f)[0].error, "window_error");
  assertEquals(f.tables.model_calls.length, 2); // the errored call is ledgered too (null tokens)
  assertEquals(f.tables.model_calls[1].prompt_tokens, null);
  // an unparsable reply is a window error as well
  const g = fake({ records: [await seeded({}, LPW)] }); const u = transport([{ raw: "not json" }]);
  const b = await run(g, u); assertEquals(b.status, 422); assertEquals(b.json.error, "window_error"); assertEquals(g.tables.interview_records[0].market_state, "unplaced");
});

Deno.test("(l) R32 time budget: 5 windows at 120 s each → the third is never started (240 + 120 > 300); reason time_budget; nothing placed", async () => {
  const clock = { t: 5_000_000 };
  const f = fake({ records: [await seeded({}, 5 * LPW)] }); const t = transport([{ key: "mkt-a", ms: 120_000 }, { key: "mkt-a", ms: 120_000 }, { key: "mkt-a", ms: 120_000 }, { key: "mkt-a", ms: 120_000 }, { key: "mkt-a", ms: 120_000 }], clock);
  assertEquals(cutWindows(fixtureText(5 * LPW)).length, 5);
  const r = await run(f, t, undefined, "user", clock);
  assertEquals(r.status, 422); assertEquals(r.json.error, "time_budget"); assertEquals(t.calls.length, 2); assertEquals(r.json.windows_run, 2);
  assertEquals(f.tables.interview_records[0].market_state, "unplaced");
  const e = basisOf(f)[1]; assertEquals(e.result, "failed"); assertEquals(e.failure_reason, "time_budget"); assertEquals(e.windows_run, 2);
  assertEquals(runsOf(f)[0].status, "failed"); assertEquals(runsOf(f)[0].error, "time_budget");
  // the floor: before the first window the slowest is 30 s — a run that starts at 271 s elapsed would stop; at 0 s it runs
  const g = fake({ records: [await seeded({}, LPW)] }); const u = transport([{ key: "mkt-a", ms: 20_000 }], { t: 1 });
  assertEquals((await run(g, u, undefined, "user", { t: 1 })).json.result, "placed");
});

Deno.test("(m) market_basis is append-only: the prefix is byte-identical after every run, one entry per run (placed, not inferred, failed)", async () => {
  const f = fake({ records: [await seeded({}, 3 * LPW)] });
  const before = JSON.stringify(basisOf(f));
  await run(f, transport([{ key: "mkt-a" }, { key: "mkt-b" }, { key: null }]));
  const after1 = basisOf(f); assertEquals(after1.length, 2); assertEquals(JSON.stringify(after1.slice(0, 1)), before);
  await run(f, transport([{ throws: "planted" }]));
  const after2 = basisOf(f); assertEquals(after2.length, 3); assertEquals(JSON.stringify(after2.slice(0, 2)), JSON.stringify(after1));
  await run(f, transport([{ key: "mkt-a" }, { key: "mkt-a" }, { key: "mkt-a" }]));
  const after3 = basisOf(f); assertEquals(after3.length, 4); assertEquals(JSON.stringify(after3.slice(0, 3)), JSON.stringify(after2)); assertEquals(after3[3].result, "placed");
  assertEquals(runsOf(f).length, 3);
});

Deno.test("(n) in flight: a planned row bumped < 5 min ago → 409 inference_in_flight, nothing run; a stale planned row (> 5 min) is marked failed stale_no_progress and the run proceeds", async () => {
  const NOW = 10_000_000;
  const fresh = { id: 77, company_id: CO, component: COMPONENT, surface_type: "interview_records", surface_id: "rec-1", status: "planned", ran_at: new Date(NOW - 60_000).toISOString(), excluded_by_rule: {} };
  const f = fake({ records: [await seeded()], runs: [fresh] }); const t = transport([{ key: "mkt-a" }]);
  const r = await run(f, t, undefined, "user", { t: NOW });
  assertEquals(r.status, 409); assertEquals(r.json.error, "inference_in_flight"); assertEquals(r.json.run_id, 77); assertEquals(t.calls.length, 0);
  const stale = { ...fresh, id: 78, ran_at: new Date(NOW - 6 * 60_000).toISOString() };
  const g = fake({ records: [await seeded()], runs: [stale] }); const u = transport([{ key: "mkt-a" }]);
  const ok = await run(g, u, undefined, "user", { t: NOW });
  assertEquals(ok.status, 200); assertEquals(ok.json.result, "placed");
  const old = g.tables.integrity_runs.find((x) => x.id === 78)!; assertEquals(old.status, "failed"); assertEquals(old.error, "stale_no_progress");
  assertEquals((runsOf(g).find((x) => x.id !== 78)!.excluded_by_rule as Row).stale_marked, [78]);
});

Deno.test("(o) the planned row is bumped after every window (ran_at moves, windows_done counts up) — the heartbeat the 5-minute rule reads", async () => {
  const clock = { t: 20_000_000 };
  const f = fake({ records: [await seeded({}, 3 * LPW)] }); const t = transport([{ key: "mkt-a", ms: 10_000 }, { key: "mkt-a", ms: 10_000 }, { key: "mkt-a", ms: 10_000 }], clock);
  await run(f, t, undefined, "user", clock);
  const bumps = f.writes.filter((w) => w.table === "integrity_runs" && w.op === "update").map((w) => w.payload!);
  assertEquals(bumps.length, 4); // 3 window bumps + the final
  assertEquals(bumps.map((b) => (b.excluded_by_rule as Row).windows_done), [1, 2, 3, 3]);
  assertEquals(bumps.slice(0, 3).map((b) => b.status), ["planned", "planned", "planned"]);
  assertEquals(bumps.map((b) => Date.parse(String(b.ran_at))), [20_010_000, 20_020_000, 20_030_000, 20_030_000]);
});

Deno.test("(p) a 'Change market' during the run wins: the record is re-read before the write — placement untouched, the entry records operator_placed_meanwhile", async () => {
  const f = fake({ records: [await seeded({}, 2 * LPW)] }, { operatorMeanwhile: true }); const t = transport([{ key: "mkt-a" }, { key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 200); assertEquals(r.json.result, "operator_placed_meanwhile"); assertEquals(r.json.journey_key, null);
  const rec = f.tables.interview_records[0]; assertEquals(rec.journey_key, "mkt-c"); assertEquals(rec.market_state, "placed");
  const basis = basisOf(f); assertEquals(basis[basis.length - 1].result, "operator_placed_meanwhile"); assertEquals(basis[basis.length - 2].kind, "operator_override");
});

Deno.test("(q) local-only: a non-local Ollama base → 500 before any call; no external host is imported by the function", async () => {
  env("https://api.example.com"); const f = fake({ records: [await seeded()] }); const t = transport([{ key: "mkt-a" }]);
  const resp = await handleInferInterviewMarket(post({ company_id: CO, interview_record_id: "rec-1" }), { createClient: () => f.client as never, callModel: t.callModel as never, readVersion: () => Promise.resolve("0.34.0") });
  assertEquals(resp.status, 500); assertStringIncludes(String((await resp.json()).error), "Local-only"); assertEquals(t.calls.length, 0);
  const src = await Deno.readTextFile(new URL("./handler.ts", import.meta.url));
  for (const bad of ["openai", "anthropic", "api.openai.com", "dify", "OPENAI_API_KEY"]) assert(!src.toLowerCase().includes(bad), `handler must not mention ${bad}`);
});

Deno.test("(r) no live markets → 409 no_markets, no run; tally is a pure strict majority", async () => {
  const f = fake({ records: [await seeded()], defs: [{ company_id: CO, journey_key: "internal", job_executor: "Ops", jtbd: "x", retracted_at: null }] }); const t = transport([{ key: "mkt-a" }]);
  const r = await run(f, t); assertEquals(r.status, 409); assertEquals(r.json.error, "no_markets"); assertEquals(t.calls.length, 0); assertEquals(runsOf(f).length, 0);
  // R45: live definitions whose lens is all deferred → no candidates either
  const g = fake({ records: [await seeded()], defs: [{ company_id: CO, journey_key: "mkt-x", job_executor: "X", jtbd: "x", retracted_at: null }], lens: [{ company_id: CO, journey_key: "mkt-x", title: "X", portfolio_state: "deferred" }] });
  const rg = await run(g, transport([{ key: "mkt-x" }])); assertEquals(rg.status, 409); assertEquals(rg.json.error, "no_markets");
  const w = (k: string | null, status: "ok" | "error" = "ok") => ({ index: 0, chars: 1, status, market_key: k, reason: null, ms: 1, prompt_tokens: null, completion_tokens: null });
  assertEquals(tally([w("a"), w("a"), w("b")]).winner, "a");
  assertEquals(tally([w("a"), w("b")]).winner, null);
  assertEquals(tally([w("a"), w(null), w(null)]).winner, "a"); // none votes are not named
  assertEquals(tally([w("a"), w("b", "error")]).winner, "a"); // an errored window is not a vote (the run fails anyway)
  assertEquals(tally([]).winner, null);
  const p = buildPrompt([{ market_key: "k1", title: "T1", job_executor: "E1", jtbd: "J1" }], "win");
  assertEquals((p.schema as { properties: { market_key: { anyOf: Array<{ enum?: string[] }> } } }).properties.market_key.anyOf[0].enum, ["k1"]);
});

Deno.test("(s) a refused record write → 409 record_write_refused, the planned row failed, nothing placed", async () => {
  const f = fake({ records: [await seeded()] }, { refuseRecordWrite: true }); const t = transport([{ key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 409); assertEquals(r.json.error, "record_write_refused");
  assertEquals(runsOf(f)[0].status, "failed"); assertEquals(runsOf(f)[0].error, "record_write_refused"); assertEquals(f.tables.interview_records[0].market_state, "unplaced");
});

Deno.test("(t) R36 context overflow: a reply whose prompt_eval_count equals Ollama's truncation size (num_ctx/2 + 2) is an error, never a vote — the run fails, nothing placed, entry appended, planned row failed, the call ledgered; a normal window is unaffected", async () => {
  assertEquals(truncationSize(8192), 4098); assertEquals(truncationSize(16384), 8194);
  assert(promptNotFullyRead(4098, 19_000, 8192)); assert(promptNotFullyRead(8194, 40_000, 16384));
  assert(!promptNotFullyRead(6457, 18_989, 8192)); // the measured .srt window: fully read
  assert(promptNotFullyRead(1000, 19_000, 8192)); // an impossible density (< 1 token per 8 chars) → not fully read
  assert(!promptNotFullyRead(null, 19_000, 8192));
  const f = fake({ records: [await seeded({}, 3 * LPW)] }); const t = transport([{ key: "mkt-a" }, { key: "mkt-a", promptTokens: truncationSize(NUM_CTX) }, { key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 422); assertEquals(r.json.error, "context_overflow"); assertEquals(t.calls.length, 2);
  const rec = f.tables.interview_records[0]; assertEquals(rec.market_state, "unplaced"); assertEquals(rec.journey_key, null);
  const e = basisOf(f)[1]; assertEquals(e.result, "failed"); assertEquals(e.failure_reason, "context_overflow"); assertEquals(e.num_ctx, NUM_CTX);
  const w = (e.windows as Row[])[1]; assertEquals(w.status, "error"); assertEquals(w.error, "context_overflow"); assertEquals(w.market_key, null); assertEquals(w.prompt_tokens, 4098);
  assertEquals(tally([w as never]).named, 0); // never a vote
  assertEquals(runsOf(f)[0].status, "failed"); assertEquals(runsOf(f)[0].error, "context_overflow"); assertEquals((runsOf(f)[0].excluded_by_rule as Row).num_ctx, NUM_CTX);
  assertEquals(f.tables.model_calls.length, 2); assertEquals(f.tables.model_calls[1].prompt_tokens, 4098);
  // a normal window (3,900 tokens for the same prompt) is unaffected
  const g = fake({ records: [await seeded({}, LPW)] }); const u = transport([{ key: "mkt-a", promptTokens: 3900 }]);
  const ok = await run(g, u); assertEquals(ok.status, 200); assertEquals(ok.json.result, "placed");
});

Deno.test("(u) R44 runtime gate: the Ollama version is read once per run and recorded; an unverified version fails the run BEFORE any model call (unverified_runtime), nothing placed, one entry appended (M4 via R42); the verified version runs", async () => {
  assertEquals(VERIFIED_OLLAMA_VERSIONS, ["0.34.0"]);
  VERSION = "0.35.0";
  try {
    const f = fake({ records: [await seeded({}, 3 * LPW)] }); const t = transport([{ key: "mkt-a" }, { key: "mkt-a" }, { key: "mkt-a" }]);
    const r = await run(f, t);
    assertEquals(r.status, 422); assertEquals(r.json.error, "unverified_runtime"); assertEquals(t.calls.length, 0); assertEquals(f.tables.model_calls.length, 0);
    const rec = f.tables.interview_records[0]; assertEquals(rec.market_state, "unplaced"); assertEquals(rec.journey_key, null);
    const e = basisOf(f)[1]; assertEquals(e.result, "failed"); assertEquals(e.failure_reason, "unverified_runtime"); assertEquals(e.ollama_version, "0.35.0"); assertEquals(e.windows_run, 0);
    assertEquals(runsOf(f)[0].status, "failed"); assertEquals(runsOf(f)[0].error, "unverified_runtime"); assertEquals((runsOf(f)[0].excluded_by_rule as Row).ollama_version, "0.35.0");
    // an unreadable version is unverified too
    VERSION = "unreadable:connection refused";
    const g = fake({ records: [await seeded()] }); const u = transport([{ key: "mkt-a" }]);
    const b = await run(g, u); assertEquals(b.status, 422); assertEquals(b.json.error, "unverified_runtime"); assertEquals(u.calls.length, 0);
  } finally { VERSION = "0.34.0"; }
  const h = fake({ records: [await seeded()] }); const v = transport([{ key: "mkt-a" }]);
  const ok = await run(h, v); assertEquals(ok.status, 200); assertEquals(ok.json.result, "placed");
  assertEquals(basisOf(h)[1].ollama_version, "0.34.0"); assertEquals((runsOf(h)[0].excluded_by_rule as Row).ollama_version, "0.34.0");
});

Deno.test("(v) R45: a deferred-lens market and a definition with no lens row are never offered; a window naming the deferred key is invalid = none; the basis entry carries candidate_keys (the keys offered)", async () => {
  const f = fake({ records: [await seeded({}, 3 * LPW)] }); const t = transport([{ key: "mkt-a" }, { key: "mkt-deferred" }, { key: "mkt-a" }]);
  const r = await run(f, t);
  assertEquals(r.status, 200); assertEquals(r.json.result, "placed"); assertEquals(r.json.named, 2); // the deferred vote is none
  const e = basisOf(f)[1];
  assertEquals(e.candidate_keys, ["mkt-a", "mkt-b", "mkt-c"]);
  const w = (e.windows as Row[])[1]; assertEquals(w.status, "ok"); assertEquals(w.market_key, null); assertEquals(w.invalid_key, "mkt-deferred");
  for (const c of t.calls) { assert(!c.user.includes("mkt-deferred") && !c.user.includes("Deferred market title") && !c.user.includes("mkt-nolens"), "never offered"); assertStringIncludes(c.user, "- mkt-c: Market C title"); }
  const schemaEnum = (buildPrompt([{ market_key: "mkt-a", title: "t", job_executor: "", jtbd: "" }], "w").schema as { properties: { market_key: { anyOf: Array<{ enum?: string[] }> } } }).properties.market_key.anyOf[0].enum;
  assertEquals(schemaEnum, ["mkt-a"]); // the schema only ever enumerates the offered keys
  assertEquals((runsOf(f)[0].excluded_by_rule as Row).candidates, 3);
});
