import { describe, expect, it } from "vitest";
import type { Claim } from "./evidenceDomain";
import { buildStrategicHypothesisCandidates } from "./strategicHypothesisMappers";

function makeClaim(overrides: Partial<Claim>): Claim {
  return {
    id: "claim-1",
    company_id: "company-1",
    statement: "Buyers may value operational proof more than public positioning suggests.",
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
  it("passes uncertainty-framed outside-backed claims through verbatim", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim(),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.hypothesis_kind).toBe("directional_hypothesis");
    expect(candidates[0].hypothesis.hypothesis_state).toBe("inferred");
    expect(candidates[0].hypothesis.statement).toBe("Buyers may value operational proof more than public positioning suggests.");
  });

  it("yields zero candidates for declarative claims without uncertainty, assumption, or tension language", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        statement: "Public positioning emphasizes artisanal quality over operational proof.",
      }),
    ]);

    expect(candidates).toHaveLength(0);
  });

  it("yields zero candidates for the previously pattern-matched declarative claim texts", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-2",
        statement: "Reliability worries appear tied to repeat purchasing confidence.",
        topic: "problem",
        outside_support_count: 1,
        organization_support_count: 1,
        triangulation_state: "multi_source",
      }),
      makeClaim({
        id: "claim-3",
        statement: "Internal strategy favors depth with selected partners over broad wholesale volume.",
        topic: "strategy",
        claim_type: "strategic_belief",
        outside_support_count: 0,
        organization_support_count: 2,
        triangulation_state: "single_source",
      }),
    ]);

    expect(candidates).toHaveLength(0);
  });

  it("passes uncertainty-framed internal assumptions through verbatim", () => {
    const statement = "The MojoMap model depends on buyers treating decision systems as a buyable product.";
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-4",
        statement,
        topic: "strategy",
        claim_type: "strategic_belief",
        outside_support_count: 0,
        organization_support_count: 1,
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.hypothesis_kind).toBe("candidate_assumption");
    expect(candidates[0].hypothesis.statement).toBe(statement);
  });

  it("emits verbatim-or-nothing for claims that previously matched company-name patterns", () => {
    const inputs = [
      makeClaim({
        id: "claim-5",
        statement: "MojoMap will productize decision-making through flagship engagements.",
        topic: "strategy",
        claim_type: "strategic_belief",
        outside_support_count: 0,
        organization_support_count: 1,
      }),
      makeClaim({
        id: "claim-6",
        statement: "The MojoMap model depends on buyers treating decision systems as a buyable product.",
        topic: "strategy",
        claim_type: "strategic_belief",
        outside_support_count: 0,
        organization_support_count: 1,
      }),
    ];
    const candidates = buildStrategicHypothesisCandidates("company-1", inputs);

    // Declarative marketing copy produces nothing; the assumption-framed claim
    // passes through as itself. No statement may be text that exists in no claim.
    expect(candidates).toHaveLength(1);
    const inputStatements = new Set(inputs.map((claim) => claim.statement));
    for (const candidate of candidates) {
      expect(inputStatements.has(candidate.hypothesis.statement)).toBe(true);
    }
    const combined = candidates.map((candidate) => candidate.hypothesis.statement).join(" ");
    expect(combined).not.toMatch(/cafe barra|one805|consulting support|premium engagement/i);
  });

  it("normalizes only the subject prefix on assumption claims without uncertainty language", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-7",
        statement: "Their approach relies on selective partner fit rather than broad wholesale volume.",
        topic: "strategy",
        claim_type: "strategic_belief",
        outside_support_count: 0,
        organization_support_count: 3,
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.statement).toBe("The model approach relies on selective partner fit rather than broad wholesale volume.");
    expect(candidates[0].hypothesis.hypothesis_state).toBe("inferred");
    expect(candidates[0].hypothesis.confidence).toBe("low");
  });

  it("treats contradicted claims as inferred tensions and passes their text through verbatim", () => {
    const statement = "Partnership positioning conflicts with customer reports of operational self-management burden.";
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-8",
        statement,
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
    expect(candidates[0].hypothesis.statement).toBe(statement);
  });

  it("keeps weakening evidence separate and marks directional hypotheses contradicted", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-9",
        statement: "Reliability concerns may be shaping repeat purchasing confidence.",
        topic: "problem",
        outside_support_count: 1,
        organization_support_count: 1,
        triangulation_state: "multi_source",
      }),
      makeClaim({
        id: "claim-10",
        statement: "Reliability concerns conflict with claims that current proof already feels sufficient.",
        topic: "problem",
        claim_type: "hypothesis",
        outside_support_count: 1,
        triangulation_state: "contradicted",
      }),
    ]);

    const target = candidates.find((candidate) => candidate.supportingClaimIds.includes("claim-9"));
    expect(target).toBeTruthy();
    expect(target?.hypothesis.statement).toBe("Reliability concerns may be shaping repeat purchasing confidence.");
    expect(target?.weakeningClaimIds).toContain("claim-10");
    expect(target?.hypothesis.hypothesis_state).toBe("contradicted");
  });

  it("suppresses question-shaped and route-shaped internal statements", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-11",
        statement: "What specific outcomes do marketing teams aim for?",
        topic: "strategy",
        claim_type: "strategic_belief",
        organization_support_count: 1,
      }),
      makeClaim({
        id: "claim-12",
        statement: "Create quantifiable proof of impact for MojoMapTM on decision-making.",
        topic: "strategy",
        claim_type: "strategic_belief",
        organization_support_count: 1,
      }),
    ]);

    expect(candidates).toHaveLength(0);
  });

  it("suppresses weak outside descriptions about teaser content or product placeholders", () => {
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({
        id: "claim-13",
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

  it("collapses claims with identical statements into one candidate with both supports", () => {
    const statement = "Repeat purchasing may depend on reliability staying visible in proof.";
    const candidates = buildStrategicHypothesisCandidates("company-1", [
      makeClaim({ id: "claim-14", statement, topic: "problem" }),
      makeClaim({ id: "claim-15", statement, topic: "problem" }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].hypothesis.statement).toBe(statement);
    expect(candidates[0].supportingClaimIds).toEqual(expect.arrayContaining(["claim-14", "claim-15"]));
  });
});
