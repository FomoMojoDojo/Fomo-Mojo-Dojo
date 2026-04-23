import { describe, expect, it } from "vitest";
import {
  ensureRequiredFrameworkKeys,
  hasRequiredFrameworkKeys,
  validateParentChildOpportunityDistinctness,
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

  it("flags near-duplicate parent-child opportunities", () => {
    const duplicate = validateParentChildOpportunityDistinctness(
      "Increase confidence when confirming decision scope before analysis",
      "Increase confidence when confirming scope before running analysis",
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

  it("allows process-oriented outcome wording when it remains solution-agnostic", () => {
    const desiredOutcome = validateDesiredOutcome({
      statement: "Increase the share of customers who complete the review process on time without rework.",
      leadingIndicator: "Share of customers completing review on time without repeat back-and-forth",
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(desiredOutcome.valid).toBe(true);

    const opportunity = validateOpportunity({
      outcome: "Increase the share of customers who complete the review process at first attempt.",
      importance: 8,
      satisfaction: 4,
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(opportunity.valid).toBe(true);
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

  // --- False-positive prevention tests ---

  it("allows opportunity outcome using 'workflow' as descriptive context", () => {
    const result = validateOpportunity({
      outcome: "Reduce the time customers spend navigating their approval workflow",
      importance: 8,
      satisfaction: 3,
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(result.valid).toBe(true);
    expect(result.reasons).not.toContain("contains_solution_language");
  });

  it("allows desired outcome using 'tool' as a usage context noun", () => {
    const result = validateDesiredOutcome({
      statement: "Increase the confidence teams have when using the tool to complete their first analysis",
      leadingIndicator: "Share of teams completing first analysis without requesting support",
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(result.reasons).not.toContain("contains_solution_language");
    const hardFailures = result.reasons.filter((r) => !r.startsWith("warning_"));
    expect(hardFailures).not.toContain("contains_solution_language");
  });

  it("allows 'form' when used as a metric completion context", () => {
    const result = validateOpportunity({
      outcome: "Increase the rate at which customers complete the intake form without errors",
      importance: 6,
      satisfaction: 4,
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(result.valid).toBe(true);
    expect(result.reasons).not.toContain("contains_solution_language");
  });

  it("allows 'solution' when describing customer struggle, not a prescribed artifact", () => {
    const result = validateOpportunity({
      outcome: "Reduce the time customers spend searching for a workable solution",
      importance: 7,
      satisfaction: 3,
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(result.valid).toBe(true);
    expect(result.reasons).not.toContain("contains_solution_language");
  });

  it("rejects opportunity that pairs a prescriptive verb with a solution noun", () => {
    const result = validateOpportunity({
      outcome: "Launch a new campaign workflow for onboarding teams",
      importance: 7,
      satisfaction: 5,
      frameworksUsed: ["odi", "teresa_torres"],
    });
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("contains_solution_language");
  });

  it("returns valid=true when only warning_ reasons are present", () => {
    // Uses internal-state language ("trust", "feel") in the indicator, which
    // should produce warning_contains_internal_state_language but no hard failures.
    // Statement satisfies: directional verb + measurable dimension + no solution language.
    const result = validateDesiredOutcome({
      statement: "Increase the consistency of cross-team decisions during weekly reviews",
      leadingIndicator: "Share of team leads who feel confident in cross-team commitments",
      frameworksUsed: ["odi", "teresa_torres"],
    });
    const hardFailures = result.reasons.filter((r) => !r.startsWith("warning_"));
    expect(hardFailures.length).toBe(0);
    expect(result.valid).toBe(true);
    expect(result.reasons.some((r) => r.startsWith("warning_"))).toBe(true);
  });
});
