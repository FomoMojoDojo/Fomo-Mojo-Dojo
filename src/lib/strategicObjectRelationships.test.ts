import { describe, expect, it } from "vitest";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { OdiNeedRow } from "@/hooks/useOdiNeeds";
import type { StrategyCascade } from "@/lib/types";
import {
  deduplicateRelationships,
  deriveDirectionRealizesRoutes,
  deriveNeedServedByRoutes,
  deriveRouteAlignsWithDirection,
  filterByMinStrength,
  type DerivedRelationship,
} from "./strategicObjectRelationships";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeRoute(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id:                    "route-1",
    company_id:            "company-1",
    category:              "fix",
    title:                 "Default route title",
    short_description:     null,
    frameworks_used:       ["odi"],
    pts_value:             5,
    effort:                "medium",
    type:                  "Fix",
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

function makeNeed(overrides: Partial<OdiNeedRow> = {}): OdiNeedRow {
  return {
    id:                      "need-1",
    company_id:              "company-1",
    tier:                    "need",
    desired_outcome:         "Default desired outcome",
    journey_key:             "customer",
    step_number:             1,
    step_label:              "Core job",
    importance:              7,
    satisfaction:            4,
    opportunity_score:       21,
    sort_order:              1,
    service_state:           "underserved",
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

function makeCascade(overrides: Partial<StrategyCascade> = {}): StrategyCascade {
  return {
    winning_aspiration: "Default winning aspiration",
    where_to_play:      "Default market",
    how_to_win:         "Default how to win",
    capabilities:       [],
    management_systems: [],
    assumptions:        [],
    ...overrides,
  };
}

// ─── deriveNeedServedByRoutes ───────────────────────────────────────────────────

describe("deriveNeedServedByRoutes", () => {
  it("rates exact outcome match in evidence_json as high", () => {
    const outcome = "Minimize the time customers spend locating their billing history";
    const need = makeNeed({ desired_outcome: outcome });
    const route = makeRoute({
      evidence_json: [{ id: "ev-1", title: outcome, status: "complete" }],
    });

    const rels = deriveNeedServedByRoutes(need, [route]);

    expect(rels).toHaveLength(1);
    expect(rels[0].strength).toBe("high");
    expect(rels[0].state).toBe("active");
    expect(rels[0].type).toBe("served_by");
    expect(rels[0].evidenceRefs).toContain("ev-1");
  });

  it("rates exact outcome match in why_this_matters_json as high", () => {
    const outcome = "Reduce manual reconciliation effort for billing teams";
    const need = makeNeed({ desired_outcome: outcome });
    const route = makeRoute({ why_this_matters_json: [outcome] });

    const rels = deriveNeedServedByRoutes(need, [route]);

    expect(rels).toHaveLength(1);
    expect(rels[0].strength).toBe("high");
    expect(rels[0].state).toBe("active");
  });

  it("rates meaningful token overlap as medium", () => {
    // Need: "Identify and remove barriers that slow decision velocity"
    // Route: "Eliminate velocity bottlenecks in the decision process"
    // Shared tokens after stopwords: velocity, decision (= 2/5 = 0.40 ≥ 0.25)
    const need = makeNeed({
      desired_outcome: "Identify and remove barriers that slow decision velocity",
    });
    const route = makeRoute({
      title: "Eliminate velocity bottlenecks in the decision process",
    });

    const rels = deriveNeedServedByRoutes(need, [route]);

    expect(rels).toHaveLength(1);
    expect(rels[0].strength).toBe("medium");
    expect(rels[0].state).toBe("inferred");
    expect(rels[0].displayLabel).toBe("May serve this need");
  });

  it("does not include routes with no meaningful overlap in high or medium", () => {
    // Need about billing; route about go-to-market positioning — unrelated
    const need = makeNeed({
      desired_outcome: "Reduce billing errors in monthly reconciliation cycles",
    });
    const route = makeRoute({
      title:                 "Strengthen positioning for enterprise segments",
      why_this_matters_json: ["Brand differentiation drives premium pricing."],
    });

    const rels = deriveNeedServedByRoutes(need, [route]);
    const primary = rels.filter((r) => r.strength === "high" || r.strength === "medium");

    expect(primary).toHaveLength(0);
  });

  it("returns empty array when no routes match at any threshold", () => {
    const need = makeNeed({ desired_outcome: "Validate assumptions with customers" });
    const rels = deriveNeedServedByRoutes(need, []);
    expect(rels).toHaveLength(0);
  });
});

// ─── deriveDirectionRealizesRoutes ─────────────────────────────────────────────

describe("deriveDirectionRealizesRoutes", () => {
  it("rates strategy_cascade framework as high", () => {
    const cascade = makeCascade();
    const route = makeRoute({ frameworks_used: ["strategy_cascade"] });

    const rels = deriveDirectionRealizesRoutes(cascade, "company-1", [route]);

    expect(rels).toHaveLength(1);
    expect(rels[0].strength).toBe("high");
    expect(rels[0].state).toBe("active");
    expect(rels[0].type).toBe("realizes");
    expect(rels[0].displayLabel).toBe("Generated from your strategic direction");
  });

  it("rates strategy_cascade case-insensitively", () => {
    const cascade = makeCascade();
    const route = makeRoute({ frameworks_used: ["Strategy_Cascade"] });
    const rels = deriveDirectionRealizesRoutes(cascade, "company-1", [route]);
    expect(rels[0].strength).toBe("high");
  });

  it("rates theme overlap between route text and direction narrative as medium", () => {
    // Route tokens: build, reliable, execution, processes, scale
    // Direction tokens include: execution (from how_to_win)
    // Shared: execution = 1 / min(5,N) → need at least 0.20 coverage
    // Direction how_to_win also has "speed": route uses "reliable" not "speed"
    // Let's engineer overlap ≥ 0.20:
    // Route: "Drive execution speed and reliable delivery at scale"
    // Tokens: drive, execution, speed, reliable, delivery, scale (6)
    // Direction how_to_win: "Win through execution speed and delivery reliability"
    // Tokens: win, execution, speed, delivery, reliability (5, through=stopword)
    // Shared: execution, speed, delivery = 3 → coverage = 3/min(6,5) = 3/5 = 0.60
    const cascade = makeCascade({
      winning_aspiration: "Become the reliable platform for enterprise",
      where_to_play:      "Enterprise software",
      how_to_win:         "Win through execution speed and delivery reliability",
    });
    const route = makeRoute({
      title:                 "Drive execution speed and reliable delivery at scale",
      frameworks_used:       ["odi"],
      why_this_matters_json: [],
    });

    const rels = deriveDirectionRealizesRoutes(cascade, "company-1", [route]);

    expect(rels).toHaveLength(1);
    expect(rels[0].strength).toBe("medium");
    expect(rels[0].displayLabel).toBe("Aligned with strategic direction");
  });

  it("emits no relationship for routes with no direction alignment", () => {
    const cascade = makeCascade({
      winning_aspiration: "Win through execution speed and reliability",
      where_to_play:      "Enterprise software",
      how_to_win:         "Excel through fast iteration",
    });
    const route = makeRoute({
      title:                 "Redesign invoice template for new brand guidelines",
      why_this_matters_json: ["Brand consistency matters for trust."],
      frameworks_used:       ["public_research"],
    });

    const rels = deriveDirectionRealizesRoutes(cascade, "company-1", [route]);
    expect(rels).toHaveLength(0);
  });

  it("handles empty routes list", () => {
    const cascade = makeCascade();
    const rels = deriveDirectionRealizesRoutes(cascade, "company-1", []);
    expect(rels).toHaveLength(0);
  });
});

// ─── deriveRouteAlignsWithDirection ─────────────────────────────────────────────

describe("deriveRouteAlignsWithDirection", () => {
  it("returns high for strategy_cascade routes", () => {
    const route = makeRoute({ frameworks_used: ["strategy_cascade"] });
    const cascade = makeCascade();

    const rel = deriveRouteAlignsWithDirection(route, cascade, "company-1");

    expect(rel).not.toBeNull();
    expect(rel!.strength).toBe("high");
    expect(rel!.type).toBe("aligns_with");
    expect(rel!.toId).toBe("company-1");
  });

  it("returns null when cascade is null", () => {
    const route = makeRoute({ frameworks_used: ["strategy_cascade"] });
    const rel = deriveRouteAlignsWithDirection(route, null, "company-1");
    expect(rel).toBeNull();
  });

  it("returns null when no alignment signal exists", () => {
    const cascade = makeCascade({
      winning_aspiration: "Win through execution speed",
      where_to_play:      "Enterprise software",
      how_to_win:         "Fast delivery",
    });
    const route = makeRoute({
      title:           "Redesign invoice templates for brand refresh",
      frameworks_used: ["public_research"],
    });

    const rel = deriveRouteAlignsWithDirection(route, cascade, "company-1");
    // coverageScore should be below DIR_ROUTE_LOW (0.10) → null
    expect(rel).toBeNull();
  });
});

// ─── Relationship state ─────────────────────────────────────────────────────────

describe("relationship state derivation", () => {
  it("preserves stale state when route dependency_state is stale", () => {
    const outcome = "Reduce onboarding steps for new users";
    const need  = makeNeed({ desired_outcome: outcome });
    const route = makeRoute({
      evidence_json:    [{ id: "ev-1", title: outcome, status: "complete" }],
      dependency_state: "stale",
    });

    const rels = deriveNeedServedByRoutes(need, [route]);

    expect(rels[0].state).toBe("stale");
  });

  it("preserves contradicted state when route dependency_state is contradicted", () => {
    const outcome = "Minimize friction during account setup";
    const need  = makeNeed({ desired_outcome: outcome });
    const route = makeRoute({
      why_this_matters_json: [outcome],
      dependency_state:      "contradicted",
    });

    const rels = deriveNeedServedByRoutes(need, [route]);

    expect(rels[0].state).toBe("contradicted");
  });

  it("marks inference-derived relationships as inferred", () => {
    const need = makeNeed({
      desired_outcome: "Identify and remove barriers that slow decision velocity",
    });
    const route = makeRoute({
      title:            "Eliminate velocity bottlenecks in the decision process",
      dependency_state: null,
    });

    const rels = deriveNeedServedByRoutes(need, [route]);

    expect(rels[0].state).toBe("inferred");
  });
});

// ─── deduplicateRelationships ───────────────────────────────────────────────────

describe("deduplicateRelationships", () => {
  it("removes duplicate relationships, keeping the higher-strength entry", () => {
    const base: DerivedRelationship = {
      fromId:       "need-1",
      fromKind:     "customer_need",
      toId:         "route-1",
      toKind:       "strategic_route",
      type:         "served_by",
      strength:     "medium",
      state:        "inferred",
      reason:       "overlap",
      displayLabel: "May serve",
    };
    const higher: DerivedRelationship = {
      ...base,
      strength:     "high",
      reason:       "exact match",
      displayLabel: "Clearly serves",
    };

    const result = deduplicateRelationships([base, higher]);

    expect(result).toHaveLength(1);
    expect(result[0].strength).toBe("high");
    expect(result[0].reason).toBe("exact match");
  });

  it("keeps distinct relationships with different toIds", () => {
    const rel1: DerivedRelationship = {
      fromId: "need-1", fromKind: "customer_need",
      toId: "route-1", toKind: "strategic_route",
      type: "served_by", strength: "high", state: "active",
      reason: "exact", displayLabel: "Clearly serves",
    };
    const rel2: DerivedRelationship = {
      ...rel1,
      toId: "route-2",
    };

    const result = deduplicateRelationships([rel1, rel2]);
    expect(result).toHaveLength(2);
  });

  it("handles empty input", () => {
    expect(deduplicateRelationships([])).toHaveLength(0);
  });
});

// ─── filterByMinStrength ────────────────────────────────────────────────────────

describe("filterByMinStrength", () => {
  const rels: DerivedRelationship[] = [
    {
      fromId: "a", fromKind: "customer_need",
      toId: "b", toKind: "strategic_route",
      type: "served_by", strength: "high", state: "active",
      reason: "", displayLabel: "",
    },
    {
      fromId: "a", fromKind: "customer_need",
      toId: "c", toKind: "strategic_route",
      type: "served_by", strength: "medium", state: "inferred",
      reason: "", displayLabel: "",
    },
    {
      fromId: "a", fromKind: "customer_need",
      toId: "d", toKind: "strategic_route",
      type: "served_by", strength: "low", state: "inferred",
      reason: "", displayLabel: "",
    },
  ];

  it("returns high and medium when min is medium", () => {
    const filtered = filterByMinStrength(rels, "medium");
    expect(filtered).toHaveLength(2);
    expect(filtered.every((r) => r.strength !== "low")).toBe(true);
  });

  it("returns only high when min is high", () => {
    const filtered = filterByMinStrength(rels, "high");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].strength).toBe("high");
  });

  it("returns all when min is low", () => {
    const filtered = filterByMinStrength(rels, "low");
    expect(filtered).toHaveLength(3);
  });
});
