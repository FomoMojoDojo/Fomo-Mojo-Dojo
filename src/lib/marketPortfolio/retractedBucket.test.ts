import { describe, it, expect } from "vitest";
import { resolveMarketPortfolio, type MarketDefRow } from "./resolveMarketPortfolio";

// Gate 8b — the admin portfolio is the ONE surface that still shows a retracted def, and only in its
// own bucket: never active, never deferred, never merged with the live def that shares its content.
const COMPANY_DEF = (over: Partial<MarketDefRow>): MarketDefRow => ({
  id: "x", journey_key: "pmk-x", job_executor: "New York sports fans", jtbd: "To watch local games.",
  chooser: null, provenance_type: "internal_hypothesis", market_register: "public_inferred",
  relationship_kind: "user", relationship_basis: null, declared_verbatim: null, declared_source_ref: null, ...over,
});

describe("resolveMarketPortfolio — retracted bucket (Gate 8b)", () => {
  // RED ON REVERT: the old resolver had no bucket; a retracted def landed in `active`.
  it("(8b-i) a retracted def lands in `retracted` only, with its (untouched) lens state", async () => {
    const p = await resolveMarketPortfolio({
      defs: [COMPANY_DEF({ id: "blind", journey_key: "pmk-blind", retracted: true })],
      lenses: [{ journey_key: "pmk-blind", portfolio_state: "active", portfolio_role: "support" }],
      verdicts: [], surface: "outside",
    });
    expect(p.active).toHaveLength(0);
    expect(p.deferred).toHaveLength(0);
    expect(p.retracted.map((m) => m.journey_key)).toEqual(["pmk-blind"]);
    expect(p.retracted[0].portfolio_state).toBe("active");   // lens untouched by retraction
  });

  it("(8b-i) a retracted def and its complete re-judge with IDENTICAL content never merge — one live, one history", async () => {
    const p = await resolveMarketPortfolio({
      defs: [
        COMPANY_DEF({ id: "blind", journey_key: "pmk-blind", retracted: true }),
        COMPANY_DEF({ id: "live", journey_key: "pmk-live", retracted: false }),   // same executor + jtbd ⇒ same identity
      ],
      lenses: [
        { journey_key: "pmk-blind", portfolio_state: "active", portfolio_role: "support" },
        { journey_key: "pmk-live", portfolio_state: "active", portfolio_role: "support" },
      ],
      verdicts: [], surface: "diagnose",
    });
    expect(p.active.map((m) => m.journey_key)).toEqual(["pmk-live"]);
    expect(p.active[0].is_collapsed_twin).toBe(false);
    expect(p.active[0].collapsed_keys).toEqual([]);
    expect(p.retracted.map((m) => m.journey_key)).toEqual(["pmk-blind"]);
  });

  it("(8b-i) unretracted / unset defs are untouched — pre-8b fixtures behave exactly as before", async () => {
    const p = await resolveMarketPortfolio({
      defs: [COMPANY_DEF({ id: "a", journey_key: "pmk-a" }), COMPANY_DEF({ id: "b", journey_key: "pmk-b", jtbd: "Another job.", retracted: null })],
      lenses: [{ journey_key: "pmk-b", portfolio_state: "deferred", portfolio_role: "support" }],
      verdicts: [], surface: "outside",
    });
    expect(p.active.map((m) => m.journey_key)).toEqual(["pmk-a"]);
    expect(p.deferred.map((m) => m.journey_key)).toEqual(["pmk-b"]);
    expect(p.retracted).toEqual([]);
  });
});
