import { describe, expect, it } from "vitest";
import {
  buildDesiredOutcomeSentence,
  composeDesiredOutcomeFromParts,
  deriveDesiredOutcomeParts,
  getPrimaryDesiredOutcome,
  validateDesiredOutcomeParts,
} from "./desiredOutcome";

describe("desiredOutcome adapter", () => {
  it("composes a plain-language desired outcome sentence", () => {
    const sentence = buildDesiredOutcomeSentence({
      direction: "increase",
      metric: "Share of customers completing first pass",
      object: "reliable progress from onboarding to first use",
      context: "new customers in the customer journey",
      constraint: "without extra support loops",
    });

    expect(sentence).toContain("Increase reliable progress from onboarding to first use");
    expect(sentence.toLowerCase()).toContain("new customers");
  });

  it("derives structured fields from legacy text", () => {
    const derived = deriveDesiredOutcomeParts({
      outcome_statement: "Increase the share of customers who complete setup on first pass in onboarding",
      leading_indicator: "Share of customers completing setup on first pass",
      target_direction: "increase",
      journey_key: "customer",
    });

    expect(derived.direction).toBe("increase");
    expect(derived.object.length).toBeGreaterThan(8);
    expect(derived.context.length).toBeGreaterThan(8);
    expect(derived.metric).toContain("Share");
  });

  it("rejects structured outcomes with solution language", () => {
    const validation = validateDesiredOutcomeParts({
      direction: "increase",
      metric: "Share of teams with weekly completion",
      object: "dashboard adoption",
      context: "delivery teams",
    });

    expect(validation.valid).toBe(false);
    expect(validation.reasons).toContain("contains_solution_language");
  });

  it("selects explicit primary outcome when available", () => {
    const selected = getPrimaryDesiredOutcome([
      {
        outcome_statement: "Increase first-pass completion",
        leading_indicator: "First-pass completion rate",
        is_primary: false,
      },
      {
        outcome_statement: "Reduce avoidable handoff delay",
        leading_indicator: "Handoff cycle time",
        is_primary: true,
      },
    ]);

    expect(selected?.is_primary).toBe(true);
    expect(composeDesiredOutcomeFromParts(deriveDesiredOutcomeParts(selected || {})).target_direction).toBe("reduce");
  });
});
