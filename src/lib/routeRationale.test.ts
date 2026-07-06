import { describe, expect, it } from "vitest";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { RouteRow } from "@/hooks/useRoutes";
import { buildRouteRationales, type RouteRationaleEvidenceItem } from "./routeRationale";

function makeRoute(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: "route-1",
    company_id: "company-1",
    category: "fix",
    title: "Make proof of operational reliability visible earlier",
    short_description: "Reduce trust loss before buyers experience the operational value of the offer.",
    why_this_matters_json: ["Trust breaks down before the operational value becomes visible."],
    frameworks_used: ["odi"],
    pts_value: 6,
    effort: "medium",
    type: "Fix",
    sort_order: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvidence(items: Partial<RouteRationaleEvidenceItem>[] = []): RouteRationaleEvidenceItem[] {
  if (items.length > 0) {
    return items.map((item, index) => ({
      id: item.id || `ev-${index + 1}`,
      title: item.title || `Evidence ${index + 1}`,
      status: item.status || "missing",
    }));
  }
  return [
    { id: "ev-1", title: "Customer proof that operational reliability changes buying confidence", status: "missing" },
  ];
}

function makeHypothesis(overrides: Partial<HypothesisProvenanceCard> = {}): HypothesisProvenanceCard {
  return {
    hypothesis: {
      id: "hyp-1",
      company_id: "company-1",
      hypothesis_key: "hyp-1",
      statement: "Category positioning may need stronger operational proof to hold buyer trust.",
      hypothesis_kind: "directional_hypothesis",
      hypothesis_state: "inferred",
      topic: "positioning",
      confidence: "low",
      validation_state: "unvalidated",
      what_must_be_true: ["We need evidence that clearer operational proof changes confidence or choice."],
      source_run_id: null,
      reframed_from_hypothesis_id: null,
      is_active: true,
      raw_payload: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    supportingClaims: [
      {
        claim: {
          id: "claim-1",
          company_id: "company-1",
          statement: "Public positioning emphasizes artisanal quality more than operational proof.",
          topic: "positioning",
          claim_type: "inference",
          outside_support_count: 1,
          organization_support_count: 1,
          customer_support_count: 0,
          triangulation_state: "multi_source",
          confidence: "medium",
          revalidation_flag: false,
          raw_payload: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        dependencyTypes: ["supports"],
        supportShape: { outside: 1, organization: 1, customer: 0 },
        contradictionCount: 0,
        derivedTriangulationState: "multi_source",
        strongestSupportingSignal: null,
        supportingSignals: [],
        contradictorySignals: [],
        qualifyingSignals: [],
      },
    ],
    weakeningClaims: [],
    latestEventAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRouteLink(overrides: Partial<{
  routeId: string;
  hypothesisId: string;
  dependencyType: "supports" | "constrains" | "assumes" | "contradicts";
  strength: "high" | "medium" | "low";
}> = {}) {
  return {
    routeId: overrides.routeId || "route-1",
    hypothesisId: overrides.hypothesisId || "hyp-1",
    dependencyType: overrides.dependencyType || "supports",
    strength: overrides.strength || "high",
  };
}

describe("route rationale", () => {
  it("treats outside and internal route support as customer validation missing", () => {
    const rationales = buildRouteRationales({
      seeds: [{ route: makeRoute(), evidence: makeEvidence(), assumptions: [] }],
      hypotheses: [makeHypothesis()],
      recommendedRouteId: "route-1",
      phase: "diagnose",
    });

    expect(rationales[0]?.confidenceLabel).toBe("Customer validation missing");
    expect(rationales[0]?.readiness).toBe("Validate");
    expect(rationales[0]?.readinessMeaning).toBe("Confidence has built enough to validate. Not yet safe to commit.");
    expect(rationales[0]?.whatSupportsIt).toContain("Customer proof is still missing");
  });

  it("marks routes as strengthening when customer-backed multi-source evidence exists", () => {
    const rationale = buildRouteRationales({
      seeds: [{ route: makeRoute(), evidence: makeEvidence(), assumptions: [] }],
      hypotheses: [
        makeHypothesis({
          hypothesis: {
            ...makeHypothesis().hypothesis,
            confidence: "medium",
            hypothesis_state: "emerging",
          },
          supportingClaims: [
            {
              ...makeHypothesis().supportingClaims[0],
              supportShape: { outside: 1, organization: 1, customer: 1 },
              supportingSignals: [
                {
                  ref: { id: "ref-1", company_id: "company-1", claim_id: "claim-1", signal_id: "signal-1", relationship: "supports", created_at: new Date().toISOString() },
                  signal: {
                    id: "signal-1",
                    company_id: "company-1",
                    source_id: null,
                    source_type: "interview",
                    source_title: null,
                    source_url: null,
                    signal_band: "customer",
                    evidence_type: "customer_validation",
                    claim_text: "Operators say reliability changes supplier trust.",
                    evidence_excerpt: "Reliability changes supplier trust.",
                    topic: "problem",
                    framework: null,
                    directness: "direct",
                    recency: null,
                    framing_fit: "strong",
                    structure_level: "interpreted",
                    validation_status: "validated",
                    confidence_to_use: "high",
                    raw_payload: {},
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                },
              ],
            },
          ],
        }),
      ],
      recommendedRouteId: "route-1",
    })[0];

    expect(rationale.confidenceLabel).toBe("Evidence is starting to converge");
    expect(rationale.movement).toBe("strengthen");
    expect(rationale.readiness).toBe("Commit");
  });

  it("marks routes contradicted when weakening evidence is present", () => {
    const rationale = buildRouteRationales({
      seeds: [{ route: makeRoute(), evidence: makeEvidence(), assumptions: [] }],
      hypotheses: [
        makeHypothesis({
          weakeningClaims: [
            {
              ...makeHypothesis().supportingClaims[0],
              claim: {
                ...makeHypothesis().supportingClaims[0].claim,
                id: "claim-2",
                statement: "Customers prioritize convenience over operational reliability.",
              },
            },
          ],
        }),
      ],
      recommendedRouteId: "route-1",
    })[0];

    expect(rationale.confidenceLabel).toBe("Contradicted by recent evidence");
    expect(rationale.movement).toBe("weaken");
    expect(rationale.readiness).toBe("Hold");
  });

  it("prefers explicit graph-linked hypotheses over lexical fallback", () => {
    const fallbackHypothesis = makeHypothesis();
    const explicitHypothesis = makeHypothesis({
      hypothesis: {
        ...makeHypothesis().hypothesis,
        id: "hyp-2",
        statement: "Partner fit may matter more than wholesale reach.",
      },
      supportingClaims: [
        {
          ...makeHypothesis().supportingClaims[0],
          claim: {
            ...makeHypothesis().supportingClaims[0].claim,
            id: "claim-2",
            statement: "Selective partner fit appears to matter more than wholesale reach.",
          },
        },
      ],
    });

    const rationale = buildRouteRationales({
      seeds: [{ route: makeRoute(), evidence: makeEvidence(), assumptions: [] }],
      hypotheses: [fallbackHypothesis, explicitHypothesis],
      routeLinks: [makeRouteLink({ hypothesisId: "hyp-2", dependencyType: "assumes", strength: "high" })],
      recommendedRouteId: "route-1",
    })[0];

    expect(rationale.linkSource).toBe("graph_linked");
    expect(rationale.matchedHypothesisIds).toEqual(["hyp-2"]);
    expect(rationale.whyThisRouteExists.toLowerCase()).toMatch(/emerging strategy|partner fit may matter more than wholesale reach/);
  });

  it("uses specific support language when graph-linked evidence exists", () => {
    const rationale = buildRouteRationales({
      seeds: [{ route: makeRoute(), evidence: makeEvidence(), assumptions: [] }],
      hypotheses: [makeHypothesis()],
      routeLinks: [makeRouteLink({ dependencyType: "supports", strength: "high" })],
      recommendedRouteId: "route-1",
      phase: "diagnose",
    })[0];

    expect(rationale.linkSource).toBe("graph_linked");
    expect(rationale.whatSupportsIt).toContain("Customer proof is still missing");
  });

  it("lets diagnose favor strategic direction over public descriptors when both exist", () => {
    const outsideHypothesis = makeHypothesis({
      supportingClaims: [
        {
          ...makeHypothesis().supportingClaims[0],
          supportShape: { outside: 2, organization: 0, customer: 0 },
          claim: {
            ...makeHypothesis().supportingClaims[0].claim,
            statement: "Public positioning emphasizes craft quality and specialty coffee.",
          },
        },
      ],
    });

    const orgHypothesis = makeHypothesis({
      hypothesis: {
        ...makeHypothesis().hypothesis,
        id: "hyp-2",
        statement: "Partner operational outcomes may matter more than craft identity.",
      },
      supportingClaims: [
        {
          ...makeHypothesis().supportingClaims[0],
          claim: {
            ...makeHypothesis().supportingClaims[0].claim,
            id: "claim-2",
            statement: "Internal strategy is centered on partner operational outcomes and operator risk reduction.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    const rationale = buildRouteRationales({
      seeds: [{ route: makeRoute(), evidence: makeEvidence(), assumptions: [] }],
      hypotheses: [outsideHypothesis, orgHypothesis],
      recommendedRouteId: "route-1",
      phase: "diagnose",
    })[0];

    expect(rationale.whyThisRouteExists).toContain("emerging strategy appears centered on");
    expect(rationale.whyThisRouteExists.toLowerCase()).toContain("partner operational outcomes");
    expect(rationale.whatSupportsIt).toContain("The route fits a direction increasingly centered on partner operational outcomes");
    expect(rationale.whatSupportsIt).toContain("Outside perception reads as a company publicly known for craft quality and specialty coffee");
  });

  it("filters generic route assumptions out of what must become true", () => {
    const orgHypothesis = makeHypothesis({
      hypothesis: {
        ...makeHypothesis().hypothesis,
        id: "hyp-2",
        statement: "Operational reliability may matter more than coffee novelty.",
        confidence: "medium",
      },
      supportingClaims: [
        {
          ...makeHypothesis().supportingClaims[0],
          claim: {
            ...makeHypothesis().supportingClaims[0].claim,
            id: "claim-2",
            statement: "Internal strategy is centered on operational reliability and lower operator burden.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    const rationale = buildRouteRationales({
      seeds: [
        {
          route: makeRoute(),
          evidence: makeEvidence(),
          assumptions: [
            {
              id: "assumption-1",
              statement: "There is validated demand for this new capability.",
              status: "unproven",
              layer: "customer",
              critical: true,
            },
          ],
        },
      ],
      hypotheses: [orgHypothesis],
      recommendedRouteId: "route-1",
      phase: "focus",
    })[0];

    expect(rationale.mustBecomeTrue).not.toBe("There is validated demand for this new capability.");
    expect(rationale.mustBecomeTrue.toLowerCase()).toMatch(/operational reliability|clearer operational proof/);
  });

  it("treats contradiction links as weakening even without lexical weakening claims", () => {
    const rationale = buildRouteRationales({
      seeds: [{ route: makeRoute(), evidence: makeEvidence(), assumptions: [] }],
      hypotheses: [makeHypothesis()],
      routeLinks: [makeRouteLink({ dependencyType: "contradicts", strength: "medium" })],
      recommendedRouteId: "route-1",
    })[0];

    expect(rationale.linkSource).toBe("graph_linked");
    expect(rationale.confidenceLabel).toBe("Contradicted by recent evidence");
    expect(rationale.movement).toBe("weaken");
  });

  it("surfaces critical assumptions in what must become true", () => {
    const rationale = buildRouteRationales({
      seeds: [
        {
          route: makeRoute(),
          evidence: makeEvidence(),
          assumptions: [
            {
              id: "assumption-1",
              statement: "Customers need to respond to visible proof of reliability, not just price.",
              status: "unproven",
              layer: "customer",
              critical: true,
            },
          ],
        },
      ],
      hypotheses: [makeHypothesis()],
      recommendedRouteId: "route-1",
    })[0];

    expect(rationale.mustBecomeTrue).toBe("Customers need to respond to visible proof of reliability, not just price.");
  });

  it("can narrow the lead route when it clearly outranks weaker alternatives", () => {
    const primaryRoute = makeRoute();
    const weakRoute = makeRoute({
      id: "route-2",
      title: "Improve partner communications",
      short_description: "Keep communication more consistent.",
      why_this_matters_json: ["Communication quality matters."],
      category: "improve",
    });

    const rationales = buildRouteRationales({
      seeds: [
        { route: primaryRoute, evidence: makeEvidence(), assumptions: [] },
        { route: weakRoute, evidence: makeEvidence([{ title: "General communication hygiene" }]), assumptions: [] },
      ],
      hypotheses: [makeHypothesis()],
      recommendedRouteId: "route-1",
    });

    const lead = rationales.find((item) => item.routeId === "route-1");
    expect(lead?.movement).toBe("narrow");
  });

  it("marks routes with no meaningful support and major open dependencies as hold", () => {
    const rationale = buildRouteRationales({
      seeds: [
        {
          route: makeRoute({
            title: "Explore whether proof matters",
            short_description: "A directional path with very thin support.",
            why_this_matters_json: ["This may matter, but we do not know enough yet."],
          }),
          evidence: [
            { id: "ev-1", title: "Customer proof is still missing", status: "missing" },
            { id: "ev-2", title: "No internal validation exists yet", status: "missing" },
          ],
          assumptions: [
            {
              id: "assumption-1",
              statement: "Customers would notice visible operational proof.",
              status: "unproven",
              layer: "customer",
              critical: true,
            },
            {
              id: "assumption-2",
              statement: "The team can supply that proof consistently.",
              status: "unproven",
              layer: "org",
              critical: true,
            },
          ],
        },
      ],
      hypotheses: [],
      recommendedRouteId: "route-1",
    })[0];

    expect(rationale.confidenceLabel).toBe("Still highly uncertain");
    expect(rationale.readiness).toBe("Hold");
  });

  it("marks early directional routes as investigate", () => {
    const rationale = buildRouteRationales({
      seeds: [{ route: makeRoute(), evidence: makeEvidence(), assumptions: [] }],
      hypotheses: [
        makeHypothesis({
          supportingClaims: [
            {
              ...makeHypothesis().supportingClaims[0],
              supportShape: { outside: 1, organization: 0, customer: 0 },
            },
          ],
        }),
      ],
      recommendedRouteId: "route-1",
      phase: "outside_signals",
    })[0];

    expect(rationale.confidenceLabel).toBe("Still highly uncertain");
    expect(rationale.readiness).toBe("Investigate");
    expect(rationale.readinessMeaning).toBe("Worth examining further. Not enough has formed yet to narrow direction.");
  });
});
