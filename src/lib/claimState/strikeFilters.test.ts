// Strike Gate A — chokepoint-filter tests for the claimState layer: the
// regression sweep and the band distribution must exclude struck claims
// (frozen in place / out of bands), and the transition loader must refuse them.
// The sweep can never SET struck — structurally impossible here (its only
// update writes `state`; the DB trigger blocks any status write outside
// set_claim_status — proven live at migration time).
import { describe, expect, it } from "vitest";
import { computeClaimStateDistribution } from "./distribution";
import { regressionSweep, retireClaim } from "./machine";

type Row = Record<string, unknown>;

// Capturing fake: records filters, serves rows.
function fakeDb(rows: Row[]) {
  const captured: Array<{ method: string; col: string; v: unknown }> = [];
  const db = {
    captured,
    from() {
      const chain = {
        _rows: rows,
        select() { return this; },
        eq(col: string, v: unknown) { captured.push({ method: "eq", col, v }); this._rows = this._rows.filter((r) => r[col] === v); return this; },
        neq(col: string, v: unknown) { captured.push({ method: "neq", col, v }); this._rows = this._rows.filter((r) => r[col] !== v); return this; },
        in(col: string, vs: unknown[]) { captured.push({ method: "in", col, v: vs }); this._rows = this._rows.filter((r) => vs.includes(r[col])); return this; },
        maybeSingle() { return Promise.resolve({ data: this._rows[0] ?? null, error: null }); },
        update() { return { eq: () => Promise.resolve({ error: null }) }; },
        then(resolve: (v: { data: Row[]; error: null }) => void) { resolve({ data: this._rows, error: null }); },
      };
      return chain;
    },
  };
  return db;
}

const claim = (id: string, state: string, status = "active"): Row => ({
  id, company_id: "co-1", claim_type: "observation", state, status,
  need_statement: null, action_category: null, triangulation_state: "untested",
  revalidation_flag: false,
});

describe("strike Gate A — claimState chokepoints", () => {
  it("band distribution excludes struck claims (minimized still counts)", async () => {
    const db = fakeDb([claim("c1", "diagnose"), claim("c2", "diagnose", "struck"), claim("c3", "diagnose", "minimized")]);
    const dist = await computeClaimStateDistribution(db as never, "co-1");
    expect(dist.diagnose).toBe(2); // active + minimized; struck out
    expect(db.captured.some((f) => f.method === "neq" && f.col === "status" && f.v === "struck")).toBe(true);
  });

  it("regression sweep never loads struck claims", async () => {
    const db = fakeDb([claim("c1", "diagnose", "struck")]);
    const result = await regressionSweep(db as never, "co-1");
    expect(result.regressions).toEqual([]);
    expect(db.captured.some((f) => f.method === "neq" && f.col === "status" && f.v === "struck")).toBe(true);
  });

  it("retire (a lifecycle act) refuses a struck claim", async () => {
    const db = fakeDb([claim("c1", "diagnose", "struck")]);
    const r = await retireClaim(db as never, "c1");
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/struck/);
  });
});
