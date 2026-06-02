import { describe, expect, it } from "vitest";
import type { SignalDraft } from "./evidenceDomain";
import {
  mapDifyFileOutputToSignals,
  mapPublicBaselineOutputToSignals,
  mapSignalsToClaimCandidates,
  scoreClaimToJobStepMatch,
  scoreClaimToNeedMatch,
} from "./evidenceMappers";

function makeSignal(overrides: Partial<SignalDraft>): SignalDraft {
  return {
    company_id: "company-1",
    source_id: "source-1",
    source_type: "file_proposal",
    source_title: "Test source",
    source_url: null,
    signal_band: "organization",
    evidence_type: "internal_data",
    claim_text: "Default claim text for testing",
    evidence_excerpt: "Default evidence excerpt for testing",
    topic: "unknown",
    framework: null,
    directness: "inferred",
    recency: null,
    framing_fit: "partial",
    structure_level: "interpreted",
    validation_status: "unvalidated",
    confidence_to_use: "medium",
    raw_payload: {},
    ...overrides,
  };
}

describe("evidence mappers", () => {
  it("suppresses metadata noise, meta-analysis fragments, and fake validation labels", () => {
    const signals = [
      makeSignal({
        source_type: "public_baseline_run",
        source_title: "Public baseline run",
        source_url: "https://example.com",
        signal_band: "outside",
        evidence_type: "market_signal",
        claim_text: "declared in page metadata (/)",
        evidence_excerpt: "declared in page metadata (/)",
        framework: "public_baseline",
        topic: "market",
        directness: "direct",
        recency: "recent",
        structure_level: "extracted",
        validation_status: "directional",
      }),
      makeSignal({
        source_type: "mojo_analysis",
        claim_text: "The current state of discovery lacks robust validation for critical steps.",
        evidence_excerpt: "The current state of discovery lacks robust validation for critical steps.",
      }),
      makeSignal({
        claim_text: "[CUSTOMER VALIDATED] Evidence of assessing coffee needs exists.",
        evidence_excerpt: "[CUSTOMER VALIDATED] Evidence of assessing coffee needs exists.",
      }),
    ];

    expect(mapSignalsToClaimCandidates("company-1", signals)).toHaveLength(0);
  });

  it("rewrites first-person customer anecdotes into reusable evidence statements", () => {
    const candidates = mapSignalsToClaimCandidates("company-1", [
      makeSignal({
        source_type: "transcript",
        source_title: "Customer interview",
        signal_band: "customer",
        evidence_type: "customer_validation",
        claim_text: "I received a bag of coffee from a highly regarded supplier through a subscription service I've relied on for years.",
        evidence_excerpt: "I received a bag of coffee from a highly regarded supplier through a subscription service I've relied on for years.",
        topic: "problem",
        directness: "direct",
        framing_fit: "strong",
        validation_status: "directional",
        confidence_to_use: "high",
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].claim.statement).toBe(
      "Customer evidence describes disappointment with a previously trusted supplier.",
    );
    expect(candidates[0].claim.claim_type).toBe("unmet_need");
    expect(candidates[0].claim.customer_support_count).toBe(1);
  });

  it("collapses duplicate named-program evidence into one canonical claim", () => {
    const candidates = mapSignalsToClaimCandidates("company-1", [
      makeSignal({
        claim_text: "The company also offers educational sessions called Curiosity Labs.",
        evidence_excerpt: "The company also offers educational sessions called Curiosity Labs.",
        topic: "positioning",
      }),
      makeSignal({
        claim_text: "They also conduct Curiosity Labs to deepen customer experience.",
        evidence_excerpt: "They also conduct Curiosity Labs to deepen customer experience.",
        topic: "positioning",
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].claim.statement).toBe(
      "Cafe Barra uses education sessions to reinforce customer experience and partner support.",
    );
    expect(candidates[0].sourceSignals).toHaveLength(2);
    expect(candidates[0].claim.organization_support_count).toBe(2);
  });

  it("rewrites feature dumps into one concise differentiation claim instead of preserving the raw list", () => {
    const candidates = mapSignalsToClaimCandidates("company-1", [
      makeSignal({
        claim_text: "Proprietary Barra Roast Method, Selective partner network through a hard-edged Partner Fit Profile, Last Mile Excellence standard for coffee preparation",
        evidence_excerpt: "Proprietary Barra Roast Method, Selective partner network through a hard-edged Partner Fit Profile, Last Mile Excellence standard for coffee preparation",
        topic: "positioning",
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].claim.statement).toBe(
      "Cafe Barra's differentiation rests on roast method, partner selectivity, and preparation standards.",
    );
  });

  it("keeps only real contradictions and filters meta contradiction artifacts", () => {
    const candidates = mapSignalsToClaimCandidates("company-1", [
      makeSignal({
        source_type: "mojo_analysis",
        validation_status: "contradicted",
        claim_text: "Confidence score high but unclear in Discovery",
        evidence_excerpt: "Confidence score high but unclear in Discovery",
      }),
      makeSignal({
        source_type: "transcript",
        source_title: "Customer interview",
        signal_band: "customer",
        evidence_type: "customer_validation",
        validation_status: "contradicted",
        directness: "direct",
        framing_fit: "strong",
        confidence_to_use: "high",
        claim_text: "Partnership positioning conflicts with customer reports of operational self-management burden.",
        evidence_excerpt: "Partnership positioning conflicts with customer reports of operational self-management burden.",
        topic: "problem",
      }),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].claim.statement).toBe(
      "Partnership positioning conflicts with customer reports of operational self-management burden.",
    );
    expect(candidates[0].claim.triangulation_state).toBe("contradicted");
    expect(candidates[0].sourceSignals[0]?.relationship).toBe("contradicts");
  });

  it("maps customer-research file outputs to customer signals conservatively", () => {
    const signals = mapDifyFileOutputToSignals({
      companyId: "company-1",
      sourceId: "file-1",
      sourceType: "file",
      sourceTitle: "Cafe_Owner_Research_Reddit_March_2026.pdf",
      evidence: ["Under-roasted beans forced extra dialing-in during service."],
    });

    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((signal) => signal.signal_band === "customer")).toBe(true);
    expect(signals.every((signal) => signal.evidence_type === "customer_validation")).toBe(true);
    expect(signals.every((signal) => signal.validation_status === "directional")).toBe(true);
  });

  it("maps public baseline output to outside signals", () => {
    const signals = mapPublicBaselineOutputToSignals({
      companyId: "company-1",
      sourceId: "baseline-1",
      resultJson: {
        outside_voice_signals: [{ signal: "Competitors appear to win trust through hands-on operational support.", confidence: "high" }],
        evidence_ledger: [{ snippet: "Switching costs remain low in the category.", bucket: "market", url: "https://example.com" }],
        top_hypotheses: ["Public positioning emphasizes artisanal quality more than operational proof."],
      },
    });

    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal.signal_band === "outside")).toBe(true);
    expect(signals.every((signal) => signal.evidence_type === "market_signal")).toBe(true);
  });

  it("matches job-step provenance conservatively", () => {
    const roastClaim = {
      statement: "Cafe operators report inconsistent roast quality across batches.",
      topic: "problem",
      claim_type: "unmet_need" as const,
      triangulation_state: "customer_backed" as const,
    };
    const marketClaim = {
      statement: "Public market signals suggest customer switching costs remain low.",
      topic: "market",
      claim_type: "inference" as const,
      triangulation_state: "single_source" as const,
    };

    expect(
      scoreClaimToJobStepMatch(roastClaim, {
        step_label: "Evaluate current offerings",
        description: "Compare roast consistency, flavor fit, and batch performance.",
      }),
    ).toBeGreaterThan(0);

    expect(
      scoreClaimToJobStepMatch(marketClaim, {
        step_label: "Evaluate current offerings",
        description: "Compare roast consistency, flavor fit, and batch performance.",
      }),
    ).toBe(0);
  });

  it("keeps direct claim-to-need matching conservative", () => {
    const roastClaim = {
      statement: "Cafe operators report inconsistent roast quality across batches.",
      topic: "problem",
      claim_type: "unmet_need" as const,
      triangulation_state: "customer_backed" as const,
    };

    expect(
      scoreClaimToNeedMatch(roastClaim, {
        desired_outcome: "Reduce the risk of inconsistent roast quality across batches.",
      }),
    ).toBeGreaterThan(0);

    expect(
      scoreClaimToNeedMatch(roastClaim, {
        desired_outcome: "Increase confidence that teams define success for Identify main competitors in specialty coffee the same way.",
      }),
    ).toBe(0);
  });
});

// ── Claim statement stability (key pinning) ───────────────────────────────────
//
// These tests pin the exact statement output of mapSignalsToClaimCandidates for
// known signal inputs. If the mapping code changes in a way that rewrites the
// statement text (and thus drifts the deterministicSignalClaimId stable key),
// these tests fail — alerting the developer before claim UUID churn hits prod.
//
// Do NOT update these expected strings without also running a migration to
// update deterministicSignalClaimId keys for affected companies.

describe("claim statement stability — key pinning", () => {
  it("org-band uploaded_file signal produces a stable statement (R1 guard)", () => {
    const signals = [
      makeSignal({
        source_type: "uploaded_file",
        signal_band: "organization",
        claim_text: "We struggle to track batch quality consistently across production runs",
        evidence_excerpt: "We struggle to track batch quality consistently across production runs",
        directness: "direct",
        framing_fit: "strong",
        structure_level: "interpreted",
        validation_status: "validated",
        confidence_to_use: "high",
      }),
      makeSignal({
        source_type: "uploaded_file",
        signal_band: "organization",
        claim_text: "Batch quality tracking is unreliable across production cycles",
        evidence_excerpt: "Batch quality tracking is unreliable across production cycles",
        directness: "inferred",
        framing_fit: "strong",
        structure_level: "interpreted",
        validation_status: "unvalidated",
        confidence_to_use: "medium",
      }),
    ];

    const candidates = mapSignalsToClaimCandidates("company-1", signals);
    expect(candidates).toHaveLength(2);

    // Pin the exact statement string for the first signal's candidate.
    // synthesizeEvidenceStatement rewrites org-band signals via
    // summarizeOrganizationEvidence — so the stable key is NOT the raw claim_text.
    // If this assertion fails after a code change, the stable claim key would
    // drift — triggering UUID churn for existing claims on the next rebuild.
    const firstStatement = candidates[0].claim.statement;
    expect(firstStatement).toBe(
      "Batch variability is creating recipe-adjustment burden inside coffee operations.",
    );

    // The statement must be stable across a second call with identical inputs.
    const candidates2 = mapSignalsToClaimCandidates("company-1", signals);
    expect(candidates2[0].claim.statement).toBe(firstStatement);
  });

  it("accumulation: adding a second signal to an existing group does not change the statement", () => {
    const baseSignal = makeSignal({
      source_type: "uploaded_file",
      signal_band: "organization",
      claim_text: "Our goal is to be the Bay Area leader in youth mental health",
      evidence_excerpt: "Our goal is to be the Bay Area leader in youth mental health",
      directness: "direct",
      framing_fit: "strong",
      structure_level: "interpreted",
      validation_status: "validated",
      confidence_to_use: "high",
    });

    const accumulatedSignal = makeSignal({
      source_type: "uploaded_file",
      signal_band: "customer",
      claim_text: "Our goal is to be the Bay Area leader in youth mental health support",
      evidence_excerpt: "Our goal is to be the Bay Area leader in youth mental health support",
      directness: "direct",
      framing_fit: "strong",
      structure_level: "interpreted",
      validation_status: "validated",
      confidence_to_use: "high",
    });

    const before = mapSignalsToClaimCandidates("company-1", [baseSignal]);
    const after = mapSignalsToClaimCandidates("company-1", [baseSignal, accumulatedSignal]);

    // If both signals normalize to the same key, they produce one candidate and
    // the statement is set by the first (oldest) signal — unchanged by accumulation.
    // If they produce two candidates, each statement is stable on its own.
    const beforeStatements = before.map((c) => c.claim.statement);
    const afterStatements = after.map((c) => c.claim.statement);

    // Every statement present before accumulation must appear unchanged after.
    for (const stmt of beforeStatements) {
      expect(afterStatements).toContain(stmt);
    }
  });
});
