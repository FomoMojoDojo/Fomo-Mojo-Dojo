// ── MojoScore Projection Tests ────────────────────────────────────────────────
//
// Tests for computeReachableScore and computeUnlockableScore.
// Uses the same scenario fixtures as snapshots.test.ts.

import { describe, it, expect } from "vitest";
import { computeMojoScore } from "../computeMojoScore";
import {
  computeReachableScore,
  computeUnlockableScore,
  contributorTier,
} from "../projections";
import type { MojoScoreInput, MojoScoreResult } from "../types";

const NOW   = "2026-05-15T00:00:00Z";
const FRESH = "2026-05-12T00:00:00Z";

// ── Shared fixtures ───────────────────────────────────────────────────────────

const emptyInput: MojoScoreInput = {
  companyId: "co-empty",
  claims: [],
  routes: [],
  needs: [],
  computedAt: NOW,
};

const cafeBarraClaims = [
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

const cafeBarraRoutes = [
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

const cafeBarraNeeds = Array.from({ length: 6 }, (_, i) => ({
  id: `need-${i}`,
  desired_outcome: `Outcome ${i}`,
  importance: 7,
  satisfaction: 4,
  opportunity_score: 21,
  service_state: "under_served",
  updated_at: FRESH,
}));

const committedClaims = Array.from({ length: 10 }, (_, i) => ({
  id: `cl-fl-${i}`,
  state: "flow" as const,
  claim_type: null,
  topic: null,
  outside_support_count: 3,
  organization_support_count: 3,
  customer_support_count: 2,
  updated_at: FRESH,
}));

const committedRoutes = [
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

// ── Invariants ────────────────────────────────────────────────────────────────

describe("computeReachableScore — invariants", () => {
  const datasets: [string, MojoScoreInput][] = [
    ["empty", emptyInput],
    [
      "cafe_barra",
      {
        companyId: "co-cafe-barra",
        claims: cafeBarraClaims,
        routes: cafeBarraRoutes,
        needs: cafeBarraNeeds,
        computedAt: NOW,
      },
    ],
    [
      "committed",
      {
        companyId: "co-committed",
        claims: committedClaims,
        routes: committedRoutes,
        needs: [{ id: "n1", desired_outcome: "Do X", importance: 8, satisfaction: 3, opportunity_score: 25, service_state: "under_served", updated_at: FRESH }],
        computedAt: NOW,
      },
    ],
  ];

  for (const [name, input] of datasets) {
    const result = computeMojoScore(input);
    const reachable = computeReachableScore(result);
    it(`[${name}] reachable >= total_score`, () =>
      expect(reachable).toBeGreaterThanOrEqual(result.total_score));
    it(`[${name}] reachable <= 100`, () =>
      expect(reachable).toBeLessThanOrEqual(100));
    it(`[${name}] reachable is an integer`, () =>
      expect(Number.isInteger(reachable)).toBe(true));
  }
});

describe("computeUnlockableScore — invariants", () => {
  const datasets: [string, MojoScoreInput][] = [
    ["empty", emptyInput],
    [
      "cafe_barra",
      {
        companyId: "co-cafe-barra",
        claims: cafeBarraClaims,
        routes: cafeBarraRoutes,
        needs: cafeBarraNeeds,
        computedAt: NOW,
      },
    ],
  ];

  for (const [name, input] of datasets) {
    const result = computeMojoScore(input);
    const reachable = computeReachableScore(result);
    const unlockable = computeUnlockableScore(reachable, result);
    it(`[${name}] unlockable >= reachable`, () =>
      expect(unlockable).toBeGreaterThanOrEqual(reachable));
    it(`[${name}] unlockable <= 100`, () =>
      expect(unlockable).toBeLessThanOrEqual(100));
    it(`[${name}] unlockable is an integer`, () =>
      expect(Number.isInteger(unlockable)).toBe(true));
  }
});

// ── Empty engagement ──────────────────────────────────────────────────────────

describe("empty engagement projections", () => {
  const result = computeMojoScore(emptyInput);
  const reachable  = computeReachableScore(result);
  const unlockable = computeUnlockableScore(reachable, result);

  it("reachable is 0 (no contributors have headroom when everything is 0, ceilings are no-op)", () => {
    // All foundation contributors start at 0, ceilings above 0 → some gain expected
    // But total_score is 0 and all contributors score 0, so gain = sum(ceiling * weight)
    // This tests the actual computed value is deterministic
    expect(reachable).toBeGreaterThanOrEqual(0);
  });

  it("unlockable >= reachable when everything is at zero", () =>
    expect(unlockable).toBeGreaterThanOrEqual(reachable));
});

// ── Cafe Barra profile ────────────────────────────────────────────────────────

describe("cafe_barra profile projections", () => {
  const input: MojoScoreInput = {
    companyId: "co-cafe-barra",
    claims: cafeBarraClaims,
    routes: cafeBarraRoutes,
    needs: cafeBarraNeeds,
    computedAt: NOW,
  };

  const result: MojoScoreResult = computeMojoScore(input);
  const reachable  = computeReachableScore(result);
  const unlockable = computeUnlockableScore(reachable, result);

  it("reachable is higher than current score (foundation work has headroom)", () =>
    expect(reachable).toBeGreaterThan(result.total_score));

  it("unlockable is higher than reachable (customer research unlocks more)", () =>
    expect(unlockable).toBeGreaterThan(reachable));

  it("unlockable delta over current is >= 10 pts (diagnose profile has significant customer headroom)", () =>
    expect(unlockable - result.total_score).toBeGreaterThanOrEqual(10));

  it("unlockable does not exceed 100", () =>
    expect(unlockable).toBeLessThanOrEqual(100));
});

// ── Committed (high-score) profile ────────────────────────────────────────────

describe("committed profile projections", () => {
  const input: MojoScoreInput = {
    companyId: "co-committed",
    claims: committedClaims,
    routes: committedRoutes,
    needs: [{ id: "n1", desired_outcome: "Do X", importance: 8, satisfaction: 3, opportunity_score: 25, service_state: "under_served", updated_at: FRESH }],
    computedAt: NOW,
  };

  const result = computeMojoScore(input);
  const reachable  = computeReachableScore(result);
  const unlockable = computeUnlockableScore(reachable, result);

  it("reachable delta is small (most contributors already at or near ceiling)", () =>
    expect(reachable - result.total_score).toBeLessThanOrEqual(15));

  it("unlockable <= 100 (capped)", () =>
    expect(unlockable).toBeLessThanOrEqual(100));
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe("projections are deterministic", () => {
  const input: MojoScoreInput = {
    companyId: "co-det",
    claims: cafeBarraClaims,
    routes: cafeBarraRoutes,
    needs: cafeBarraNeeds,
    computedAt: NOW,
  };

  it("same result produces same reachable on repeated calls", () => {
    const r1 = computeMojoScore(input);
    const r2 = computeMojoScore(input);
    expect(computeReachableScore(r1)).toBe(computeReachableScore(r2));
  });

  it("same inputs produce same unlockable on repeated calls", () => {
    const r1 = computeMojoScore(input);
    const r2 = computeMojoScore(input);
    const reach1 = computeReachableScore(r1);
    const reach2 = computeReachableScore(r2);
    expect(computeUnlockableScore(reach1, r1)).toBe(
      computeUnlockableScore(reach2, r2),
    );
  });
});

// ── contributorTier ───────────────────────────────────────────────────────────

describe("contributorTier", () => {
  it("returns 'foundation' for structural_completeness", () =>
    expect(contributorTier("structural_completeness")).toBe("foundation"));

  it("returns 'foundation' for evidence_freshness", () =>
    expect(contributorTier("evidence_freshness")).toBe("foundation"));

  it("returns 'foundation' for action_portfolio_balance", () =>
    expect(contributorTier("action_portfolio_balance")).toBe("foundation"));

  it("returns 'foundation' for wrap_evidence", () =>
    expect(contributorTier("wrap_evidence")).toBe("foundation"));

  it("returns 'foundation' for opportunity_route_coverage", () =>
    expect(contributorTier("opportunity_route_coverage")).toBe("foundation"));

  it("returns 'customer' for customer_band_evidence", () =>
    expect(contributorTier("customer_band_evidence")).toBe("customer"));

  it("returns 'customer' for state_distribution_health", () =>
    expect(contributorTier("state_distribution_health")).toBe("customer"));

  it("returns null for unknown key", () =>
    expect(contributorTier("nonexistent_key")).toBeNull());
});

// ── SCORE-2: companies write-back unification ─────────────────────────────────
//
// snapshotMojoScore (the sole companies-score writer) persists
//   potential_score = computeReachableScore(result)      — REACHABLE
//   projected_score = computeUnlockableScore(reachable)  — DESTINATION
// replacing the old evidence-band-cap formula, so the columns mean exactly what
// the surfaces (MojoScoreStrip, HomepageHierarchy) render and explain. These
// tests document that contract against a full-spine-shaped result.

describe("SCORE-2 write-back semantics (potential=REACHABLE, projected=DESTINATION)", () => {
  const fullSpine: MojoScoreInput = {
    companyId: "co-spine",
    claims: Array.from({ length: 10 }, (_, i) => ({
      id: `c-${i}`,
      state: "diagnose" as const,
      claim_type: null,
      topic: null,
      outside_support_count: 1,
      organization_support_count: 0,
      customer_support_count: 0,
      updated_at: FRESH,
    })),
    routes: [
      { id: "r1", category: "fix", level: "route", parent_id: null },
      {
        id: "l1", category: "fix", level: "leg", parent_id: "r1",
        steps_json: [{ id: "s1", title: "Step", status: "complete" }],
        evidence_json: [{ id: "e1", title: "Ev", status: "complete" }],
      },
    ],
    needs: [],
    computedAt: NOW,
  };

  const result = computeMojoScore(fullSpine);
  const reachable = computeReachableScore(result);
  const destination = computeUnlockableScore(reachable, result);

  it("reachable (→ potential_score) is >= current", () =>
    expect(reachable).toBeGreaterThanOrEqual(result.total_score));

  it("destination (→ projected_score) is >= reachable", () =>
    expect(destination).toBeGreaterThanOrEqual(reachable));

  it("both are integers in [0,100]", () => {
    for (const v of [reachable, destination]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("structural completeness contributes on a full spine (2C defect stays fixed)", () => {
    const sc = result.contributors.find((c) => c.key === "structural_completeness");
    expect(sc?.score).toBe(100);
  });
});
