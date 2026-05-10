import { describe, expect, it } from "vitest";
import {
  buildRouteWhyThisMattersNarrative,
  classifyRouteQuality,
  rewriteRouteLanguage,
  type RouteLanguageInput,
} from "./routeLanguage";

function makeInput(overrides: Partial<RouteLanguageInput> = {}): RouteLanguageInput {
  return {
    category: "improve",
    title: "Enhance Path Selection Confidence",
    shortDescription:
      "Improve how customers find and choose marketing paths aligned with their unique brand positioning to increase confidence and strategic fit.",
    whyThisMatters: [
      "Improve how customers find and choose marketing paths aligned with their unique brand positioning to increase confidence and strategic fit.",
      "Linked to 4 opportunity signals, led by Increase likelihood customers select marketing paths aligned with their unique brand positioning.",
      "At least one related job step is still marked as a gap, so this route reduces visible execution risk.",
    ],
    linkedHypotheses: [],
    opportunityOutcome: "Increase likelihood customers select marketing paths aligned with their unique brand positioning.",
  };
}

describe("route language", () => {
  it("classifies generic capability-bucket titles as generic", () => {
    const quality = classifyRouteQuality(makeInput());
    expect(quality.quality).toBe("generic");
    expect(quality.reasons).toContain("generic_start");
  });

  it("rewrites generic Fomo route language into a decision-shaped path", () => {
    const rewritten = rewriteRouteLanguage(makeInput());
    expect(rewritten.title).toBe("Reduce uncertainty about which path fits the brand");
    expect(rewritten.shortDescription).toContain("before effort is committed");
    expect(rewritten.qualityAfter.quality).toMatch(/strong|highly_specific/);
  });

  it("rewrites donor-impact routes into trust and visibility language", () => {
    const rewritten = rewriteRouteLanguage({
      category: "improve",
      title: "Strengthen Funding Cycle Reporting",
      shortDescription:
        "Improve clarity and completeness of funding cycle reports shared with donors and stakeholders to demonstrate impact and sustain support.",
      whyThisMatters: [
        "Improve clarity and completeness of funding cycle reports shared with donors and stakeholders to demonstrate impact and sustain support.",
      ],
      linkedHypotheses: [
        {
          statement: "Donor willingness may depend on visible governance and community participation.",
        },
      ],
    });

    expect(rewritten.title).toBe("Reduce donor uncertainty around long-term impact visibility");
    expect(rewritten.shortDescription).toContain("future support depends less on trust alone");
  });

  it("uses linked hypothesis context to sharpen repeat-purchase routes", () => {
    const rewritten = rewriteRouteLanguage({
      category: "create",
      title: "Create repeat-purchase measurement loop",
      shortDescription:
        "No system exists to track whether customers return or how purchase frequency changes over time.",
      whyThisMatters: [
        "Repeat purchase rate is the leading indicator of whether the core experience is landing.",
        "A lightweight tracking loop creates the feedback channel needed to validate every other route.",
      ],
      linkedHypotheses: [
        {
          statement: "Switching risk may stay high unless supplier value is easy to perceive.",
          whatMustBeTrue: ["Supplier switching must remain easy enough that proof gaps change behavior."],
          dependencyType: "supports",
        },
      ],
    });

    expect(rewritten.title).toBe("Test whether operational proof changes repeat purchasing confidence");
    expect(rewritten.whyThisMatters.join(" ")).toContain("supplier switching must remain easy enough");
  });

  it("removes generic why-this-matters boilerplate", () => {
    const lines = buildRouteWhyThisMattersNarrative(makeInput());
    expect(lines.some((line) => /Linked to \d+ opportunity signals/i.test(line))).toBe(false);
    expect(lines.some((line) => /reduces visible execution risk/i.test(line))).toBe(false);
  });
});
