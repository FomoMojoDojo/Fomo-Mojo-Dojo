import { describe, expect, it } from "vitest";
import {
  strengthenHypothesis,
  weakenHypothesis,
  makeUnstable,
  contradictHypothesis,
  retireHypothesis,
  reframeHypothesis,
  supersedeCascade,
  deriveDownstreamImpact,
  transitionHypothesis,
} from "./hypothesisLifecycle";
import type { StrategicHypothesis } from "./strategicHypothesisDomain";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeHypothesis(overrides: Partial<StrategicHypothesis> = {}): StrategicHypothesis {
  return {
    id: "hyp-1",
    company_id: "company-1",
    hypothesis_key: "directional_hypothesis:reliability_matters",
    statement: "Reliability concerns are affecting repeat purchasing confidence.",
    hypothesis_kind: "directional_hypothesis",
    hypothesis_state: "emerging",
    topic: "problem",
    confidence: "medium",
    validation_state: "directional",
    what_must_be_true: ["Customers confirm reliability is a factor in repeat purchases."],
    source_run_id: null,
    reframed_from_hypothesis_id: null,
    superseded_by_id: null,
    originating_context: null,
    reframed_reason: null,
    is_active: true,
    raw_payload: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── 1. Strengthening ─────────────────────────────────────────────────────────

describe("hypothesis strengthening", () => {
  it("transitions inferred → emerging on strengthen", () => {
    const h = makeHypothesis({ hypothesis_state: "inferred" });
    const result = strengthenHypothesis(h);
    expect(result?.nextState).toBe("emerging");
    expect(result?.previousState).toBe("inferred");
    expect(result?.kind).toBe("strengthen");
    expect(result?.isCommitmentImpact).toBe(false);
  });

  it("transitions emerging → strengthened on strengthen", () => {
    const h = makeHypothesis({ hypothesis_state: "emerging" });
    const result = strengthenHypothesis(h, "Customer interviews confirmed the pattern.");
    expect(result?.nextState).toBe("strengthened");
    expect(result?.reason).toBe("Customer interviews confirmed the pattern.");
  });

  it("transitions unstable → emerging on strengthen (must re-earn strengthened)", () => {
    const h = makeHypothesis({ hypothesis_state: "unstable" });
    const result = strengthenHypothesis(h);
    expect(result?.nextState).toBe("emerging");
  });

  it("cannot strengthen a retired hypothesis", () => {
    const h = makeHypothesis({ hypothesis_state: "retired" });
    expect(strengthenHypothesis(h)).toBeNull();
  });

  it("cannot strengthen a reframed hypothesis", () => {
    const h = makeHypothesis({ hypothesis_state: "reframed" });
    expect(strengthenHypothesis(h)).toBeNull();
  });
});

// ─── 2. Contradiction ─────────────────────────────────────────────────────────

describe("hypothesis contradiction", () => {
  it("transitions emerging → contradicted and marks commitment impact", () => {
    const h = makeHypothesis({ hypothesis_state: "emerging" });
    const result = contradictHypothesis(h, "Three customers denied reliability was a concern.");
    expect(result?.nextState).toBe("contradicted");
    expect(result?.isCommitmentImpact).toBe(true);
    expect(result?.reason).toBe("Three customers denied reliability was a concern.");
  });

  it("transitions strengthened → contradicted on contradict", () => {
    const h = makeHypothesis({ hypothesis_state: "strengthened" });
    expect(contradictHypothesis(h)?.nextState).toBe("contradicted");
  });

  it("does NOT allow contradicted → strengthened (must reframe to recover)", () => {
    const h = makeHypothesis({ hypothesis_state: "contradicted" });
    expect(strengthenHypothesis(h)).toBeNull();
  });

  it("does NOT allow contradicted → unstable", () => {
    const h = makeHypothesis({ hypothesis_state: "contradicted" });
    expect(weakenHypothesis(h)).toBeNull();
  });
});

// ─── 3. Unstable state ────────────────────────────────────────────────────────

describe("unstable hypothesis state", () => {
  it("transitions emerging → unstable on weaken and marks commitment impact", () => {
    const h = makeHypothesis({ hypothesis_state: "emerging" });
    const result = weakenHypothesis(h, "Two signals weakened the pattern.");
    expect(result?.nextState).toBe("unstable");
    expect(result?.isCommitmentImpact).toBe(true);
  });

  it("transitions strengthened → unstable on weaken", () => {
    const h = makeHypothesis({ hypothesis_state: "strengthened" });
    expect(weakenHypothesis(h)?.nextState).toBe("unstable");
  });

  it("transitions inferred → unstable on make_unstable", () => {
    const h = makeHypothesis({ hypothesis_state: "inferred" });
    expect(makeUnstable(h)?.nextState).toBe("unstable");
  });

  it("unstable → contradicted is a valid path", () => {
    const h = makeHypothesis({ hypothesis_state: "unstable" });
    expect(contradictHypothesis(h)?.nextState).toBe("contradicted");
  });
});

// ─── 4. Reframing lineage ─────────────────────────────────────────────────────

describe("hypothesis reframing lineage", () => {
  it("successor's reframed_from_hypothesis_id points to the original ID", () => {
    const original = makeHypothesis({ id: "hyp-original" });
    const { retired, successor, lineage } = reframeHypothesis({
      original,
      newStatement: "Batch variability is the core driver of repeat-purchase attrition.",
      reason: "Customer interviews pointed to batch consistency, not generic reliability.",
    });

    expect(retired.id).toBe("hyp-original");
    expect(retired.hypothesis_state).toBe("reframed");
    expect(retired.is_active).toBe(false);
    expect(retired.reframed_reason).toBe(
      "Customer interviews pointed to batch consistency, not generic reliability.",
    );
    expect(successor.reframed_from_hypothesis_id).toBe("hyp-original");
    expect(lineage.fromId).toBe("hyp-original");
  });

  it("successor starts as inferred with low confidence (must re-earn status)", () => {
    const original = makeHypothesis({ hypothesis_state: "strengthened", confidence: "high" });
    const { successor } = reframeHypothesis({
      original,
      newStatement: "Operational consistency matters more than artisanal differentiation.",
      reason: "Evidence shifted.",
    });

    expect(successor.hypothesis_state).toBe("inferred");
    expect(successor.confidence).toBe("low");
    expect(successor.validation_state).toBe("unvalidated");
    expect(successor.what_must_be_true).toEqual([]);
  });

  it("reframing does NOT destructively overwrite original statement", () => {
    const original = makeHypothesis({ statement: "Original statement that must be preserved." });
    const { retired, successor } = reframeHypothesis({
      original,
      newStatement: "New reframed statement.",
      reason: "Evidence changed.",
    });

    // retired only carries the minimal delta — statement is NOT included
    expect((retired as Record<string, unknown>).statement).toBeUndefined();
    // Successor has the new statement
    expect(successor.statement).toBe("New reframed statement.");
  });

  it("reframing preserves company_id and hypothesis_kind from original", () => {
    const original = makeHypothesis({
      company_id: "company-xyz",
      hypothesis_kind: "candidate_assumption",
    });
    const { successor } = reframeHypothesis({
      original,
      newStatement: "The model may depend on buyers valuing consistency over novelty.",
      reason: "New research.",
    });

    expect(successor.company_id).toBe("company-xyz");
    expect(successor.hypothesis_kind).toBe("candidate_assumption");
  });
});

// ─── 5. Retirement ────────────────────────────────────────────────────────────

describe("hypothesis retirement", () => {
  it("retires inferred, emerging, strengthened, unstable, and contradicted states", () => {
    const validStates: Array<StrategicHypothesis["hypothesis_state"]> = [
      "inferred", "emerging", "strengthened", "unstable", "contradicted",
    ];
    for (const state of validStates) {
      const h = makeHypothesis({ hypothesis_state: state });
      const result = retireHypothesis(h, "No longer relevant.");
      expect(result?.nextState).toBe("retired");
      expect(result?.kind).toBe("retire");
    }
  });

  it("cannot retire an already-retired hypothesis", () => {
    const h = makeHypothesis({ hypothesis_state: "retired" });
    expect(retireHypothesis(h)).toBeNull();
  });

  it("cannot retire a reframed hypothesis", () => {
    const h = makeHypothesis({ hypothesis_state: "reframed" });
    expect(retireHypothesis(h)).toBeNull();
  });
});

// ─── 6. Supersession ─────────────────────────────────────────────────────────

describe("hypothesis supersession", () => {
  it("marks hypothesis inactive with a forward pointer to the successor ID", () => {
    const h = makeHypothesis({ id: "hyp-old" });
    const result = supersedeCascade(h, "hyp-new");
    expect(result?.superseded_by_id).toBe("hyp-new");
    expect(result?.is_active).toBe(false);
    expect(result?.id).toBe("hyp-old");
  });

  it("cannot supersede an already-retired hypothesis", () => {
    const h = makeHypothesis({ hypothesis_state: "retired" });
    expect(supersedeCascade(h, "hyp-new")).toBeNull();
  });
});

// ─── 7. Downstream stale signaling ───────────────────────────────────────────

describe("downstream stale signaling", () => {
  it("contradiction produces high-pressure stale signal for linked routes", () => {
    const h = makeHypothesis();
    const transition = contradictHypothesis(h)!;
    const impact = deriveDownstreamImpact({
      transition,
      linkedRouteIds: ["route-1", "route-2"],
      hypothesisStatement: h.statement,
    });

    expect(impact.pressure).toBe("high");
    expect(impact.staleRouteIds).toContain("route-1");
    expect(impact.staleRouteIds).toContain("route-2");
    expect(impact.note).toMatch(/contradicted/);
  });

  it("unstable transition produces medium-pressure stale signal", () => {
    const h = makeHypothesis({ hypothesis_state: "strengthened" });
    const transition = weakenHypothesis(h)!;
    const impact = deriveDownstreamImpact({
      transition,
      linkedRouteIds: ["route-3"],
      hypothesisStatement: h.statement,
    });

    expect(impact.pressure).toBe("medium");
    expect(impact.staleRouteIds).toContain("route-3");
    expect(impact.note).toMatch(/conflicting evidence/);
  });

  it("strengthening produces no stale signal", () => {
    const h = makeHypothesis({ hypothesis_state: "inferred" });
    const transition = strengthenHypothesis(h)!;
    const impact = deriveDownstreamImpact({
      transition,
      linkedRouteIds: ["route-1"],
      hypothesisStatement: h.statement,
    });

    expect(impact.staleRouteIds).toHaveLength(0);
    expect(impact.pressure).toBe("low");
    expect(impact.note).toBe("");
  });

  it("long hypothesis statements are truncated in the note", () => {
    const h = makeHypothesis({
      hypothesis_state: "strengthened",
      statement: "A".repeat(120),
    });
    const transition = weakenHypothesis(h)!;
    const impact = deriveDownstreamImpact({
      transition,
      linkedRouteIds: ["route-1"],
      hypothesisStatement: h.statement,
    });

    expect(impact.note).toMatch(/\.\.\./);
  });

  it("returns empty stale list when no routes are linked", () => {
    const h = makeHypothesis();
    const transition = contradictHypothesis(h)!;
    const impact = deriveDownstreamImpact({
      transition,
      linkedRouteIds: [],
      hypothesisStatement: h.statement,
    });

    expect(impact.staleRouteIds).toHaveLength(0);
    expect(impact.pressure).toBe("high");
  });
});

// ─── 8. Generic transitionHypothesis guard ───────────────────────────────────

describe("transitionHypothesis invalid transitions", () => {
  it("returns null for an invalid transition on terminal state", () => {
    expect(transitionHypothesis({ hypothesis_state: "retired" }, "strengthen")).toBeNull();
    expect(transitionHypothesis({ hypothesis_state: "reframed" }, "contradict")).toBeNull();
  });

  it("contradicted cannot be strengthened or weakened — only retired", () => {
    const h = makeHypothesis({ hypothesis_state: "contradicted" });
    expect(transitionHypothesis(h, "strengthen")).toBeNull();
    expect(transitionHypothesis(h, "weaken")).toBeNull();
    expect(transitionHypothesis(h, "make_unstable")).toBeNull();
    expect(transitionHypothesis(h, "retire")?.nextState).toBe("retired");
  });
});
