import { describe, expect, it } from "vitest";
import {
  buildConservativeRouteHypothesisLinks,
  type RouteHypothesisLike,
  type RouteHypothesisRouteLike,
} from "./routeHypothesisLinking";

function makeRoute(overrides: Partial<RouteHypothesisRouteLike> = {}): RouteHypothesisRouteLike {
  return {
    id: "route-1",
    category: "fix",
    title: "Make proof of operational reliability visible earlier",
    short_description: "Reduce trust loss before buyers experience the operational value of the offer.",
    why_this_matters_json: ["Trust breaks down before the operational value becomes visible."],
    assumptions_json: [
      { statement: "Buyers need visible proof before they trust the offer.", critical: true },
    ],
    ...overrides,
  };
}

function makeHypothesis(overrides: Partial<RouteHypothesisLike> = {}): RouteHypothesisLike {
  return {
    id: "hyp-1",
    statement: "Public positioning may need stronger operational proof to win trust.",
    hypothesis_kind: "directional_hypothesis",
    hypothesis_state: "inferred",
    topic: "positioning",
    confidence: "low",
    what_must_be_true: ["Buyers must need more operational proof than current public positioning provides."],
    is_active: true,
    ...overrides,
  };
}

describe("route hypothesis linking", () => {
  it("ignores retired hypotheses", () => {
    const links = buildConservativeRouteHypothesisLinks({
      routes: [makeRoute()],
      hypotheses: [
        {
          hypothesis: makeHypothesis({ id: "hyp-retired", hypothesis_state: "retired", is_active: false }),
          supportShape: { outside: 1, organization: 1, customer: 0 },
        },
      ],
    });

    expect(links).toHaveLength(0);
  });

  it("does not link broad generic positioning hypotheses to unrelated routes", () => {
    const links = buildConservativeRouteHypothesisLinks({
      routes: [
        makeRoute({
          id: "route-ops",
          category: "create",
          title: "Build an onboarding toolkit",
          short_description: "Standardize installation and training for new teams.",
          why_this_matters_json: ["Implementation consistency matters more than messaging."],
          assumptions_json: [{ statement: "The team can operationalize onboarding.", critical: true }],
        }),
      ],
      hypotheses: [
        {
          hypothesis: makeHypothesis({
            statement: "Public positioning may need stronger operational proof to win trust.",
            topic: "positioning",
          }),
          supportShape: { outside: 1, organization: 0, customer: 0 },
        },
      ],
    });

    expect(links).toHaveLength(0);
  });

  it("dedupes duplicate route-hypothesis links", () => {
    const route = makeRoute();
    const links = buildConservativeRouteHypothesisLinks({
      routes: [route, { ...route }],
      hypotheses: [
        {
          hypothesis: makeHypothesis(),
          supportShape: { outside: 1, organization: 1, customer: 0 },
        },
      ],
    });

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ routeId: "route-1", hypothesisId: "hyp-1" });
  });

  it("preserves contradiction links when a contradicted hypothesis clearly maps to a route", () => {
    const links = buildConservativeRouteHypothesisLinks({
      routes: [makeRoute()],
      hypotheses: [
        {
          hypothesis: makeHypothesis({
            id: "hyp-contradicted",
            hypothesis_state: "contradicted",
            statement: "Public positioning may need stronger operational proof to win trust.",
          }),
          supportShape: { outside: 1, organization: 1, customer: 0 },
          hasContradiction: true,
        },
      ],
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.dependencyType).toBe("contradicts");
  });

  it("maps unstable hypothesis to constrains dependency type", () => {
    const links = buildConservativeRouteHypothesisLinks({
      routes: [makeRoute()],
      hypotheses: [
        {
          hypothesis: makeHypothesis({
            id: "hyp-unstable",
            hypothesis_state: "unstable",
            statement: "Public positioning may need stronger operational proof to win trust.",
          }),
          supportShape: { outside: 1, organization: 1, customer: 0 },
        },
      ],
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.dependencyType).toBe("constrains");
  });

  it("strengthened hypothesis maps to supports dependency type", () => {
    const links = buildConservativeRouteHypothesisLinks({
      routes: [makeRoute()],
      hypotheses: [
        {
          hypothesis: makeHypothesis({
            id: "hyp-strong",
            hypothesis_state: "strengthened",
            confidence: "high",
            statement: "Public positioning may need stronger operational proof to win trust.",
          }),
          supportShape: { outside: 2, organization: 1, customer: 1 },
        },
      ],
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.dependencyType).toBe("supports");
  });
});
