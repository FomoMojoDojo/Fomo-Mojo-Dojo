import { describe, expect, it } from "vitest";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { StrategyCascade } from "@/lib/types";
import type { PositioningCanvas } from "@/lib/types";
import {
  buildPositioningLensNarrative,
  buildRoutePositioningImplication,
} from "./positioningLensNarrative";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoute(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id:                    "route-1",
    company_id:            "company-1",
    category:              "improve",
    title:                 "Default route title",
    short_description:     null,
    frameworks_used:       [],
    pts_value:             5,
    effort:                "medium",
    type:                  "Improve",
    sort_order:            1,
    steps_json:            null,
    evidence_json:         null,
    why_this_matters_json: null,
    assumptions_json:      null,
    dependency_state:      null,
    validation_state:      null,
    evidence_state:        null,
    stale_reason:          null,
    updated_at:            null,
    created_at:            new Date().toISOString(),
    ...overrides,
  };
}

function makeCascade(overrides: Partial<StrategyCascade> = {}): StrategyCascade {
  return {
    winning_aspiration: "Become the most trusted partner for mid-market retailers",
    where_to_play:      "Mid-market retail operations",
    how_to_win:         "Speed-to-value and customer success focus",
    capabilities:       [],
    management_systems: [],
    assumptions:        [],
    ...overrides,
  };
}

function makePositioning(overrides: Partial<PositioningCanvas> = {}): PositioningCanvas {
  return {
    value_for_customer:       "We help retailers reduce operational friction",
    best_fit_customers:       "Mid-market retail chains",
    market_category:          "Retail operations software",
    category_rationale:       "Focused on mid-market",
    current_tagline:          "Streamline your retail ops",
    proposed_tagline:         "",
    competitive_alternatives: [],
    unique_attributes:        [],
    ...overrides,
  };
}

// ─── 1. Inherited positioning ─────────────────────────────────────────────────

describe("inherited positioning", () => {
  it("returns inherited when no cascade and generic tagline", () => {
    const result = buildPositioningLensNarrative(null, null, []);
    expect(result.posture).toBe("inherited");
  });

  it("inherited has correct headline", () => {
    const result = buildPositioningLensNarrative(null, null, []);
    expect(result.postureHeadline).toBe("Positioning is still inherited from public perception.");
  });

  it("returns null marketPerception and intendedIdentity when no data", () => {
    const result = buildPositioningLensNarrative(null, null, []);
    expect(result.marketPerception).toBeNull();
    expect(result.intendedIdentity).toBeNull();
  });
});

// ─── 2. Coherent positioning ──────────────────────────────────────────────────

describe("coherent positioning", () => {
  it("returns coherent when cascade and positioning share meaningful theme overlap", () => {
    const cascade = makeCascade({
      winning_aspiration: "Be the most trusted retail partner for mid-market operations",
      how_to_win:         "Customer success and operational reliability for retail chains",
    });
    const positioning = makePositioning({
      value_for_customer: "We help retail operations teams succeed with reliable customer outcomes",
      market_category:    "Retail operations",
    });
    const result = buildPositioningLensNarrative(positioning, cascade, []);
    expect(result.posture).toBe("coherent");
  });

  it("coherent panel has marketPerception and intendedIdentity set", () => {
    const cascade = makeCascade({
      winning_aspiration: "Be the most trusted retail partner for mid-market operations",
      how_to_win:         "Customer success and operational reliability for retail chains",
    });
    const positioning = makePositioning({
      value_for_customer: "We help retail operations teams succeed with reliable customer outcomes",
      market_category:    "Retail operations",
    });
    const result = buildPositioningLensNarrative(positioning, cascade, []);
    expect(result.marketPerception).toBeTruthy();
    expect(result.intendedIdentity).toBeTruthy();
  });
});

// ─── 3. Fragmented positioning ────────────────────────────────────────────────

describe("fragmented positioning", () => {
  it("returns fragmented when fix and create routes both present at scale", () => {
    const routes = [
      makeRoute({ id: "r1", category: "fix" }),
      makeRoute({ id: "r2", category: "fix" }),
      makeRoute({ id: "r3", category: "create" }),
      makeRoute({ id: "r4", category: "improve" }),
    ];
    const result = buildPositioningLensNarrative(makePositioning(), makeCascade(), routes);
    expect(result.posture).toBe("fragmented");
  });

  it("fragmented posture does not fire with fewer than 4 routes", () => {
    const routes = [
      makeRoute({ id: "r1", category: "fix" }),
      makeRoute({ id: "r2", category: "create" }),
      makeRoute({ id: "r3", category: "improve" }),
    ];
    const result = buildPositioningLensNarrative(makePositioning(), makeCascade(), routes);
    expect(result.posture).not.toBe("fragmented");
  });

  it("fragmented posture includes route-mix tension", () => {
    const routes = [
      makeRoute({ id: "r1", category: "fix" }),
      makeRoute({ id: "r2", category: "fix" }),
      makeRoute({ id: "r3", category: "create" }),
      makeRoute({ id: "r4", category: "improve" }),
    ];
    const result = buildPositioningLensNarrative(makePositioning(), makeCascade(), routes);
    const tensions = result.tensions.map((t) => t.between);
    expect(tensions).toContain("route emphasis");
  });
});

// ─── 4. Contradicting route signal ───────────────────────────────────────────

describe("route coherence signals", () => {
  it("strategy_cascade framework produces reinforces signal", () => {
    const route = makeRoute({ frameworks_used: ["strategy_cascade"], category: "improve" });
    const implication = buildRoutePositioningImplication(route, makePositioning(), makeCascade());
    expect(implication.coherenceSignal).toBe("reinforces");
  });

  it("create route with low theme overlap produces weakens signal", () => {
    const route = makeRoute({
      id: "r-create",
      category: "create",
      title: "Launch quantum blockchain integration",
      frameworks_used: [],
      why_this_matters_json: ["Quantum entanglement protocol unrelated to any existing domain"],
    });
    const positioning = makePositioning({
      value_for_customer: "Streamlined retail inventory tracking for grocery stores",
      market_category:    "Retail inventory",
    });
    const cascade = makeCascade({
      winning_aspiration: "Best grocery inventory software for retail chains",
      how_to_win:         "Inventory tracking speed and grocery store reliability",
    });
    const implication = buildRoutePositioningImplication(route, positioning, cascade);
    expect(implication.coherenceSignal).toBe("weakens");
  });

  it("contradicting routes appear in contradictingRoutes list", () => {
    const reinforcing = makeRoute({ id: "r1", frameworks_used: ["strategy_cascade"] });
    const weakening = makeRoute({
      id: "r2",
      category: "create",
      title: "Expand into quantum blockchain infrastructure",
      frameworks_used: [],
      why_this_matters_json: ["Quantum entanglement protocol for unrelated market"],
    });
    const positioning = makePositioning({
      value_for_customer: "Streamlined retail inventory tracking",
      market_category:    "Retail inventory",
    });
    const cascade = makeCascade({
      winning_aspiration: "Best retail inventory software",
      how_to_win:         "Inventory tracking reliability",
    });
    const result = buildPositioningLensNarrative(positioning, cascade, [reinforcing, weakening]);
    expect(result.reinforcingRoutes.some((r) => r.routeId === "r1")).toBe(true);
    expect(result.contradictingRoutes.some((r) => r.routeId === "r2")).toBe(true);
  });
});

// ─── 5. Customer proof lag ────────────────────────────────────────────────────

describe("customer proof status", () => {
  it("returns missing when no evidence across routes", () => {
    const routes = [makeRoute({ evidence_json: null }), makeRoute({ id: "r2", evidence_json: [] })];
    const result = buildPositioningLensNarrative(makePositioning(), makeCascade(), routes);
    expect(result.customerProofStatus).toBe("missing");
  });

  it("returns present when complete evidence AND customer framework present", () => {
    const routes = [
      makeRoute({
        frameworks_used: ["odi"],
        evidence_json: [{ id: "e1", title: "Customer interview", status: "complete" }],
      }),
    ];
    const result = buildPositioningLensNarrative(makePositioning(), makeCascade(), routes);
    expect(result.customerProofStatus).toBe("present");
  });

  it("returns partial when complete evidence but no customer framework", () => {
    const routes = [
      makeRoute({
        frameworks_used: ["public_baseline"],
        evidence_json: [{ id: "e1", title: "Industry report", status: "complete" }],
      }),
    ];
    const result = buildPositioningLensNarrative(makePositioning(), makeCascade(), routes);
    expect(result.customerProofStatus).toBe("partial");
  });
});

// ─── 6. Route reinforcing strategic center ────────────────────────────────────

describe("route reinforcing strategic center", () => {
  it("buildRoutePositioningImplication returns reinforces for strategy_cascade", () => {
    const route = makeRoute({ frameworks_used: ["strategy_cascade"] });
    const result = buildRoutePositioningImplication(route, makePositioning(), makeCascade());
    expect(result.coherenceSignal).toBe("reinforces");
    expect(result.displayLabel).toContain("Reinforces");
  });

  it("includes a claimReinforced string from positioning themes", () => {
    const route = makeRoute({
      title: "Improve customer success onboarding flow",
      frameworks_used: ["strategy_cascade"],
    });
    const result = buildRoutePositioningImplication(route, makePositioning(), makeCascade());
    expect(typeof result.claimReinforced).toBe("string");
    expect(result.claimReinforced.length).toBeGreaterThan(10);
  });
});

// ─── 7. Route weakening strategic center ─────────────────────────────────────

describe("route weakening strategic center", () => {
  it("buildRoutePositioningImplication returns weakens for misaligned create route", () => {
    const route = makeRoute({
      id: "r-diverge",
      category: "create",
      title: "Launch blockchain arbitrage infrastructure",
      frameworks_used: [],
      why_this_matters_json: ["Quantum cryptography protocol for financial derivatives"],
    });
    const positioning = makePositioning({
      value_for_customer: "We help grocery retailers reduce spoilage losses",
      market_category:    "Grocery retail",
    });
    const cascade = makeCascade({
      winning_aspiration: "The top grocery inventory software for mid-market retailers",
      how_to_win:         "Spoilage reduction and inventory accuracy for grocery chains",
    });
    const result = buildRoutePositioningImplication(route, positioning, cascade);
    expect(result.coherenceSignal).toBe("weakens");
    expect(result.displayLabel).toContain("contradictory");
  });
});

// ─── Wouldstrengthen ─────────────────────────────────────────────────────────

describe("wouldStrengthen", () => {
  it("always returns 1–3 items", () => {
    const result = buildPositioningLensNarrative(null, null, []);
    expect(result.wouldStrengthen.length).toBeGreaterThanOrEqual(1);
    expect(result.wouldStrengthen.length).toBeLessThanOrEqual(3);
  });

  it("includes customer interview prompt when proof is missing", () => {
    const result = buildPositioningLensNarrative(makePositioning(), makeCascade(), []);
    expect(result.wouldStrengthen.some((s) => s.toLowerCase().includes("customer"))).toBe(true);
  });
});
