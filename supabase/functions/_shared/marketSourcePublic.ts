// F3′ (operator ruling, 2026-11-14): IS A MARKET DEFINITION PUBLIC BY SOURCE?
//
// A market definition carries no evidence ids, so its publicness is read from how it was BORN:
//   • provenance_type 'public_research' — written by research-company / researchSynthesisWrite, whose prompts
//     are public-only by construction (a file COUNT is the only upload fact that reaches them; SP-350 §1);
//   • a portfolio-discovery market — source_path 'market_portfolio_discovery:outside_only' with the immutable
//     market_register 'public_inferred' — mined ONLY from outside-band signals whose source_type is
//     public_baseline_run or competitor_discovery_run (both on the SP-346 list; its tripwire aborts on anything
//     else: marketPortfolioDiscovery.ts:89-90, :464-474).
// Everything else is NOT public: internal_declared and manual (the client's own words), a step-set
// internal_hypothesis (built locally from job steps that may be file-derived), NULL, anything unrecognised —
// and ANY definition an operator has edited (operator_edited_at, Q3), whatever its label.
//
// Pure. Read-only. The answer decides whether a market's executor / jtbd may frame an OUTSIDE call.
export const MARKET_NOT_PUBLIC_BY_SOURCE = "market_not_public_by_source";
export const PORTFOLIO_PUBLIC_SOURCE_PATH = "market_portfolio_discovery:outside_only";

export type MarketSourceRow = {
  provenance_type?: string | null;
  source_path?: string | null;
  market_register?: string | null;
  operator_edited_at?: string | null;
};

export function marketPublicBySource(def: MarketSourceRow | null | undefined): { public: boolean; reason: string } {
  if (!def) return { public: false, reason: "no_market_definition" };
  if (def.operator_edited_at != null && String(def.operator_edited_at).trim() !== "") return { public: false, reason: "operator_edited" };
  if (def.provenance_type === "public_research") return { public: true, reason: "public_research" };
  if (def.source_path === PORTFOLIO_PUBLIC_SOURCE_PATH && def.market_register === "public_inferred") {
    return { public: true, reason: "portfolio_outside_only" };
  }
  return { public: false, reason: `provenance:${def.provenance_type ?? "null"}` };
}
