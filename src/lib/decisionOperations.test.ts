import { describe, expect, it } from "vitest";
import {
  deriveDecisionLifecycleState,
  deriveCommitmentMaturity,
  deriveReviewPressure,
  buildDecisionOperationsContext,
  LIFECYCLE_LABELS,
  COMMITMENT_MATURITY_LABELS,
  type DecisionLifecycleState,
  type CommitmentMaturity,
} from "./decisionOperations";
import type { RouteRationale, RouteNarrativeConfidence, RouteMovement } from "./routeRationale";
import type { CommitmentState } from "./decisionSystem";
import type { DisciplineAssessment } from "./confidenceDiscipline";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeRationale(overrides: {
  confidenceLabel?: RouteNarrativeConfidence;
  movement?: RouteMovement;
  outside?: number;
  organization?: number;
  customer?: number;
  routeId?: string;
} = {}): RouteRationale {
  return {
    routeId: overrides.routeId ?? "r1",
    routeTitle: "Test Route",
    confidenceLabel: overrides.confidenceLabel ?? "Evidence is starting to converge",
    movement: overrides.movement ?? "strengthen",
    movementLabel: "Strengthening",
    readiness: "Validate",
    readinessMeaning: "Promising path. Needs validation before commitment.",
    whyThisRouteExists: "This route rises because operational gaps limit trust.",
    whatSupportsIt: "Internal and customer evidence are aligning.",
    uncertainty: "Customer proof is still missing.",
    mustBecomeTrue: "We need evidence that this changes customer decisions.",
    couldWeaken: "If buyers prioritize price over reliability, this route may weaken.",
    supportingEvidenceLines: [],
    weakeningEvidenceLines: [],
    relevanceScore: 5,
    matchedHypothesisIds: [],
    supportShape: {
      outside: overrides.outside ?? 0,
      organization: overrides.organization ?? 1,
      customer: overrides.customer ?? 0,
    },
    linkSource: "fallback_matched",
  };
}

function makeDiscipline(overrides: {
  escalationWithoutProof?: boolean;
  prematureCertainty?: boolean;
  falseConvergence?: boolean;
  immatureAmbiguity?: boolean;
} = {}): DisciplineAssessment {
  const flags = {
    prematureCertainty: overrides.prematureCertainty ?? false,
    falseConvergence: overrides.falseConvergence ?? false,
    escalationWithoutProof: overrides.escalationWithoutProof ?? false,
    immatureAmbiguity: overrides.immatureAmbiguity ?? false,
  };
  const active = Object.values(flags).some(Boolean);
  return {
    restraintFlags: flags,
    cooledRegister: "converging",
    active,
    coolPhrase: (p: string) => p,
    assertsTooMuch: () => false,
  };
}

// ─── deriveDecisionLifecycleState ─────────────────────────────────────────────

describe("deriveDecisionLifecycleState", () => {
  it("unwind → de-escalating", () => {
    expect(deriveDecisionLifecycleState("unwind", makeRationale())).toBe("de-escalating");
  });

  it("pause → stalled", () => {
    expect(deriveDecisionLifecycleState("pause", makeRationale())).toBe("stalled");
  });

  it("scale → committed", () => {
    expect(deriveDecisionLifecycleState("scale", makeRationale())).toBe("committed");
  });

  it("commit + contradicted → re-evaluating", () => {
    const r = makeRationale({ confidenceLabel: "Contradicted by recent evidence" });
    expect(deriveDecisionLifecycleState("commit", r)).toBe("re-evaluating");
  });

  it("commit + strengthen → advancing", () => {
    const r = makeRationale({ movement: "strengthen" });
    expect(deriveDecisionLifecycleState("commit", r)).toBe("advancing");
  });

  it("commit + narrow → committed (not advancing)", () => {
    const r = makeRationale({ movement: "narrow" });
    expect(deriveDecisionLifecycleState("commit", r)).toBe("committed");
  });

  it("validate + remain_unresolved → gated", () => {
    const r = makeRationale({ movement: "remain_unresolved" });
    expect(deriveDecisionLifecycleState("validate", r)).toBe("gated");
  });

  it("validate + split → gated", () => {
    const r = makeRationale({ movement: "split" });
    expect(deriveDecisionLifecycleState("validate", r)).toBe("gated");
  });

  it("validate + strengthen → validating", () => {
    const r = makeRationale({ movement: "strengthen" });
    expect(deriveDecisionLifecycleState("validate", r)).toBe("validating");
  });

  it("explore → exploring", () => {
    expect(deriveDecisionLifecycleState("explore", makeRationale())).toBe("exploring");
  });

  it("all states have labels", () => {
    const states: DecisionLifecycleState[] = [
      "exploring", "validating", "advancing", "committed",
      "gated", "stalled", "re-evaluating", "de-escalating",
    ];
    for (const state of states) {
      expect(LIFECYCLE_LABELS[state]).toBeTruthy();
    }
  });
});

// ─── deriveCommitmentMaturity ─────────────────────────────────────────────────

describe("deriveCommitmentMaturity", () => {
  it("scale → institutionally_committed", () => {
    expect(deriveCommitmentMaturity("scale", makeRationale())).toBe("institutionally_committed");
  });

  it("commit + customer > 0 → operationally_ready", () => {
    const r = makeRationale({ customer: 1 });
    expect(deriveCommitmentMaturity("commit", r)).toBe("operationally_ready");
  });

  it("commit + no customer → strategically_directional", () => {
    const r = makeRationale({ customer: 0, organization: 1 });
    expect(deriveCommitmentMaturity("commit", r)).toBe("strategically_directional");
  });

  it("validate + org signal → strategically_directional", () => {
    const r = makeRationale({ organization: 1 });
    expect(deriveCommitmentMaturity("validate", r)).toBe("strategically_directional");
  });

  it("explore + no org signal → intellectually_interesting", () => {
    const r = makeRationale({ outside: 1, organization: 0, customer: 0 });
    expect(deriveCommitmentMaturity("explore", r)).toBe("intellectually_interesting");
  });

  it("all maturities have labels", () => {
    const maturities: CommitmentMaturity[] = [
      "intellectually_interesting",
      "strategically_directional",
      "operationally_ready",
      "institutionally_committed",
    ];
    for (const m of maturities) {
      expect(COMMITMENT_MATURITY_LABELS[m]).toBeTruthy();
    }
  });
});

// ─── deriveReviewPressure ─────────────────────────────────────────────────────

describe("deriveReviewPressure", () => {
  it("re-evaluating → warranted with re-evaluation note", () => {
    const r = makeRationale({ confidenceLabel: "Contradicted by recent evidence" });
    const result = deriveReviewPressure("commit", "re-evaluating", r);
    expect(result.warranted).toBe(true);
    expect(result.note).toMatch(/re-evaluation warranted/i);
  });

  it("commit + no customer → warranted with commitment review note", () => {
    const r = makeRationale({ customer: 0 });
    const result = deriveReviewPressure("commit", "committed", r);
    expect(result.warranted).toBe(true);
    expect(result.note).toMatch(/commitment review overdue/i);
  });

  it("scale + no customer → warranted", () => {
    const r = makeRationale({ customer: 0 });
    const result = deriveReviewPressure("scale", "committed", r);
    expect(result.warranted).toBe(true);
  });

  it("commit + customer present → not warranted (no other flags)", () => {
    const r = makeRationale({ customer: 1 });
    const result = deriveReviewPressure("commit", "advancing", r);
    expect(result.warranted).toBe(false);
    expect(result.note).toBeNull();
  });

  it("discipline escalationWithoutProof → warranted with rising pressure note", () => {
    const r = makeRationale({ customer: 1 });
    const d = makeDiscipline({ escalationWithoutProof: true });
    const result = deriveReviewPressure("validate", "validating", r, d);
    expect(result.warranted).toBe(true);
    expect(result.note).toMatch(/commitment pressure rising/i);
  });

  it("gated → warranted with plateau note", () => {
    const r = makeRationale({ movement: "remain_unresolved" });
    const result = deriveReviewPressure("validate", "gated", r);
    expect(result.warranted).toBe(true);
    expect(result.note).toMatch(/validation has plateaued/i);
  });

  it("stalled + remain_unresolved → warranted with assumptions note", () => {
    const r = makeRationale({ movement: "remain_unresolved" });
    const result = deriveReviewPressure("pause", "stalled", r);
    expect(result.warranted).toBe(true);
    expect(result.note).toMatch(/assumptions remain unresolved/i);
  });

  it("stalled + non-unresolved movement → not warranted", () => {
    const r = makeRationale({ movement: "strengthen" });
    const result = deriveReviewPressure("pause", "stalled", r);
    expect(result.warranted).toBe(false);
  });

  it("exploring → not warranted", () => {
    const r = makeRationale();
    const result = deriveReviewPressure("explore", "exploring", r);
    expect(result.warranted).toBe(false);
    expect(result.note).toBeNull();
  });
});

// ─── buildDecisionOperationsContext ──────────────────────────────────────────

describe("buildDecisionOperationsContext", () => {
  it("empty portfolio → healthy governance, no signals", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [],
      rationales: [],
      portfolioState: "balanced",
    });
    expect(ctx.portfolioGovernanceState).toBe("healthy");
    expect(ctx.governanceSignals).toHaveLength(0);
    expect(ctx.drift.any).toBe(false);
  });

  it("missing rationale → exploring lifecycle, no review pressure", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [{ routeId: "r1", commitmentState: "commit" }],
      rationales: [],
      portfolioState: "balanced",
    });
    expect(ctx.routes[0].lifecycleState).toBe("exploring");
    expect(ctx.routes[0].reviewPressure.warranted).toBe(false);
  });

  it("all routes exploring + gated → perpetualExploration drift → stalled governance", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [
        { routeId: "r1", commitmentState: "explore" },
        { routeId: "r2", commitmentState: "validate" },
      ],
      rationales: [
        makeRationale({ routeId: "r1", movement: "strengthen" }),
        makeRationale({ routeId: "r2", movement: "remain_unresolved" }),
      ],
      portfolioState: "validation_heavy",
    });
    expect(ctx.drift.perpetualExploration).toBe(true);
    expect(ctx.portfolioGovernanceState).toBe("stalled");
    expect(ctx.governanceSignals.some((s) => /exploration continues/i.test(s))).toBe(true);
  });

  it("scaling_ahead portfolio → overextended governance", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [
        { routeId: "r1", commitmentState: "commit" },
        { routeId: "r2", commitmentState: "scale" },
      ],
      rationales: [
        makeRationale({ routeId: "r1", customer: 1 }),
        makeRationale({ routeId: "r2", customer: 1 }),
      ],
      portfolioState: "scaling_ahead",
    });
    expect(ctx.drift.overcommitted).toBe(true);
    expect(ctx.portfolioGovernanceState).toBe("overextended");
    expect(ctx.governanceSignals.some((s) => /commitment pressure rising/i.test(s))).toBe(true);
  });

  it("two gated routes → validationBottleneck → bottlenecked governance", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [
        { routeId: "r1", commitmentState: "validate" },
        { routeId: "r2", commitmentState: "validate" },
      ],
      rationales: [
        makeRationale({ routeId: "r1", movement: "remain_unresolved" }),
        makeRationale({ routeId: "r2", movement: "split" }),
      ],
      portfolioState: "validation_heavy",
    });
    expect(ctx.drift.validationBottleneck).toBe(true);
    expect(ctx.portfolioGovernanceState).toBe("bottlenecked");
    expect(ctx.governanceSignals.some((s) => /validation is the active bottleneck/i.test(s))).toBe(true);
  });

  it("committed routes with zero customer signal → driftingCommitment → drifting governance", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [
        { routeId: "r1", commitmentState: "commit" },
      ],
      rationales: [
        makeRationale({ routeId: "r1", movement: "strengthen", customer: 0 }),
      ],
      portfolioState: "converging",
    });
    expect(ctx.drift.driftingCommitment).toBe(true);
    expect(ctx.portfolioGovernanceState).toBe("drifting");
    expect(ctx.governanceSignals.some((s) => /no customer validation/i.test(s))).toBe(true);
  });

  it("committed + customer signal → healthy governance", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [
        { routeId: "r1", commitmentState: "commit" },
      ],
      rationales: [
        makeRationale({ routeId: "r1", movement: "strengthen", customer: 2, organization: 1 }),
      ],
      portfolioState: "converging",
    });
    expect(ctx.drift.any).toBe(false);
    expect(ctx.portfolioGovernanceState).toBe("healthy");
    expect(ctx.governanceSignals).toHaveLength(0);
  });

  it("re-evaluating route → governance signal about re-evaluation", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [
        { routeId: "r1", commitmentState: "commit" },
      ],
      rationales: [
        makeRationale({
          routeId: "r1",
          movement: "strengthen",
          confidenceLabel: "Contradicted by recent evidence",
          customer: 2,
        }),
      ],
      portfolioState: "converging",
    });
    expect(ctx.routes[0].lifecycleState).toBe("re-evaluating");
    expect(ctx.governanceSignals.some((s) => /flagged for re-evaluation/i.test(s))).toBe(true);
  });

  it("governance signals capped at 3", () => {
    const ctx = buildDecisionOperationsContext({
      routeEntries: [
        { routeId: "r1", commitmentState: "commit" },
        { routeId: "r2", commitmentState: "commit" },
      ],
      rationales: [
        makeRationale({ routeId: "r1", movement: "strengthen", confidenceLabel: "Contradicted by recent evidence", customer: 0 }),
        makeRationale({ routeId: "r2", movement: "remain_unresolved", customer: 0 }),
      ],
      portfolioState: "scaling_ahead",
    });
    expect(ctx.governanceSignals.length).toBeLessThanOrEqual(3);
  });

  it("discipline escalationWithoutProof threads through to route reviewPressure", () => {
    const d = makeDiscipline({ escalationWithoutProof: true });
    const ctx = buildDecisionOperationsContext({
      routeEntries: [{ routeId: "r1", commitmentState: "validate" }],
      rationales: [makeRationale({ routeId: "r1", movement: "strengthen", customer: 0 })],
      portfolioState: "balanced",
      discipline: d,
    });
    expect(ctx.routes[0].reviewPressure.warranted).toBe(true);
    expect(ctx.routes[0].reviewPressure.note).toMatch(/commitment pressure rising/i);
  });
});
