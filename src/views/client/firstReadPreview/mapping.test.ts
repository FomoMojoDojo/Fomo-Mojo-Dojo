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

// R4 (2026-08-27) — beat-2 display grouping: identical statement+HOST folds to one row + mention count.
// The fold key is (host, text) — READ-DATE AGNOSTIC (see mapping.ts: the source-tag label embeds the
// read-date, so keying on it mis-split the wanderlog quadruplicate 3+1 across two baseline runs).
import { foldIdenticalSignals } from "./mapping";
import type { FRSignal } from "./types";
const sig = (over: Partial<FRSignal>): FRSignal => ({
  id: "x", text: "t", sourceTag: { label: "wanderlog.com" }, eventDate: "2024-01-01",
  strength: "moderate", provablyVerbatim: false, ...over,
});
const item = (over: { id?: string; text?: string; host?: string; readDate: string; eventDate?: string; label?: string }): Beat2Sortable => ({
  signal: sig({ id: over.id, text: over.text ?? "t", eventDate: over.eventDate ?? "2024-01-01", sourceTag: { label: over.label ?? `${over.host ?? "wanderlog.com"} · read ${over.readDate}` } }),
  readDate: over.readDate,
  host: over.host ?? "wanderlog.com",
});
describe("foldIdenticalSignals — beat-2 display grouping (host+text, read-date agnostic)", () => {
  it("folds identical statement+host read on DIFFERENT baseline runs to ONE row → all 4 mentions (fails without the fix)", () => {
    // The exact wanderlog case: same text + host, 3 read Aug 19 + 1 read Aug 7. Must fold to ONE, count 4.
    const out = foldIdenticalSignals([
      item({ id: "a", text: "mixed reviews", readDate: "2026-08-19", eventDate: "2024-09-01" }),
      item({ id: "b", text: "mixed reviews", readDate: "2026-08-19", eventDate: "2026-01-01" }),
      item({ id: "c", text: "mixed reviews", readDate: "2026-08-19", eventDate: "2024-09-01" }),
      item({ id: "d", text: "mixed reviews", readDate: "2026-08-07", eventDate: "2024-01-01" }),
    ]);
    expect(out).toHaveLength(1);                       // one row despite two read-dates
    expect(out[0].signal.mentionCount).toBe(4);        // "4 mentions" — every folded row counted
    expect(out[0].readDate).toBe("2026-08-19");        // representative keeps the FRESHEST read
    expect(out[0].signal.eventDate).toBe("2026-01-01"); // newest eventDate carried
  });
  it("distinct statements OR hosts are NOT folded (a 0-duplicate company is byte-identical)", () => {
    const out = foldIdenticalSignals([
      item({ id: "a", text: "review one", host: "yelp.com", readDate: "2026-08-01" }),
      item({ id: "b", text: "review two", host: "yelp.com", readDate: "2026-08-01" }),
      item({ id: "c", text: "review one", host: "restaurantguru.com", readDate: "2026-08-01" }), // same text, diff host → distinct
    ]);
    expect(out).toHaveLength(3);
    expect(out.every((x) => x.signal.mentionCount === 1)).toBe(true);
  });
});

// R4 (2026-08-27) — beat-2 fresh-first ordering: read-date (crawl) desc, then host.
import { orderBeat2Signals, type Beat2Sortable } from "./mapping";
describe("orderBeat2Signals — fresh-first (read-date desc, then host)", () => {
  it("leads with the freshest read-date; host breaks a read-date tie; stale trails (fails without the sort)", () => {
    const items: Beat2Sortable[] = [
      { signal: sig({ id: "stale" }), readDate: "2026-08-07", host: "wanderlog.com" },
      { signal: sig({ id: "freshB" }), readDate: "2026-08-26", host: "restaurantji.com" },
      { signal: sig({ id: "freshA" }), readDate: "2026-08-26", host: "chamberofcommerce.com" },
    ];
    expect(orderBeat2Signals(items).map((s) => s.id)).toEqual(["freshA", "freshB", "stale"]);
  });
});
