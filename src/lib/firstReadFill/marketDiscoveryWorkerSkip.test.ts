// Gate 3b — the worker must not re-judge a candidate a judge has already ruled on, and finalize must
// not delete the rulings.
//
// WHY (a) MATTERS. Gate 3's replay re-fires a manifest from cursor 0, so already-written candidates
// come back round. Re-judging them is not idempotent: gate (a) replays its banked verdict, but the
// MPD-1e reframe then makes a FRESH qwen2.5:14b call at temperature 0.2, and only an EXACT content
// identity folds the restatement back into the existing def. Any other wording the same-market judge
// calls "different" is WRITTEN, landing a duplicate audience under the `-2` journey key.
//
// WHY (c) MATTERS. The finalize prune deleted every verdict whose identity was not a live def — i.e.
// exactly the rejections and dedup folds that explain why an audience is absent. It kept the verdicts
// whose answer is already visible as a def and destroyed the ones that explain a gap.
import { describe, it, expect, vi, afterEach } from "vitest";
import { computeMarketDiscovery } from "../../../supabase/functions/_shared/marketPortfolioDiscovery.ts";
import {
  marketCandidateDecided,
  marketCandidateAccounted,
  type ExistsProbe,
} from "../../../supabase/functions/_shared/marketCandidateAccounted.ts";
// CANDIDATE_ERROR_COMPONENT lives beside the WRITER (the discovery loop's catch), not the reader.
import {
  marketIdentity,
  CANDIDATE_ERROR_COMPONENT,
} from "../../../supabase/functions/_shared/marketPortfolioDiscovery.ts";
import { CRITERION_VERSION } from "../../../supabase/functions/_shared/solutionAgnosticJudge.ts";

const COMPANY = "49435388-954b-42ff-8366-62e207a3f625";
const EXECUTOR = "Quantum software developers building applications on quantum computers";
const JTBD = "To create robust quantum applications by integrating Riverlane's Deltaflow QEC stack.";
const CANDIDATE = { job_executor: EXECUTOR, jtbd: JTBD, chooser: "Devs", relationship_kind: "buyer", relationship_basis: "b" };

type Row = Record<string, unknown>;

/** A fake supabase whose only job is to answer equality reads from planted tables and to RECORD every
 *  table it was asked for — `touched` is how a test asserts the gate chain never ran, since gate (a)
 *  reads step_perspective_verdicts before it does anything else. */
function fakeSupabase(tables: Record<string, Row[]>, opts: { failUpsert?: boolean; dieOnOutcomeUpsert?: number } = {}) {
  const touched: string[] = [];
  const deletes: Array<{ table: string; match: Row }> = [];
  const inserts: Array<{ table: string; row: Row }> = [];
  const upserts: Array<{ table: string; rows: Row[]; onConflict: string | undefined }> = [];
  const builder = (table: string) => {
    touched.push(table);
    const match: Row = {};
    let mode: "select" | "delete" = "select";
    const rows = () => (tables[table] ?? []).filter((r) =>
      Object.entries(match).every(([c, v]) => r[c] === v));
    const api: Record<string, unknown> = {
      select: () => api,
      // Gate 5b: the worker loads the offering read once per run; the fake answers with whatever is planted (or nothing).
      insert: (row: Row) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
      upsert: (rows: Row[], o?: { onConflict?: string }) => {
        upserts.push({ table, rows, onConflict: o?.onConflict });
        if (opts.failUpsert) return Promise.resolve({ error: { message: "planted upsert failure" } });
        // Gate 7a: the isolate dies (not a throw the worker can catch — the request is cancelled by
        // the supervisor) at the Nth outcome write. Everything filed BEFORE it must already be on
        // the record; nothing after it ever is.
        if (opts.dieOnOutcomeUpsert && table === "market_candidate_outcomes"
          && upserts.filter((u) => u.table === "market_candidate_outcomes").length === opts.dieOnOutcomeUpsert) {
          throw new Error("WorkerRequestCancelled: request has been cancelled by supervisor");
        }
        // model the real UNIQUE key: the columns the caller names in onConflict decide what is
        // "the same row" — replace on a full match, else add. (Gate 5c: the caller's key is what
        // protects the v1 rows, so the fake honours exactly the key it is given, never a wider one.)
        const store = (tables[table] ??= []);
        const key = (o?.onConflict ?? "id").split(",").map((c) => c.trim());
        for (const r of rows) {
          const at = store.findIndex((x) => key.every((c) => x[c] === r[c]));
          if (at >= 0) store[at] = r; else store.push(r);
        }
        return Promise.resolve({ error: null });
      },
      delete: () => { mode = "delete"; return api; },
      eq: (col: string, val: unknown) => { match[col] = val; return api; },
      in: () => api,
      like: () => api,
      order: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => {
        if (mode === "delete") deletes.push({ table, match: { ...match } });
        return Promise.resolve({ data: rows(), error: null }).then(res);
      },
    };
    return api;
  };
  return { client: { from: builder }, touched, deletes, inserts, upserts, tables };
}

const probeOver = (tables: Record<string, Row[]>): ExistsProbe => async (table, match) =>
  (tables[table] ?? []).some((r) => Object.entries(match).every(([c, v]) => r[c] === v));

const baseArgs = (client: { from: (t: string) => unknown }) => ({
  supabase: client as { from: (t: string) => never },
  companyId: COMPANY,
  ollamaUrl: "http://127.0.0.1:9/v1",   // discard port — a real call would fail loudly
  nowIso: "2026-09-10T00:00:00.000Z",
  write: false,
});

afterEach(() => vi.restoreAllMocks());

describe("worker skips DECIDED candidates (Gate 3b)", () => {
  // ── (a) THE PROOF — red on revert ───────────────────────────────────────────────────────────────
  it("(a) a candidate with a written public def is skipped: already_decided, gate chain never entered", async () => {
    const tables = {
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [
        // The reframe-rescued def: SAME executor, DIFFERENT jtbd — the shape that a re-judge duplicates.
        { id: "d1", company_id: COMPANY, journey_key: "pmk-quantum-software-developers",
          job_executor: EXECUTOR, jtbd: "To develop reliable quantum applications.",
          user_id: "u1", market_register: "public_inferred" },
      ],
      market_discovery_verdicts: [],
      market_lens: [],
    };
    const fake = fakeSupabase(tables);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await computeMarketDiscovery({ ...baseArgs(fake.client), candidates: [CANDIDATE] });

    expect(res.ok).toBe(true);
    if (!res.ok || res.scoped !== true) throw new Error("expected a scoped run");
    expect(res.totals.decided).toBe(1);
    expect(res.results[0].outcome).toBe("already_decided");
    expect(res.results[0].judge_reasons.decided).toMatch(/not re-judged/);
    // runGates never ran: gate (a) reads step_perspective_verdicts FIRST, and no model was called.
    expect(fake.touched).not.toContain("step_perspective_verdicts");
    expect(fetchSpy).not.toHaveBeenCalled();
    // and nothing was judged
    expect(res.totals.judged_buyer).toBe(0);
    expect(res.totals.reframe_attempts).toBe(0);
  });

  it("(a2) a candidate with a banked gate-(b) verdict on its own identity is skipped too", async () => {
    const identity = await marketIdentity(EXECUTOR, JTBD);
    const fake = fakeSupabase({
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [],
      // Gate 5b: only a ruling under the CURRENT criterion decides. A version-less fixture is a v1 row.
      market_discovery_verdicts: [{ id: "v1", company_id: COMPANY, market_a_identity: identity, criterion_version: CRITERION_VERSION, inputs_complete: true }],
      market_lens: [],
    });
    const res = await computeMarketDiscovery({ ...baseArgs(fake.client), candidates: [CANDIDATE] });
    if (!res.ok || res.scoped !== true) throw new Error("expected a scoped run");
    expect(res.results[0].outcome).toBe("already_decided");
    expect(fake.touched).not.toContain("step_perspective_verdicts");
  });

  it("(a-neg) an UNDECIDED candidate is NOT skipped — the gate chain is entered", async () => {
    const fake = fakeSupabase({
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [], market_discovery_verdicts: [], market_lens: [],
    });
    const res = await computeMarketDiscovery({ ...baseArgs(fake.client), candidates: [CANDIDATE] });
    if (!res.ok || res.scoped !== true) throw new Error("expected a scoped run");
    expect(res.totals.decided).toBe(0);
    expect(res.results[0].outcome).not.toBe("already_decided");
    expect(fake.touched).toContain("step_perspective_verdicts"); // gate (a) was entered
  });
});

// ── (b) the split: an error terminal accounts, but does not decide ────────────────────────────────
describe("decided vs accounted (Gate 3b split)", () => {
  it("(b) an ERROR-TERMINAL-only candidate is NOT decided (worker retries) but IS accounted (poll advances)", async () => {
    const identity = await marketIdentity(EXECUTOR, JTBD);
    const tables = {
      odi_market_definitions: [], market_discovery_verdicts: [],
      integrity_runs: [{ company_id: COMPANY, component: CANDIDATE_ERROR_COMPONENT, run_ref: identity, status: "failed" }],
    };
    const args = { exists: probeOver(tables), companyId: COMPANY, candidate: CANDIDATE };
    expect(await marketCandidateDecided(args)).toBe(false);
    expect(await marketCandidateAccounted(args)).toBe(true);
  });

  // Gate 7c — RED ON REVERT: a def DECIDES (the worker skips) but no longer ACCOUNTS (the poll waits
  // for the candidate's own row). The row the skip files is what closes the gap.
  it("(b2) a DECIDED candidate (def only) is decided but NOT accounted until its row exists", async () => {
    const identity = await marketIdentity(EXECUTOR, JTBD);
    const tables: Record<string, Row[]> = {
      odi_market_definitions: [{ company_id: COMPANY, job_executor: EXECUTOR, market_register: "public_inferred" }],
      market_discovery_verdicts: [], integrity_runs: [], market_candidate_outcomes: [],
    };
    const args = { exists: probeOver(tables), companyId: COMPANY, candidate: CANDIDATE };
    expect(await marketCandidateDecided(args)).toBe(true);
    expect(await marketCandidateAccounted(args)).toBe(false);
    tables.market_candidate_outcomes.push({ company_id: COMPANY, original_identity: identity, outcome: "already_decided", criterion_version: CRITERION_VERSION });
    expect(await marketCandidateAccounted(args)).toBe(true);
  });

  it("(b3) a mid-flight candidate is neither", async () => {
    const args = {
      exists: probeOver({ odi_market_definitions: [], market_discovery_verdicts: [], integrity_runs: [] }),
      companyId: COMPANY, candidate: CANDIDATE,
    };
    expect(await marketCandidateDecided(args)).toBe(false);
    expect(await marketCandidateAccounted(args)).toBe(false);
  });
});

// ── (c) finalize keeps every verdict ──────────────────────────────────────────────────────────────
describe("finalize keeps verdicts (Gate 3b)", () => {
  // RED ON REVERT: the old body deleted both of these — the rejection and the dedup fold, i.e. every
  // ruling that explains an ABSENCE.
  it("(c) a verdict whose identity is NOT a live def is left in place", async () => {
    const orphan = await marketIdentity(EXECUTOR, JTBD);
    const liveDef = { id: "d1", company_id: COMPANY, journey_key: "pmk-live", job_executor: "Someone else",
      jtbd: "Some job.", user_id: "u1", market_register: "public_inferred" };
    const liveIdentity = await marketIdentity(liveDef.job_executor, liveDef.jtbd);
    const fake = fakeSupabase({
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [liveDef],
      market_discovery_verdicts: [
        { id: "v-rejected", company_id: COMPANY, pair_identity: "p1", verdict_kind: "solution_agnostic",
          market_a_identity: orphan, market_b_identity: null, verdict: "rejected", judge_reason: "solution-bound" },
        { id: "v-dedup", company_id: COMPANY, pair_identity: "p2", verdict_kind: "same_market",
          market_a_identity: orphan, market_b_identity: liveIdentity, verdict: "accepted", judge_reason: "same market" },
      ],
      market_lens: [],
    });
    const res = await computeMarketDiscovery({ ...baseArgs(fake.client), write: true }); // finalize: no candidates
    expect(res.ok).toBe(true);
    if (!res.ok || res.scoped !== false) throw new Error("expected the finalize path");
    expect(fake.deletes).toEqual([]);                       // nothing deleted, from any table
    expect(res.totals.verdicts_pruned).toBe(0);             // the counter stays, always zero
  });
});

// ── Gate 4b / 7a — the outcome writer, one row per candidate at its terminal ─────────────────────
describe("per-candidate outcomes are persisted at each candidate's terminal (Gate 4b, 7a)", () => {
  const RUN = "b60e2867-53b1-4b8d-86d9-1230240e5cab";
  const writeArgs = (client: { from: (t: string) => unknown }, over: Record<string, unknown> = {}) => ({
    ...baseArgs(client), write: true, runId: RUN, candidateOffset: 0, ...over,
  });
  const SECOND = { ...CANDIDATE, job_executor: "Quantum hardware OEMs integrating QEC into their stacks", jtbd: "To ship hardware whose errors are corrected in real time." };
  // Both decided by a def under their executor: zero model calls, so the only reads and writes are
  // the decided probes and the outcome rows — the ORDER of table touches is the proof.
  const twoDecided = (opts: { dieOnOutcomeUpsert?: number } = {}) => {
    const tables: Record<string, Row[]> = {
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [
        { id: "d1", company_id: COMPANY, journey_key: "pmk-x", job_executor: CANDIDATE.job_executor, jtbd: "Reframed.", user_id: "u1", market_register: "public_inferred" },
        { id: "d2", company_id: COMPANY, journey_key: "pmk-y", job_executor: SECOND.job_executor, jtbd: "Reframed too.", user_id: "u1", market_register: "public_inferred" },
      ],
      market_discovery_verdicts: [], market_lens: [], market_candidate_outcomes: [],
    };
    return { tables, fake: fakeSupabase(tables, opts) };
  };

  // ── Gate 7a — THE PROOF — red on revert (the chunk-level write after the loop) ────────────────
  // Edgewood #1 / Coreviva #3–#4: the worker had the ruling in memory and the isolate was killed at
  // the 400s wall before the post-loop write. With one write per candidate, a death during candidate
  // 2 finds candidate 1's row already on the record; the old body filed both after the loop, so a
  // death anywhere in the chunk lost every row in it.
  it("(7a) a death during candidate 2's write leaves candidate 1's row ON THE RECORD", async () => {
    const { tables, fake } = twoDecided({ dieOnOutcomeUpsert: 2 });
    await expect(computeMarketDiscovery({ ...writeArgs(fake.client), candidates: [CANDIDATE, SECOND] }))
      .rejects.toThrow(/cancelled by supervisor/);
    expect(tables.market_candidate_outcomes).toHaveLength(1);         // RED on revert: 0 rows
    expect(tables.market_candidate_outcomes[0]).toMatchObject({ candidate_index: 1, job_executor: CANDIDATE.job_executor });
  });

  it("(7a) each candidate's row is written BEFORE the next candidate's first read — one upsert per candidate", async () => {
    const { fake } = twoDecided();
    const res = await computeMarketDiscovery({ ...writeArgs(fake.client), candidates: [CANDIDATE, SECOND] });
    expect(res.ok).toBe(true);
    const ups = fake.upserts.filter((u) => u.table === "market_candidate_outcomes");
    expect(ups).toHaveLength(2);                                        // RED on revert: 1 upsert of 2 rows
    expect(ups.map((u) => u.rows.length)).toEqual([1, 1]);
    expect(ups.map((u) => u.rows[0].candidate_index)).toEqual([1, 2]);
    // ORDER: candidate 1's outcome write precedes candidate 2's decided probe (its first table read,
    // odi_market_definitions). Under the old body every def read in the chunk preceded the first
    // outcome write, so the LAST def read sat before it — RED on revert.
    const firstOutcomeWrite = fake.touched.indexOf("market_candidate_outcomes");
    const lastDefRead = fake.touched.lastIndexOf("odi_market_definitions");
    expect(firstOutcomeWrite).toBeGreaterThan(-1);
    expect(lastDefRead).toBeGreaterThan(firstOutcomeWrite);
  });

  it("(g4b) a decided candidate files an already_decided outcome keyed to its manifest position", async () => {
    const fake = fakeSupabase({
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [{ id: "d1", company_id: COMPANY, journey_key: "pmk-x", job_executor: EXECUTOR,
        jtbd: "Reframed.", user_id: "u1", market_register: "public_inferred" }],
      market_discovery_verdicts: [], market_lens: [], market_candidate_outcomes: [],
    });
    const res = await computeMarketDiscovery({ ...writeArgs(fake.client), candidates: [CANDIDATE] });
    expect(res.ok).toBe(true);
    // Gate 7a: one candidate ⇒ exactly one upsert of exactly one row (per candidate, not per chunk).
    const ups = fake.upserts.filter((u) => u.table === "market_candidate_outcomes");
    expect(ups).toHaveLength(1);
    const up = ups[0];
    expect(up.rows).toHaveLength(1);
    expect(up.onConflict).toBe("run_id,candidate_index,criterion_version");
    expect(up.rows[0]).toMatchObject({
      run_id: RUN, candidate_index: 1, job_executor: EXECUTOR, outcome: "already_decided",
    });
    // the ORIGINAL identity is what clause (3) looks up
    expect(String(up.rows[0].original_identity)).toHaveLength(64);
  });

  it("(g4b) candidate_index is the GLOBAL manifest position, not the chunk position", async () => {
    const fake = fakeSupabase({
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [{ id: "d1", company_id: COMPANY, journey_key: "pmk-x", job_executor: EXECUTOR,
        jtbd: "Reframed.", user_id: "u1", market_register: "public_inferred" }],
      market_discovery_verdicts: [], market_lens: [], market_candidate_outcomes: [],
    });
    await computeMarketDiscovery({ ...writeArgs(fake.client, { candidateOffset: 4 }), candidates: [CANDIDATE] });
    const ups = fake.upserts.filter((u) => u.table === "market_candidate_outcomes");
    expect(ups).toHaveLength(1);
    expect(ups[0].rows[0].candidate_index).toBe(5);   // offset 4 + position 1
  });

  // RED ON REVERT: without the upsert the chunk returns ok and the caller advances the cursor past a
  // candidate whose ruling was never recorded — the Gate 1b defect, on a different record.
  it("(g4b) a FAILED outcome write fails the chunk, so the cursor cannot advance", async () => {
    const fake = fakeSupabase({
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [{ id: "d1", company_id: COMPANY, journey_key: "pmk-x", job_executor: EXECUTOR,
        jtbd: "Reframed.", user_id: "u1", market_register: "public_inferred" }],
      market_discovery_verdicts: [], market_lens: [], market_candidate_outcomes: [],
    }, { failUpsert: true });
    const res = await computeMarketDiscovery({ ...writeArgs(fake.client), candidates: [CANDIDATE] });
    expect(res.ok).toBe(false);
    if (res.ok || !("error" in res)) throw new Error("expected an error result");
    expect(res.error).toMatch(/candidate outcome write failed/);
  });

  it("(g4b) re-judging the same chunk REPLACES the row, never duplicates it", async () => {
    const tables: Record<string, Row[]> = {
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [{ id: "d1", company_id: COMPANY, journey_key: "pmk-x", job_executor: EXECUTOR,
        jtbd: "Reframed.", user_id: "u1", market_register: "public_inferred" }],
      market_discovery_verdicts: [], market_lens: [], market_candidate_outcomes: [],
    };
    const fake = fakeSupabase(tables);
    await computeMarketDiscovery({ ...writeArgs(fake.client), candidates: [CANDIDATE] });
    await computeMarketDiscovery({ ...writeArgs(fake.client), candidates: [CANDIDATE] });
    expect(tables.market_candidate_outcomes.length).toBe(1);
  });

  it("(g4b) no runId (a manual/dry call) ⇒ judging is identical and nothing is filed", async () => {
    const fake = fakeSupabase({
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [{ id: "d1", company_id: COMPANY, journey_key: "pmk-x", job_executor: EXECUTOR,
        jtbd: "Reframed.", user_id: "u1", market_register: "public_inferred" }],
      market_discovery_verdicts: [], market_lens: [], market_candidate_outcomes: [],
    });
    const res = await computeMarketDiscovery({ ...baseArgs(fake.client), write: true, candidates: [CANDIDATE] });
    expect(res.ok).toBe(true);
    expect(fake.upserts.length).toBe(0);
  });
});

// ── Gate 4d — a candidate that was ruled on stays ruled on ───────────────────────────────────────
// The first live replay overwrote Geniant #2's rejected_solution and #4's deduped with
// already_decided, and the census dropped from 7 rows to 6. `already_decided` is not a ruling — it
// says a ruling exists elsewhere — so it must never replace one.
describe("already_decided never overwrites a terminal outcome (Gate 4d)", () => {
  const RUN = "b60e2867-53b1-4b8d-86d9-1230240e5cab";
  const decidedTables = (existingOutcome: string | null): Record<string, Row[]> => ({
    companies: [{ id: COMPANY, name: "Riverlane" }],
    odi_market_definitions: [{ id: "d1", company_id: COMPANY, journey_key: "pmk-x", job_executor: EXECUTOR,
      jtbd: "Reframed.", user_id: "u1", market_register: "public_inferred" }],
    market_discovery_verdicts: [], market_lens: [],
    market_candidate_outcomes: existingOutcome
      ? [{ run_id: RUN, candidate_index: 1, company_id: COMPANY, outcome: existingOutcome, reconstructed: true, criterion_version: CRITERION_VERSION }]
      : [],
  });
  const run = (tables: Record<string, Row[]>) => {
    const fake = fakeSupabase(tables);
    return computeMarketDiscovery({
      ...baseArgs(fake.client), write: true, runId: RUN, candidateOffset: 0, candidates: [CANDIDATE],
    }).then((res) => ({ res, fake }));
  };

  // RED ON REVERT
  it("(g4d) an existing rejected_solution row is LEFT ALONE by an already_decided pass", async () => {
    const tables = decidedTables("rejected_solution");
    const { fake } = await run(tables);
    expect(fake.upserts.find((u) => u.table === "market_candidate_outcomes")).toBeUndefined();
    expect(tables.market_candidate_outcomes[0].outcome).toBe("rejected_solution");
  });

  for (const terminal of ["deduped", "rejected_buyer", "accepted_active", "accepted_deferred"]) {
    it(`(g4d) an existing ${terminal} row is left alone too`, async () => {
      const tables = decidedTables(terminal);
      await run(tables);
      expect(tables.market_candidate_outcomes[0].outcome).toBe(terminal);
    });
  }

  it("(g4d) an existing ERROR row IS replaced — a failure is not a ruling", async () => {
    const tables = decidedTables("error");
    const { fake } = await run(tables);
    expect(fake.upserts.find((u) => u.table === "market_candidate_outcomes")).toBeTruthy();
    expect(tables.market_candidate_outcomes[0].outcome).toBe("already_decided");
  });

  it("(g4d) no existing row ⇒ the skip is still recorded", async () => {
    const tables = decidedTables(null);
    await run(tables);
    expect(tables.market_candidate_outcomes).toHaveLength(1);
    expect(tables.market_candidate_outcomes[0].outcome).toBe("already_decided");
  });

  // RED ON REVERT: the payload omitted `reconstructed`, so ON CONFLICT DO UPDATE never reset it and
  // Geniant's rows stayed reconstructed=true after being rewritten first-hand.
  it("(g4d) a live write asserts reconstructed=false", async () => {
    const { fake } = await run(decidedTables(null));
    const up = fake.upserts.find((u) => u.table === "market_candidate_outcomes")!;
    expect(up.rows[0].reconstructed).toBe(false);
  });
});

// ── Gate 5c — rulings are keyed by criterion version; nothing crosses versions ────────────────────
// The first v2 re-fire (Riverlane) upserted on (run_id, candidate_index) and REPLACED the v1
// rulings for #1, #3 and #4 with their v2 rulings. The column added to keep history was defeated by
// the key. Now the version is in the key and the 4d guard looks only at the current version.
describe("a v2 write never touches a v1 row (Gate 5c)", () => {
  const RUN = "b60e2867-53b1-4b8d-86d9-1230240e5cab";
  const V1_ROW: Row = Object.freeze({
    id: "4eb744f4-25d0-42df-aee1-56dabffe57f0", run_id: RUN, candidate_index: 1, company_id: COMPANY,
    job_executor: EXECUTOR, outcome: "rejected_solution", reconstructed: true, criterion_version: 1,
    judge_reasons: { reconstructed_reason: "v1: names the company's product" },
  });
  const tablesWith = (extra: Row[]): Record<string, Row[]> => ({
    companies: [{ id: COMPANY, name: "Riverlane" }],
    odi_market_definitions: [{ id: "d1", company_id: COMPANY, journey_key: "pmk-x", job_executor: EXECUTOR,
      jtbd: "Reframed.", user_id: "u1", market_register: "public_inferred" }],
    market_discovery_verdicts: [], market_lens: [],
    market_candidate_outcomes: [{ ...V1_ROW }, ...extra],
  });
  const run = (tables: Record<string, Row[]>) => {
    const fake = fakeSupabase(tables);
    return computeMarketDiscovery({
      ...baseArgs(fake.client), write: true, runId: RUN, candidateOffset: 0, candidates: [CANDIDATE],
    }).then((res) => ({ res, fake }));
  };

  // RED ON REVERT (either half): with the two-column key the v1 row is replaced; with the
  // version-blind guard the v1 terminal blocks the v2 write and no v2 row appears at all.
  it("(g5c) a v2 write lands BESIDE the v1 row, and the v1 row is byte-identical afterwards", async () => {
    const tables = tablesWith([]);
    const before = JSON.stringify(V1_ROW);
    const { fake } = await run(tables);
    const up = fake.upserts.find((u) => u.table === "market_candidate_outcomes")!;
    expect(up).toBeTruthy();
    expect(up.onConflict).toBe("run_id,candidate_index,criterion_version");
    const rows = tables.market_candidate_outcomes;
    expect(rows).toHaveLength(2);
    const v1 = rows.find((r) => r.criterion_version === 1)!;
    const v2 = rows.find((r) => r.criterion_version === CRITERION_VERSION)!;
    expect(JSON.stringify(v1)).toBe(before);                       // byte-identical
    expect(v2.outcome).toBe("already_decided");
    expect(v2.candidate_index).toBe(1);
  });

  it("(g5c) a duplicate v2 write replaces ONLY the v2 row — the v1 row beside it is untouched", async () => {
    const tables = tablesWith([{ id: "e", run_id: RUN, candidate_index: 1, company_id: COMPANY,
      outcome: "error", reconstructed: false, criterion_version: CRITERION_VERSION }]);
    const before = JSON.stringify(V1_ROW);
    await run(tables);
    const rows = tables.market_candidate_outcomes;
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows.find((r) => r.criterion_version === 1))).toBe(before);
    expect(rows.find((r) => r.criterion_version === CRITERION_VERSION)!.outcome).toBe("already_decided");
  });

  // RED ON REVERT of the guard's version filter: a version-blind probe would see the v1 terminal
  // and keep the candidate — so the 4d rule would silently suppress every v2 already_decided row
  // for every candidate v1 had ruled on.
  it("(g5c) the 4d guard defers to a v2 terminal, not to a v1 one", async () => {
    const tables = tablesWith([{ id: "t2", run_id: RUN, candidate_index: 1, company_id: COMPANY,
      outcome: "deduped", reconstructed: false, criterion_version: CRITERION_VERSION }]);
    const { fake } = await run(tables);
    expect(fake.upserts.find((u) => u.table === "market_candidate_outcomes")).toBeUndefined();  // v2 terminal kept
    expect(tables.market_candidate_outcomes.map((r) => r.outcome).sort()).toEqual(["deduped", "rejected_solution"]);
  });
});

// ── Gate 6e — a verdict judged without its inputs is neither decided nor served from cache ───────
// RED ON REVERT. Gotham 2026-09-11: discovery fired before the offering read existed; four v2 verdicts
// were banked with no solution line and would have been cached by content identity forever.
describe("inputs_complete=false verdicts are history, not rulings (Gate 6e)", () => {
  it("(g6e) an inputs_complete=false gate-(b) verdict does NOT make the candidate already_decided", async () => {
    const identity = await marketIdentity(EXECUTOR, JTBD);
    const fake = fakeSupabase({
      companies: [{ id: COMPANY, name: "Riverlane" }],
      odi_market_definitions: [],
      market_discovery_verdicts: [{ id: "blind", company_id: COMPANY, market_a_identity: identity, pair_identity: "k", verdict_kind: "solution_agnostic",
        verdict: "rejected", criterion_version: CRITERION_VERSION, inputs_complete: false }],
      market_lens: [], step_perspective_verdicts: [],
    });
    const res = await computeMarketDiscovery({ ...baseArgs(fake.client), candidates: [CANDIDATE] });
    if (!res.ok || res.scoped !== true) throw new Error("expected a scoped run");
    expect(res.results[0].outcome).not.toBe("already_decided");   // the chain is entered (and errors on the discard-port judge)
    expect(res.totals.verdicts_cached).toBe(0);                     // and nothing was served from the blind row
  });
});
