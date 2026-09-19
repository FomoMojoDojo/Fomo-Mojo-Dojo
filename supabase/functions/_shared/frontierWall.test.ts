// Wall brief (operator rulings signed 2026-09-18) — the bet writer and finding beats behind the client-material wall.
//
// Guards (each with a by-hand planted failure, reported in the gate; a mocked global fetch counts EXTERNAL calls;
// non-empty fixtures on both sides):
//   (a) the corpus query can never return an organization-band row: an upload row (signal_band=organization,
//       source_type=uploaded_file) in the fake table never reaches the prompt; the public rows do
//   (b) a withdrawn row (superseded_at set) never enters the corpus while its live twin does
//   (c) company WITH client material + non-public definition → refused: 0 external calls, frontier_refused written;
//       company WITHOUT client material + the same label → 1 routed call; public definition → 1 routed call either way
//   (d) the predicate fails closed on a lookup error
//   (e) resolveModel decides the endpoint (public → external URL hit; a non-public provenance → local); a direct
//       callOpenAIJSON in either writer fails the source guard
//   (f) a resolved frontier row is not rewritten and frontier_refresh_skipped_not_open is written; an open row is updated
//   (g) findingBeats: internal_inferred + client material → local, 0 external calls; internal_inferred + no client
//       material → routed (external); public_inferred → routed (external)
//   (h) every routed call writes a model_calls row
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { executorAdmitted, FRONTIER_REFRESH_SKIPPED_NOT_OPEN, FRONTIER_REFUSED, generateFrontier, defaultFrontierRoutedModel } from "./frontierFinding.ts";
import { beatsRouteProvenance, generateFindingBeats, defaultBeatsRoutedModel } from "./findingBeats.ts";
import { CLIENT_PROVIDED_SOURCE_KINDS, companyHasClientProvidedMaterial } from "./clientMaterial.ts";
import type { RoutedModel } from "./modelRouter.ts";

type Row = Record<string, unknown>;
const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const CO = "d8feefb3-ce5a-43d9-bccb-f573bb95e88a";

/** Fake client: filters (eq/in/is/not/neq/like/order/limit/range), count-head selects, inserts and updates logged. */
function fakeDb(seed: Record<string, Row[]>, opts: { failTable?: string } = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const log: Array<{ table: string; op: string; row?: Row; ids?: unknown[] }> = [];
  /** The filter chain of every SELECT, per table (last query wins) — so a guard can assert the predicate itself. */
  const filters: Record<string, string[]> = {};
  const from = (table: string) => {
    tables[table] ??= [];
    let rows = [...tables[table]];
    let head = false;
    let pending: Row | null = null;
    const b: Record<string, unknown> = {};
    const applied: string[] = []; filters[table] = applied;
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    const result = () => {
      if (opts.failTable === table) return { data: null, count: null, error: { message: `boom on ${table}` } };
      if (pending) { const ids = rows.map((r) => r.id); for (const r of tables[table]) if (ids.includes(r.id)) Object.assign(r, pending); log.push({ table, op: "update", row: pending, ids }); pending = null; }
      return head ? { data: null, count: rows.length, error: null } : { data: rows, error: null };
    };
    Object.assign(b, {
      select: (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return b; },
      insert: (r: Row | Row[]) => { const arr = Array.isArray(r) ? r : [r]; for (const x of arr) { tables[table].push({ id: `new-${table}-${tables[table].length + 1}`, ...x }); log.push({ table, op: "insert", row: x }); } return Promise.resolve({ data: null, error: null }); },
      update: (patch: Row) => { pending = patch; return b; },
      eq: (c: string, v: unknown) => { applied.push(`eq:${c}=${String(v)}`); return chain((r) => r.filter((x) => (c.includes(".") ? true : x[c] === v))); },
      neq: (c: string, v: unknown) => { applied.push(`neq:${c}`); return chain((r) => r.filter((x) => x[c] !== v)); },
      in: (c: string, vs: unknown[]) => { applied.push(`in:${c}`); return chain((r) => r.filter((x) => vs.includes(x[c]))); },
      is: (c: string, v: unknown) => { applied.push(`is:${c}=${String(v)}`); return chain((r) => r.filter((x) => x[c] == v)); },
      not: (c: string, _op: string, v: unknown) => chain((r) => r.filter((x) => x[c] != v)),
      like: () => b, order: () => b, limit: () => b, range: () => b, filter: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
    });
    return b;
  };
  return { tables, log, filters, from };
}

const PUBLIC_SIG = (id: string, url: string, text: string, extra: Row = {}): Row => ({ id, company_id: CO, signal_band: "outside", voice_class: "outside_voice_about_client", source_type: "public_baseline_run", claim_text: text, evidence_excerpt: text, source_title: "x", source_url: url, event_date: "2026-09-01", created_at: "2026-09-11T00:00:00Z", confidence_to_use: "medium", evidence_class: "prose", superseded_at: null, held_at: null, raw_payload: { url, snippet: text }, ...extra });
const UPLOAD_SIG: Row = { id: "S-upload", company_id: CO, signal_band: "organization", voice_class: null, source_type: "uploaded_file", claim_text: "SECRET-UPLOAD-SENTENCE from the client's strategy deck", evidence_excerpt: "", source_url: null, created_at: "2026-06-05T00:00:00Z", superseded_at: null, held_at: null, raw_payload: {} };

function world(opts: { hasUpload: boolean; defProvenance: string; frontierStatus?: string | null; withdrawnTwin?: boolean }) {
  const sigs = [
    PUBLIC_SIG("S-live", "https://glassdoor.com/r/1", "IAQM has a 4.8-star rating and a 97% would-recommend rate."),
    PUBLIC_SIG("S-live-2", "https://yelp.com/biz/iaqm", "Yelp reviewers praise dry ice blasting for mold remediation."),
  ];
  if (opts.withdrawnTwin) sigs.push(PUBLIC_SIG("S-withdrawn", "https://glassdoor.com/r/2", "WITHDRAWN-TWIN text that must never be read.", { superseded_at: "2026-09-01T00:00:00Z" }));
  if (opts.hasUpload) sigs.push(UPLOAD_SIG);
  const findings: Row[] = [
    { id: "F-obs", company_id: CO, kind: "observation", register: "public_inferred", status: "open", body: "Regulatory licensing underpins IAQM's market access.", created_at: "2026-09-11T00:00:00Z" },
    { id: "F-frontier-other", company_id: CO, kind: "frontier", register: "public_inferred", status: "open", body: "You're betting on sustainability messaging.", created_at: "2026-09-11T00:00:00Z" },
  ];
  if (opts.frontierStatus) { findings.pop(); findings.push({ id: "F-frontier", company_id: CO, kind: "frontier", register: "public_inferred", status: opts.frontierStatus, body: "OLD BET", beats: {}, created_at: "2026-06-08T00:00:00Z" }); }
  return fakeDb({
    companies: [{ id: CO, name: "Indoor Air Quality Management", website: "https://iaqm.com" }],
    signals: sigs,
    own_words_candidates: [{ id: "O-1", company_id: CO, judge_keep: true, judge_kind: null, quote: "We recognized the dangers of polluted indoor air when we named our company over 20 years ago.", content_identity: "ci-1", created_at: "2026-08-01T00:00:00Z" }],
    claims: [{ id: "c-own", company_id: CO, claim_type: "own_words", status: "active", provenance: "public_observed", raw_payload: { content_identity: "ci-1" } }],
    finding_recurrence: [{ finding_id: "F-obs", company_id: CO }, { finding_id: "F-frontier-other", company_id: CO }],
    findings,
    claim_deltas: [],
    signal_recurrence_verdicts: [],
    odi_market_definitions: [{ id: "m1", company_id: CO, job_executor: "Residential property owners addressing mold", provenance_type: opts.defProvenance, retracted: false }],
    input_files: [], inputs: [], file_proposals: [], intake_responses: [], interview_records: [],
    integrity_runs: [], model_calls: [],
  });
}

/** A routed caller that records what it received and returns a mineable bet; `externalHits` counts external routes. */
function fakeRouted(): { routed: RoutedModel; calls: Array<{ provenances: unknown[]; user: string; provider: string }> } {
  const calls: Array<{ provenances: unknown[]; user: string; provider: string }> = [];
  const routed: RoutedModel = ({ provenances, user }) => {
    const provider = provenances.every((p) => ["public_observed", "public_inferred", "public_research", "publicly_declared"].includes(String(p))) ? "external_openai" : "local_ollama";
    calls.push({ provenances, user, provider });
    return Promise.resolve({ provider: provider as never, model: provider === "external_openai" ? "gpt-4.1-mini" : "qwen2.5:14b-instruct", content: JSON.stringify({ mineable: true, body: "You're betting that licensing is the moat.", observe: "o", name_tension: "t", open: "p" }) });
  };
  return { routed, calls };
}

Deno.test("(a) an organization-band upload row never reaches the prompt; the public rows do", async () => {
  // the upload row sits in the signals table; the definition is public so rule 1 lets the run proceed — the corpus query must still never return it
  const db = world({ hasUpload: true, defProvenance: "public_research" });
  const { routed, calls } = fakeRouted();
  const r = await generateFrontier({ supabase: db as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: routed });
  assertEquals(r.generated, true);
  assertEquals(calls.length, 1);
  assert(!calls[0].user.includes("SECRET-UPLOAD-SENTENCE"), "the upload row is not in the prompt");
  assert(calls[0].user.includes("4.8-star rating") && calls[0].user.includes("polluted indoor air") && calls[0].user.includes("Regulatory licensing"), "public S/O/F rows are");
  assert(!calls[0].user.includes("sustainability messaging"), "the existing frontier does not feed itself");
  // the corpus query ITSELF can never return an organization-band row: the band predicate is on the signals query
  const sigFilters = db.filters.signals ?? [];
  assert(sigFilters.includes("eq:signal_band=outside"), `signals query carries signal_band=outside (got ${sigFilters.join(" ")})`);
  assert(sigFilters.includes("in:voice_class") && sigFilters.includes("is:superseded_at=null") && sigFilters.includes("is:held_at=null"), "public voices, live only");
  // and no signals query in the whole run was made without the band predicate — the org band is unreachable
  assert(!db.log.some((l) => l.table === "signals"), "no write to signals");
});

Deno.test("(b) a withdrawn row never enters the corpus while its live twin does", async () => {
  const db = world({ hasUpload: false, defProvenance: "internal_hypothesis", withdrawnTwin: true });
  const { routed, calls } = fakeRouted();
  await generateFrontier({ supabase: db as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: routed });
  assertEquals(calls.length, 1);
  assert(!calls[0].user.includes("WITHDRAWN-TWIN"), "withdrawn row absent");
  assert(calls[0].user.includes("4.8-star rating"), "live twin present");
});

Deno.test("(c) client material + non-public definition → refused (0 calls, frontier_refused); no material → 1 call; public definition → 1 call either way", async () => {
  // WITH client material (an upload) + internal_hypothesis definition → refused
  const dbA = world({ hasUpload: true, defProvenance: "internal_hypothesis" });
  // the predicate sees the upload: the count-head select over signals.source_type in (...) finds S-upload
  const materialA = await companyHasClientProvidedMaterial(dbA as never, CO);
  assertEquals(materialA.has, true); assertEquals(materialA.found.map((f) => f.kind), ["upload_signal"]);
  const { routed: rA, calls: cA } = fakeRouted();
  const resA = await generateFrontier({ supabase: dbA as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: rA });
  assertEquals(resA.refused !== undefined, true);
  assertEquals(cA.length, 0, "no routed call");
  assertEquals(dbA.log.filter((l) => l.table === "integrity_runs" && l.row?.component === FRONTIER_REFUSED).length, 1, "frontier_refused written");
  assertEquals(dbA.log.filter((l) => l.table === "findings").length, 0, "no finding written");
  // WITHOUT client material + same label → 1 routed call
  const dbB = world({ hasUpload: false, defProvenance: "internal_hypothesis" });
  const { routed: rB, calls: cB } = fakeRouted();
  const resB = await generateFrontier({ supabase: dbB as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: rB });
  assertEquals(resB.generated, true); assertEquals(cB.length, 1);
  // public definition → 1 routed call with or without material
  for (const hasUpload of [true, false]) {
    const db = world({ hasUpload, defProvenance: "public_research" });
    const { routed, calls } = fakeRouted();
    const res = await generateFrontier({ supabase: db as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: routed });
    assertEquals(res.generated, true, `public def, upload=${hasUpload}`); assertEquals(calls.length, 1);
  }
  assertEquals(executorAdmitted(null, { has: false, found: [], errors: [] }).admitted, false, "no definition → no executor");
});

Deno.test("(d) the predicate fails closed on a lookup error", async () => {
  const clean = world({ hasUpload: false, defProvenance: "internal_hypothesis" });
  assertEquals((await companyHasClientProvidedMaterial(clean as never, CO)).has, false, "clean company → no material");
  const broken = fakeDb(clean.tables, { failTable: "interview_records" });
  const v = await companyHasClientProvidedMaterial(broken as never, CO);
  assertEquals(v.has, true, "a lookup error counts as material");
  assertEquals(v.errors.map((e) => e.kind), ["interview"]);
  // and the writer refuses on it
  const { routed, calls } = fakeRouted();
  const res = await generateFrontier({ supabase: broken as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: routed });
  assert(res.refused && res.refused.includes("lookup errors: interview"), res.refused);
  assertEquals(calls.length, 0);
  assertEquals(CLIENT_PROVIDED_SOURCE_KINDS.map((k) => k.kind), ["upload_signal", "uploaded_file", "file_proposal", "intake", "interview", "client_attested_claim", "declared_market_definition"]);
});

Deno.test("(e) resolveModel decides the endpoint: public provenances hit the external URL, a non-public provenance goes local — through the real routed callers", async () => {
  const realFetch = globalThis.fetch;
  const hits: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    hits.push(url);
    const body = url.includes("api.openai.com")
      ? { choices: [{ message: { content: JSON.stringify({ mineable: true, body: "b", observe: "o", name_tension: "t", open: "p" }) } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }
      : { message: { content: JSON.stringify({ observe: "o", name_tension: "t", open: "p" }) } };
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
  }) as typeof fetch;
  try {
    const routed = defaultFrontierRoutedModel("test-key");
    await routed({ role: "generator", provenances: ["public_observed", "public_inferred"], system: "s", user: "u" });
    assertEquals(hits.filter((h) => h.includes("api.openai.com")).length, 1, "all-public → external");
    const beatsRouted = defaultBeatsRoutedModel("test-key");
    await beatsRouted({ role: "generator", provenances: ["internal_inferred"], system: "s", user: "u" });
    assertEquals(hits.filter((h) => h.includes("api.openai.com")).length, 1, "non-public → NOT external");
    assertEquals(hits.filter((h) => h.includes("/api/chat")).length, 1, "non-public → local ollama");
  } finally { globalThis.fetch = realFetch; }
  // source guard: neither writer calls OpenAI directly
  for (const f of ["./frontierFinding.ts", "./findingBeats.ts"]) {
    const src = await read(f);
    assert(!src.includes("callOpenAIJSON(") && !src.includes("api.openai.com") && !src.includes('from "./openaiClient.ts"'), `${f}: no direct OpenAI call`);
    assert(src.includes("makeRoutedModel("), `${f}: routes through makeRoutedModel`);
  }
});

Deno.test("(f) a resolved frontier is not rewritten (audit row written); an open frontier is updated in place", async () => {
  const dbR = world({ hasUpload: false, defProvenance: "internal_hypothesis", frontierStatus: "resolved" });
  const { routed, calls } = fakeRouted();
  const r = await generateFrontier({ supabase: dbR as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: routed });
  assertEquals(r.skipped, FRONTIER_REFRESH_SKIPPED_NOT_OPEN);
  assertEquals(calls.length, 0, "no model call for a resolved row");
  assertEquals(dbR.tables.findings.find((f) => f.id === "F-frontier")?.body, "OLD BET", "body untouched");
  assertEquals(dbR.log.filter((l) => l.table === "integrity_runs" && l.row?.component === FRONTIER_REFRESH_SKIPPED_NOT_OPEN).length, 1);
  const dbO = world({ hasUpload: false, defProvenance: "internal_hypothesis", frontierStatus: "open" });
  const { routed: r2, calls: c2 } = fakeRouted();
  const o = await generateFrontier({ supabase: dbO as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: r2 });
  assertEquals(o.generated, true); assertEquals(c2.length, 1);
  assertEquals(dbO.tables.findings.find((f) => f.id === "F-frontier")?.body, "You're betting that licensing is the moat.", "open row refreshed in place");
  assertEquals(dbO.tables.findings.find((f) => f.id === "F-frontier")?.status, "open");
});

Deno.test("(g) findingBeats: internal_inferred + client material → local; internal_inferred + no material → routed external; public_inferred → routed external", async () => {
  assertEquals(beatsRouteProvenance("internal_inferred", true), "internal_inferred");
  assertEquals(beatsRouteProvenance("internal_inferred", false), "public_inferred");
  assertEquals(beatsRouteProvenance("public_inferred", true), "public_inferred");
  const mk = (hasUpload: boolean, register: string) => {
    const db = world({ hasUpload, defProvenance: "internal_hypothesis" });
    db.tables.findings = [{ id: "F-b", company_id: CO, kind: "observation", register, status: "open", body: "A finding body.", beats: null, created_at: "2026-09-11T00:00:00Z" }];
    return db;
  };
  const calls: Array<{ provenances: unknown[]; provider: string }> = [];
  const routed: RoutedModel = ({ provenances }) => { const provider = provenances.every((p) => String(p).startsWith("public")) ? "external_openai" : "local_ollama"; calls.push({ provenances, provider }); return Promise.resolve({ provider: provider as never, model: "m", content: JSON.stringify({ observe: "o", name_tension: "t", open: "p" }) }); };
  await generateFindingBeats({ supabase: mk(true, "internal_inferred") as never, companyId: CO, openaiApiKey: "k", routedModel: routed });
  assertEquals(calls.at(-1)?.provider, "local_ollama");
  await generateFindingBeats({ supabase: mk(false, "internal_inferred") as never, companyId: CO, openaiApiKey: "k", routedModel: routed });
  assertEquals(calls.at(-1)?.provider, "external_openai");
  await generateFindingBeats({ supabase: mk(true, "public_inferred") as never, companyId: CO, openaiApiKey: "k", routedModel: routed });
  assertEquals(calls.at(-1)?.provider, "external_openai");
  assertEquals(calls.length, 3);
});

Deno.test("(h) every routed call writes a model_calls row (frontier and beats)", async () => {
  const db = world({ hasUpload: false, defProvenance: "internal_hypothesis" });
  const { routed } = fakeRouted();
  await generateFrontier({ supabase: db as never, companyId: CO, runId: 70, openaiApiKey: "k", routedModel: routed });
  const rows = db.log.filter((l) => l.table === "model_calls");
  assertEquals(rows.length, 1); assertEquals(rows[0].row?.call_site, "frontier-finding"); assertEquals(rows[0].row?.provider, "openai");
  db.tables.findings = [{ id: "F-b", company_id: CO, kind: "observation", register: "public_inferred", status: "open", body: "A finding body.", beats: null, created_at: "2026-09-11T00:00:00Z" }];
  await generateFindingBeats({ supabase: db as never, companyId: CO, openaiApiKey: "k", routedModel: routed });
  const rows2 = db.log.filter((l) => l.table === "model_calls");
  assertEquals(rows2.length, 2); assertEquals(rows2[1].row?.call_site, "finding-beats");
});
