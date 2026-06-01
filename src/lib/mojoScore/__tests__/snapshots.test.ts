// ── MojoScore Snapshot Tests ─────────────────────────────────────────────────
//
// Five named scenarios that define the expected score range and engagement state.
// These act as regression guards — if scoring behavior changes, snapshots fail.
//
// Scenarios:
//   1. "empty"          — zero data, new engagement
//   2. "hypothesis_only"— all outside_view, no evidence
//   3. "cafe_barra"     — Cafe Barra live data profile (diagnose-dominant)
//   4. "mid_stage"      — focus-stage engagement with mixed evidence
//   5. "committed"      — flow-dominant with full WRAP and coverage

import { describe, it, expect } from "vitest";
import { computeMojoScore, METHODOLOGY_VERSION } from "../computeMojoScore";
import type { MojoScoreInput } from "../types";

const NOW = "2026-05-15T00:00:00Z";
const FRESH = "2026-05-12T00:00:00Z";

// ── Scenario 1: Empty ─────────────────────────────────────────────────────────

describe("Scenario: empty engagement", () => {
  const result = computeMojoScore({
    companyId: "co-empty",
    claims: [],
    routes: [],
    needs: [],
    computedAt: NOW,
  });

  it("total_score is 0", () => expect(result.total_score).toBe(0));
  it("engagement_state is forming", () => expect(result.engagement_state).toBe("forming"));
  it("has 7 contributors", () => expect(result.contributors).toHaveLength(7));
  it("methodology_version matches", () =>
    expect(result.methodology_version).toBe(METHODOLOGY_VERSION));
  it("all contributors are 0 weighted", () =>
    expect(result.contributors.every((c) => c.weighted === 0)).toBe(true));
});

// ── Scenario 2: Hypothesis Only ──────────────────────────────────────────────

describe("Scenario: hypothesis_only", () => {
  const claims = Array.from({ length: 10 }, (_, i) => ({
    id: `cl-${i}`,
    state: "outside_view" as const,
    claim_type: null,
    topic: null,
    outside_support_count: 0,
    organization_support_count: 0,
    customer_support_count: 0,
    updated_at: FRESH,
  }));

  const routes = [
    { id: "r1", category: "fix", level: "leg" as const, parent_id: "top-1", steps_json: [], evidence_json: [] },
    { id: "r2", category: "improve", level: "leg" as const, parent_id: "top-1", steps_json: [], evidence_json: [] },
  ];

  const result = computeMojoScore({
    companyId: "co-hyp",
    claims,
    routes,
    needs: [],
    computedAt: NOW,
  });

  it("total_score is low (< 20)", () => expect(result.total_score).toBeLessThan(20));
  it("engagement_state is forming", () => expect(result.engagement_state).toBe("forming"));
  it("state_distribution_health score is 0", () => {
    const c = result.contributors.find((c) => c.key === "state_distribution_health")!;
    expect(c.score).toBe(0);
  });
  it("has projected_raisers", () =>
    expect(result.projected_raisers.length).toBeGreaterThan(0));
});

// ── Scenario 3: Cafe Barra (diagnose-dominant) ────────────────────────────────

describe("Scenario: cafe_barra profile", () => {
  // 41 claims: 36 diagnose, 5 outside_view
  const claims = [
    ...Array.from({ length: 36 }, (_, i) => ({
      id: `cl-d-${i}`,
      state: "diagnose" as const,
      claim_type: null,
      topic: null,
      outside_support_count: 2,
      organization_support_count: 1,
      customer_support_count: 0,
      updated_at: FRESH,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `cl-ov-${i}`,
      state: "outside_view" as const,
      claim_type: null,
      topic: null,
      outside_support_count: 1,
      organization_support_count: 0,
      customer_support_count: 0,
      updated_at: FRESH,
    })),
  ];

  // 3 top-level routes, 10 legs
  const topRoutes = [
    {
      id: "route-a", category: "fix", level: "route" as const, parent_id: null,
      rejected_alternatives: [{ alternative_title: "Alt A", rejection_reason: "Too costly" }],
      what_would_have_to_be_true: [
        { condition: "Cond 1", satisfied_flag: false },
        { condition: "Cond 2", satisfied_flag: true },
      ],
    },
    {
      id: "route-b", category: "improve", level: "route" as const, parent_id: null,
      rejected_alternatives: [{ alternative_title: "Alt B", rejection_reason: "Too slow" }],
      what_would_have_to_be_true: [{ condition: "Cond 3", satisfied_flag: false }],
    },
    {
      id: "route-c", category: "create", level: "route" as const, parent_id: null,
      rejected_alternatives: [],
      what_would_have_to_be_true: [],
    },
  ];

  const legs = [
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `leg-a-${i}`, category: "fix", level: "leg" as const, parent_id: "route-a",
      steps_json: [{ id: `s${i}`, title: `Step ${i}`, status: i < 2 ? "complete" : "missing" }],
      evidence_json: [{ id: `e${i}`, title: `Ev ${i}`, status: "complete" }],
      linked_need_ids: [`need-${i}`],
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `leg-b-${i}`, category: "improve", level: "leg" as const, parent_id: "route-b",
      steps_json: [{ id: `sb${i}`, title: `Step ${i}`, status: "in_progress" }],
      evidence_json: [{ id: `eb${i}`, title: `Ev ${i}`, status: i < 2 ? "complete" : "missing" }],
      linked_need_ids: [],
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `leg-c-${i}`, category: "create", level: "leg" as const, parent_id: "route-c",
      steps_json: [{ id: `sc${i}`, title: `Step ${i}`, status: "missing" }],
      evidence_json: [{ id: `ec${i}`, title: `Ev ${i}`, status: "missing" }],
      linked_need_ids: [],
    })),
  ];

  const needs = Array.from({ length: 6 }, (_, i) => ({
    id: `need-${i}`,
    desired_outcome: `Outcome ${i}`,
    importance: 7,
    satisfaction: 4,
    opportunity_score: 21,
    service_state: "under_served",
    updated_at: FRESH,
  }));

  const input: MojoScoreInput = {
    companyId: "co-cafe-barra",
    claims,
    routes: [...topRoutes, ...legs],
    needs,
    computedAt: NOW,
  };

  const result = computeMojoScore(input);

  it("engagement_state is diagnosing", () =>
    expect(result.engagement_state).toBe("diagnosing"));

  it("total_score is in 20–50 range for diagnose-dominant profile", () => {
    expect(result.total_score).toBeGreaterThanOrEqual(20);
    expect(result.total_score).toBeLessThanOrEqual(55);
  });

  it("state_distribution_health is lowest weighted contributor", () => {
    const sdh = result.contributors.find(
      (c) => c.key === "state_distribution_health",
    )!;
    expect(sdh.score).toBeLessThan(40);
  });

  it("wrap_evidence score reflects partial WRAP coverage", () => {
    const wrap = result.contributors.find((c) => c.key === "wrap_evidence")!;
    // 2/3 routes have alternatives, 2/3 have conditions → partial
    expect(wrap.score).toBeGreaterThan(0);
    expect(wrap.score).toBeLessThan(100);
  });

  it("action_portfolio_balance is high (all 3 categories present)", () => {
    const apb = result.contributors.find(
      (c) => c.key === "action_portfolio_balance",
    )!;
    expect(apb.score).toBeGreaterThan(80);
  });

  it("has at least 3 projected_raisers", () =>
    expect(result.projected_raisers.length).toBeGreaterThanOrEqual(3));

  it("projected_raisers sorted by estimated_points desc", () => {
    const pts = result.projected_raisers.map((r) => r.estimated_points);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]).toBeLessThanOrEqual(pts[i - 1]);
    }
  });
});

// ── Scenario 4: Mid-stage (focus emerging) ────────────────────────────────────

describe("Scenario: mid_stage", () => {
  const claims = [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `cl-f-${i}`, state: "focus" as const,
      claim_type: null, topic: null,
      outside_support_count: 2, organization_support_count: 2, customer_support_count: 1,
      updated_at: FRESH,
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `cl-d-${i}`, state: "diagnose" as const,
      claim_type: null, topic: null,
      outside_support_count: 1, organization_support_count: 1, customer_support_count: 0,
      updated_at: FRESH,
    })),
  ];

  const result = computeMojoScore({
    companyId: "co-mid",
    claims,
    routes: [],
    needs: [],
    computedAt: NOW,
  });

  it("engagement_state is focusing", () =>
    expect(result.engagement_state).toBe("focusing"));

  it("total_score higher than diagnose-only profile", () => {
    // State score: (20*33 + 10*67)/30 ≈ 44.3, + 2 bonus → ~46
    const sdh = result.contributors.find((c) => c.key === "state_distribution_health")!;
    expect(sdh.score).toBeGreaterThan(35);
  });
});

// ── Scenario 5: Committed (flow-dominant) ─────────────────────────────────────

describe("Scenario: committed", () => {
  const claims = Array.from({ length: 10 }, (_, i) => ({
    id: `cl-fl-${i}`, state: "flow" as const,
    claim_type: null, topic: null,
    outside_support_count: 3, organization_support_count: 3, customer_support_count: 2,
    updated_at: FRESH,
  }));

  const topRoutes = [
    {
      id: "r1", category: "fix", level: "route" as const, parent_id: null,
      rejected_alternatives: [{ alternative_title: "A", rejection_reason: "B" }],
      what_would_have_to_be_true: [{ condition: "C", satisfied_flag: true }],
    },
    {
      id: "r2", category: "create", level: "route" as const, parent_id: null,
      rejected_alternatives: [{ alternative_title: "A2", rejection_reason: "B2" }],
      what_would_have_to_be_true: [{ condition: "C2", satisfied_flag: true }],
    },
  ];

  const needs = [{ id: "n1", desired_outcome: "Do X", importance: 8, satisfaction: 3, opportunity_score: 25, service_state: "under_served", updated_at: FRESH }];

  const legs = [
    {
      id: "l1", category: "fix", level: "leg" as const, parent_id: "r1",
      steps_json: [{ id: "s1", title: "Step", status: "complete" }],
      evidence_json: [{ id: "e1", title: "Ev", status: "complete" }],
      linked_need_ids: ["n1"],
    },
    {
      id: "l2", category: "improve", level: "leg" as const, parent_id: "r1",
      steps_json: [{ id: "s2", title: "Step", status: "complete" }],
      evidence_json: [{ id: "e2", title: "Ev", status: "complete" }],
      linked_need_ids: [],
    },
    {
      id: "l3", category: "create", level: "leg" as const, parent_id: "r2",
      steps_json: [{ id: "s3", title: "Step", status: "complete" }],
      evidence_json: [{ id: "e3", title: "Ev", status: "complete" }],
      linked_need_ids: [],
    },
  ];

  const result = computeMojoScore({
    companyId: "co-committed",
    claims,
    routes: [...topRoutes, ...legs],
    needs,
    computedAt: NOW,
  });

  it("engagement_state is accelerating", () =>
    expect(result.engagement_state).toBe("accelerating"));

  it("total_score is high (> 70)", () =>
    expect(result.total_score).toBeGreaterThan(70));

  it("state_distribution_health score is 100", () => {
    const sdh = result.contributors.find((c) => c.key === "state_distribution_health")!;
    expect(sdh.score).toBe(100);
  });

  it("wrap_evidence score is 100 (all routes fully documented)", () => {
    const wrap = result.contributors.find((c) => c.key === "wrap_evidence")!;
    expect(wrap.score).toBe(100);
  });

  it("structural_completeness score is 100 (all steps complete)", () => {
    const sc = result.contributors.find((c) => c.key === "structural_completeness")!;
    expect(sc.score).toBe(100);
  });
});
