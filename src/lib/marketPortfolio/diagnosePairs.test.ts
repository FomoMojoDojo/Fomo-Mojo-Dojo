import { describe, expect, it } from "vitest";
import { deriveDiagnoseModel } from "./diagnosePairs";
import type { ResolvedMarket } from "./resolveMarketPortfolio";

// Minimal ResolvedMarket factory — only the fields deriveDiagnoseModel reads.
function mkt(
  journey_key: string,
  register: string,
  pairs: Array<{ journey_key: string; register: string }> = [],
): ResolvedMarket {
  return {
    journey_key,
    display_statement: `stmt-${journey_key}`,
    job_executor: `exec-${journey_key}`,
    jtbd: `job-${journey_key}`,
    provenance: register === "internal_declared" ? "internal_declared" : "internal_hypothesis",
    register,
    tier: "inferred_hypothesis",
    relationship_kind: null,
    relationship_basis: null,
    portfolio_state: "active",
    source_refs: [],
    is_collapsed_twin: false,
    collapsed_keys: [],
    cross_register_pairs: pairs.map((p) => ({ journey_key: p.journey_key, register: p.register, reason: "REDACTED — must not render" })),
  };
}

describe("deriveDiagnoseModel — say/see classification", () => {
  it("classifies a declared pair, an inferred pair, and both gap kinds", () => {
    const active = [
      mkt("customer", "internal_declared", [{ journey_key: "pmk-fam", register: "public_inferred" }]),
      mkt("pmk-fam", "public_inferred", [{ journey_key: "customer", register: "internal_declared" }]),
      mkt("mkt-schools", "internal_inferred", [{ journey_key: "pmk-iep", register: "public_inferred" }]),
      mkt("pmk-iep", "public_inferred", [{ journey_key: "mkt-schools", register: "internal_inferred" }]),
      mkt("mkt-staff", "internal_inferred", []), // said, not shown
      mkt("pmk-community", "public_inferred", []), // shown, not said
    ];
    const m = deriveDiagnoseModel(active, []);
    expect(m.ready).toBe(true);
    expect(m.declaredPairs.map((p) => p.internal.journey_key)).toEqual(["customer"]);
    expect(m.declaredPairs[0].publicSide.journey_key).toBe("pmk-fam");
    expect(m.inferredPairs.map((p) => p.internal.journey_key)).toEqual(["mkt-schools"]);
    expect(m.internalOnly.map((x) => x.journey_key)).toEqual(["mkt-staff"]);
    expect(m.publicOnly.map((x) => x.journey_key)).toEqual(["pmk-community"]);
    expect(m.fanOut).toEqual([]);
  });

  it("surfaces fan-out in BOTH directions (N internal ↔ 1 public, 1 internal ↔ N public)", () => {
    const active = [
      // pmk-phil ← community-orgs, nonprofits, funders (3 internal ↔ 1 public)
      mkt("mkt-community-orgs", "internal_inferred", [{ journey_key: "pmk-phil", register: "public_inferred" }]),
      mkt("mkt-nonprofits", "internal_inferred", [{ journey_key: "pmk-phil", register: "public_inferred" }]),
      // funders ↔ both pmk-phil and pmk-gov (1 internal ↔ 2 public)
      mkt("mkt-funders", "internal_inferred", [
        { journey_key: "pmk-phil", register: "public_inferred" },
        { journey_key: "pmk-gov", register: "public_inferred" },
      ]),
      mkt("pmk-phil", "public_inferred", []),
      mkt("pmk-gov", "public_inferred", []),
    ];
    const m = deriveDiagnoseModel(active, []);
    const pub = m.fanOut.find((f) => f.anchorClass === "public" && f.anchor.journey_key === "pmk-phil");
    const int = m.fanOut.find((f) => f.anchorClass === "internal" && f.anchor.journey_key === "mkt-funders");
    expect(pub?.counterparts.map((c) => c.journey_key).sort()).toEqual(["mkt-community-orgs", "mkt-funders", "mkt-nonprofits"]);
    expect(int?.counterparts.map((c) => c.journey_key).sort()).toEqual(["pmk-gov", "pmk-phil"]);
  });

  it("is NOT ready when one register is entirely absent (undiscovered public)", () => {
    const m = deriveDiagnoseModel([mkt("customer", "internal_inferred", [])], []);
    expect(m.ready).toBe(false);
    // No false gap claim: a lone internal side does not render as 'said, not shown'.
    expect(m.internalOnly.length).toBe(1); // present in the model...
    // ...but the component gates the whole act on `ready`, so it never renders.
  });

  it("treats deferred markets uniformly (a deferred internal still pairs)", () => {
    const m = deriveDiagnoseModel(
      [mkt("pmk-gov", "public_inferred", [{ journey_key: "mkt-funders", register: "internal_inferred" }])],
      [mkt("mkt-funders", "internal_inferred", [{ journey_key: "pmk-gov", register: "public_inferred" }])],
    );
    expect(m.inferredPairs.map((p) => p.internal.journey_key)).toEqual(["mkt-funders"]);
    expect(m.internalOnly).toEqual([]);
  });

  it("does not lift judge reasons into its own pair/gap/fan-out structures", () => {
    const m = deriveDiagnoseModel(
      [
        mkt("customer", "internal_declared", [{ journey_key: "pmk-fam", register: "public_inferred" }]),
        mkt("pmk-fam", "public_inferred", [{ journey_key: "customer", register: "internal_declared" }]),
      ],
      [],
    );
    // The model's OWN structures carry no reason field (raw ResolvedMarket rows
    // still nest cross_register_pairs — the component must never read those).
    const pair = m.declaredPairs[0] as Record<string, unknown>;
    expect("reason" in pair).toBe(false);
    expect(Object.keys(pair).sort()).toEqual(["internal", "publicSide"]);
  });
});
