// RELEVANCE BACKSTOP WIRING guards (operator ruling 2026-09-03): every delta recompute leaves the company
// relevance-stamped. The stamps are row-bound and vanish with the stale sweep, so the backstop must be
// re-fired from the delta terminal — through ONE self-gating path (refresh-relevance-step) that:
//   (a) fires once and never spawns a second chain (skip when nothing is unstamped; adopt a live row);
//   (b) never re-judges a stamped row (IS-NULL scoping in the core) while judging every null row;
//   (c) refuses a frozen company (CB1) before any read.
// Each proof fails if its guard is removed.
import { describe, expect, it, vi } from "vitest";
import { relevanceBackstopNeedsFire } from "../../../supabase/functions/_shared/firstReadFill.ts";
import { computeRelevanceForCompany } from "../../../supabase/functions/_shared/relevanceBackstop.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
const NOW = Date.parse("2026-09-03T20:00:00Z");
const WINDOW = 25 * 60_000;

// ── (a) the pure fire gate ───────────────────────────────────────────────────────
describe("(a) relevanceBackstopNeedsFire — fires once, never spawns twice", () => {
  it("unstamped rows and no live chain → fire", () => {
    expect(relevanceBackstopNeedsFire({ unstampedPairs: 142, runningRow: null, nowMs: NOW, windowMs: WINDOW })).toBe("fire");
  });
  it("a second finalize with ZERO unstamped rows → skip, no ledger row", () => {
    expect(relevanceBackstopNeedsFire({ unstampedPairs: 0, runningRow: null, nowMs: NOW, windowMs: WINDOW })).toBe("skip_nothing_to_stamp");
  });
  it("a running row inside the chain window → adopt it, do not spawn", () => {
    const running = { id: "r1", started_at: new Date(NOW - 5 * 60_000).toISOString() };
    expect(relevanceBackstopNeedsFire({ unstampedPairs: 40, runningRow: running, nowMs: NOW, windowMs: WINDOW })).toBe("adopt_running");
  });
  it("a stale running row outside the window is NOT adopted (the sweep owns it) → fire fresh", () => {
    const stale = { id: "r0", started_at: new Date(NOW - 60 * 60_000).toISOString() };
    expect(relevanceBackstopNeedsFire({ unstampedPairs: 40, runningRow: stale, nowMs: NOW, windowMs: WINDOW })).toBe("fire");
  });
});

// ── fake supabase for the core: a recording, chainable, thenable query builder ────
type Row = Record<string, unknown>;
function fakeStore(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; op: string; filters: Array<[string, string, unknown]>; payload?: unknown }> = [];
  const updates: Array<{ id: unknown; patch: Row }> = [];
  function chain(table: string, op: string, payload?: unknown) {
    const filters: Array<[string, string, unknown]> = [];
    const rec = { table, op, filters, payload };
    calls.push(rec);
    const run = () => {
      let rows = tables[table] ?? [];
      for (const [f, col, v] of filters) {
        if (f === "eq") rows = rows.filter((r) => r[col] === v);
        if (f === "in") rows = rows.filter((r) => (v as unknown[]).includes(r[col]));
        if (f === "is") rows = rows.filter((r) => r[col] === v || (v === null && r[col] == null));
      }
      if (op === "update") {
        for (const r of rows) { Object.assign(r, payload as Row); updates.push({ id: r.id, patch: payload as Row }); }
        return { data: null, error: null };
      }
      if (op === "insert") { (tables[table] ??= []).push(payload as Row); return { data: payload, error: null }; }
      return { data: rows, error: null };
    };
    const q: Record<string, unknown> = {};
    for (const f of ["eq", "in", "is"]) q[f] = (col: string, v: unknown) => { filters.push([f, col, v]); return q; };
    q.select = () => q; q.order = () => q; q.limit = () => q;
    q.maybeSingle = () => { const r = run() as { data: Row[] }; return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); };
    q.single = q.maybeSingle;
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    return q;
  }
  const supabase = {
    from: (table: string) => ({
      select: () => chain(table, "select"),
      update: (payload: Row) => chain(table, "update", payload),
      insert: (payload: Row) => chain(table, "insert", payload),
    }),
  };
  return { supabase, calls, updates, tables };
}

const D = (id: string, relevance_verdict: string | null, declared: string, pub: string) =>
  ({ id, company_id: CO, pairing_kind: "public_vs_public", delta_type: "echoed", declared_claim_id: `dc-${id}`, public_claim_id: `pc-${id}`, relevance_verdict, relevance_model: relevance_verdict ? "router" : null, _declared: declared, _public: pub });

function coreArgs(store: ReturnType<typeof fakeStore>, companyId: string, judge = vi.fn()) {
  return {
    supabase: store.supabase,
    companyId,
    nowIso: "2026-09-03T20:00:00.000Z",
    write: true,
    routedCall: judge,
    pairingKind: "public_vs_public" as const,
  };
}

function seed(rows: Row[]) {
  const claims: Row[] = [];
  for (const r of rows) {
    claims.push({ id: r.declared_claim_id, statement: r._declared });
    claims.push({ id: r.public_claim_id, statement: r._public });
  }
  return fakeStore({
    companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org" }],
    claim_deltas: rows,
    claims,
    integrity_runs: [],
  });
}

// ── (b) IS-NULL scoping — stamped rows untouched, null rows judged ────────────────
describe("(b) computeRelevanceForCompany — never re-judges a stamped row, judges every null row", () => {
  it("planted STAMPED row keeps its verdict and receives no update; planted NULL rows get stamped", async () => {
    // dov>=2 → router 'relevant' (no model); dov=0 → router 'orthogonal' (no model); the judge is never needed here.
    const stamped = D("stamped", "orthogonal", "crisis stabilization unit for youth", "crisis stabilization unit serving youth");
    const nullA = D("null-a", null, "crisis stabilization unit for youth", "the crisis stabilization unit serves youth"); // dov>=2 → relevant
    const nullB = D("null-b", null, "residential treatment for adolescents", "Edgewood hosted a gala"); // dov=0 → orthogonal
    const store = seed([stamped, nullA, nullB]);
    const judge = vi.fn();
    const out = await computeRelevanceForCompany(coreArgs(store, CO, judge));
    expect(out.ok).toBe(true);
    // the stamped row was never written
    expect(store.updates.map((u) => u.id)).not.toContain("stamped");
    expect(stamped.relevance_verdict).toBe("orthogonal");
    expect(stamped.relevance_model).toBe("router");
    // both null rows were stamped by the deterministic router
    expect(nullA.relevance_verdict).toBe("relevant");
    expect(nullB.relevance_verdict).toBe("orthogonal");
    expect(store.updates.map((u) => u.id).sort()).toEqual(["null-a", "null-b"]);
    // examined == the NULL rows only (the stamped row was never loaded)
    if (out.ok) expect(out.totals.examined).toBe(2);
    expect(judge).not.toHaveBeenCalled();
  });
});

// ── (c) frozen refusal before any read ────────────────────────────────────────────
describe("(c) CB1 is refused before any store read", () => {
  it("returns skipped:frozen_company and touches no table", async () => {
    const store = seed([]);
    const out = await computeRelevanceForCompany(coreArgs(store, CB1));
    expect(out).toEqual({ ok: false, skipped: "frozen_company" });
    expect(store.calls).toHaveLength(0);
  });
});
