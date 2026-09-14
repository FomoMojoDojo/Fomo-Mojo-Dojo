// Operator rulings 1–2 (2026-09-14): ONE authorship authority for every source type, consumed by band, voice
// and claim provenance; our analysis mints organization band with voice 'analysis' and may mint ANALYTIC claims
// but never declared ones; the client's intake and judged uploads are unchanged.
import { describe, expect, it } from "vitest";
import { authorshipForSource, bandFromOrigin, deriveClaimProvenance, mapDifyFileOutputToSignals, mapSignalsToClaimCandidates, voiceClassFromOrigin } from "./evidenceMappers";

const base = { companyId: "co", sourceId: "p1", sourceTitle: "x" };

describe("authorshipForSource — the one authority", () => {
  it("mojo_analysis ⇒ us; intake ⇒ client; uploads ⇒ their judged origin (uncertain when unjudged)", () => {
    expect(authorshipForSource("mojo_analysis", null)).toBe("us");
    expect(authorshipForSource("intake", null)).toBe("client");
    expect(authorshipForSource("manual_note", null)).toBe("client");
    for (const a of ["client", "us", "third_party", "uncertain"] as const) expect(authorshipForSource("uploaded_file", { authorship: a, subject: "this_company" })).toBe(a);
    expect(authorshipForSource("uploaded_file", null)).toBe("uncertain");
  });
  it("band, voice and isOurs all read it: the three agree for every source", () => {
    expect([bandFromOrigin("mojo_analysis", null), voiceClassFromOrigin("mojo_analysis", null)]).toEqual(["organization", "analysis"]);
    expect([bandFromOrigin("intake", null), voiceClassFromOrigin("intake", null)]).toEqual(["organization", null]);
    expect([bandFromOrigin("uploaded_file", { authorship: "us", subject: "this_company" }), voiceClassFromOrigin("uploaded_file", { authorship: "us", subject: "this_company" })]).toEqual(["organization", "analysis"]);
    expect(deriveClaimProvenance([{ sourceType: "mojo_analysis", band: "organization" }])).toBe("analytic");
    expect(deriveClaimProvenance([{ sourceType: "uploaded_file", band: "organization", authorship: "us" }])).toBe("analytic");
    expect(deriveClaimProvenance([{ sourceType: "intake", band: "organization" }])).toBe("internal_declared");
  });
});

describe("a. a mojo_analysis signal mints organization band, voice 'analysis', stamped us", () => {
  it("every shape", () => {
    const sigs = mapDifyFileOutputToSignals({ ...base, sourceType: "mojo_analysis", summary: "Customer proof lags.", evidence: ["Specific claims without validation."], contradictions: [{ claim: "Adoption assumed.", conflicts_with: "" }], questionsToVerify: ["What is adoption?"] });
    expect(sigs.length).toBe(4);
    for (const s of sigs) {
      expect(s.signal_band).toBe("organization");
      expect(s.voice_class).toBe("analysis");
      expect((s.raw_payload as { upload_origin?: { authorship?: string } }).upload_origin?.authorship).toBe("us");
    }
  });
});

describe("b. an analysis-voice signal mints an ANALYTIC claim and never a declared one", () => {
  const stmt = "Families wait three weeks for a first appointment.";
  const sig = (over: Record<string, unknown>) => ({ company_id: "co", source_id: "p", source_type: "uploaded_file", source_title: "doc", source_url: null, signal_band: "organization", evidence_type: "internal_data", claim_text: stmt, evidence_excerpt: stmt, topic: "problem", framework: null, directness: "direct", recency: null, framing_fit: "strong", structure_level: "extracted", validation_status: "unvalidated", confidence_to_use: "high", voice_class: null, raw_payload: {}, ...over }) as never;
  it("alone: analytic", () => {
    const c = mapSignalsToClaimCandidates("co", [sig({ voice_class: "analysis", raw_payload: { upload_origin: { authorship: "us", subject: "this_company" } } })], [], "x.test");
    expect(c.map((x) => x.claim.provenance)).toEqual(["analytic"]);
  });
  it("beside the client's identical statement: TWO candidates — declared stays declared, ours stays analytic; neither merges", () => {
    const c = mapSignalsToClaimCandidates("co", [
      sig({ voice_class: null, raw_payload: { upload_origin: { authorship: "client", subject: "this_company" } } }),
      sig({ voice_class: "analysis", raw_payload: { upload_origin: { authorship: "us", subject: "this_company" } } }),
    ], [], "x.test");
    expect(c.map((x) => [x.claim.provenance, x.sourceSignals.length]).sort()).toEqual([["analytic", 1], ["internal_declared", 1]]);
  });
  it("mojo_analysis rows the same way: analytic only", () => {
    const c = mapSignalsToClaimCandidates("co", [sig({ source_type: "mojo_analysis", voice_class: "analysis", raw_payload: { upload_origin: { authorship: "us", subject: "this_company" } } })], [], "x.test");
    expect(c.map((x) => x.claim.provenance)).toEqual(["analytic"]);
  });
});

describe("c./d. intake and judged uploads are unchanged", () => {
  it("intake: organization, no voice class, internal_declared", () => {
    const [s] = mapDifyFileOutputToSignals({ ...base, sourceType: "intake", evidence: ["We're growing, but it feels fragile or chaotic"] });
    expect([s.signal_band, s.voice_class]).toEqual(["organization", null]);
    expect(deriveClaimProvenance([{ sourceType: "intake", band: "organization" }])).toBe("internal_declared");
  });
  it("uploads: client ⇒ organization/∅/internal_declared; third_party ⇒ outside/outside_voice; uncertain ⇒ outside/market_context (a779766)", () => {
    const c = mapDifyFileOutputToSignals({ ...base, sourceType: "uploaded_file", origin: { authorship: "client", subject: "this_company" }, evidence: ["e"] })[0];
    const t = mapDifyFileOutputToSignals({ ...base, sourceType: "uploaded_file", origin: { authorship: "third_party", subject: "this_company" }, evidence: ["e"] })[0];
    const u = mapDifyFileOutputToSignals({ ...base, sourceType: "uploaded_file", evidence: ["e"] })[0];
    expect([c.signal_band, c.voice_class]).toEqual(["organization", null]);
    expect([t.signal_band, t.voice_class]).toEqual(["outside", "outside_voice_about_client"]);
    expect([u.signal_band, u.voice_class]).toEqual(["outside", "market_context"]);
    expect(deriveClaimProvenance([{ sourceType: "uploaded_file", band: "organization", authorship: "client" }])).toBe("internal_declared");
    expect(deriveClaimProvenance([{ sourceType: "uploaded_file", band: "outside", authorship: "third_party" }])).toBe("public_observed");
  });
});
