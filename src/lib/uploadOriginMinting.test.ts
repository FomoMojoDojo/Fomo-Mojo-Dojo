// Import provenance — what a NEW upload mints, by AUTHORSHIP + SUBJECT (rulings 1–5, 8, 11 — 2026-09-13).
// Pure proofs on the mapper and the gates: the same functions dify-analyze-file's persist path calls
// (mapDifyFileOutputToSignals → mapSignalsToClaimCandidates → deriveClaimProvenance) and the state
// machine reads (checkOutsideViewToDiagnose).
//   a. third_party × the_market  ⇒ signals only: outside, market_signal, voice_class market_context; NO claim
//                                   candidate (so no supports ref can reach an Edgewood claim); Gate 1 is
//                                   not halved (nothing is declared)
//   b. third_party × this_company ⇒ outside, market_signal, outside_voice_about_client; MAY mint a
//                                   public_observed claim with a supports ref (outside support)
//   c. client                     ⇒ organization, internal_data, framing strong, internal_declared (today's behaviour)
//   d. us                         ⇒ organization, voice_class analysis — signals only end to end (the ingest drops
//                                   analysis-voice signals before candidate mapping); at the mapper level a claim
//                                   would be ANALYTIC, never declared; never halves Gate 1; excluded from the First Read
//   e. uncertain                  ⇒ outside, never declared
//   f. "…Survey….pdf" from a third party ⇒ NOT customer band (the exact exposure in the inventory)
//   g. UNDERSERVED unreachable (survey provenance only); First Read still excludes upload-derived claims
import { describe, it, expect } from "vitest";
import { mapDifyFileOutputToSignals, mapSignalsToClaimCandidates, deriveClaimProvenance, bandFromOrigin, voiceClassFromOrigin } from "./evidenceMappers";
import { checkOutsideViewToDiagnose } from "./claimState/gates";
import { isSurveyValidated, certaintyRung } from "./surveyVerdict";
import { documentDerivedClaimIds } from "../../supabase/functions/_shared/firstReadProvenance";

const SECTOR_TEXT = "Regional caregivers report long waits for youth mental health assessment; 62% of families surveyed could not name a first point of contact.";
const COMPANY_TEXT = "Edgewood Center's continuum of care is cited by county partners as the region's most coordinated youth mental health pathway.";
const mint = (over: Partial<Parameters<typeof mapDifyFileOutputToSignals>[0]>) => mapDifyFileOutputToSignals({
  companyId: "c1", sourceId: "prop-1", sourceType: "uploaded_file", sourceTitle: "doc.pdf",
  summary: SECTOR_TEXT, evidence: [SECTOR_TEXT], frameworkResults: [{ framework: "jtbd", findings: [{ claim: SECTOR_TEXT, evidence: SECTOR_TEXT, confidence: "medium", mojo_area: "opportunities", suggested_update: "", risk_if_ignored: "" }] }],
  ...over,
});
const gateRefs = (signals: ReturnType<typeof mint>, relationship = "supports") =>
  signals.map((signal) => ({ relationship, signal: { signal_band: signal.signal_band, directness: signal.directness, structure_level: signal.structure_level, framing_fit: signal.framing_fit } }));

describe("a. third-party SECTOR document: informs, never speaks, never corroborates", () => {
  const signals = mint({ origin: { authorship: "third_party", subject: "the_market" }, sourceTitle: "Youth Mental Health Survey 2024.pdf" });
  it("mints outside-band market_signal signals with voice_class stamped (never null)", () => {
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.signal_band).toBe("outside");
      expect(s.evidence_type).toBe("market_signal");
      expect(s.voice_class).toBe("market_context");
      expect(s.framing_fit).not.toBe("strong");
      expect((s.raw_payload as { upload_origin?: unknown }).upload_origin).toEqual({ authorship: "third_party", subject: "the_market" });
    }
  });
  it("mints NO claim candidate — so no supports ref can ever reach an Edgewood claim", () => {
    expect(mapSignalsToClaimCandidates("c1", signals, [], null)).toEqual([]);
    // even with the company's anchors configured and its name in the text, the SUBJECT fact decides
    const named = mint({ origin: { authorship: "third_party", subject: "the_market" }, summary: COMPANY_TEXT, evidence: [COMPANY_TEXT], frameworkResults: [] });
    expect(mapSignalsToClaimCandidates("c1", named, ["edgewood"], null)).toEqual([]);
  });
  it("cannot satisfy Gate 1 as declared: a public_observed claim with only outside refs stays blocked", () => {
    const r = checkOutsideViewToDiagnose({ state: "outside_view", id: "cl-1", provenance: "public_observed" }, gateRefs(signals) as never);
    expect(r.allowed).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/No qualifying organizational signal/);
    expect(deriveClaimProvenance([{ sourceType: "uploaded_file", band: "outside", authorship: "third_party" }])).toBe("public_observed");
  });
});

describe("b. third-party document ABOUT THE COMPANY: outside evidence that may corroborate", () => {
  const signals = mint({ origin: { authorship: "third_party", subject: "this_company" }, summary: COMPANY_TEXT, evidence: [COMPANY_TEXT], frameworkResults: [] });
  it("outside band, market_signal, outside_voice_about_client", () => {
    for (const s of signals) {
      expect(s.signal_band).toBe("outside");
      expect(s.evidence_type).toBe("market_signal");
      expect(s.voice_class).toBe("outside_voice_about_client");
    }
  });
  it("mints a public_observed claim candidate carrying OUTSIDE support (the public baseline's weight: direct, partial framing ⇒ 'qualifies'), never declared", () => {
    const cands = mapSignalsToClaimCandidates("c1", signals, [], null);
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      expect(c.claim.provenance).toBe("public_observed");
      expect(c.claim.outside_support_count).toBeGreaterThan(0);
      expect(c.claim.organization_support_count).toBe(0);
      expect(c.sourceSignals.every((s) => s.relationship === "qualifies" || s.relationship === "supports")).toBe(true);
    }
    for (const s of signals) expect(s.directness).toBe("direct");
  });
  it("corroborates: joined to the client's own org signal on the same statement, the claim becomes multi_source", () => {
    const own = mint({ origin: { authorship: "client", subject: "this_company" }, summary: COMPANY_TEXT, evidence: [COMPANY_TEXT], frameworkResults: [] });
    const cands = mapSignalsToClaimCandidates("c1", [...own, ...signals], [], null);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.some((c) => c.claim.triangulation_state === "multi_source" && c.claim.outside_support_count > 0 && c.claim.organization_support_count > 0)).toBe(true);
    expect(cands.every((c) => c.claim.provenance === "public_observed")).toBe(true); // mixed backing is observation-corroborated, not declared
  });
});

describe("c. CLIENT document: unchanged from today", () => {
  // (a first-person aspiration like "We will make Roots the standard" is routed to the foundation layer, never a claim — pre-existing)
  const signals = mint({ origin: { authorship: "client", subject: "this_company" }, summary: "Families wait three weeks for a first appointment at our clinics.", evidence: ["Families wait three weeks for a first appointment."], frameworkResults: [] });
  it("organization band, internal_data, framing strong, voice_class untouched (null), internal_declared claims", () => {
    for (const s of signals) {
      expect(s.signal_band).toBe("organization");
      expect(s.evidence_type).toBe("internal_data");
      expect(s.framing_fit).toBe("strong");
      expect(s.voice_class ?? null).toBeNull();
    }
    const cands = mapSignalsToClaimCandidates("c1", signals, [], null);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((c) => c.claim.provenance === "internal_declared")).toBe(true);
  });
  it("Gate 1 keeps the declared single-source rule for the client's own material", () => {
    const r = checkOutsideViewToDiagnose({ state: "outside_view", id: "cl-2", provenance: "internal_declared" }, gateRefs(signals.slice(0, 1)) as never);
    expect(r.allowed).toBe(true);
  });
});

describe("d. 'us' document (our analysis): analytic, never the client's words", () => {
  const signals = mint({ origin: { authorship: "us", subject: "this_company" }, summary: "Edgewood's advantage is coordination through the continuum of care.", evidence: ["Coordination is the advantage."], frameworkResults: [] });
  // MAPPER-LEVEL: the candidate builder would birth an analytic claim from these signals. END TO END the
  // ingest (evidencePhase1) filters voice_class 'analysis' signals out BEFORE candidate mapping, so a 'us'
  // document mints SIGNALS ONLY and no claim at all — proven live by scripts/guards/remint-guard.sh (c).
  it("organization band with voice_class 'analysis'; at the mapper level any claim would be ANALYTIC, never internal_declared", () => {
    for (const s of signals) {
      expect(s.signal_band).toBe("organization");
      expect(s.voice_class).toBe("analysis");
    }
    const cands = mapSignalsToClaimCandidates("c1", signals, [], null);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((c) => c.claim.provenance === "analytic")).toBe(true);
  });
  it("does not halve Gate 1 (an analytic claim needs the ≥2 rule like a public one) and stays out of the First Read", () => {
    const r = checkOutsideViewToDiagnose({ state: "outside_view", id: "cl-3", provenance: "analytic" }, gateRefs(signals.slice(0, 1)) as never);
    expect(r.allowed).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/need at least 2/);
    const excluded = documentDerivedClaimIds([{ claim_id: "cl-3", signal_id: "s1" }], new Map([["s1", "uploaded_file"]]));
    expect(excluded.has("cl-3")).toBe(true);
  });
});

describe("e. 'uncertain' authorship never mints declared", () => {
  it("outside band; provenance public_observed; no origin at all reads as uncertain", () => {
    expect(bandFromOrigin("uploaded_file", { authorship: "uncertain", subject: "this_company" })).toBe("outside");
    expect(bandFromOrigin("uploaded_file", null)).toBe("outside");
    expect(voiceClassFromOrigin("uploaded_file", null)).toBe("market_context");
    const signals = mint({ origin: { authorship: "uncertain", subject: "uncertain" } });
    expect(signals.every((s) => s.signal_band === "outside")).toBe(true);
    expect(mapSignalsToClaimCandidates("c1", signals, [], null)).toEqual([]);
    expect(deriveClaimProvenance([{ sourceType: "uploaded_file", band: "organization", authorship: "uncertain" }])).toBe("public_observed");
  });
});

describe("f. a FILE NAME never mints a band (ruling 5)", () => {
  it("'Youth Mental Health Survey 2024.pdf' from a third party is outside, not customer validation", () => {
    for (const name of ["Youth Mental Health Survey 2024.pdf", "Parent Interview Transcript.pdf", "Customer Research - Buyer Research.pdf"]) {
      const signals = mint({ origin: { authorship: "third_party", subject: "the_market" }, sourceTitle: name });
      expect(signals.every((s) => s.signal_band === "outside" && s.evidence_type === "market_signal" && s.validation_status !== "validated")).toBe(true);
      expect(signals.some((s) => s.evidence_type === "customer_validation")).toBe(false);
    }
    // the same name from the client is organization — still never customer
    expect(mint({ origin: { authorship: "client", subject: "this_company" }, sourceTitle: "Youth Mental Health Survey 2024.pdf" }).every((s) => s.signal_band === "organization")).toBe(true);
    // only the row's own SOURCE TYPE reaches the customer band
    expect(mint({ sourceType: "survey", sourceTitle: "anything.pdf" }).every((s) => s.signal_band === "customer")).toBe(true);
  });
});

describe("g. still safe", () => {
  it("UNDERSERVED: no upload provenance earns the verdict — public_research / manual / internal_declared all read unearned", () => {
    for (const p of ["public_research", "manual", "internal_declared", "framework_adjudicated", "internal_hypothesis"]) {
      expect(isSurveyValidated({ provenance_type: p, service_state: "underserved" } as never)).toBe(false);
    }
    expect(certaintyRung({ provenance_type: "public_research" } as never)).toBe("outside_signals");
  });
  it("First Read: a claim with ANY uploaded_file signal is excluded, whatever its origin", () => {
    const src = new Map<string, string | null>([["s1", "uploaded_file"], ["s2", "public_baseline_run"]]);
    const excluded = documentDerivedClaimIds([{ claim_id: "a", signal_id: "s1" }, { claim_id: "a", signal_id: "s2" }, { claim_id: "b", signal_id: "s2" }], src);
    expect(excluded.has("a")).toBe(true);
    expect(excluded.has("b")).toBe(false);
  });
});

describe("h. upload-derived needs carry the document's origin (ruling 8)", () => {
  it("client ⇒ manual (unchanged); third_party ⇒ public_research; us / uncertain ⇒ no need is written", async () => {
    const { needProvenanceForOrigin } = await import("@/components/FileUploadDialog");
    expect(needProvenanceForOrigin({ authorship: "client", subject: "this_company" })).toBe("manual");
    expect(needProvenanceForOrigin({ authorship: "third_party", subject: "the_market" })).toBe("public_research");
    expect(needProvenanceForOrigin({ authorship: "third_party", subject: "this_company" })).toBe("public_research");
    expect(needProvenanceForOrigin({ authorship: "us", subject: "this_company" })).toBeNull();
    expect(needProvenanceForOrigin({ authorship: "uncertain", subject: "uncertain" })).toBeNull();
    expect(certaintyRung({ provenance_type: "public_research" } as never)).toBe("outside_signals"); // "From outside signals", never "Backed by your research"
  });
});
