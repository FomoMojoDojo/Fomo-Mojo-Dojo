import { describe, it, expect } from "vitest";
import { strengthForSignal, verdictForDeltaType, facetForTopic, formatMonthYear, bareHost } from "./mapping";

describe("firstReadPreview mapping — R4 strength", () => {
  it("recurrence-confirmed is strong regardless of confidence", () => {
    expect(strengthForSignal("low", true)).toBe("strong");
    expect(strengthForSignal("medium", true)).toBe("strong");
    expect(strengthForSignal(null, true)).toBe("strong");
  });
  it("low confidence single-source is thin", () => {
    expect(strengthForSignal("low", false)).toBe("thin");
  });
  it("medium single-source is moderate; unruled high fails toward moderate", () => {
    expect(strengthForSignal("medium", false)).toBe("moderate");
    expect(strengthForSignal("high", false)).toBe("moderate");
    expect(strengthForSignal(null, false)).toBe("moderate");
  });
});

describe("firstReadPreview mapping — A1 gap vocabulary (declared-anchored)", () => {
  it("echoed→confirmed, divergent→contradicted, publicly_silent→unechoed", () => {
    expect(verdictForDeltaType("echoed")).toBe("confirmed");
    expect(verdictForDeltaType("divergent")).toBe("contradicted");
    expect(verdictForDeltaType("publicly_silent")).toBe("unechoed");
  });
  it("internally_silent (record-only) stays OFF this surface now", () => {
    expect(verdictForDeltaType("internally_silent")).toBeNull();
  });
  it("unknown types render nothing (never fabricate)", () => {
    expect(verdictForDeltaType("whatever")).toBeNull();
  });
});

describe("firstReadPreview mapping — R2 trivial facet map", () => {
  it("market and positioning map trivially", () => {
    expect(facetForTopic("market")).toBe("Market");
    expect(facetForTopic("Positioning")).toBe("Positioning");
  });
  it("ambiguous topics stay ungrouped — never hand-mapped", () => {
    for (const t of ["job", "operations", "unique attributes", "unknown", "problem", null, undefined, ""]) {
      expect(facetForTopic(t)).toBeNull();
    }
  });
});

describe("firstReadPreview mapping — recency + host", () => {
  it("formats month-year and omits when absent", () => {
    expect(formatMonthYear("2026-03-14")).toBe("March 2026");
    expect(formatMonthYear("2025-12-01")).toBe("December 2025");
    expect(formatMonthYear(null)).toBeNull();
    expect(formatMonthYear("garbage")).toBeNull();
  });
  it("bareHost strips scheme and www", () => {
    expect(bareHost("https://www.edgewood.org/about")).toBe("edgewood.org");
    expect(bareHost("cafebarra.com")).toBe("cafebarra.com");
    expect(bareHost(null)).toBeNull();
  });
});
