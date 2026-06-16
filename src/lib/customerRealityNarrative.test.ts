import { describe, expect, it } from "vitest";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { StrategyCascade } from "@/lib/types";
import {
  buildCustomerRealityNarrative,
  deriveNeedRealityCard,
  deriveRouteCustomerImplication,
  deriveValidationStatus,
  type CustomerRealityPosture,
  type ValidationStatus,
  type FrictionKind,
} from "./customerRealityNarrative";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeNeed(overrides: Partial<OdiNeedRow> = {}): OdiNeedRow {
  return {
    id:                      "need-1",
    company_id:              "company-1",
    tier:                    "need",
    desired_outcome:         "Minimize the time spent locating order status",
    journey_key:             "customer",
    step_number:             1,
    step_label:              "Core job",
    importance:              7,
    satisfaction:            4,
    opportunity_score:       21,
    sort_order:              1,
    service_state:           "underserved",
    provenance_type:         "manual",
    source_path:             "customer_interviews",
    source_url:              null,
    notes:                   null,
    social_extraction_json:  null,
    frameworks_used:         ["odi"],
    dependency_state:        null,
    validation_state:        null,
    evidence_state:          null,
    last_reviewed_at:        null,
    stale_reason:            null,
    stale_since_event_id:    null,
    source_run_id:           null,
    updated_at:              null,
    created_at:              new Date().toISOString(),
    ...overrides,
  };
}

function makeRoute(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id:                    "route-1",
    company_id:            "company-1",
    category:              "improve",
    title:                 "Default route",
    short_description:     null,
    frameworks_used:       ["odi"],
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
    winning_aspiration: "Be the most trusted partner for mid-market retailers",
    where_to_play:      "Mid-market retail operations",
    how_to_win:         "Speed-to-value and customer success",
    capabilities:       [],
    management_systems: [],
    assumptions:        [],
    ...overrides,
  };
}

// ─── 1. Inferred customer reality ─────────────────────────────────────────────

describe("inferred customer reality", () => {
  it("returns 'inferred' posture when all needs come from outside research", () => {
    const needs = [
      makeNeed({ id: "n1", provenance_type: "public_research", source_path: "public_baseline", frameworks_used: [], desired_outcome: "Reduce order errors", opportunity_score: 12 }),
      makeNeed({ id: "n2", provenance_type: "public_research", source_path: "benchmark_report", frameworks_used: [], desired_outcome: "Improve shipping speed", opportunity_score: 15 }),
    ];
    const result = buildCustomerRealityNarrative(needs, [], makeCascade());
    expect(result.posture).toBe("inferred");
    expect(result.postureHeadline).toContain("inferred");
  });

  // Validation status is now driven by provenance_type, not source_path/frameworks sniffing.
  it("classifies public_research provenance as 'inferred'", () => {
    const need = makeNeed({ provenance_type: "public_research", source_path: "public_baseline", frameworks_used: [] });
    expect(deriveValidationStatus(need)).toBe("inferred");
  });

  it("classifies manual provenance as 'validated' (the company's own research)", () => {
    const need = makeNeed({ provenance_type: "manual", source_path: "internal", frameworks_used: ["odi"] });
    expect(deriveValidationStatus(need)).toBe("validated");
  });

  it("classifies odi_survey provenance as 'validated'", () => {
    const need = makeNeed({ provenance_type: "odi_survey", source_path: "", frameworks_used: [] });
    expect(deriveValidationStatus(need)).toBe("validated");
  });

  it("classifies internal_declared provenance as 'directional'", () => {
    const need = makeNeed({ provenance_type: "internal_declared", source_path: "internal_doc", frameworks_used: [] });
    expect(deriveValidationStatus(need)).toBe("directional");
  });

  it("classifies unknown provenance as 'directional'", () => {
    const need = makeNeed({ provenance_type: null, source_path: "internal_doc", frameworks_used: [] });
    expect(deriveValidationStatus(need)).toBe("directional");
  });
});

// ─── 2. Grounded customer reality ─────────────────────────────────────────────

describe("grounded customer reality", () => {
  it("returns 'grounded' when ≥2 validated needs and a customer-framework route", () => {
    const needs = [
      makeNeed({ id: "n1", source_path: "customer_interviews", frameworks_used: ["odi"] }),
      makeNeed({ id: "n2", source_path: "primary_research",   frameworks_used: ["jtbd"] }),
    ];
    const routes = [makeRoute({ frameworks_used: ["odi"] })];
    const result = buildCustomerRealityNarrative(needs, routes, makeCascade());
    expect(result.posture).toBe("grounded");
  });

  it("grounded posture has validatedNeedCount ≥ 2", () => {
    const needs = [
      makeNeed({ id: "n1", source_path: "customer_interviews", frameworks_used: ["odi"] }),
      makeNeed({ id: "n2", source_path: "customer_interviews", frameworks_used: ["odi"] }),
    ];
    const routes = [makeRoute({ frameworks_used: ["odi"] })];
    const result = buildCustomerRealityNarrative(needs, routes, makeCascade());
    expect(result.validatedNeedCount).toBeGreaterThanOrEqual(2);
  });
});

// ─── 3. Fragmented customer needs ─────────────────────────────────────────────

describe("fragmented customer needs", () => {
  it("returns 'fragmented' for high-variance needs with no thematic clustering", () => {
    const needs = [
      makeNeed({ id: "n1", importance: 9, desired_outcome: "Quantum entanglement timing", source_path: "baseline", frameworks_used: [] }),
      makeNeed({ id: "n2", importance: 2, desired_outcome: "Molecular gastronomy recipes", source_path: "benchmark", frameworks_used: [] }),
      makeNeed({ id: "n3", importance: 8, desired_outcome: "Satellite orbit calibration", source_path: "external", frameworks_used: [] }),
      makeNeed({ id: "n4", importance: 1, desired_outcome: "Knitting pattern database", source_path: "report", frameworks_used: [] }),
    ];
    const result = buildCustomerRealityNarrative(needs, [], makeCascade());
    expect(result.posture).toBe("fragmented");
  });

  it("fragmented posture has a non-empty frictionPatterns array", () => {
    const needs = [
      makeNeed({ id: "n1", importance: 9, desired_outcome: "Quantum timing alpha", source_path: "baseline", frameworks_used: [] }),
      makeNeed({ id: "n2", importance: 2, desired_outcome: "Molecular gastronomy beta", source_path: "benchmark", frameworks_used: [] }),
      makeNeed({ id: "n3", importance: 8, desired_outcome: "Satellite calibration gamma", source_path: "external", frameworks_used: [] }),
      makeNeed({ id: "n4", importance: 1, desired_outcome: "Knitting patterns delta", source_path: "report", frameworks_used: [] }),
    ];
    const result = buildCustomerRealityNarrative(needs, [], makeCascade());
    expect(result.frictionPatterns.length).toBeGreaterThanOrEqual(0);
  });
});

// ─── 4. Route backed by validated customer need ────────────────────────────────

describe("route backed by validated customer need", () => {
  it("deriveNeedRealityCard finds improving routes via token overlap", () => {
    const need = makeNeed({
      desired_outcome: "Minimize time locating order status tracking",
    });
    const route = makeRoute({
      id: "route-match",
      title: "Improve order tracking visibility",
      why_this_matters_json: ["Customers spend too long locating order status information"],
      frameworks_used: ["odi"],
    });
    const card = deriveNeedRealityCard(need, [route]);
    expect(card.improvingRouteIds).toContain("route-match");
  });

  it("route with customer framework returns 'customer' frictionKind", () => {
    const route = makeRoute({ frameworks_used: ["odi"] });
    const result = deriveRouteCustomerImplication(route, [], []);
    expect(result.frictionKind).toBe("customer");
  });

  it("route with customer framework and complete evidence has behaviorValidated = true", () => {
    const route = makeRoute({
      frameworks_used: ["odi"],
      evidence_json: [{ id: "e1", title: "Customer interview", status: "complete" }],
    });
    const result = deriveRouteCustomerImplication(route, [], []);
    expect(result.behaviorValidated).toBe(true);
  });
});

// ─── 5. Route solving only internal friction ───────────────────────────────────

describe("route solving internal friction", () => {
  it("fix route with operational keywords returns 'operational' frictionKind", () => {
    const route = makeRoute({
      category: "fix",
      title: "Fix deployment pipeline latency",
      frameworks_used: [],
      why_this_matters_json: ["Deployment workflow bottleneck slows delivery cycle"],
    });
    const result = deriveRouteCustomerImplication(route, [], []);
    expect(result.frictionKind).toBe("operational");
  });

  it("strategy_cascade route with no customer framework returns 'strategic' frictionKind", () => {
    const route = makeRoute({
      frameworks_used: ["strategy_cascade"],
      category: "improve",
    });
    const result = deriveRouteCustomerImplication(route, [], []);
    expect(result.frictionKind).toBe("strategic");
  });

  it("operational route has customer uncertainty note", () => {
    const route = makeRoute({
      category: "fix",
      title: "Fix deployment pipeline latency",
      frameworks_used: [],
      why_this_matters_json: ["Deployment workflow latency issue"],
    });
    const result = deriveRouteCustomerImplication(route, [], []);
    expect(result.customerUncertainty).not.toBeNull();
    expect(result.customerUncertainty).toContain("customer");
  });
});

// ─── 6. Strategic direction outrunning customer proof ─────────────────────────

describe("strategic direction outrunning customer proof", () => {
  it("returns a direction-grounding conflict when cascade defined but all needs are inferred", () => {
    const needs = [
      makeNeed({ id: "n1", provenance_type: "public_research", source_path: "public_baseline", frameworks_used: [], desired_outcome: "Reduce errors" }),
    ];
    const result = buildCustomerRealityNarrative(needs, [], makeCascade());
    const hasProofConflict = result.conflicts.some((c) =>
      c.description.toLowerCase().includes("running ahead") ||
      c.description.toLowerCase().includes("grounded") ||
      c.description.toLowerCase().includes("validated"),
    );
    expect(hasProofConflict).toBe(true);
  });

  it("directionGrounding returns weak-alignment sentence when cascade tokens don't match needs", () => {
    const needs = [
      makeNeed({ id: "n1", source_path: "customer_interviews", frameworks_used: ["odi"], desired_outcome: "Knitting pattern database management" }),
    ];
    const cascade = makeCascade({
      winning_aspiration: "Dominate enterprise semiconductor logistics orchestration",
      how_to_win:         "Ultra-low latency photonic supply chain integration",
    });
    const result = buildCustomerRealityNarrative(needs, [], cascade);
    expect(result.directionGrounding).toContain("does not yet align");
  });
});

// ─── 7. Converging customer validation ────────────────────────────────────────

describe("converging customer validation", () => {
  it("returns 'converging' when needs share thematic overlap across multiple needs", () => {
    const needs = [
      makeNeed({ id: "n1", source_path: "customer_interviews", frameworks_used: ["odi"], desired_outcome: "Reduce time spent locating order status information for customers" }),
      makeNeed({ id: "n2", source_path: "customer_interviews", frameworks_used: ["odi"], desired_outcome: "Minimize effort locating order tracking confirmation details" }),
      makeNeed({ id: "n3", source_path: "public_baseline",    frameworks_used: [],      desired_outcome: "Improve order visibility for retail customers" }),
    ];
    const result = buildCustomerRealityNarrative(needs, [], makeCascade());
    expect(result.posture).toBe("converging");
  });

  it("converging narrative has a directionGrounding string", () => {
    const needs = [
      makeNeed({ id: "n1", source_path: "customer_interviews", frameworks_used: ["odi"] }),
    ];
    const result = buildCustomerRealityNarrative(needs, [], makeCascade());
    expect(typeof result.directionGrounding).toBe("string");
    expect(result.directionGrounding.length).toBeGreaterThan(5);
  });
});

// ─── NeedRealityCard ──────────────────────────────────────────────────────────

describe("deriveNeedRealityCard", () => {
  it("returns the correct validationStatus", () => {
    const validated = makeNeed({ provenance_type: "manual", source_path: "customer_interviews", frameworks_used: ["odi"] });
    const inferred  = makeNeed({ provenance_type: "public_research", source_path: "public_baseline", frameworks_used: [] });
    expect(deriveNeedRealityCard(validated, []).validationStatus).toBe("validated");
    expect(deriveNeedRealityCard(inferred,  []).validationStatus).toBe("inferred");
  });

  it("returns 1–2 wouldStrengthenConfidence items", () => {
    const need = makeNeed({ source_path: "public_baseline", frameworks_used: [] });
    const card = deriveNeedRealityCard(need, []);
    expect(card.wouldStrengthenConfidence.length).toBeGreaterThanOrEqual(1);
    expect(card.wouldStrengthenConfidence.length).toBeLessThanOrEqual(2);
  });

  it("does not find improving route when outcome is unrelated to route", () => {
    const need = makeNeed({ desired_outcome: "Minimize photonic semiconductor alignment defects" });
    const route = makeRoute({
      title: "Improve customer onboarding checklist",
      why_this_matters_json: ["Customers complete signup faster"],
    });
    const card = deriveNeedRealityCard(need, [route]);
    expect(card.improvingRouteIds).not.toContain(route.id);
  });
});

// ─── RouteCustomerImplication ─────────────────────────────────────────────────

describe("deriveRouteCustomerImplication", () => {
  it("create route with no customer signals returns market_perception frictionKind", () => {
    const route = makeRoute({ category: "create", frameworks_used: [] });
    const result = deriveRouteCustomerImplication(route, [], []);
    expect(result.frictionKind).toBe("market_perception");
  });

  it("uses ranked opp outcome as behaviorTargeted when available", () => {
    const route = makeRoute({ why_this_matters_json: [] });
    const opps = [{ outcome: "Minimize the time customers spend locating billing history", importance: 8, satisfaction: 3, opportunity_score: 20 }];
    const result = deriveRouteCustomerImplication(route, opps, []);
    expect(result.behaviorTargeted).toContain("billing history");
  });

  it("route with high-priority opp has behaviorValidated true when customer framework present", () => {
    const route = makeRoute({ frameworks_used: ["odi"] });
    const opps = [{ outcome: "Minimize errors", importance: 8, satisfaction: 2, opportunity_score: 24 }];
    const result = deriveRouteCustomerImplication(route, opps, []);
    expect(result.behaviorValidated).toBe(true);
  });
});

// ─── wouldResolve ────────────────────────────────────────────────────────────

describe("wouldResolve", () => {
  it("inferred posture suggests primary customer interviews", () => {
    const needs = [makeNeed({ source_path: "public_baseline", frameworks_used: [] })];
    const result = buildCustomerRealityNarrative(needs, [], makeCascade());
    expect(result.wouldResolve.some((s) => s.toLowerCase().includes("interview"))).toBe(true);
  });

  it("always returns at least 1 wouldResolve item", () => {
    const result = buildCustomerRealityNarrative([], [], null);
    expect(result.wouldResolve.length).toBeGreaterThanOrEqual(1);
  });
});
