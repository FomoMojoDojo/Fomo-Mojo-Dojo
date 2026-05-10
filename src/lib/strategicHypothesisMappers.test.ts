import { describe, expect, it } from "vitest";
import type { Claim } from "./evidenceDomain";
import { buildStrategicHypothesisCandidates } from "./strategicHypothesisMappers";

function makeClaim(overrides: Partial<Claim>): Claim {
  return {
    id: "claim-1",
    company_id: "company-1",
    statement: "Public positioning emphasizes artisanal quality more than operational proof.",
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
    ...overrides,
  };
}

describe("strategic hypothesis mappers", () => {
  it("generates directional hypotheses from outside-backed claims", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim(),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.hypothesis_kind).toBe("directional_hypothesis");
    expect(candidates[0].hypothesis.hypothesis_state).toBe("inferred");
    expect(candidates[0].hypothesis.statement).toBe("Public positioning may need stronger operational proof to win trust.");
  });

  it("treats contradicted claims as inferred tensions instead of commitments", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-2",
        statement: "Partnership positioning conflicts with customer reports of operational self-management burden.",
        topic: "problem",
        claim_type: "hypothesis",
        outside_support_count: 1,
        customer_support_count: 1,
        triangulation_state: "contradicted",
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.hypothesis_kind).toBe("inferred_tension");
    expect(candidates[0].hypothesis.hypothesis_state).toBe("strengthened");
    expect(candidates[0].hypothesis.validation_state).toBe("directional");
  });

  it("generates candidate assumptions from internal strategic beliefs", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-3",
        statement: "Internal strategy favors depth with selected partners over broad wholesale volume.",
        topic: "strategy",
        claim_type: "strategic_belief",
        outside_support_count: 0,
        organization_support_count: 2,
        customer_support_count: 0,
        triangulation_state: "single_source",
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.hypothesis_kind).toBe("candidate_assumption");
    expect(candidates[0].hypothesis.statement).toBe("Cafe Barra may need to prioritize partner fit over wholesale reach.");
    expect(candidates[0].hypothesis.what_must_be_true.length).toBeGreaterThan(0);
  });

  it("keeps weakening evidence separate and marks directional hypotheses contradicted", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-4",
        statement: "Reliability concerns appear tied to repeat purchasing confidence.",
        topic: "problem",
        outside_support_count: 1,
        organization_support_count: 1,
        triangulation_state: "multi_source",
      }),
      makeClaim({
        id: "claim-5",
        statement: "Reliability concerns conflict with claims that current proof already feels sufficient.",
        topic: "problem",
        claim_type: "hypothesis",
        outside_support_count: 1,
        triangulation_state: "contradicted",
      }),
    ]);

    const target = candidates.find((candidate) => candidate.supportingClaimIds.includes("claim-4"));
    expect(target).toBeTruthy();
    expect(target?.weakeningClaimIds).toContain("claim-5");
    expect(target?.hypothesis.hypothesis_state).toBe("contradicted");
  });

  it("suppresses question-shaped and route-shaped internal statements", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-6",
        statement: "What specific outcomes do marketing teams aim for?",
        topic: "strategy",
        claim_type: "strategic_belief",
        organization_support_count: 1,
      }),
      makeClaim({
        id: "claim-7",
        statement: "Create quantifiable proof of impact for MojoMapTM on decision-making.",
        topic: "strategy",
        claim_type: "strategic_belief",
        organization_support_count: 1,
      }),
    ]);

    expect(candidates).toHaveLength(0);
  });

  it("does not strengthen org-only repetition without customer or multi-band support", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-8",
        statement: "Internal strategy favors depth with selected partners over broad wholesale volume.",
        topic: "strategy",
        claim_type: "strategic_belief",
        outside_support_count: 0,
        organization_support_count: 3,
        customer_support_count: 0,
        triangulation_state: "single_source",
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.hypothesis_state).toBe("inferred");
    expect(candidates[0].hypothesis.confidence).toBe("low");
  });

  it("suppresses weak outside descriptions about teaser content or product placeholders", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-9",
        statement: "The service or offering may include digital content or potential upcoming products as the site states 'SOON' and has a contact form for inquiries.",
        topic: "market",
        claim_type: "inference",
        outside_support_count: 1,
        organization_support_count: 0,
        customer_support_count: 0,
        triangulation_state: "single_source",
      }),
    ]);

    expect(candidates).toHaveLength(0);
  });

  it("collapses duplicate counterintuitive-strategy concepts into one hypothesis statement", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-10",
        statement: "Their core value proposition relies on delivering ideas and execution plans that defy standard business norms to create unique competitive advantages.",
        topic: "strategy",
        claim_type: "inference",
        outside_support_count: 1,
        organization_support_count: 0,
        customer_support_count: 0,
        triangulation_state: "single_source",
      }),
      makeClaim({
        id: "claim-11",
        statement: "Counterintuitive strategies may be central to how the offer is positioned.",
        topic: "strategy",
        claim_type: "inference",
        outside_support_count: 1,
        organization_support_count: 0,
        customer_support_count: 0,
        triangulation_state: "single_source",
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.statement).toBe("The offer may depend on buyers valuing counterintuitive strategic guidance over conventional best practice.");
    expect(candidates[0].supportingClaimIds).toEqual(expect.arrayContaining(["claim-10", "claim-11"]));
  });
});
