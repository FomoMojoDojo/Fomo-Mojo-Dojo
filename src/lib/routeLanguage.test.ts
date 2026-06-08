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

  it("passes the route's own title/description through without canned substitution", () => {
    // Canned-substitution branches were removed: matching keywords must no longer
    // overwrite a route with a hardcoded coffee/commerce/marketing string.
    const rewritten = rewriteRouteLanguage(makeInput());
    expect(rewritten.title).toBe("Enhance Path Selection Confidence");
    expect(rewritten.title).not.toBe("Reduce uncertainty about which path fits the brand");
    expect(rewritten.shortDescription).toBe(makeInput().shortDescription);
  });

  // TODO: route-language generation for non-coffee/nonprofit domains is
  // undecided — donor-specific rewrites were removed in the identity refactor;
  // general data-derived replacement TBD (may be superseded by the
  // strategic-objects system). Re-enable and assert correct behavior once
  // decided. See SCOPE_refactor.md.
  it.skip("rewrites donor-impact routes into trust and visibility language", () => {
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

  it("keeps the route's own title and still surfaces linked-hypothesis context", () => {
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

    expect(rewritten.title).toBe("Create repeat-purchase measurement loop");
    expect(rewritten.title).not.toBe("Test whether operational proof changes repeat purchasing confidence");
    // Input-derived humanization (from the linked hypothesis) still flows through.
    expect(rewritten.whyThisMatters.join(" ")).toContain("supplier switching must remain easy enough");
  });

  it("removes generic why-this-matters boilerplate", () => {
    const lines = buildRouteWhyThisMattersNarrative(makeInput());
    expect(lines.some((line) => /Linked to \d+ opportunity signals/i.test(line))).toBe(false);
    expect(lines.some((line) => /reduces visible execution risk/i.test(line))).toBe(false);
  });
});
