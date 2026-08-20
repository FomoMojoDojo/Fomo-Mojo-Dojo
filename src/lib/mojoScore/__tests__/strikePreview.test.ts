// Strike Gate B — the −N confirm preview must be faithful to the snapshot:
// same struck-exclusion filter on claims, same compute, run twice (as-is vs
// without the target claim), and strictly read-only.
import { describe, expect, it } from "vitest";
import { computeMojoScore } from "../computeMojoScore";
import { previewStrikeScoreDelta } from "../strikePreview";
import type { ClaimInput } from "../types";

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  const captured: Array<{ table: string; method: string; col: string; v: unknown }> = [];
  const writes: string[] = [];
  const db = {
    captured,
    writes,
    from(table: string) {
      return {
        select() {
          const chain = {
            _rows: tables[table] ?? [],
            eq(col: string, v: unknown) { captured.push({ table, method: "eq", col, v }); this._rows = this._rows.filter((r) => r[col] === v); return chain; },
            neq(col: string, v: unknown) { captured.push({ table, method: "neq", col, v }); this._rows = this._rows.filter((r) => r[col] !== v); return chain; },
            then(resolve: (v: { data: Row[]; error: null }) => void) { resolve({ data: chain._rows, error: null }); },
          };
          return chain;
        },
        insert() { writes.push(table); return this; },
        update() { writes.push(table); return this; },
        delete() { writes.push(table); return this; },
      };
    },
  };
  return db;
}

const claim = (id: string, status = "active"): Row => ({
  id, company_id: "co-1", state: "diagnose", claim_type: "observation", topic: "t",
  outside_support_count: 2, organization_support_count: 1, customer_support_count: 0,
  updated_at: "2026-07-01T00:00:00Z", status,
});

describe("strike Gate B — score preview", () => {
  it("computes before/after with the target claim excluded, matching computeMojoScore", async () => {
    const claims = [claim("c1"), claim("c2"), claim("c3")];
    const db = fakeDb({ claims, routes: [], odi_needs: [] });
    // Pin the clock so the evidence-freshness contributor is deterministic:
    // preview.before must match a computeMojoScore over the same instant.
    const computedAt = "2026-07-09T00:00:00Z";
    const p = await previewStrikeScoreDelta(db as never, "co-1", "c2", computedAt);

    const inputs = (rows: Row[]) => ({
      companyId: "co-1",
      claims: rows as unknown as ClaimInput[],
      routes: [],
      needs: [],
      computedAt,
    });
    expect(p.before).toBe(computeMojoScore(inputs(claims)).total_score);
    expect(p.after).toBe(computeMojoScore(inputs(claims.filter((c) => c.id !== "c2"))).total_score);
    expect(p.delta).toBe(p.after - p.before);
    expect(db.writes).toEqual([]); // strictly read-only
  });

  it("mirrors the snapshot's struck-exclusion on the claims load (already-struck claims never in the baseline)", async () => {
    const db = fakeDb({ claims: [claim("c1"), claim("c2", "struck")], routes: [], odi_needs: [] });
    await previewStrikeScoreDelta(db as never, "co-1", "c1");
    expect(db.captured.some((f) => f.table === "claims" && f.method === "neq" && f.col === "status" && f.v === "struck")).toBe(true);
  });

  it("delta is 0 when the target claim is not in the loaded set", async () => {
    const db = fakeDb({ claims: [claim("c1")], routes: [], odi_needs: [] });
    const p = await previewStrikeScoreDelta(db as never, "co-1", "not-there");
    expect(p.delta).toBe(0);
  });
});
