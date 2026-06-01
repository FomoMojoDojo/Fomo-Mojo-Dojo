import { describe, it, expect } from "vitest";
import type { MojoScoreInput, ClaimInput, RouteInput, NeedInput } from "../types";
import { scoreStateDistributionHealth, deriveEngagementState } from "../contributors/stateDistributionHealth";
import { scoreCustomerBandEvidence } from "../contributors/customerBandEvidence";
import { scoreWrapEvidence } from "../contributors/wrapEvidence";
import { scoreActionPortfolioBalance } from "../contributors/actionPortfolioBalance";
import { scoreStructuralCompleteness } from "../contributors/structuralCompleteness";
import { scoreEvidenceFreshness } from "../contributors/evidenceFreshness";
import { scoreOpportunityRouteCoverage } from "../contributors/opportunityRouteCoverage";

const NOW = "2026-05-15T00:00:00Z";
const RECENT = "2026-05-10T00:00:00Z";   // 5 days ago → fresh
const STALE = "2025-10-01T00:00:00Z";    // 7+ months ago → stale

function claim(
  state: ClaimInput["state"],
  overrides: Partial<ClaimInput> = {},
): ClaimInput {
  return {
    id: Math.random().toString(36).slice(2),
    state,
    claim_type: null,
    topic: null,
    outside_support_count: 0,
    organization_support_count: 0,
    customer_support_count: 0,
    updated_at: RECENT,
    ...overrides,
  };
}

function leg(
  category: string,
  overrides: Partial<RouteInput> = {},
): RouteInput {
  return {
    id: Math.random().toString(36).slice(2),
    category,
    level: "leg",
    parent_id: "parent-1",
    steps_json: [],
    evidence_json: [],
    ...overrides,
  };
}

function topRoute(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    id: Math.random().toString(36).slice(2),
    category: "fix",
    level: "route",
    parent_id: null,
    ...overrides,
  };
}

function need(overrides: Partial<NeedInput> = {}): NeedInput {
  return {
    id: Math.random().toString(36).slice(2),
    desired_outcome: "Test outcome",
    importance: 7,
    satisfaction: 4,
    opportunity_score: 21,
    service_state: "under_served",
    updated_at: RECENT,
    ...overrides,
  };
}

function input(
  overrides: Partial<MojoScoreInput> = {},
): MojoScoreInput {
  return {
    companyId: "test-company",
    claims: [],
    routes: [],
    needs: [],
    computedAt: NOW,
    ...overrides,
  };
}

// ── stateDistributionHealth ────────────────────────────────────────────────────

describe("scoreStateDistributionHealth", () => {
  it("returns score 0 and correct key for empty claims", () => {
    const result = scoreStateDistributionHealth(input());
    expect(result.key).toBe("state_distribution_health");
    expect(result.score).toBe(0);
    expect(result.weight).toBe(0.30);
  });

  it("returns low score for all outside_view claims", () => {
    const result = scoreStateDistributionHealth(
      input({ claims: [claim("outside_view"), claim("outside_view"), claim("outside_view")] }),
    );
    expect(result.score).toBe(0);
    expect(result.weighted).toBe(0);
  });

  it("returns partial score for diagnose-dominant portfolio", () => {
    // 36 diagnose, 5 outside_view — Cafe Barra profile
    const claims = [
      ...Array.from({ length: 36 }, () => claim("diagnose")),
      ...Array.from({ length: 5 }, () => claim("outside_view")),
    ];
    const result = scoreStateDistributionHealth(input({ claims }));
    // base = (36*33)/41 ≈ 29.0, no momentum bonus → ~29
    expect(result.score).toBeGreaterThan(20);
    expect(result.score).toBeLessThan(45);
  });

  it("returns high score for flow-dominant portfolio", () => {
    const claims = Array.from({ length: 10 }, () => claim("flow"));
    const result = scoreStateDistributionHealth(input({ claims }));
    expect(result.score).toBe(100); // 100 * 10/10 + 5 bonus capped at 100
  });

  it("adds momentum bonus for any focus claim", () => {
    const allDiagnose = Array.from({ length: 10 }, () => claim("diagnose"));
    const withFocus = [...allDiagnose.slice(0, 9), claim("focus")];
    const baseResult = scoreStateDistributionHealth(input({ claims: allDiagnose }));
    const bonusResult = scoreStateDistributionHealth(input({ claims: withFocus }));
    expect(bonusResult.score).toBeGreaterThan(baseResult.score);
  });

  it("weight × score = weighted (rounded)", () => {
    const claims = Array.from({ length: 5 }, () => claim("diagnose"));
    const result = scoreStateDistributionHealth(input({ claims }));
    expect(result.weighted).toBeCloseTo(result.score * 0.30, 1);
  });

  it("explanation is ≤200 chars", () => {
    const claims = Array.from({ length: 20 }, () => claim("diagnose"));
    const result = scoreStateDistributionHealth(input({ claims }));
    expect(result.explanation.length).toBeLessThanOrEqual(200);
  });
});

describe("deriveEngagementState", () => {
  it("returns forming for empty claims", () => {
    expect(deriveEngagementState([])).toBe("forming");
  });

  it("returns forming for all outside_view", () => {
    expect(deriveEngagementState([claim("outside_view"), claim("outside_view")])).toBe("forming");
  });

  it("returns diagnosing when diagnose-or-above ≥ 50%", () => {
    const claims = [
      ...Array.from({ length: 6 }, () => claim("diagnose")),
      ...Array.from({ length: 4 }, () => claim("outside_view")),
    ];
    expect(deriveEngagementState(claims)).toBe("diagnosing");
  });

  it("returns focusing when focus+flow ≥ 10%", () => {
    const claims = [
      ...Array.from({ length: 2 }, () => claim("focus")),
      ...Array.from({ length: 8 }, () => claim("diagnose")),
    ];
    expect(deriveEngagementState(claims)).toBe("focusing");
  });

  it("returns accelerating when flow ≥ 60%", () => {
    const claims = [
      ...Array.from({ length: 7 }, () => claim("flow")),
      ...Array.from({ length: 3 }, () => claim("focus")),
    ];
    expect(deriveEngagementState(claims)).toBe("accelerating");
  });
});

// ── customerBandEvidence ───────────────────────────────────────────────────────

describe("scoreCustomerBandEvidence", () => {
  it("returns 0 score for empty routes", () => {
    expect(scoreCustomerBandEvidence(input()).score).toBe(0);
  });

  it("scores hypothesis_only for leg with no evidence", () => {
    const result = scoreCustomerBandEvidence(input({ routes: [leg("fix")] }));
    // Single leg, no evidence → hypothesis_only → score 0
    expect(result.score).toBe(0);
  });

  it("scores customer_evidenced for leg with supporting evidence and need link", () => {
    const testLeg = leg("fix", {
      evidence_json: [
        { id: "e1", title: "Evidence A", status: "complete" },
        { id: "e2", title: "Evidence B", status: "in_progress" },
      ],
      linked_need_ids: ["need-1"],
    });
    const result = scoreCustomerBandEvidence(input({ routes: [testLeg] }));
    expect(result.score).toBeGreaterThan(0);
  });

  it("excludes top-level route containers from scoring", () => {
    const routeContainer = topRoute();
    const legRoute = leg("fix", {
      evidence_json: [{ id: "e1", title: "Ev", status: "complete" }],
    });
    const resultBoth = scoreCustomerBandEvidence(
      input({ routes: [routeContainer, legRoute] }),
    );
    const resultLegOnly = scoreCustomerBandEvidence(
      input({ routes: [legRoute] }),
    );
    expect(resultBoth.score).toBe(resultLegOnly.score);
  });

  it("weight is 0.20", () => {
    expect(scoreCustomerBandEvidence(input({ routes: [leg("fix")] })).weight).toBe(0.20);
  });
});

// ── wrapEvidence ───────────────────────────────────────────────────────────────

describe("scoreWrapEvidence", () => {
  it("returns 0 score for no top-level routes", () => {
    expect(scoreWrapEvidence(input({ routes: [leg("fix")] })).score).toBe(0);
  });

  it("scores 40 for route with alternatives only", () => {
    const r = topRoute({
      rejected_alternatives: [{ alternative_title: "Alt A", rejection_reason: "Too slow" }],
    });
    expect(scoreWrapEvidence(input({ routes: [r] })).score).toBe(40);
  });

  it("scores 40 for route with conditions only (0 met)", () => {
    const r = topRoute({
      what_would_have_to_be_true: [{ condition: "Need X", satisfied_flag: false }],
    });
    expect(scoreWrapEvidence(input({ routes: [r] })).score).toBe(40);
  });

  it("scores 80 for route with both alternatives and conditions (0 met)", () => {
    const r = topRoute({
      rejected_alternatives: [{ alternative_title: "Alt A", rejection_reason: "Reason" }],
      what_would_have_to_be_true: [{ condition: "Cond A", satisfied_flag: false }],
    });
    expect(scoreWrapEvidence(input({ routes: [r] })).score).toBe(80);
  });

  it("scores 100 for route with both and all conditions met", () => {
    const r = topRoute({
      rejected_alternatives: [{ alternative_title: "Alt A", rejection_reason: "Reason" }],
      what_would_have_to_be_true: [{ condition: "Cond A", satisfied_flag: true }],
    });
    expect(scoreWrapEvidence(input({ routes: [r] })).score).toBe(100);
  });

  it("weight is 0.15", () => {
    expect(scoreWrapEvidence(input({ routes: [topRoute()] })).weight).toBe(0.15);
  });
});

// ── actionPortfolioBalance ────────────────────────────────────────────────────

describe("scoreActionPortfolioBalance", () => {
  it("returns 0 for no legs", () => {
    expect(scoreActionPortfolioBalance(input()).score).toBe(0);
  });

  it("returns lower score when all legs are the same category", () => {
    const routes = [leg("fix"), leg("fix"), leg("fix")];
    const result = scoreActionPortfolioBalance(input({ routes }));
    expect(result.score).toBeLessThan(50);
  });

  it("returns higher score when all three categories are present", () => {
    const routes = [leg("fix"), leg("improve"), leg("create")];
    const result = scoreActionPortfolioBalance(input({ routes }));
    expect(result.score).toBeGreaterThan(90);
  });

  it("weight is 0.10", () => {
    expect(scoreActionPortfolioBalance(input()).weight).toBe(0.10);
  });
});

// ── structuralCompleteness ────────────────────────────────────────────────────

describe("scoreStructuralCompleteness", () => {
  it("returns 0 for legs with no steps or evidence", () => {
    expect(scoreStructuralCompleteness(input({ routes: [leg("fix")] })).score).toBe(0);
  });

  it("scores 50 when all steps complete and no evidence", () => {
    const l = leg("fix", {
      steps_json: [
        { id: "s1", title: "Step 1", status: "complete" },
        { id: "s2", title: "Step 2", status: "complete" },
      ],
    });
    const result = scoreStructuralCompleteness(input({ routes: [l] }));
    expect(result.score).toBe(50);
  });

  it("scores 50 when all evidence non-missing and no steps", () => {
    const l = leg("fix", {
      evidence_json: [
        { id: "e1", title: "Ev 1", status: "complete" },
        { id: "e2", title: "Ev 2", status: "in_progress" },
      ],
    });
    const result = scoreStructuralCompleteness(input({ routes: [l] }));
    expect(result.score).toBe(50);
  });

  it("scores 100 when all steps complete and all evidence non-missing", () => {
    const l = leg("fix", {
      steps_json: [{ id: "s1", title: "Step", status: "complete" }],
      evidence_json: [{ id: "e1", title: "Ev", status: "complete" }],
    });
    const result = scoreStructuralCompleteness(input({ routes: [l] }));
    expect(result.score).toBe(100);
  });

  it("weight is 0.10", () => {
    expect(scoreStructuralCompleteness(input()).weight).toBe(0.10);
  });
});

// ── evidenceFreshness ─────────────────────────────────────────────────────────

describe("scoreEvidenceFreshness", () => {
  it("returns 0 for no items", () => {
    expect(scoreEvidenceFreshness(input()).score).toBe(0);
  });

  it("returns high score for recently updated claims", () => {
    const recentClaims = Array.from({ length: 5 }, () =>
      claim("diagnose", { updated_at: RECENT }),
    );
    const result = scoreEvidenceFreshness(input({ claims: recentClaims }));
    expect(result.score).toBe(100);
  });

  it("returns low score for stale claims", () => {
    const staleClaims = Array.from({ length: 5 }, () =>
      claim("diagnose", { updated_at: STALE }),
    );
    const result = scoreEvidenceFreshness(input({ claims: staleClaims }));
    expect(result.score).toBeLessThan(50);
  });

  it("returns 0 freshness for items with no updated_at", () => {
    const noClaims = [claim("diagnose", { updated_at: null })];
    const result = scoreEvidenceFreshness(input({ claims: noClaims }));
    expect(result.score).toBe(0);
  });

  it("weight is 0.10", () => {
    expect(scoreEvidenceFreshness(input()).weight).toBe(0.10);
  });
});

// ── opportunityRouteCoverage ──────────────────────────────────────────────────

describe("scoreOpportunityRouteCoverage", () => {
  it("returns 0 for no needs", () => {
    expect(scoreOpportunityRouteCoverage(input()).score).toBe(0);
  });

  it("returns 0 when needs exist but no routes link to them", () => {
    const result = scoreOpportunityRouteCoverage(
      input({ needs: [need()], routes: [leg("fix")] }),
    );
    expect(result.score).toBe(0);
  });

  it("returns 100 when all needs are linked", () => {
    const n = need({ id: "need-1" });
    const l = leg("fix", { linked_need_ids: ["need-1"] });
    const result = scoreOpportunityRouteCoverage(input({ needs: [n], routes: [l] }));
    expect(result.score).toBe(100); // 100% coverage + 5 bonus capped at 100
  });

  it("returns partial score for partial coverage", () => {
    const n1 = need({ id: "need-1" });
    const n2 = need({ id: "need-2" });
    const l = leg("fix", { linked_need_ids: ["need-1"] });
    const result = scoreOpportunityRouteCoverage(
      input({ needs: [n1, n2], routes: [l] }),
    );
    expect(result.score).toBe(50);
  });

  it("weight is 0.05", () => {
    expect(scoreOpportunityRouteCoverage(input()).weight).toBe(0.05);
  });
});
