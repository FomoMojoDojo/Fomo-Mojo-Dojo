// The published segment (ruling 5A, 2026-10-08): year-only for a January-1 placeholder, the full
// date otherwise, and NOTHING when there is no date. event_date_precision is not consulted — it
// reads 'day' on every row in the record, including undated ones.
import { describe, it, expect } from "vitest";
import { publishedSegment, sourceLineOf } from "./publishedSegment";

describe("publishedSegment", () => {
  it("renders a January-1 placeholder as the YEAR alone", () => {
    expect(publishedSegment("2023-01-01")).toBe("2023");
    expect(publishedSegment("2024-01-01")).toBe("2024");
    expect(publishedSegment("2025-01-01T00:00:00Z")).toBe("2025");
    expect(publishedSegment("2020-01-01 00:00:00+00")).toBe("2020");
  });
  it("renders any other date in full", () => {
    expect(publishedSegment("2026-04-30")).toBe("April 30, 2026");
    expect(publishedSegment("2025-06-23")).toBe("June 23, 2025");
    // January 2nd is a real observation, not a placeholder — it keeps its day
    expect(publishedSegment("2024-01-02")).toBe("January 2, 2024");
  });
  it("omits the segment entirely when there is no date", () => {
    for (const v of [null, undefined, "", "   ", "not-a-date"]) {
      expect(publishedSegment(v)).toBeNull();
    }
  });
});

describe("sourceLineOf", () => {
  it("joins the present parts and drops the absent ones", () => {
    expect(sourceLineOf(["Our read", "mightycause.com", "2023"])).toBe("Our read · mightycause.com · 2023");
    expect(sourceLineOf(["In the record", "edgewood.org", null])).toBe("In the record · edgewood.org");
    expect(sourceLineOf(["Our read", null, null])).toBe("Our read");
    expect(sourceLineOf([null, "", "   "])).toBe("");
  });
  it("never leaves a dangling separator", () => {
    expect(sourceLineOf(["a", null, "b"])).toBe("a · b");
    expect(sourceLineOf([null, "b"])).toBe("b");
  });
});
