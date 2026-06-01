import { describe, expect, it } from "vitest";
import {
  classifyEvolutionStage,
  deriveAssumptionEvolution,
  deriveReframingEvents,
  deriveDownstreamStaleness,
  deriveConditionalCommitmentLanguage,
  buildAssumptionMovementLine,
  type AssumptionForEvolution,
} from "./assumptionEvolution";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAssumption(overrides: Partial<AssumptionForEvolution> & { assumption: string }): AssumptionForEvolution {
  return {
    id: "a-1",
    assumption: overrides.assumption,
    status: "untested",
    prior_statement: null,
    reframed_from_id: null,
    invalidated_reason: null,
    supporting_evidence: [],
    contradicting_evidence: [],
    related_tension_ids: [],
    affected_route_ids: [],
    ...overrides,
  };
}

// ─── classifyEvolutionStage ───────────────────────────────────────────────────

describe("classifyEvolutionStage", () => {
  it("untested → forming", () => {
    expect(classifyEvolutionStage("untested")).toBe("forming");
  });

  it("emerging → forming", () => {
    expect(classifyEvolutionStage("emerging")).toBe("forming");
  });

  it("validated → resolved", () => {
    expect(classifyEvolutionStage("validated")).toBe("resolved");
  });

  it("contradicted → active (still being evaluated)", () => {
    expect(classifyEvolutionStage("contradicted")).toBe("active");
  });

  it("reframed → reframed", () => {
    expect(classifyEvolutionStage("reframed")).toBe("reframed");
  });

  it("retired → retired", () => {
    expect(classifyEvolutionStage("retired")).toBe("retired");
  });

  it("unknown status falls through to forming", () => {
    expect(classifyEvolutionStage("totally_unknown_status")).toBe("forming");
  });
});

// ─── deriveAssumptionEvolution ────────────────────────────────────────────────

describe("deriveAssumptionEvolution", () => {
  it("contradicted assumption → isUnstable = true", () => {
    const assumptions = [makeAssumption({ assumption: "Market timing is right.", status: "contradicted" })];
    const evolved = deriveAssumptionEvolution(assumptions);
    expect(evolved[0].isUnstable).toBe(true);
  });

  it("contradicted assumption sorts before forming assumption", () => {
    const assumptions = [
      makeAssumption({ id: "a-forming", assumption: "Customers need this.", status: "untested" }),
      makeAssumption({ id: "a-cont", assumption: "Timing is right.", status: "contradicted" }),
    ];
    const evolved = deriveAssumptionEvolution(assumptions);
    expect(evolved[0].id).toBe("a-cont");
    expect(evolved[1].id).toBe("a-forming");
  });

  it("retired assumption → isActive = false", () => {
    const assumptions = [makeAssumption({ assumption: "Old hypothesis.", status: "retired" })];
    const evolved = deriveAssumptionEvolution(assumptions);
    expect(evolved[0].isActive).toBe(false);
  });

  it("reframed assumption with prior_statement → hasReframing = true", () => {
    const assumptions = [
      makeAssumption({
        assumption: "Customers buy for efficiency.",
        status: "reframed",
        prior_statement: "Customers buy for price.",
      }),
    ];
    const evolved = deriveAssumptionEvolution(assumptions);
    expect(evolved[0].hasReframing).toBe(true);
    expect(evolved[0].priorStatement).toBe("Customers buy for price.");
  });
});

// ─── deriveReframingEvents ────────────────────────────────────────────────────

describe("deriveReframingEvents", () => {
  it("returns event only when status=reframed and prior_statement present", () => {
    const assumptions = [
      makeAssumption({
        id: "rf-1",
        assumption: "New belief.",
        status: "reframed",
        prior_statement: "Old belief.",
      }),
      makeAssumption({ id: "rf-2", assumption: "Untouched.", status: "untested" }),
    ];
    const events = deriveReframingEvents(assumptions);
    expect(events).toHaveLength(1);
    expect(events[0].assumptionId).toBe("rf-1");
    expect(events[0].priorStatement).toBe("Old belief.");
    expect(events[0].newStatement).toBe("New belief.");
  });

  it("reframed status without prior_statement → not included", () => {
    const assumptions = [
      makeAssumption({ assumption: "New belief.", status: "reframed", prior_statement: null }),
    ];
    const events = deriveReframingEvents(assumptions);
    expect(events).toHaveLength(0);
  });
});

// ─── deriveDownstreamStaleness ────────────────────────────────────────────────

describe("deriveDownstreamStaleness", () => {
  it("unstable assumption with affected routes → returns staleness signals", () => {
    const assumptions = [
      makeAssumption({
        id: "a-unst",
        assumption: "Price sensitivity is high.",
        status: "unstable",
        affected_route_ids: ["route-A", "route-B"],
      }),
    ];
    const signals = deriveDownstreamStaleness(assumptions);
    expect(signals).toHaveLength(2);
    expect(signals.map((s) => s.routeId)).toEqual(["route-A", "route-B"]);
    expect(signals[0].causingAssumptionId).toBe("a-unst");
  });

  it("validated assumption with route ids → no staleness signals (not unstable)", () => {
    const assumptions = [
      makeAssumption({
        assumption: "Market is ready.",
        status: "validated",
        affected_route_ids: ["route-C"],
      }),
    ];
    const signals = deriveDownstreamStaleness(assumptions);
    expect(signals).toHaveLength(0);
  });
});

// ─── deriveConditionalCommitmentLanguage ──────────────────────────────────────

describe("deriveConditionalCommitmentLanguage", () => {
  it("single critical unproven assumption → assumes X is validated", () => {
    const routeAssumptions = [
      { statement: "Market timing hypothesis.", status: "unproven", critical: true },
    ];
    const lang = deriveConditionalCommitmentLanguage(routeAssumptions);
    expect(lang).toBe("Assumes market timing hypothesis is validated.");
  });

  it("no critical assumptions → null", () => {
    const routeAssumptions = [
      { statement: "Supported claim.", status: "supported", critical: true },
      { statement: "Non-critical claim.", status: "unproven", critical: false },
    ];
    const lang = deriveConditionalCommitmentLanguage(routeAssumptions);
    expect(lang).toBeNull();
  });
});

// ─── buildAssumptionMovementLine ──────────────────────────────────────────────

describe("buildAssumptionMovementLine", () => {
  it("no unstable or reframed → null", () => {
    const evolved = deriveAssumptionEvolution([
      makeAssumption({ assumption: "Normal assumption.", status: "validating" }),
    ]);
    expect(buildAssumptionMovementLine(evolved)).toBeNull();
  });

  it("one contradicted → '1 belief contradicted.'", () => {
    const evolved = deriveAssumptionEvolution([
      makeAssumption({ assumption: "Challenged claim.", status: "contradicted" }),
    ]);
    const line = buildAssumptionMovementLine(evolved);
    expect(line).toBe("1 belief contradicted.");
  });

  it("contradicted + reframed → both appear in line", () => {
    const evolved = deriveAssumptionEvolution([
      makeAssumption({ id: "c1", assumption: "Challenged.", status: "contradicted" }),
      makeAssumption({
        id: "r1",
        assumption: "New framing.",
        status: "reframed",
        prior_statement: "Old framing.",
      }),
    ]);
    const line = buildAssumptionMovementLine(evolved);
    expect(line).not.toBeNull();
    expect(line).toContain("contradicted");
    expect(line).toContain("reframed");
  });
});
