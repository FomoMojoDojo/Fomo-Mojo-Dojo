// C1 (2026-09-17) — client mirror of the filing-class exclusion. A registry row re-classed evidence_class='filing'
// (Form 990 data / a self-reported GuideStar section) is company-source in the landscape read: it counts as
// ownVoice, never as independent — the same predicate shape as _shared/claimProvenance.ts isCompanySource.
// The bypass case (the identical row without the class, i.e. the pre-C1 shape) shows the leak the rail closes.
import { describe, it, expect } from "vitest";
import { computeSignalLandscape } from "../useSignalLandscape";

const GS = "https://www.guidestar.org/profile/94-1186168";
const row = (extra: Record<string, unknown>) => ({
  signal_band: "outside", framing_fit: "partial", directness: "direct", source_url: GS,
  claim_text: "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area",
  voice_class: "outside_voice_about_client", // the model's (wrong) label — the class must override it
  ...extra,
});

describe("computeSignalLandscape — filing-class registry rows are own voice", () => {
  it("evidence_class='filing' ⇒ ownVoice, not independent (label ignored)", () => {
    const r = computeSignalLandscape([row({ evidence_class: "filing" })], "edgewood.org");
    expect(r.publicBreakdown.ownVoice).toBe(1);
    expect(r.publicBreakdown.independent).toBe(0);
    expect(r.byBand.outside.count).toBe(0);
  });
  it("a prose registry row (rating / registry_meta) keeps the model's label — independent", () => {
    const r = computeSignalLandscape([row({ evidence_class: "prose", source_url: "https://www.charitynavigator.org/ein/941186168", claim_text: "4/4 star rating" })], "edgewood.org");
    expect(r.publicBreakdown.independent).toBe(1);
    expect(r.publicBreakdown.ownVoice).toBe(0);
  });
  it("BYPASS: the same row without the class (pre-C1 shape) leaks into independent — the rail is the only thing stopping it", () => {
    const r = computeSignalLandscape([row({})], "edgewood.org");
    expect(r.publicBreakdown.independent).toBe(1);
  });
});
