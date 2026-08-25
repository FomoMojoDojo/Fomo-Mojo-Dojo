import { describe, expect, it } from "vitest";
import type { SignalDraft } from "./evidenceDomain";
import {
  mapDifyFileOutputToSignals,
  mapPublicBaselineOutputToSignals,
  mapSignalsToClaimCandidates,
  scoreClaimToJobStepMatch,
  scoreClaimToNeedMatch,
  deriveClaimProvenance,
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

  it("passes first-person customer anecdotes through verbatim (no canned rewrite)", () => {
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
    // Fabrication-removal (07-09): the canned "Customer evidence describes…"
    // rewrite is GONE — the anecdote's own lead clause passes through verbatim
    // (whitespace-normalized only). Verbatim-or-nothing law.
    expect(candidates[0].claim.statement).toBe(
      "I received a bag of coffee from a highly regarded supplier through a subscription service I've relied on for years.",
    );
    expect(candidates[0].claim.claim_type).toBe("unmet_need");
    expect(candidates[0].claim.customer_support_count).toBe(1);
  });

  // Substitution tripwire (07-09 fabrication-removal): claim derivation must
  // NEVER rewrite subject vocabulary. "teams"/"operators"/"roasters" pass
  // through untouched — if a substitution ever returns, this fails first.
  it("never substitutes subject vocabulary into statements (teams/operators/roasters tripwire)", () => {
    const candidates = mapSignalsToClaimCandidates("company-1", [
      makeSignal({
        claim_text: "The platform currently favors small teams and independent operators who rely on regional roasters.",
        evidence_excerpt: "The platform currently favors small teams and independent operators who rely on regional roasters.",
        topic: "problem",
      }),
    ]);
    expect(candidates).toHaveLength(1);
    const statement = candidates[0].claim.statement;
    expect(statement).toContain("teams");
    expect(statement).toContain("operators");
    expect(statement).toContain("roasters");
    expect(statement).not.toContain("Cafe operators");
    expect(statement).not.toContain("suppliers");
  });

  // Verbatim-or-nothing law (ecc4bd5/6180695): the canned canonical-rewrite branch
  // was deleted — a claim statement is either honestly verbatim or not produced at
  // all. Named-program marketing prose has no honest claim shape, so it maps to
  // NOTHING (previously it was synthesized into an invented "canonical" sentence).
  it("produces no claim for named-program marketing prose (verbatim-or-nothing)", () => {
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

    expect(candidates).toHaveLength(0);
  });

  it("produces no claim for feature dumps instead of inventing a differentiation sentence (verbatim-or-nothing)", () => {
    const candidates = mapSignalsToClaimCandidates("company-1", [
      makeSignal({
        claim_text: "Proprietary Barra Roast Method, Selective partner network through a hard-edged Partner Fit Profile, Last Mile Excellence standard for coffee preparation",
        evidence_excerpt: "Proprietary Barra Roast Method, Selective partner network through a hard-edged Partner Fit Profile, Last Mile Excellence standard for coffee preparation",
        topic: "positioning",
      }),
    ]);

    expect(candidates).toHaveLength(0);
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
        outside_voice_signals: [{ signal: "Competitors seem to win trust through hands-on operational support.", confidence: "high" }],
        evidence_ledger: [{ snippet: "Switching costs remain low in the category.", bucket: "market", url: "https://example.com" }],
        top_hypotheses: ["Public positioning emphasizes artisanal quality over operational proof."],
      },
    });

    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal.signal_band === "outside")).toBe(true);
    expect(signals.every((signal) => signal.evidence_type === "market_signal")).toBe(true);
  });

  it("matches job-step provenance conservatively", () => {
    const roastClaim = {
      statement: "Cafe staff report inconsistent roast quality across batches.",
      topic: "problem",
      claim_type: "unmet_need" as const,
      triangulation_state: "customer_backed" as const,
    };
    const marketClaim = {
      statement: "Public market signals indicate customer switching costs stay low.",
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
      statement: "Cafe staff report inconsistent roast quality across batches.",
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

// ── INT-2: sole provenance-derivation authority ────────────────────────────────

describe("deriveClaimProvenance", () => {
  it("all uploaded_file org signals ⇒ internal_declared", () => {
    expect(
      deriveClaimProvenance([
        { sourceType: "uploaded_file", band: "organization" },
        { sourceType: "uploaded_file", band: "organization" },
      ]),
    ).toBe("internal_declared");
  });

  it("any public signal in the mix keeps it public_observed (no laundering)", () => {
    expect(
      deriveClaimProvenance([
        { sourceType: "uploaded_file", band: "organization" },
        { sourceType: "public_baseline", band: "outside" },
      ]),
    ).toBe("public_observed");
  });

  it("uploaded file in a non-organization band stays public_observed", () => {
    expect(deriveClaimProvenance([{ sourceType: "uploaded_file", band: "customer" }])).toBe("public_observed");
  });

  it("R4: all-intake org signals ⇒ internal_declared (client's own declared answers)", () => {
    expect(deriveClaimProvenance([{ sourceType: "intake", band: "organization" }])).toBe("internal_declared");
    // intake mixed with uploaded org material is still all-declared
    expect(
      deriveClaimProvenance([
        { sourceType: "intake", band: "organization" },
        { sourceType: "uploaded_file", band: "organization" },
      ]),
    ).toBe("internal_declared");
  });

  it("R4: intake mixed with a public signal keeps public_observed (no laundering)", () => {
    expect(
      deriveClaimProvenance([
        { sourceType: "intake", band: "organization" },
        { sourceType: "public_baseline", band: "outside" },
      ]),
    ).toBe("public_observed");
  });

  it("R4: intake in a non-organization band stays public_observed", () => {
    expect(deriveClaimProvenance([{ sourceType: "intake", band: "customer" }])).toBe("public_observed");
  });

  it("empty backing fails safe to public_observed", () => {
    expect(deriveClaimProvenance([])).toBe("public_observed");
  });

  it("mapper births uploaded-doc claims internal_declared end to end", () => {
    const candidates = mapSignalsToClaimCandidates("company-1", [
      makeSignal({
        source_type: "uploaded_file",
        signal_band: "organization",
        claim_text: "We will become the system of record for strategy decisions",
        evidence_excerpt: "We will become the system of record for strategy decisions",
        directness: "direct",
        structure_level: "interpreted",
      }),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].claim.provenance).toBe("internal_declared");
  });
});

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
    // Verbatim-or-nothing law (ecc4bd5/6180695): org-band statements are the
    // VERBATIM claim_text — the summarizeOrganizationEvidence canned rewrite was
    // deleted, and the one-time claim-key churn that implies was operator-accepted
    // in that gate (CB1 residual row). This pin now guards the POST-law stable
    // key: if it fails after a code change, claim UUIDs churn on the next rebuild.
    const firstStatement = candidates[0].claim.statement;
    expect(firstStatement).toBe(
      "We struggle to track batch quality consistently across production runs",
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

// ── Generator root-cause fixes (D1/D2/D3), falsified against the REAL historical artifacts ──
import { signalMatchesAnchor, looksLikeContextIncompleteClaim } from "./evidenceMappers";

describe("D1 — top_hypotheses born voice_class='analysis' (not client-facing evidence)", () => {
  it("every top_hypotheses signal is minted voice_class='analysis' with the analysis marker", () => {
    const signals = mapPublicBaselineOutputToSignals({
      companyId: "c", sourceId: "r", sourceUrl: "https://cafebarra.com",
      resultJson: { top_hypotheses: [
        "Cafe Barra's online DTC channel is structurally underdeveloped.",
        "The company likely positions itself in a premium niche.",
      ] },
    });
    expect(signals).toHaveLength(2);
    expect(signals.every((s) => s.voice_class === "analysis")).toBe(true);
    expect(signals.every((s) => (s.raw_payload as { source_type?: string }).source_type === "analysis")).toBe(true);
    // and none reads as client_voice — the exact D1 harm (our analysis under the client's voice)
    expect(signals.some((s) => s.voice_class === "client_voice")).toBe(false);
  });
});

describe("D2 — declared-band full-passage distillation (no lead-clause truncation)", () => {
  // Full-pipeline: the roasters source distills to the WHOLE passage (topic-safe, so the
  // pre-existing positioning/strategy filter does not confound it).
  it("KEEPS the client's own claim — 'built to support it' is no longer dropped (2201926b source)", () => {
    const c = mapSignalsToClaimCandidates("c", [makeSignal({
      signal_band: "organization", source_type: "uploaded_file", structure_level: "extracted",
      claim_text: "Most roasters leave that system to the owner. Cafe Barra is built to support it.",
      evidence_excerpt: "Most roasters leave that system to the owner. Cafe Barra is built to support it.",
      topic: "operations",
    })]);
    expect(c).toHaveLength(1);
    expect(c[0].claim.statement).toBe("Most roasters leave that system to the owner. Cafe Barra is built to support it.");
  });
  // The reject guard in isolation (falsified against the exact historical shapes).
  it("guard REFUSES the lone dangling-demonstrative fragment (struck 91f118ef shape)", () => {
    expect(looksLikeContextIncompleteClaim("Most suppliers leave that system to the owner.")).toBe(true);
  });
  it("guard REFUSES the lone inverted-thesis negation (truncated e8326a6c shape)", () => {
    expect(looksLikeContextIncompleteClaim("Cafe Barra is not a brand yet.")).toBe(true);
  });
  it("guard PASSES the full 2-sentence passage — the inversion is resolved (not truncated)", () => {
    expect(looksLikeContextIncompleteClaim("Cafe Barra is not a brand yet. A brand-led strategy only works if the brand has earned the right to lead.")).toBe(false);
    expect(looksLikeContextIncompleteClaim("Most roasters leave that system to the owner. Cafe Barra is built to support it.")).toBe(false);
  });
});

describe("D3 — anchor gate: unanchored outside signals never mint client claims", () => {
  const ANCHORS = ["Cafe Barra", "cafebarra.com", "Le French Rooster", "lefrenchrooster.com", "2221 W Olive"];
  const outside = (text: string, url = "https://joe.coffee/x") => makeSignal({
    signal_band: "outside", source_type: "public_baseline_run", structure_level: "extracted",
    directness: "direct", claim_text: text, evidence_excerpt: text, source_url: url, topic: "market",
  });
  it("REFUSES the 5 wrong-entity signals from minting a client claim", () => {
    const bad = [
      "Izote coffee brought their coffee cart for my baby shower today.",
      "If you are at Providence St. Joseph's in Burbank, stop by Belli Fratelli Roasters.",
      "TAKE OUT + MAIL ORDER + LOCAL LA DELIVERY. BUY OUR BEANS. Italian Roast.",
      "Hand crafted Organic coffee roasters have opened their first cafe in lobby of Burbank Medical Center.",
      "Specializing in Hand Packed Fair Trade Certified Ultra Micro Roasted Organic Coffee.",
    ].map((t) => outside(t));
    expect(mapSignalsToClaimCandidates("c", bad, ANCHORS)).toHaveLength(0);
  });
  it("ADMITS an anchored outside signal (names Cafe Barra & Le French Rooster)", () => {
    const good = outside("joe.coffee lists Cafe Barra & Le French Rooster with 4.6 stars from 576 reviews.");
    expect(mapSignalsToClaimCandidates("c", [good], ANCHORS).length).toBeGreaterThan(0);
  });
  it("INERT when no anchors configured — back-compat (unseeded company mints as before)", () => {
    const s = outside("Izote coffee brought their coffee cart for my baby shower today.");
    expect(mapSignalsToClaimCandidates("c", [s]).length).toBeGreaterThan(0); // no anchors → not gated
  });
  it("signalMatchesAnchor: matches by name/domain/address, rejects a different business", () => {
    expect(signalMatchesAnchor({ claim_text: "Cafe Barra roasts small batch", source_url: null }, ANCHORS)).toBe(true);
    expect(signalMatchesAnchor({ claim_text: "review", source_url: "https://cafebarra.com/x" }, ANCHORS)).toBe(true);
    expect(signalMatchesAnchor({ claim_text: "Belli Fratelli Roasters, 191 S Buena Vista", source_url: "https://yelp.com" }, ANCHORS)).toBe(false);
  });
});

import { extractConcreteTokens, retainConcreteEvidence } from "./evidenceMappers";

describe("GATE 2 · E2 specificity guard — outside/customer thinning no longer drops concrete content", () => {
  const outside = (text: string) => makeSignal({
    signal_band: "outside", source_type: "public_baseline_run", structure_level: "extracted",
    directness: "direct", claim_text: text, evidence_excerpt: text, source_url: "https://joe.coffee/x", topic: "market",
  });

  it("FAIL of the OLD thinning — a rich source EXPANDS past the generic lead (keeps pay/assault/staff)", () => {
    // Edgewood 41c91fa4 shape: lead is generic valence, concrete allegations live in later clauses.
    const src = "Edgewood is a non profit that is going down hill. The pay is terrible for what you have to endure and you get assaulted daily; there is never enough staff working each day.";
    const c = mapSignalsToClaimCandidates("c", [outside(src)]);
    expect(c).toHaveLength(1);
    const st = c[0].claim.statement;
    // the OLD lead-only output is REJECTED — the minted statement is not the thinned generic lead
    expect(st).not.toBe("Edgewood is a non profit that is going down hill.");
    // …and the concrete allegations the lead dropped now survive
    expect(st.toLowerCase()).toContain("assaulted");
    expect(st.toLowerCase()).toContain("staff");
    expect(st.toLowerCase()).toContain("pay");
  });

  it("PASS — a pure-valence multi-sentence source thins to its lead (no concrete dropped)", () => {
    // both sentences are generic valence: dropping the 2nd loses nothing concrete → lead-only is honest.
    const src = "The coffee here is absolutely wonderful. Everyone should come and try it sometime.";
    const c = mapSignalsToClaimCandidates("c", [outside(src)]);
    expect(c).toHaveLength(1);
    expect(c[0].claim.statement).toBe("The coffee here is absolutely wonderful.");
  });

  it("retainConcreteEvidence — structural detection stands ALONE (a number outside the lexicon is kept)", () => {
    // no allegation word anywhere; the concrete fact is purely structural ($82K / 3.1) in the 2nd clause.
    const src = "Reviews are mixed overall. Clinician salaries sit at ~$82K versus a market average near $147K.";
    const out = retainConcreteEvidence(src);
    expect(out).toContain("$82K");
    expect(out).toContain("$147K");
    expect(out).not.toBe("Reviews are mixed overall.");
  });

  it("extractConcreteTokens — the superset REFUSE primitive rejects a statement that drops a source number", () => {
    const source = extractConcreteTokens("Comp & benefits 3.1/5; 'pay is low' cited in 7 reviews; salaries ~$82K.");
    const thinned = extractConcreteTokens("Comp & benefits are a concern."); // drops 3.1/5, 7, 82k, pay
    const dropsConcrete = [...source].some((tok) => !thinned.has(tok));
    expect(dropsConcrete).toBe(true); // the assertion would REFUSE this over-thinned statement
  });

  it("control — a single-sentence source is returned unchanged (nothing to thin)", () => {
    expect(retainConcreteEvidence("Great little neighborhood coffee spot.")).toBe("Great little neighborhood coffee spot.");
  });
});
