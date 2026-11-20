// SP-452 (2026-11-19): the quote path shows the VERIFIED quote, written out, masked, uncut.
import { describe, expect, it } from "vitest";
import { QUOTE_MAX_CHARS, brandWords, displayQuote, formatQuoteDate } from "./reviewQuote";

const row = (over: Partial<Parameters<typeof displayQuote>[0]> = {}) => ({
  signalId: "s1",
  quote: "App constantly logs out on the TV for no reason.",
  brand: "spectrum",
  sourceUrl: "https://play.google.com/store/apps/details?id=com.TWCableTV",
  eventDate: "2026-11-12",
  ...over,
});

describe("the date, as the First Read writes one", () => {
  it("is written out in full", () => {
    expect(formatQuoteDate("2026-11-12")).toBe("November 12, 2026");
    expect(formatQuoteDate("2026-09-30")).toBe("September 30, 2026");
    expect(formatQuoteDate("2025-05-04")).toBe("May 4, 2025");
  });
  it("is the stored day, whatever the reader's timezone — a date-only value is not shifted", () => {
    // new Date("2026-01-01").toLocaleDateString() prints 31 December west of UTC. This does not.
    expect(formatQuoteDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatQuoteDate("2026-12-31")).toBe("December 31, 2026");
  });
  it("is null when the page showed none, so the surface can say so in its own words", () => {
    expect(formatQuoteDate(null)).toBeNull();
    expect(formatQuoteDate("")).toBeNull();
    expect(formatQuoteDate("not a date")).toBeNull();
  });
});

describe("the text", () => {
  it("is the stored verified quote, and the site comes from the page it sat on", () => {
    const d = displayQuote(row());
    expect(d.text).toBe("App constantly logs out on the TV for no reason.");
    expect(d.site).toBe("Google Play");
    expect(d.brand).toBe("spectrum");   // the stored value; the mono meta line upper-cases it
    expect(d.date).toBe("November 12, 2026");
    expect(d.clipped).toBe(false);
  });
  it("is null — not a fragment, not a guess — when no verified quote was stored", () => {
    expect(displayQuote(row({ quote: null })).text).toBeNull();
    expect(displayQuote(row({ quote: "   " })).text).toBeNull();
  });
  it("still passes the mask as a second layer", () => {
    const d = displayQuote(row({ quote: "Report\n\nStewartMyrtle Beach, SC\n\nthe service was down" }));
    expect(d.masked).toBe(1);
    expect(d.text).toContain("[reviewer]");
    expect(d.text).not.toContain("Stewart");
  });
  it("clips only past the limit, and then visibly", () => {
    const long = "x".repeat(QUOTE_MAX_CHARS + 1);
    const d = displayQuote(row({ quote: long }));
    expect(d.clipped).toBe(true);
    expect(d.text!.endsWith("…")).toBe(true);
    const edge = displayQuote(row({ quote: "y".repeat(QUOTE_MAX_CHARS) }));
    expect(edge.clipped).toBe(false);
    expect(edge.text!.endsWith("…")).toBe(false);
  });
});

describe("the brand words are read, not written down (SP-455c)", () => {
  it("come from the company's own name and the brands its rows recorded", () => {
    expect(brandWords("Charter Communications", ["spectrum", "cox"]))
      .toEqual(["charter", "communications", "cox", "spectrum"]);
  });
  it("the sentinel need_evidence writes for an unnamed brand is not a brand word", () => {
    expect(brandWords("Charter Communications", ["brand_not_recorded"]))
      .toEqual(["charter", "communications"]);
  });
  it("tolerate an empty company and empty values", () => {
    expect(brandWords(null, [])).toEqual([]);
    expect(brandWords("", ["", "  "])).toEqual([]);
  });
  it("a brand standing where a reviewer's name would is left alone", () => {
    const quote = "May 13 Cox Communications raised my bill again";
    expect(displayQuote(row({ quote }), brandWords("Charter Communications", ["cox"])).masked).toBe(0);
    // and without the words, the mask is only MORE eager — it never leaks
    expect(displayQuote(row({ quote }), []).masked).toBe(1);
  });
});
