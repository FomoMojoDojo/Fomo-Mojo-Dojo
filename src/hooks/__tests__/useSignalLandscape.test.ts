import { describe, it, expect } from "vitest";
import { computeSignalLandscape } from "../useSignalLandscape";

// Signal-basis recount (2026-06-11): outside rows need a content identity (url + text)
// — fixtures give each row distinct text so they count as distinct evidence units.
let seq = 0;
const makeSignal = (
  band: string,
  framing_fit = "partial",
  directness = "direct",
  extra: Record<string, unknown> = {},
) => ({
  signal_band: band,
  framing_fit,
  directness,
  source_url: `https://example.com/item-${++seq}`,
  claim_text: `distinct evidence text number ${seq}`,
  ...extra,
});

// ── Empty case ────────────────────────────────────────────────────────────────

describe("computeSignalLandscape — empty", () => {
  const result = computeSignalLandscape([]);

  it("total is 0", () => expect(result.total).toBe(0));
  it("all band counts are 0", () => {
    expect(result.byBand.outside.count).toBe(0);
    expect(result.byBand.organization.count).toBe(0);
    expect(result.byBand.customer.count).toBe(0);
  });
  it("narrative mentions no signals", () => expect(result.narrative).toContain("No signals collected"));
  it("missingBand is customer", () => expect(result.missingBand).toBe("customer"));
  it("breakdown reconciles at zero", () => {
    const b = result.publicBreakdown;
    expect(b.independent + b.ownVoice + b.competitorsMarket + b.syndicatedExcluded + b.duplicatesMerged).toBe(b.rawOutsideTotal);
  });
});

// ── Normal case: outside + org only ─────────────────────────────────────────

describe("computeSignalLandscape — outside and org, no customer", () => {
  const signals = [
    makeSignal("outside", "strong", "direct"),
    makeSignal("outside", "partial", "weak"),
    makeSignal("outside", "strong", "direct"),
    makeSignal("organization", "strong", "inferred"),
    makeSignal("organization", "weak", "direct"),
  ];
  const result = computeSignalLandscape(signals);

  it("total is 5", () => expect(result.total).toBe(5));
  it("outside count is 3 (distinct independent items)", () => expect(result.byBand.outside.count).toBe(3));
  it("outside strong count is 2", () => expect(result.byBand.outside.strong).toBe(2));
  it("outside gaps count is 1 (weak directness)", () => expect(result.byBand.outside.gaps).toBe(1));
  it("organization count is 2", () => expect(result.byBand.organization.count).toBe(2));
  it("customer count is 0", () => expect(result.byBand.customer.count).toBe(0));
  it("missingBand is customer", () => expect(result.missingBand).toBe("customer"));
  it("dominantBand is outside", () => expect(result.dominantBand).toBe("outside"));
  it("narrative mentions team view mapped but no customer", () =>
    expect(result.narrative).toContain("no customer voice"));
});

// ── Recount semantics: classification, syndication, dedup ────────────────────

describe("computeSignalLandscape — public recount semantics", () => {
  const signals = [
    // independent outside voice
    makeSignal("outside"),
    makeSignal("outside"),
    // the client's own words: explicit class
    makeSignal("outside", "partial", "direct", { voice_class: "client_voice" }),
    // legacy NULL row on the company domain → deterministic fallback says client_voice
    makeSignal("outside", "partial", "direct", { source_url: "https://acme.com/about", voice_class: null }),
    // legacy NULL row, company_claim bucket → client_voice
    makeSignal("outside", "partial", "direct", { raw_payload: { bucket: "company_claim" }, voice_class: null }),
    // competitor + market context
    makeSignal("outside", "partial", "direct", { voice_class: "competitor_voice" }),
    makeSignal("outside", "partial", "direct", { voice_class: "market_context" }),
    // syndicated ovac — stamped copy of client prose
    makeSignal("outside", "partial", "direct", { voice_class: "outside_voice_about_client", syndicated_from_client: true }),
    // unstamped ovac counts as independent until a judge pass stamps it (lazy-stamping)
    makeSignal("outside", "partial", "direct", { voice_class: "outside_voice_about_client", syndicated_from_client: null }),
  ];
  const result = computeSignalLandscape(signals, "acme.com");
  const b = result.publicBreakdown;

  it("headline counts only independent outside voice", () => expect(result.byBand.outside.count).toBe(3));
  it("own public voice counted separately (explicit + 2 fallback-classified)", () => expect(b.ownVoice).toBe(3));
  it("competitors & market counted separately", () => expect(b.competitorsMarket).toBe(2));
  it("syndicated copies excluded, visibly", () => expect(b.syndicatedExcluded).toBe(1));
  it("breakdown reconciles to raw outside total", () =>
    expect(b.independent + b.ownVoice + b.competitorsMarket + b.syndicatedExcluded + b.duplicatesMerged).toBe(b.rawOutsideTotal));
  it("raw outside total counts every outside row", () => expect(b.rawOutsideTotal).toBe(9));
});

describe("computeSignalLandscape — content-identity dedup", () => {
  const dupe = { source_url: "https://reviews.example.com/acme", claim_text: "Great service, fixed the mold fast." };
  const signals = [
    makeSignal("outside", "strong", "direct", dupe),
    makeSignal("outside", "partial", "weak", dupe), // same identity — merged
    makeSignal("outside", "partial", "direct", { source_url: dupe.source_url, claim_text: "A different review entirely." }), // same URL, different text — distinct
  ];
  const result = computeSignalLandscape(signals);
  const b = result.publicBreakdown;

  it("identical url+text merges", () => expect(b.duplicatesMerged).toBe(1));
  it("same URL with different text stays distinct", () => expect(b.independent).toBe(2));
  it("first occurrence drives quality stats", () => expect(result.byBand.outside.strong).toBe(1));
  it("reconciles", () =>
    expect(b.independent + b.ownVoice + b.competitorsMarket + b.syndicatedExcluded + b.duplicatesMerged).toBe(b.rawOutsideTotal));
});

// ── Normal case: all three bands present ─────────────────────────────────────

describe("computeSignalLandscape — all three bands", () => {
  const signals = [
    makeSignal("outside", "strong"),
    makeSignal("outside", "partial"),
    makeSignal("organization", "strong"),
    makeSignal("organization", "strong"),
    makeSignal("organization", "strong"),
    makeSignal("customer", "partial"),
  ];
  const result = computeSignalLandscape(signals);

  it("total is 6", () => expect(result.total).toBe(6));
  it("customer count is 1 (less than org)", () => expect(result.byBand.customer.count).toBe(1));
  it("narrative mentions customer evidence thin", () =>
    expect(result.narrative).toContain("still thin"));
});

describe("computeSignalLandscape — all bands balanced", () => {
  const signals = [
    makeSignal("outside", "strong"),
    makeSignal("outside", "partial"),
    makeSignal("organization", "strong"),
    makeSignal("organization", "partial"),
    makeSignal("customer", "strong"),
    makeSignal("customer", "partial"),
    makeSignal("customer", "strong"),
  ];
  const result = computeSignalLandscape(signals);

  it("customer count exceeds org", () => expect(result.byBand.customer.count).toBeGreaterThanOrEqual(result.byBand.organization.count));
  it("narrative mentions multiple angles", () =>
    expect(result.narrative).toContain("multiple angles"));
});

// ── Single signal ─────────────────────────────────────────────────────────────

describe("computeSignalLandscape — single organization signal", () => {
  const result = computeSignalLandscape([makeSignal("organization", "strong")]);

  it("total is 1", () => expect(result.total).toBe(1));
  it("organization count is 1", () => expect(result.byBand.organization.count).toBe(1));
  it("narrative uses singular 'signal'", () => expect(result.narrative).toContain("1 signal"));
  it("dominantBand is organization", () => expect(result.dominantBand).toBe("organization"));
});

// ── Unknown band is ignored ───────────────────────────────────────────────────

describe("computeSignalLandscape — unknown band", () => {
  const signals = [
    makeSignal("outside"),
    makeSignal("unknown_band_xyz"),
  ];
  const result = computeSignalLandscape(signals);

  it("total counts known-band evidence units only", () => expect(result.total).toBe(1));
  it("outside count is 1", () => expect(result.byBand.outside.count).toBe(1));
  it("unknown band is not counted in byBand", () => {
    const knownTotal =
      result.byBand.outside.count +
      result.byBand.organization.count +
      result.byBand.customer.count;
    expect(knownTotal).toBe(1);
  });
});

// ── voice_class='analysis' — OUR reading, excluded from independent/ownVoice ─────
// (CB2 signal-voice re-label, 2026-08-07): analysis-voiced outside signals must not count
// as independent evidence NOR as the client's own public voice, and must keep the sum invariant.
describe("computeSignalLandscape — analysis voice excluded", () => {
  const signals = [
    makeSignal("outside", "partial", "direct", { voice_class: "outside_voice_about_client", source_url: "https://news.example.com/x" }),
    // analysis-voiced, NON-company host → must land in analysisExcluded, not independent
    makeSignal("outside", "partial", "direct", { voice_class: "analysis", source_url: "https://instagram.com/y" }),
    makeSignal("outside", "partial", "direct", { voice_class: "analysis", source_url: "https://instagram.com/z" }),
  ];
  const b = computeSignalLandscape(signals, "acme.com").publicBreakdown;

  it("analysis rows land in analysisExcluded, not independent or ownVoice", () => {
    expect(b.analysisExcluded).toBe(2);
    expect(b.independent).toBe(1);
    expect(b.ownVoice).toBe(0);
  });
  it("six-field sum still equals rawOutsideTotal", () =>
    expect(b.independent + b.ownVoice + b.competitorsMarket + b.syndicatedExcluded + b.duplicatesMerged + b.analysisExcluded).toBe(b.rawOutsideTotal));
});
