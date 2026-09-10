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

const COMPANY = "49435388-954b-42ff-8366-62e207a3f625";
const EXECUTOR = "Quantum software developers building applications on quantum computers";
const JTBD = "To create robust quantum applications by integrating Riverlane's Deltaflow QEC stack.";
const CANDIDATE = { job_executor: EXECUTOR, jtbd: JTBD, chooser: "Devs", relationship_kind: "buyer", relationship_basis: "b" };

type Row = Record<string, unknown>;

/** A fake supabase whose only job is to answer equality reads from planted tables and to RECORD every
 *  table it was asked for — `touched` is how a test asserts the gate chain never ran, since gate (a)
 *  reads step_perspective_verdicts before it does anything else. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const touched: string[] = [];
  const deletes: Array<{ table: string; match: Row }> = [];
  const inserts: Array<{ table: string; row: Row }> = [];
  const builder = (table: string) => {
    touched.push(table);
    const match: Row = {};
    let mode: "select" | "delete" = "select";
    const rows = () => (tables[table] ?? []).filter((r) =>
      Object.entries(match).every(([c, v]) => r[c] === v));
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (row: Row) => { inserts.push({ table, row }); return Promise.resolve({ error: null }); },
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
  return { client: { from: builder }, touched, deletes, inserts };
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
      market_discovery_verdicts: [{ id: "v1", company_id: COMPANY, market_a_identity: identity }],
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

  it("(b2) a DECIDED candidate is both decided and accounted", async () => {
    const tables = {
      odi_market_definitions: [{ company_id: COMPANY, job_executor: EXECUTOR, market_register: "public_inferred" }],
      market_discovery_verdicts: [], integrity_runs: [],
    };
    const args = { exists: probeOver(tables), companyId: COMPANY, candidate: CANDIDATE };
    expect(await marketCandidateDecided(args)).toBe(true);
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
