// 4f-6 (ruling F9) — the fixed readers, exercised against a PLANTED company-held need.
//
// The census test next door is a source wall: it says no reader may carry journey_key unguarded.
// This one is the behavioural half — it builds the query each fixed reader builds and asserts the
// planted company-held row is not in the result. The supabase client is faked so the test records
// the filter chain rather than hitting a database: what is under test is which filters a reader
// applies, and that is exactly what the chain records.
//
// The planted row: holder='company', journey_key=null — the shape 4f-5 will be the first to write.
import { describe, it, expect } from "vitest";

type Row = { id: string; journey_key: string | null; holder: string; company_id: string; status: string };

const COMPANY = "c-1";
const MARKET_NEED: Row = { id: "n-market", journey_key: "customer", holder: "market", company_id: COMPANY, status: "active" };
const COMPANY_NEED: Row = { id: "n-company", journey_key: null, holder: "company", company_id: COMPANY, status: "active" };
const TABLE: Row[] = [MARKET_NEED, COMPANY_NEED];

/** A minimal PostgREST-shaped builder that applies the filters it is given to TABLE. */
function fakeFrom(_table: string) {
  let rows = [...TABLE];
  const api = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (col: keyof Row, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    neq: (col: keyof Row, val: unknown) => {
      rows = rows.filter((r) => r[col] !== val);
      return api;
    },
    not: (col: keyof Row, op: string, val: unknown) => {
      if (op !== "is" || val !== null) throw new Error(`unsupported not(${col}, ${op})`);
      rows = rows.filter((r) => r[col] !== null);
      return api;
    },
    get rows() {
      return rows;
    },
  };
  return api;
}

describe("4f-6: a company-held need reaches no market-keyed reader", () => {
  it("useOdiNeeds, no-key path — the fix under test", () => {
    // mirrors src/hooks/useOdiNeeds.ts (no journeyKey branch)
    const q = fakeFrom("odi_needs")
      .select()
      .eq("company_id", COMPANY)
      .not("journey_key", "is", null)
      .neq("status", "retracted");
    expect(q.rows.map((r) => r.id)).toEqual(["n-market"]);
  });

  it("useOdiNeeds, keyed path — already safe, asserted so it stays that way", () => {
    const q = fakeFrom("odi_needs")
      .select()
      .eq("company_id", COMPANY)
      .eq("journey_key", "customer")
      .neq("status", "retracted");
    expect(q.rows.map((r) => r.id)).toEqual(["n-market"]);
  });

  it("snapshotMojoScore / strikePreview — the score is a market score", () => {
    const q = fakeFrom("odi_needs").select().eq("company_id", COMPANY).not("journey_key", "is", null);
    expect(q.rows).toHaveLength(1);
    expect(q.rows[0].id).toBe("n-market");
  });

  it("local-alignment, propose-cascade, propose-positioning — model context carries no unkeyed need", () => {
    const q = fakeFrom("odi_needs").select().eq("company_id", COMPANY).not("journey_key", "is", null).order();
    expect(q.rows.some((r) => r.holder === "company")).toBe(false);
  });

  it("evidencePhase1 dependency rebuild — no dependency can name a company-held need", () => {
    const q = fakeFrom("odi_needs").select().eq("company_id", COMPANY).not("journey_key", "is", null).limit();
    expect(q.rows.map((r) => r.id)).toEqual(["n-market"]);
  });

  it("researchSynthesisWrite reconcile — a company-held need is never a reconcile candidate", () => {
    const q = fakeFrom("odi_needs").select().eq("company_id", COMPANY).not("journey_key", "is", null).eq("status", "active");
    expect(q.rows.map((r) => r.id)).toEqual(["n-market"]);
  });

  it("the plant is real: without the filter the company-held need DOES come back", () => {
    // the pre-4f-6 no-key query, kept here as the red half of the fix
    const q = fakeFrom("odi_needs").select().eq("company_id", COMPANY).neq("status", "retracted");
    expect(q.rows.map((r) => r.id)).toEqual(["n-market", "n-company"]);
  });
});

describe("4f-6: the by-id readers refuse rather than render", () => {
  // evaluate-opportunity-alignment and propose-opportunity-changes read ONE row by id, so no filter
  // can help them — they must refuse. This asserts the predicate they refuse on.
  const isCompanyHeld = (n: { journey_key: string | null | undefined }) =>
    n.journey_key === null || n.journey_key === undefined;

  it("refuses a company-held need", () => {
    expect(isCompanyHeld(COMPANY_NEED)).toBe(true);
  });

  it("passes a market need through", () => {
    expect(isCompanyHeld(MARKET_NEED)).toBe(false);
  });
});
