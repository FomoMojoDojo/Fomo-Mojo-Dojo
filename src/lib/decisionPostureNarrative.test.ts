import { describe, expect, it } from "vitest";
import {
  deriveDecisionFieldCondition,
  confidenceMovementLabel,
  confidenceMovementColor,
  decisionStateColor,
  decisionStateBorderColor,
  type NarrativeDecision,
} from "./decisionPostureNarrative";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function d(
  state: NarrativeDecision["decision_state"],
  overrides: Partial<NarrativeDecision> = {},
): NarrativeDecision {
  return {
    decision_state: state,
    confidence_state: "directional",
    title: "Standardize onboarding",
    current_posture: null,
    confidence_movement: [],
    decision_memory: [],
    ...overrides,
  };
}

// ─── deriveDecisionFieldCondition ─────────────────────────────────────────────

describe("deriveDecisionFieldCondition", () => {
  it("returns null for empty array", () => {
    expect(deriveDecisionFieldCondition([])).toBeNull();
  });

  it("returns null when all decisions are retired", () => {
    expect(
      deriveDecisionFieldCondition([d("retired"), d("retired")]),
    ).toBeNull();
  });

  it("prioritizes destabilizing over everything", () => {
    const result = deriveDecisionFieldCondition([
      d("commit_ready", { title: "Route A" }),
      d("stabilizing", { title: "Route B" }),
      d("destabilizing", { title: "Route C" }),
    ]);
    expect(result).toContain("Route C");
  });

  it("uses current_posture for destabilizing when set", () => {
    expect(
      deriveDecisionFieldCondition([
        d("destabilizing", {
          current_posture: "Partnership direction weakening after recent validation.",
        }),
      ]),
    ).toBe("Partnership direction weakening after recent validation.");
  });

  it("uses weakening language when confidence_movement says weakening", () => {
    const result = deriveDecisionFieldCondition([
      d("destabilizing", {
        title: "Onboarding standardization",
        confidence_movement: [
          { at: "2026-01-01T00:00:00Z", direction: "weakening", reason: "" },
        ],
      }),
    ]);
    expect(result).toContain("weakening");
    expect(result).toContain("Onboarding standardization");
  });

  it("uses unstable language when no movement direction", () => {
    const result = deriveDecisionFieldCondition([
      d("destabilizing", { title: "Narrow positioning" }),
    ]);
    expect(result).toContain("unstable");
  });

  it("prioritizes reframing over commit_ready and contradicted", () => {
    const result = deriveDecisionFieldCondition([
      d("commit_ready", { title: "A" }),
      d("reframing", { title: "B" }),
    ]);
    expect(result).toContain("B");
    expect(result).toContain("reframed");
  });

  it("uses current_posture for reframing when set", () => {
    expect(
      deriveDecisionFieldCondition([
        d("reframing", { current_posture: "Scaling decision is being reframed." }),
      ]),
    ).toBe("Scaling decision is being reframed.");
  });

  it("prioritizes contradicted confidence over commit_ready", () => {
    const result = deriveDecisionFieldCondition([
      d("commit_ready", { title: "A", confidence_state: "strong" }),
      d("stabilizing", { title: "B", confidence_state: "contradicted" }),
    ]);
    expect(result).toContain("contradicting evidence");
  });

  it("uses singular form for one contradicted decision", () => {
    const result = deriveDecisionFieldCondition([
      d("stabilizing", { title: "Partnership scale", confidence_state: "contradicted" }),
    ]);
    expect(result).toContain("Partnership scale");
    expect(result).not.toContain("Several");
  });

  it("uses plural form for multiple contradicted decisions", () => {
    const result = deriveDecisionFieldCondition([
      d("under_validation", { confidence_state: "contradicted", title: "A" }),
      d("stabilizing", { confidence_state: "contradicted", title: "B" }),
    ]);
    expect(result).toBe("Several decisions remain open under conflicting evidence.");
  });

  it("handles commit_ready state", () => {
    const result = deriveDecisionFieldCondition([
      d("commit_ready", { title: "Narrow positioning" }),
    ]);
    expect(result).toContain("commitment readiness");
  });

  it("uses current_posture for commit_ready when set", () => {
    expect(
      deriveDecisionFieldCondition([
        d("commit_ready", { current_posture: "Commitment stabilizing around operational reliability." }),
      ]),
    ).toBe("Commitment stabilizing around operational reliability.");
  });

  it("uses current_posture for stabilizing when set", () => {
    expect(
      deriveDecisionFieldCondition([
        d("stabilizing", { current_posture: "Commitment stabilizing around operational reliability." }),
      ]),
    ).toBe("Commitment stabilizing around operational reliability.");
  });

  it("uses title in stabilizing fallback — lowercase first char", () => {
    const result = deriveDecisionFieldCondition([
      d("stabilizing", { title: "Operational reliability direction" }),
    ]);
    expect(result).toContain("operational reliability direction");
  });

  it("pluralizes stabilizing when multiple stabilizing decisions", () => {
    const result = deriveDecisionFieldCondition([
      d("stabilizing", { title: "A" }),
      d("stabilizing", { title: "B" }),
    ]);
    expect(result).toContain("2 directions");
  });

  it("handles single under_validation decision", () => {
    const result = deriveDecisionFieldCondition([
      d("under_validation", { title: "Onboarding standardization" }),
    ]);
    expect(result).toContain("Onboarding standardization");
    expect(result).toContain("validation");
  });

  it("uses current_posture for single under_validation", () => {
    expect(
      deriveDecisionFieldCondition([
        d("under_validation", { current_posture: "Scaling decision remains under validation." }),
      ]),
    ).toBe("Scaling decision remains under validation.");
  });

  it("pluralizes multiple under_validation decisions", () => {
    const result = deriveDecisionFieldCondition([
      d("under_validation", { title: "A" }),
      d("under_validation", { title: "B" }),
      d("under_validation", { title: "C" }),
    ]);
    expect(result).toContain("3 commitment questions");
  });

  it("all committed returns committed message", () => {
    const result = deriveDecisionFieldCondition([
      d("committed", { title: "Onboarding direction" }),
    ]);
    expect(result).toContain("committed");
  });

  it("multiple committed decisions return count", () => {
    const result = deriveDecisionFieldCondition([
      d("committed", { title: "A" }),
      d("committed", { title: "B" }),
    ]);
    expect(result).toBe("2 decisions committed.");
  });

  it("exploratory fallback returns singular correctly", () => {
    const result = deriveDecisionFieldCondition([d("exploratory")]);
    expect(result).toContain("1 commitment question");
    expect(result).not.toContain("questions");
  });

  it("exploratory fallback returns plural for multiple", () => {
    const result = deriveDecisionFieldCondition([
      d("exploratory", { title: "A" }),
      d("exploratory", { title: "B" }),
      d("exploratory", { title: "C" }),
    ]);
    expect(result).toContain("3 commitment questions");
  });

  it("ignores retired decisions in count", () => {
    const result = deriveDecisionFieldCondition([
      d("retired"),
      d("exploratory", { title: "A" }),
    ]);
    expect(result).toContain("1 commitment question");
  });

  it("mixed committed + open uses open count in fallback", () => {
    const result = deriveDecisionFieldCondition([
      d("committed", { title: "A" }),
      d("exploratory", { title: "B" }),
    ]);
    expect(result).toContain("1 commitment question");
  });
});

// ─── confidenceMovementLabel ──────────────────────────────────────────────────

describe("confidenceMovementLabel", () => {
  it("strengthening", () => expect(confidenceMovementLabel("strengthening")).toBe("Strengthening"));
  it("weakening", () => expect(confidenceMovementLabel("weakening")).toBe("Weakening"));
  it("stable", () => expect(confidenceMovementLabel("stable")).toBe("Stable"));
  it("null → empty", () => expect(confidenceMovementLabel(null)).toBe(""));
  it("undefined → empty", () => expect(confidenceMovementLabel(undefined)).toBe(""));
  it("unknown → empty", () => expect(confidenceMovementLabel("other")).toBe(""));
});

// ─── confidenceMovementColor ──────────────────────────────────────────────────

describe("confidenceMovementColor", () => {
  it("strengthening → teal", () => expect(confidenceMovementColor("strengthening")).toBe("#5F9B8C"));
  it("weakening → amber-brown", () => expect(confidenceMovementColor("weakening")).toBe("#b06a3c"));
  it("stable → muted", () => expect(confidenceMovementColor("stable")).toBe("#6E847F"));
  it("null → muted", () => expect(confidenceMovementColor(null)).toBe("#6E847F"));
});

// ─── decisionStateColor ───────────────────────────────────────────────────────

describe("decisionStateColor", () => {
  it("destabilizing → red", () => expect(decisionStateColor("destabilizing")).toBe("#c44233"));
  it("commit_ready → teal", () => expect(decisionStateColor("commit_ready")).toBe("#5F9B8C"));
  it("committed → teal", () => expect(decisionStateColor("committed")).toBe("#5F9B8C"));
  it("stabilizing → teal", () => expect(decisionStateColor("stabilizing")).toBe("#5F9B8C"));
  it("under_validation → amber", () => expect(decisionStateColor("under_validation")).toBe("#FAC846"));
  it("exploratory → muted", () => expect(decisionStateColor("exploratory")).toBe("#6E847F"));
});

// ─── decisionStateBorderColor ─────────────────────────────────────────────────

describe("decisionStateBorderColor", () => {
  it("destabilizing → red", () => expect(decisionStateBorderColor("destabilizing")).toBe("#c44233"));
  it("committed → teal", () => expect(decisionStateBorderColor("committed")).toBe("#5F9B8C"));
  it("stabilizing → soft teal", () => expect(decisionStateBorderColor("stabilizing")).toBe("#a0c4b8"));
  it("exploratory → line", () => expect(decisionStateBorderColor("exploratory")).toBe("#DDE6D1"));
});
