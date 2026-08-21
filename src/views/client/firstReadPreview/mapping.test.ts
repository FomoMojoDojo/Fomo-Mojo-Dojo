import { describe, it, expect } from "vitest";
import { strengthForSignal, verdictForDeltaType, facetForTopic, formatMonthYear, bareHost, foldByHostDate } from "./mapping";

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

describe("firstReadPreview mapping — foldByHostDate (S4 display fold, 2026-08-21)", () => {
  const src = (host: string, date: string | null, quote = "q") => ({ host, date, quote });

  it("folds identical host+date to one row with a count; distinct rows stay ×1", () => {
    // CB2 shape: two corner.inc · 2026-04-19 (non-adjacent) + one distinct.
    const folded = foldByHostDate([
      src("corner.inc", "2026-04-19"),
      src("yelp.com", "2026-07-01"),
      src("corner.inc", "2026-04-19"),
    ]);
    expect(folded).toEqual([
      { host: "corner.inc", date: "2026-04-19", count: 2 }, // ×2, first appearance kept
      { host: "yelp.com", date: "2026-07-01", count: 1 },
    ]);
  });

  it("first-appearance order is preserved; same host different date does not fold", () => {
    const folded = foldByHostDate([
      src("corner.inc", "2026-04-19"),
      src("corner.inc", "2026-08-19"),
      src("corner.inc", "2026-04-19"),
    ]);
    expect(folded.map((g) => `${g.host} ${g.date} x${g.count}`)).toEqual([
      "corner.inc 2026-04-19 x2",
      "corner.inc 2026-08-19 x1",
    ]);
  });
});
