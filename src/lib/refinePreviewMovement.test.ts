import { describe, expect, it } from "vitest";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { StrategicChangeSummary } from "@/hooks/useStrategicChangeSummary";
import type { RouteRationale } from "@/lib/routeRationale";
import { buildRefinePreviewMovementItems } from "./refinePreviewMovement";

function makeRow(overrides: Partial<HypothesisProvenanceCard>): HypothesisProvenanceCard {
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
      what_must_be_true: [],
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
          statement: "Public positioning emphasizes artisanal quality over operational proof.",
          topic: "positioning",
          claim_type: "inference",
          outside_support_count: 1,
          organization_support_count: 0,
          customer_support_count: 0,
          triangulation_state: "single_source",
          confidence: "low",
          revalidation_flag: false,
          raw_payload: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        dependencyTypes: ["supports"],
        supportShape: { outside: 1, organization: 0, customer: 0 },
        contradictionCount: 0,
        derivedTriangulationState: "single_source",
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

function makeChangeSummary(overrides: Partial<StrategicChangeSummary> = {}): StrategicChangeSummary {
  return {
    latestJobMapEvent: null,
    affectedArtifacts: [],
    affectedCounts: { total: 0, odi_needs: 0, routes: 0, desired_outcomes: 0 },
    scoreNote: null,
    debug: {
      latestEventId: null,
      latestEventAt: null,
      latestArtifactVersionCount: 0,
      dependenciesCreatedCount: 0,
    },
    ...overrides,
  };
}

function makeRationale(overrides: Partial<RouteRationale> = {}): RouteRationale {
  return {
    routeId: "route-1",
    routeTitle: "Test whether operational proof changes repeat purchasing confidence",
    confidenceLabel: "Customer validation missing",
    movement: "narrow",
    movementLabel: "Narrowing",
    readiness: "Validate",
    readinessMeaning: "Promising path. Needs validation before commitment.",
    whyThisRouteExists: "Why this route exists",
    whatSupportsIt: "Public and internal evidence are pointing toward proof and trust, but customer proof is still missing.",
    uncertainty: "We still do not have direct customer evidence showing this route would change real decisions.",
    mustBecomeTrue: "We need evidence that clearer operational proof changes confidence or choice.",
    couldWeaken: "If buyers prioritize price or convenience more than reliability, this route may weaken.",
    supportingEvidenceLines: [],
    weakeningEvidenceLines: [],
    relevanceScore: 1,
    matchedHypothesisIds: [],
    supportShape: { outside: 1, organization: 1, customer: 0 },
    linkSource: "graph_linked",
    ...overrides,
  };
}

describe("refine preview movement", () => {
  it("surfaces customer proof as the main gap when hypotheses are outside-only", () => {
    const items = buildRefinePreviewMovementItems({
      activeRows: [makeRow({})],
      allRows: [makeRow({})],
      phaseLabel: "Pre-Diagnosis",
      changeSummary: makeChangeSummary(),
    });

    expect(items[0]?.headline).toBe("Customer proof is still the main gap.");
    expect(items[0]?.confidenceImplication).toContain("Confidence stays directional");
  });

  it("elevates needs review when downstream needs are unsettled", () => {
    const items = buildRefinePreviewMovementItems({
      activeRows: [makeRow({})],
      allRows: [makeRow({})],
      phaseLabel: "Diagnose",
      changeSummary: makeChangeSummary({
        affectedArtifacts: [
          {
            object_type: "odi_need",
            object_id: "need-1",
            label: "Reduce dial-in burden during new coffee arrivals",
            dependency_state: "needs_review",
            stale_reason: "Job map was regenerated",
            updated_at: new Date().toISOString(),
          },
        ],
        affectedCounts: { total: 1, odi_needs: 1, routes: 0, desired_outcomes: 0 },
      }),
    });

    expect(items.some((item) => item.headline === "Some needs now require review.")).toBe(true);
    expect(items.find((item) => item.headline === "Some needs now require review.")?.evidenceLines).toContain(
      "Reduce dial-in burden during new coffee arrivals",
    );
  });

  it("prioritizes the customer proof gap ahead of lower-priority read-focusing movement", () => {
    const activeRow = makeRow({});
    const retiredRow = makeRow({
      hypothesis: {
        ...makeRow({}).hypothesis,
        id: "hyp-retired",
        is_active: false,
        hypothesis_state: "retired",
        statement: "A broader positioning issue may explain the current signal noise.",
      },
      latestEventAt: new Date().toISOString(),
    });

    const items = buildRefinePreviewMovementItems({
      activeRows: [activeRow],
      allRows: [activeRow, retiredRow],
      phaseLabel: "Pre-Diagnosis",
      changeSummary: makeChangeSummary(),
    });

    expect(items[0]?.headline).toBe("Customer proof is still the main gap.");
    expect(items.some((item) => item.headline === "The outside read is becoming more focused.")).toBe(true);
  });

  it("recognizes customer-backed movement as strengthening instead of a gap", () => {
    const customerRow = makeRow({
      hypothesis: {
        ...makeRow({}).hypothesis,
        id: "hyp-2",
        statement: "Reliability may matter more to repeat purchasing than novelty.",
      },
      supportingClaims: [
        {
          ...makeRow({}).supportingClaims[0],
          supportShape: { outside: 1, organization: 1, customer: 1 },
        },
      ],
    });

    const items = buildRefinePreviewMovementItems({
      activeRows: [customerRow],
      allRows: [customerRow],
      phaseLabel: "Diagnose",
      changeSummary: makeChangeSummary(),
    });

    expect(items[0]?.headline).toBe("Customer evidence is starting to reinforce part of the read.");
    expect(items[0]?.tone).toBe("strengthening");
  });

  it("surfaces open tensions without using backend language", () => {
    const tensionRow = makeRow({
      hypothesis: {
        ...makeRow({}).hypothesis,
        id: "hyp-3",
        statement: "Artisanal positioning may conflict with operators' need for predictable execution.",
        hypothesis_kind: "inferred_tension",
      },
    });

    const items = buildRefinePreviewMovementItems({
      activeRows: [tensionRow],
      allRows: [tensionRow],
      phaseLabel: "Diagnose",
      changeSummary: makeChangeSummary(),
    });

    expect(items.some((item) => item.headline === "A strategic tension is still open.")).toBe(true);
  });

  it("shows focus when recent retired directions narrow the read", () => {
    const activeRow = makeRow({
      hypothesis: {
        ...makeRow({}).hypothesis,
        id: "hyp-4",
        statement: "Switching risk may persist while supplier benefits are not easy to see.",
      },
    });
    const retiredRow = makeRow({
      hypothesis: {
        ...makeRow({}).hypothesis,
        id: "hyp-5",
        is_active: false,
        hypothesis_state: "retired",
        statement: "A broader positioning issue may explain the current signal noise.",
      },
      latestEventAt: new Date().toISOString(),
    });

    const items = buildRefinePreviewMovementItems({
      activeRows: [activeRow],
      allRows: [activeRow, retiredRow],
      phaseLabel: "Pre-Diagnosis",
      changeSummary: makeChangeSummary(),
    });

    expect(items.some((item) => item.headline === "The outside read is becoming more focused.")).toBe(true);
  });

  it("uses route posture to narrate focus-phase movement", () => {
    const items = buildRefinePreviewMovementItems({
      activeRows: [makeRow({})],
      allRows: [makeRow({})],
      phaseLabel: "Focus",
      changeSummary: makeChangeSummary(),
      routeRationales: [makeRationale()],
    });

    expect(items.some((item) => item.headline === "A lead route is becoming safer to focus around.")).toBe(true);
  });

  it("uses route weakening to narrate flow-phase drift", () => {
    const items = buildRefinePreviewMovementItems({
      activeRows: [makeRow({})],
      allRows: [makeRow({})],
      phaseLabel: "Flow",
      changeSummary: makeChangeSummary(),
      routeRationales: [makeRationale({ movement: "weaken", movementLabel: "Weakening", readiness: "Hold", confidenceLabel: "Contradicted by recent evidence" })],
    });

    expect(items.some((item) => item.headline === "Confidence around the current route is softening.")).toBe(true);
  });

  it("surfaces public-versus-strategy conflict during diagnose", () => {
    const outsideRow = makeRow({
      hypothesis: {
        ...makeRow({}).hypothesis,
        statement: "Public positioning still emphasizes craft quality.",
      },
      supportingClaims: [
        {
          ...makeRow({}).supportingClaims[0],
          claim: {
            ...makeRow({}).supportingClaims[0].claim,
            statement: "Public positioning emphasizes craft quality and specialty coffee.",
          },
          supportShape: { outside: 2, organization: 0, customer: 0 },
        },
      ],
    });
    const orgRow = makeRow({
      hypothesis: {
        ...makeRow({}).hypothesis,
        id: "hyp-9",
        statement: "Partner operational outcomes may matter more than craft identity.",
        hypothesis_kind: "candidate_assumption",
      },
      supportingClaims: [
        {
          ...makeRow({}).supportingClaims[0],
          claim: {
            ...makeRow({}).supportingClaims[0].claim,
            id: "claim-9",
            statement: "Internal strategy is centered on partner operational outcomes and operator risk reduction.",
          },
          supportShape: { outside: 0, organization: 2, customer: 0 },
        },
      ],
    });

    const items = buildRefinePreviewMovementItems({
      activeRows: [outsideRow, orgRow],
      allRows: [outsideRow, orgRow],
      phaseLabel: "Diagnose",
      changeSummary: makeChangeSummary(),
    });

    expect(items.some((item) => item.headline === "The public story and strategic direction are not fully aligned.")).toBe(true);
  });
});
