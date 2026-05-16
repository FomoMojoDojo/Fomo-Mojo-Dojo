import { describe, it, expect } from "vitest";
import { computeSignalLandscape } from "../useSignalLandscape";

const makeSignal = (
  band: string,
  framing_fit = "partial",
  directness = "direct",
) => ({ signal_band: band, framing_fit, directness });

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
  it("outside count is 3", () => expect(result.byBand.outside.count).toBe(3));
  it("outside strong count is 2", () => expect(result.byBand.outside.strong).toBe(2));
  it("outside gaps count is 1 (weak directness)", () => expect(result.byBand.outside.gaps).toBe(1));
  it("organization count is 2", () => expect(result.byBand.organization.count).toBe(2));
  it("customer count is 0", () => expect(result.byBand.customer.count).toBe(0));
  it("missingBand is customer", () => expect(result.missingBand).toBe("customer"));
  it("dominantBand is outside", () => expect(result.dominantBand).toBe("outside"));
  it("narrative mentions team view mapped but no customer", () =>
    expect(result.narrative).toContain("no customer voice"));
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

  it("total still counts all rows passed in", () => expect(result.total).toBe(2));
  it("outside count is 1", () => expect(result.byBand.outside.count).toBe(1));
  it("unknown band is not counted in byBand", () => {
    const knownTotal =
      result.byBand.outside.count +
      result.byBand.organization.count +
      result.byBand.customer.count;
    expect(knownTotal).toBe(1);
  });
});
