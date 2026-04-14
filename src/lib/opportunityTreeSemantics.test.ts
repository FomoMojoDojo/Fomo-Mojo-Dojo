import { describe, expect, it } from "vitest";
import {
  ensureRequiredFrameworkKeys,
  hasRequiredFrameworkKeys,
  validateDesiredOutcome,
  validateOpportunity,
  validateOutcomeOpportunityDistinctness,
  validateSolutionIdea,
  validateSolutionTest,
} from "./opportunityTreeSemantics";

describe("opportunityTreeSemantics", () => {
  it("enforces required framework keys", () => {
    const normalized = ensureRequiredFrameworkKeys(["Teresa Torres", "odi"]);
    expect(normalized).toContain("odi");
    expect(normalized).toContain("teresa_torres");
    expect(hasRequiredFrameworkKeys(normalized)).toBe(true);
  });

  it("flags desired outcomes with solution language", () => {
    const invalid = validateDesiredOutcome({
      statement: "Build a dashboard to track decisions",
      leadingIndicator: "Number of dashboards launched",
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.reasons).toContain("contains_solution_language");
  });

  it("flags near-duplicate outcome and opportunity text", () => {
    const duplicate = validateOutcomeOpportunityDistinctness(
      "Increase consistent tracking of decision results after using MojoMap",
      "Increase how consistently customers track decision results after using MojoMap",
    );
    expect(duplicate.valid).toBe(false);
  });

  it("validates ODI opportunity score inputs", () => {
    const invalid = validateOpportunity({
      outcome: "Increase customer confidence in confirming scope",
      importance: 12,
      satisfaction: 3,
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.reasons).toContain("importance_out_of_range");
  });

  it("requires odi + teresa_torres framework tags on artifacts", () => {
    const outcome = validateDesiredOutcome({
      statement: "Increase confidence in weekly decision prioritization",
      leadingIndicator: "Share of teams reporting confidence after weekly review",
      frameworksUsed: ["odi"],
    });
    expect(outcome.valid).toBe(false);
    expect(outcome.reasons).toContain("missing_required_frameworks");

    const test = validateSolutionTest({
      title: "Structured pilot",
      method: "Run a guided pilot with 5 teams",
      metric: "Weekly completion rate",
      successThreshold: ">=70% by week 4",
      timebox: "4 weeks",
      frameworksUsed: ["teresa_torres"],
    });
    expect(test.valid).toBe(false);
    expect(test.reasons).toContain("missing_required_frameworks");
  });

  it("requires method, metric, threshold, and timebox for tests", () => {
    const test = validateSolutionTest({
      title: "Pilot test",
      method: "",
      metric: "completion rate",
      successThreshold: "10% lift",
      timebox: "2 weeks",
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(test.valid).toBe(false);
    expect(test.reasons).toContain("missing_method");
  });

  it("accepts valid solution ideas", () => {
    const idea = validateSolutionIdea({
      title: "Structured scope review workflow",
      description: "Implement a guided review step before analysis to reduce scope ambiguity.",
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(idea.valid).toBe(true);
  });
});
