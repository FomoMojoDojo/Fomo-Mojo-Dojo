// SPEND CAP + PAGE-WORDS PAIRING on the claim-delta path (operator brief 2026-10-22).
//   cap guard   makeLedgeredCapGuard refuses when ledgered + projected > cap, flushes pending ledger writes first, and
//               refuses when one of them failed (the cumulative cannot be computed); a call that fits passes.
//   core        a cap refusal mid-run is COUNTED, never thrown: the run completes, the integrity row is completed and
//               names pairs judged and pairs refused by the cap, the refused pair writes nothing and its claims get no
//               silence row; once refused, no further paid call is made. A non-cap model error still throws.
//   page words  decidePageWords admits a declared own-word only verbatim, on an own host, with a kept own-words row and
//               no held backing; an observed claim only when every backing signal is live, non-blank and verified.
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeDeltasForCompany } from "./claimDeltaSynthesis.ts";
import { makeLedgeredCapGuard, makeSpendCap, SpendCapRefused } from "./spendCap.ts";
import { decidePageWords, type PageWordsSignal } from "./deltaPageWords.ts";

type Row = Record<string, unknown>;
const CO = "11111111-1111-1111-1111-111111111111";
const UNIQUE_MSG = 'duplicate key value violates unique constraint "claim_deltas_company_id_content_identity_pairing_kind_key"';

/** In-memory supabase fake shared by BOTH runs. claim_deltas enforces the production unique key. */
function fakeDb(seed: Record<string, Row[]>, opts: { insertError?: (table: string, row: Row) => { code?: string; message: string } | null } = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = [...rows];
  let nextId = 1;
  const from = (table: string) => {
    tables[table] ??= [];
    let rows = [...tables[table]];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      neq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] !== v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      is: (c: string, v: unknown) => chain((r) => r.filter((x) => (x[c] ?? null) === v)),
      like: () => b, not: () => b, gte: () => b, order: () => b, abortSignal: () => b,
      limit: (n: number) => chain((r) => r.slice(0, n)),
      range: (a: number, z: number) => chain((r) => r.slice(a, z + 1)),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      insert: (payload: Row) => {
        const forced = opts.insertError?.(table, payload);
        if (forced) return Promise.resolve({ data: null, error: forced });
        const row: Row = { id: `row-${nextId++}`, ...payload };
        if (table === "claim_deltas") {
          // THE PRODUCTION CONSTRAINT: UNIQUE (company_id, content_identity, pairing_kind).
          const dup = tables[table].some((r) => r.company_id === row.company_id && r.content_identity === row.content_identity && r.pairing_kind === row.pairing_kind);
          if (dup) return Promise.resolve({ data: null, error: { code: "23505", message: UNIQUE_MSG } });
        }
        tables[table].push(row);
        return Promise.resolve({ data: null, error: null });
      },
      delete: () => ({
        in: (c: string, ids: unknown[]) => { tables[table] = tables[table].filter((r) => !ids.includes(r[c])); return Promise.resolve({ error: null }); },
      }),
    });
    return b;
  };
  const rpc = (fn: string, a: { p_company_id?: string; p_ids?: string[]; p_reason?: string }) => {
    if (fn !== "delete_claim_deltas_audited") return Promise.resolve({ data: null, error: { message: `unknown rpc ${fn}` } });
    const ids = a.p_ids ?? [];
    tables.claim_deltas = tables.claim_deltas.filter((r) => !(ids.includes(r.id as string) && r.company_id === a.p_company_id));
    return Promise.resolve({ data: ids.length, error: null });
  };
  return { tables, from, rpc };
}


const claim = (id: string, statement: string, extra: Row = {}): Row =>
  ({ id, company_id: CO, provenance: "public_observed", status: "active", statement, topic: null, claim_type: "observation", proof_category: null, raw_payload: null, ...extra });
const seed = (): Record<string, Row[]> => ({
  companies: [{ id: CO, website: "https://co-1.com" }],
  claims: [
    claim("d1", "evidence score visible always", { claim_type: "own_words", declared_eligible: true }),
    claim("d2", "weekly release cadence shipping fast", { claim_type: "own_words", declared_eligible: true }),
    claim("p1", "score visible on the site"),
    claim("p2", "shipping weekly release cadence observed"),
  ],
  signals: [
    { id: "s-own", company_id: CO, voice_class: "client_voice", source_url: "https://co-1.com/about", evidence_class: "prose" },
    { id: "s-p1", company_id: CO, voice_class: "outside_voice_about_client", source_url: "https://yelp.com/x", evidence_class: "prose" },
    { id: "s-p2", company_id: CO, voice_class: "outside_voice_about_client", source_url: "https://news.example.com/y", evidence_class: "prose" },
  ],
  claim_signal_refs: [
    { company_id: CO, claim_id: "d1", signal_id: "s-own" }, { company_id: CO, claim_id: "d2", signal_id: "s-own" },
    { company_id: CO, claim_id: "p1", signal_id: "s-p1" }, { company_id: CO, claim_id: "p2", signal_id: "s-p2" },
  ],
  claim_deltas: [], claim_delta_rejections: [], claim_delta_looks: [], claim_delta_relevance_overrides: [], integrity_runs: [],
});
const observedOf = (user: string) => user.match(/OBSERVED \(public\)[^:]*: ([\s\S]*?)\nAre these/)?.[1]?.trim() ?? "";
/** A routed model that echoes every pair, refusing (as the cap hook does) on generator call number `refuseAt`. */
function routed(refuseAt: number | null, calls: string[]) {
  let gen = 0;
  return async (a: { role: "generator" | "judge"; user: string }) => {
    calls.push(a.role);
    if (a.role === "generator") {
      gen++;
      if (refuseAt != null && gen >= refuseAt) throw new SpendCapRefused("spend cap $0.01: refused (test)");
      return { content: JSON.stringify({ same_subject: true, relation: "echo", reason: "same" }), provider: "external_openai", model: "gpt-4.1" };
    }
    return { content: JSON.stringify({ same_subject: true, relation: "echo", confident: true, span: observedOf(a.user), reason: "echo" }), provider: "external_openai", model: "gpt-4.1-mini" };
  };
}
const args = (db: ReturnType<typeof fakeDb>, routedCall: unknown) => ({
  supabase: db as never, companyId: CO, ollamaUrl: "http://127.0.0.1:11434/v1", nowIso: "2026-10-22T05:00:00.000Z", write: true,
  pairingKind: "public_vs_public" as const, routedCall: routedCall as never,
});

Deno.test("core: a cap refusal is counted, the run completes with a completed integrity row, nothing is written for the refused pair", async () => {
  const db = fakeDb(seed()); const calls: string[] = [];
  const r = await computeDeltasForCompany(args(db, routed(2, calls)));
  assert(r.ok && "totals" in r, JSON.stringify(r));
  assertEquals(r.totals.pairs_refused_by_cap, 1);
  const pairs = db.tables.claim_deltas.filter((x) => x.delta_type === "echoed");
  assertEquals(pairs.length, 1);
  // the refused pair's claims are NOT compared — no silence row says they were looked at and found silent
  const silent = db.tables.claim_deltas.filter((x) => x.delta_type === "publicly_silent" || x.delta_type === "internally_silent");
  assertEquals(silent.length, 0);
  const integ = db.tables.integrity_runs.find((x) => x.component === "first_read_gap_pairs")!;
  assertEquals(integ.status, "completed");
  const ebr = integ.excluded_by_rule as Record<string, unknown>;
  assertEquals(ebr.pairs_refused_by_cap, 1);
  assertEquals(ebr.pairs_judged, 1);
  assertEquals(ebr.pair_rows, 1);
});

Deno.test("core: a finalize after chunked calls counts the chunks' verdicts as judged (not this call's 0)", async () => {
  const db = fakeDb(seed()); const calls: string[] = [];
  const a = args(db, routed(null, calls));
  // chunk: d1 only, then d2 only (pairs written inline), then the unscoped finalize with no model call left to make
  await computeDeltasForCompany({ ...a, declaredIds: ["d1"] });
  await computeDeltasForCompany({ ...a, declaredIds: ["d2"] });
  const before = calls.length;
  const r = await computeDeltasForCompany(a);
  assert(r.ok && "totals" in r);
  assertEquals(calls.length, before);   // the finalize made no call
  const ebr = db.tables.integrity_runs.find((x) => x.component === "first_read_gap_pairs")!.excluded_by_rule as Record<string, unknown>;
  assertEquals(ebr.pairs_judged, 2);
  assertEquals(ebr.pairs_judged_this_call, 0);
  assertEquals(ebr.pair_rows, 2);
});

Deno.test("core: once the cap refuses, no further paid call is attempted", async () => {
  const db = fakeDb(seed()); const calls: string[] = [];
  const r = await computeDeltasForCompany(args(db, routed(1, calls)));
  assert(r.ok && "totals" in r);
  assertEquals(r.totals.pairs_refused_by_cap, 2);
  assertEquals(calls, ["generator"]);   // the one refused attempt; the second pair is counted without a call
});

Deno.test("core: a non-cap model error still throws", async () => {
  const db = fakeDb(seed());
  await assertRejects(() => computeDeltasForCompany(args(db, async () => { throw new Error("openai 500"); })), Error, "openai 500");
});

Deno.test("cap guard: refuses when ledgered + projected > cap; a call that fits passes; pending writes are flushed first", async () => {
  const ledger: Row[] = [{ company_id: CO, provider: "openai", usd: 0.0095, created_at: "2026-10-22T05:00:01Z" }];
  const sb = { from: () => ({ select: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: ledger, error: null }) }) }) }) };
  const cap = makeSpendCap({ capUsd: 0.01, companyId: CO, since: "2026-10-22T05:00:00Z", supabase: sb });
  const pending: Array<Promise<boolean>> = [Promise.resolve(true)];
  const guard = makeLedgeredCapGuard(cap, pending, { site: "generate-claim-deltas", maxOutputTokens: 500 });
  // gpt-4.1: 500 out × $8/MTok = $0.004 alone ⇒ 0.0095 + ≥0.004 > 0.01 ⇒ refused
  await assertRejects(() => guard({ model: "gpt-4.1", system: "s", user: "u" }), SpendCapRefused, "> cap");
  assertEquals(pending.length, 0);
  assertEquals(cap.refusals.length, 1);
  // gpt-4.1-mini: 500 out × $1.60/MTok = $0.0008 ⇒ 0.0095 + 0.0008 > 0.01 ⇒ refused too; under a bigger cap it passes
  const roomy = makeSpendCap({ capUsd: 1, companyId: CO, since: "2026-10-22T05:00:00Z", supabase: sb });
  await makeLedgeredCapGuard(roomy, [], { site: "generate-claim-deltas", maxOutputTokens: 500 })({ model: "gpt-4.1-mini", system: "s", user: "u" });
});

Deno.test("cap guard: a failed ledger write refuses the next paid call", async () => {
  const sb = { from: () => ({ select: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: [], error: null }) }) }) }) };
  const cap = makeSpendCap({ capUsd: 1, companyId: CO, since: "2026-10-22T05:00:00Z", supabase: sb });
  await assertRejects(() => makeLedgeredCapGuard(cap, [Promise.resolve(false)], { site: "x", maxOutputTokens: 500 })({ model: "gpt-4.1", system: "s", user: "u" }), SpendCapRefused, "could not be ledgered");
});

const sig = (id: string, o: Partial<PageWordsSignal> = {}): [string, PageWordsSignal] => [id, { id, held: false, superseded: false, excerpt: "page words", verified: true, ...o }];
Deno.test("page words: each rule refuses on its own and a clean pair is admitted", () => {
  const signals = new Map([sig("own"), sig("ownHeld", { held: true }), sig("ok"), sig("blank", { excerpt: "" }), sig("unver", { verified: false }), sig("held", { held: true })]);
  const ow = new Map([["ci-1", { content_identity: "ci-1", judge_keep: true, signal_id: "own" }], ["ci-2", { content_identity: "ci-2", judge_keep: false, signal_id: "own" }], ["ci-3", { content_identity: "ci-3", judge_keep: true, signal_id: "ownHeld" }]]);
  const d = decidePageWords({
    declared: [
      { id: "d-ok", page_url: "https://co-1.com/a", content_identity: "ci-1", fidelity: "verbatim" },
      { id: "d-para", page_url: "https://co-1.com/a", content_identity: "ci-1", fidelity: "paraphrase" },
      { id: "d-host", page_url: "https://other.com/a", content_identity: "ci-1", fidelity: "verbatim" },
      { id: "d-nokeep", page_url: "https://co-1.com/a", content_identity: "ci-2", fidelity: "verbatim" },
      { id: "d-held", page_url: "https://co-1.com/a", content_identity: "ci-3", fidelity: "verbatim" },
    ],
    observed: [{ id: "p-ok" }, { id: "p-none" }, { id: "p-blank" }, { id: "p-unver" }, { id: "p-held" }, { id: "p-mixed" }],
    refsByClaim: new Map([["p-ok", ["ok"]], ["p-blank", ["blank"]], ["p-unver", ["unver"]], ["p-held", ["held"]], ["p-mixed", ["ok", "blank"]]]),
    signals, ownWordsByIdentity: ow, ownHosts: "co-1.com",
  });
  assertEquals([...d.declaredOk], ["d-ok"]);
  assertEquals([...d.observedOk], ["p-ok"]);
  assertEquals(Object.fromEntries(["d-para", "d-host", "d-nokeep", "d-held", "p-none", "p-blank", "p-unver", "p-held", "p-mixed"].map((k) => [k, d.reasons.get(k)])), {
    "d-para": "not_verbatim", "d-host": "not_own_host", "d-nokeep": "no_kept_own_words_row", "d-held": "backing_held",
    "p-none": "unbacked", "p-blank": "backing_blank", "p-unver": "backing_unverified", "p-held": "backing_held", "p-mixed": "backing_blank",
  });
});
