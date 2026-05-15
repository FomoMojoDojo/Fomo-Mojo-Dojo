import { describe, it, expect } from "vitest";
import { stateDistributionToBand } from "./distribution";
import type { ClaimStateDistribution } from "./types";

function dist(
  overrides: Partial<Omit<ClaimStateDistribution, "computed_at">> = {},
): ClaimStateDistribution {
  const base = {
    outside_view: 0,
    diagnose: 0,
    focus: 0,
    flow: 0,
    total: 0,
    ...overrides,
  };
  // Recompute total from parts if not explicitly provided
  if (!overrides.total) {
    base.total = base.outside_view + base.diagnose + base.focus + base.flow;
  }
  return { ...base, computed_at: "2026-05-14T00:00:00Z" };
}

describe("stateDistributionToBand", () => {
  it("returns hypothesis_only for empty distribution", () => {
    expect(stateDistributionToBand(dist())).toBe("hypothesis_only");
  });

  it("returns hypothesis_only when all claims are outside_view", () => {
    expect(stateDistributionToBand(dist({ outside_view: 10, total: 10 }))).toBe("hypothesis_only");
  });

  it("returns directional_not_validated when diagnoseOrAbove > 50%", () => {
    // 6 diagnose out of 10 = 60% diagnoseOrAbove, 0% focusOrFlow
    expect(stateDistributionToBand(dist({ outside_view: 4, diagnose: 6, total: 10 }))).toBe(
      "directional_not_validated",
    );
  });

  it("returns directional_not_validated when focusOrFlow > 20% but ≤ 50%", () => {
    // 3 focus out of 10 = 30% focusOrFlow
    expect(stateDistributionToBand(dist({ outside_view: 7, focus: 3, total: 10 }))).toBe(
      "directional_not_validated",
    );
  });

  it("returns customer_evidenced when focusOrFlow > 50% but flow ≤ 30%", () => {
    // 6 focus, 2 flow, 2 outside = 80% focusOrFlow, 20% flow
    expect(stateDistributionToBand(dist({ outside_view: 2, focus: 6, flow: 2, total: 10 }))).toBe(
      "customer_evidenced",
    );
  });

  it("returns proven_path when focusOrFlow > 50% AND flow > 30%", () => {
    // 4 focus, 4 flow, 2 outside = 80% focusOrFlow, 40% flow
    expect(stateDistributionToBand(dist({ outside_view: 2, focus: 4, flow: 4, total: 10 }))).toBe(
      "proven_path",
    );
  });

  it("returns proven_path at exact boundary (flow = 31%)", () => {
    // 2 outside, 3 focus, 5 flow (but that's 80% focusOrFlow / 50% flow — proven)
    expect(
      stateDistributionToBand(dist({ outside_view: 0, focus: 3, flow: 4, diagnose: 3, total: 10 })),
    ).toBe("proven_path");
  });

  it("returns hypothesis_only when diagnoseOrAbove is ≤ 50% and focusOrFlow ≤ 20%", () => {
    // 9 outside, 1 diagnose = 10% diagnoseOrAbove, 0% focusOrFlow
    expect(stateDistributionToBand(dist({ outside_view: 9, diagnose: 1, total: 10 }))).toBe(
      "hypothesis_only",
    );
  });

  it("focusOrFlow at exactly 20% boundary returns hypothesis_only (not >20%)", () => {
    // 2 focus out of 10 = exactly 20% — not > 20%, so hypothesis_only
    expect(stateDistributionToBand(dist({ outside_view: 8, focus: 2, total: 10 }))).toBe(
      "hypothesis_only",
    );
  });
});
