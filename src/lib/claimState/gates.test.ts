import { describe, it, expect } from "vitest";
import {
  checkNoSkip,
  checkOutsideViewToDiagnose,
  checkDiagnoseToFocus,
  checkFocusToFlow,
  shouldRegressDiagnoseToOutsideView,
  shouldRegressFocusToDiagnose,
  shouldRegressFlowToFocus,
} from "./gates";
import type { ClaimSignalRefForGate, SignalForGate } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function signal(
  overrides: Partial<SignalForGate> = {},
): SignalForGate {
  return {
    signal_band: "organization",
    directness: "direct",
    framing_fit: "strong",
    validation_status: "validated",
    structure_level: "extracted",
    ...overrides,
  };
}

function ref(
  relationship: ClaimSignalRefForGate["relationship"],
  sig: Partial<SignalForGate> = {},
): ClaimSignalRefForGate {
  return { relationship, signal: signal(sig) };
}

// ── checkNoSkip ───────────────────────────────────────────────────────────────

describe("checkNoSkip", () => {
  it("allows sequential transitions", () => {
    expect(checkNoSkip("outside_view", "diagnose").allowed).toBe(true);
    expect(checkNoSkip("diagnose", "focus").allowed).toBe(true);
    expect(checkNoSkip("focus", "flow").allowed).toBe(true);
  });

  it("blocks skipping a state", () => {
    const r = checkNoSkip("outside_view", "focus");
    expect(r.allowed).toBe(false);
    expect(r.blockers[0]).toMatch(/diagnose/);
  });

  it("blocks skipping two states", () => {
    const r = checkNoSkip("outside_view", "flow");
    expect(r.allowed).toBe(false);
  });
});

// ── checkOutsideViewToDiagnose ────────────────────────────────────────────────

describe("checkOutsideViewToDiagnose", () => {
  const claim = { id: "c1", state: "outside_view" as const };

  it("passes with qualifying org signal + 2 supporting", () => {
    const refs = [
      ref("supports", { signal_band: "organization", directness: "direct", structure_level: "extracted" }),
      ref("supports", { signal_band: "customer", directness: "direct", structure_level: "interpreted" }),
    ];
    expect(checkOutsideViewToDiagnose(claim, refs).allowed).toBe(true);
  });

  it("blocks if no org signal", () => {
    const refs = [
      ref("supports", { signal_band: "customer" }),
      ref("supports", { signal_band: "customer" }),
    ];
    const r = checkOutsideViewToDiagnose(claim, refs);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("organizational"))).toBe(true);
  });

  it("blocks if org signal is weak", () => {
    const refs = [
      ref("supports", { signal_band: "organization", directness: "weak", structure_level: "extracted" }),
      ref("supports", { signal_band: "customer" }),
    ];
    expect(checkOutsideViewToDiagnose(claim, refs).allowed).toBe(false);
  });

  // ── INT-2: provenance-aware single-source clause ──────────────────────────
  it("internal_declared advances with ONE qualifying org signal (Law 7: two-source is a proof rule, not a provenance rule)", () => {
    const declared = { id: "c1", state: "outside_view" as const, provenance: "internal_declared" as const };
    const refs = [
      ref("supports", { signal_band: "organization", directness: "direct", structure_level: "interpreted" }),
    ];
    expect(checkOutsideViewToDiagnose(declared, refs).allowed).toBe(true);
  });

  it("internal_declared still blocks without a QUALIFYING org signal (raw structure)", () => {
    const declared = { id: "c1", state: "outside_view" as const, provenance: "internal_declared" as const };
    const refs = [
      ref("supports", { signal_band: "organization", directness: "direct", structure_level: "raw" }),
    ];
    expect(checkOutsideViewToDiagnose(declared, refs).allowed).toBe(false);
  });

  it("public regression: public_observed (and provenance-absent) claims keep the >=2 rule", () => {
    const oneRef = [
      ref("supports", { signal_band: "organization", directness: "direct", structure_level: "extracted" }),
    ];
    expect(checkOutsideViewToDiagnose({ id: "c1", state: "outside_view" as const }, oneRef).allowed).toBe(false);
    expect(
      checkOutsideViewToDiagnose(
        { id: "c1", state: "outside_view" as const, provenance: "public_observed" as const },
        oneRef,
      ).allowed,
    ).toBe(false);
  });

  it("blocks if org signal is raw structure", () => {
    const refs = [
      ref("supports", { signal_band: "organization", directness: "direct", structure_level: "raw" }),
      ref("supports", { signal_band: "customer" }),
    ];
    expect(checkOutsideViewToDiagnose(claim, refs).allowed).toBe(false);
  });

  it("blocks if fewer than 2 supporting refs", () => {
    const refs = [
      ref("supports", { signal_band: "organization", directness: "direct", structure_level: "extracted" }),
    ];
    const r = checkOutsideViewToDiagnose(claim, refs);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("2"))).toBe(true);
  });

  it("blocks if claim is not in outside_view", () => {
    const r = checkOutsideViewToDiagnose({ id: "c1", state: "diagnose" }, []);
    expect(r.allowed).toBe(false);
    expect(r.blockers[0]).toMatch(/outside_view/);
  });

  it("non-supporting refs don't count toward the 2-signal threshold", () => {
    const refs = [
      ref("supports", { signal_band: "organization", directness: "direct", structure_level: "extracted" }),
      ref("contradicts", { signal_band: "customer" }),
    ];
    expect(checkOutsideViewToDiagnose(claim, refs).allowed).toBe(false);
  });
});

// ── checkDiagnoseToFocus — need claims ────────────────────────────────────────

describe("checkDiagnoseToFocus — need claim", () => {
  const claim = {
    id: "c1",
    state: "diagnose" as const,
    claim_type: "customer_outcome",
    need_statement: "Minimize the time spent preparing quarterly reports",
  };
  const odiNeed = { importance: 7, satisfaction: 3, opportunity_score: 28 };

  function goodRefs(): ClaimSignalRefForGate[] {
    return [ref("supports", { signal_band: "customer", validation_status: "validated" })];
  }

  it("passes with customer signal + need_statement + odiNeed importance≥1", () => {
    expect(checkDiagnoseToFocus(claim, goodRefs(), odiNeed).allowed).toBe(true);
  });

  it("blocks if no customer signal", () => {
    const refs = [ref("supports", { signal_band: "organization" })];
    const r = checkDiagnoseToFocus(claim, refs, odiNeed);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("customer"))).toBe(true);
  });

  it("blocks if need_statement is empty", () => {
    const r = checkDiagnoseToFocus({ ...claim, need_statement: "" }, goodRefs(), odiNeed);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("need_statement"))).toBe(true);
  });

  it("blocks if no odiNeed provided", () => {
    const r = checkDiagnoseToFocus(claim, goodRefs(), undefined);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("odi_need"))).toBe(true);
  });

  it("blocks if odiNeed.importance < 1", () => {
    const r = checkDiagnoseToFocus(claim, goodRefs(), { ...odiNeed, importance: 0 });
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("Importance"))).toBe(true);
  });

  it("blocks unaddressed contradictions", () => {
    const refs = [
      ref("supports", { signal_band: "customer", validation_status: "validated" }),
      ref("contradicts", { signal_band: "organization", validation_status: "unvalidated" }),
    ];
    const r = checkDiagnoseToFocus(claim, refs, odiNeed);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("contradiction"))).toBe(true);
  });

  it("allows contradictions addressed by a qualifies ref", () => {
    const refs = [
      ref("supports", { signal_band: "customer", validation_status: "validated" }),
      ref("contradicts", { signal_band: "organization", validation_status: "unvalidated" }),
      ref("qualifies", { signal_band: "customer" }),
    ];
    expect(checkDiagnoseToFocus(claim, refs, odiNeed).allowed).toBe(true);
  });

  it("allows contradictions where the signal itself is marked contradicted", () => {
    const refs = [
      ref("supports", { signal_band: "customer", validation_status: "validated" }),
      ref("contradicts", { signal_band: "organization", validation_status: "contradicted" }),
    ];
    expect(checkDiagnoseToFocus(claim, refs, odiNeed).allowed).toBe(true);
  });
});

// ── checkDiagnoseToFocus — non-need claims ────────────────────────────────────

describe("checkDiagnoseToFocus — non-need claim", () => {
  const claim = {
    id: "c2",
    state: "diagnose" as const,
    claim_type: "market_hypothesis",
    need_statement: null,
  };

  it("passes with 2 direct customer signals + 1 validated", () => {
    const refs = [
      ref("supports", { signal_band: "customer", directness: "direct", validation_status: "validated" }),
      ref("supports", { signal_band: "customer", directness: "inferred", validation_status: "unvalidated" }),
    ];
    expect(checkDiagnoseToFocus(claim, refs).allowed).toBe(true);
  });

  it("passes with 1 direct customer + 1 strong org + 1 validated", () => {
    const refs = [
      ref("supports", { signal_band: "customer", directness: "direct", validation_status: "validated" }),
      ref("supports", { signal_band: "organization", framing_fit: "strong" }),
    ];
    expect(checkDiagnoseToFocus(claim, refs).allowed).toBe(true);
  });

  it("blocks with only 1 direct customer and no strong org", () => {
    const refs = [
      ref("supports", { signal_band: "customer", directness: "direct", validation_status: "validated" }),
    ];
    const r = checkDiagnoseToFocus(claim, refs);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("2"))).toBe(true);
  });

  it("blocks if no validated signal exists", () => {
    const refs = [
      ref("supports", { signal_band: "customer", directness: "direct", validation_status: "directional" }),
      ref("supports", { signal_band: "customer", directness: "inferred", validation_status: "unvalidated" }),
    ];
    const r = checkDiagnoseToFocus(claim, refs);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("validated"))).toBe(true);
  });

  it("weak customer signals don't count toward triangulation", () => {
    const refs = [
      ref("supports", { signal_band: "customer", directness: "weak", validation_status: "validated" }),
      ref("supports", { signal_band: "customer", directness: "weak", validation_status: "validated" }),
    ];
    expect(checkDiagnoseToFocus(claim, refs).allowed).toBe(false);
  });
});

// ── checkFocusToFlow ──────────────────────────────────────────────────────────

describe("checkFocusToFlow", () => {
  const claim = { id: "c3", state: "focus" as const, action_category: "fix" as const };
  const goodRoute = {
    id: "r1",
    steps_json: [{ status: "in_progress" }],
    stale_reason: null,
    dependency_state: null,
    linked_need_ids: null,
  };

  it("passes with action_category, started route step, no blocker tension", () => {
    expect(checkFocusToFlow(claim, goodRoute, [], []).allowed).toBe(true);
  });

  it("blocks if action_category is null", () => {
    const r = checkFocusToFlow({ ...claim, action_category: null }, goodRoute, [], []);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("action_category"))).toBe(true);
  });

  it("blocks if no linked route", () => {
    const r = checkFocusToFlow(claim, null, [], []);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("route"))).toBe(true);
  });

  it("blocks if route has no started steps", () => {
    const route = { ...goodRoute, steps_json: [{ status: "pending" }] };
    const r = checkFocusToFlow(claim, route, [], []);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("started"))).toBe(true);
  });

  it("blocks if a commitment-blocker tension covers this route", () => {
    const tension = { is_commitment_blocker: true, blocked_commitments: ["r1"] };
    const r = checkFocusToFlow(claim, goodRoute, [tension], []);
    expect(r.allowed).toBe(false);
    expect(r.blockers.some((b) => b.includes("tension"))).toBe(true);
  });

  it("ignores non-blocker tensions", () => {
    const tension = { is_commitment_blocker: false, blocked_commitments: ["r1"] };
    expect(checkFocusToFlow(claim, goodRoute, [tension], []).allowed).toBe(true);
  });

  it("passes if monitoring anchor is satisfied by managed_outcome only", () => {
    const routeNoSteps = { ...goodRoute, steps_json: [] };
    // No started steps — would normally fail, managed_outcome compensates
    // (monitoring anchor check only kicks in when steps fail, and with empty route
    //  the started-steps blocker fires first; managed_outcomes satisfy the anchor
    //  but the started-steps check is separate — so this should still block)
    const r = checkFocusToFlow(claim, routeNoSteps, [], [{ journey_key: "jk1" }]);
    // started-steps check fires; managed_outcome alone doesn't satisfy that gate
    expect(r.allowed).toBe(false);
  });
});

// ── Regression detectors ──────────────────────────────────────────────────────

describe("shouldRegressDiagnoseToOutsideView", () => {
  it("returns false when active org supporting signal exists", () => {
    const refs = [
      ref("supports", { signal_band: "organization", directness: "direct", validation_status: "validated" }),
    ];
    expect(shouldRegressDiagnoseToOutsideView(refs)).toBe(false);
  });

  it("returns true when all org signals are contradicted", () => {
    const refs = [
      ref("supports", { signal_band: "organization", directness: "direct", validation_status: "contradicted" }),
    ];
    expect(shouldRegressDiagnoseToOutsideView(refs)).toBe(true);
  });

  it("returns true when no org supporting signal at all", () => {
    const refs = [ref("supports", { signal_band: "customer" })];
    expect(shouldRegressDiagnoseToOutsideView(refs)).toBe(true);
  });

  it("returns true when org signal is weak (regardless of validation)", () => {
    const refs = [
      ref("supports", { signal_band: "organization", directness: "weak", validation_status: "validated" }),
    ];
    expect(shouldRegressDiagnoseToOutsideView(refs)).toBe(true);
  });
});

describe("shouldRegressFocusToDiagnose", () => {
  it("returns false when active customer signal exists", () => {
    const refs = [ref("supports", { signal_band: "customer", validation_status: "validated" })];
    expect(shouldRegressFocusToDiagnose(refs)).toBe(false);
  });

  it("returns true when all customer signals are contradicted", () => {
    const refs = [ref("supports", { signal_band: "customer", validation_status: "contradicted" })];
    expect(shouldRegressFocusToDiagnose(refs)).toBe(true);
  });

  it("returns true when odiNeed importance drops below 1", () => {
    const refs = [ref("supports", { signal_band: "customer", validation_status: "validated" })];
    expect(shouldRegressFocusToDiagnose(refs, { importance: 0, satisfaction: 5, opportunity_score: 0 })).toBe(true);
  });

  it("returns false when odiNeed importance is exactly 1", () => {
    const refs = [ref("supports", { signal_band: "customer", validation_status: "validated" })];
    expect(shouldRegressFocusToDiagnose(refs, { importance: 1, satisfaction: 5, opportunity_score: 5 })).toBe(false);
  });
});

describe("shouldRegressFlowToFocus", () => {
  const goodRoute = {
    id: "r1",
    steps_json: [{ status: "complete" }],
    stale_reason: null,
    dependency_state: null,
    linked_need_ids: null,
  };

  it("returns false for a healthy route with no customer contradictions", () => {
    expect(shouldRegressFlowToFocus(goodRoute, [])).toBe(false);
  });

  it("returns true when linkedRoute is null", () => {
    expect(shouldRegressFlowToFocus(null, [])).toBe(true);
  });

  it("returns true when route has stale_reason", () => {
    expect(shouldRegressFlowToFocus({ ...goodRoute, stale_reason: "dependency changed" }, [])).toBe(true);
  });

  it("returns true when dependency_state is stale", () => {
    expect(shouldRegressFlowToFocus({ ...goodRoute, dependency_state: "stale" }, [])).toBe(true);
  });

  it("returns true when there is a direct customer contradiction", () => {
    const refs = [ref("contradicts", { signal_band: "customer", directness: "direct" })];
    expect(shouldRegressFlowToFocus(goodRoute, refs)).toBe(true);
  });

  it("ignores inferred customer contradictions", () => {
    const refs = [ref("contradicts", { signal_band: "customer", directness: "inferred" })];
    expect(shouldRegressFlowToFocus(goodRoute, refs)).toBe(false);
  });

  it("ignores org contradictions", () => {
    const refs = [ref("contradicts", { signal_band: "organization", directness: "direct" })];
    expect(shouldRegressFlowToFocus(goodRoute, refs)).toBe(false);
  });
});
