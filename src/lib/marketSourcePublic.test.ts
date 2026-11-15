// F3′: a market definition is public BY SOURCE only when it was born public — research-company's public_research,
// or portfolio discovery's outside-only register — and no operator has edited it.
import { describe, expect, it } from "vitest";
import { marketPublicBySource, MARKET_NOT_PUBLIC_BY_SOURCE } from "../../supabase/functions/_shared/marketSourcePublic.ts";

describe("F3′ marketPublicBySource", () => {
  it("admits public_research and the portfolio outside-only register", () => {
    expect(marketPublicBySource({ provenance_type: "public_research" })).toEqual({ public: true, reason: "public_research" });
    expect(marketPublicBySource({ provenance_type: "internal_hypothesis", source_path: "market_portfolio_discovery:outside_only", market_register: "public_inferred" }).public).toBe(true);
  });
  it("refuses client material, step hypotheses, unknowns and operator edits", () => {
    for (const def of [
      { provenance_type: "internal_declared" }, { provenance_type: "manual" }, { provenance_type: "internal_hypothesis" },
      { provenance_type: "internal_hypothesis", source_path: "market_portfolio_discovery:outside_only", market_register: "internal_inferred" },
      { provenance_type: null }, { provenance_type: "public_research", operator_edited_at: "2026-11-01T00:00:00Z" },
    ]) expect([def, marketPublicBySource(def).public]).toEqual([def, false]);
    expect(marketPublicBySource(null)).toEqual({ public: false, reason: "no_market_definition" });
    expect(MARKET_NOT_PUBLIC_BY_SOURCE).toBe("market_not_public_by_source");
  });
});
