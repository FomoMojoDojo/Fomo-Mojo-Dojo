// V2-6 — the verbatim-quote PRODUCER. The byte-exact CHECK (liftVerbatimQuote) is the
// authority; the producer only proposes a substring of the SOURCE'S OWN words.

import { describe, it, expect } from "vitest";
import { selectVerbatimQuote, produceQuote, normalizeUrlKey } from "./quoteProducer";
import { liftVerbatimQuote } from "../verbatimQuote";

const SOURCE =
  "Edgewood offers a continuum of mental healthcare for youth and families. Founded in 1851, it is a nonprofit serving the San Francisco Bay Area. Our crisis stabilization unit is the only one serving youth under twelve.";

const BOILERPLATE =
  "Cookie policy. We use cookies to improve your experience. Sign in. Subscribe to our newsletter. © 2024 All rights reserved. Skip to main content.";

describe("V2-6 — selectVerbatimQuote (source's own words, byte-exact)", () => {
  it("picks a real sentence that is a BYTE-EXACT substring of the source", () => {
    const q = selectVerbatimQuote(SOURCE);
    expect(q).toBeTruthy();
    expect(SOURCE.includes(q!)).toBe(true); // never fuzzy
    expect(q!.length).toBeGreaterThanOrEqual(40);
  });

  it("refuses boilerplate / navigation (not the source's own voice)", () => {
    expect(selectVerbatimQuote(BOILERPLATE)).toBeNull();
    // FALSIFICATION: a synthetic crawl label is refused
    expect(selectVerbatimQuote("Site crawl (/about). Declared in page metadata (/).")).toBeNull();
  });

  it("no retained source → no quote (structural: a source-less path produces nothing)", () => {
    expect(selectVerbatimQuote("")).toBeNull();
    expect(selectVerbatimQuote(null)).toBeNull();
    expect(selectVerbatimQuote("too short")).toBeNull();
  });

  it("relevance hint picks the most-overlapping sentence, deterministically", () => {
    const q = selectVerbatimQuote(SOURCE, "crisis stabilization unit youth under twelve");
    expect(q).toContain("crisis stabilization unit");
    // no hint → first qualifying sentence
    expect(selectVerbatimQuote(SOURCE)).toContain("Edgewood offers a continuum");
  });
});

describe("V2-6 — produceQuote passes the byte-exact CHECK; a paraphrase lifts nothing", () => {
  it("produced quote is verified verbatim by liftVerbatimQuote", () => {
    const p = produceQuote(SOURCE, null, "continuum of mental healthcare");
    expect(p).toBeTruthy();
    expect(liftVerbatimQuote(SOURCE, p!.quote)).not.toBeNull(); // the authority agrees
    expect(p!.quote_source_text).toBe(SOURCE);
  });

  it("FALSIFICATION: a PARAPHRASE (not a substring) lifts nothing — the CHECK is the authority", () => {
    // a model paraphrase that is NOT a byte-exact substring of the source
    const paraphrase = "Edgewood provides a full range of youth mental health services";
    expect(SOURCE.includes(paraphrase)).toBe(false);
    expect(liftVerbatimQuote(SOURCE, paraphrase)).toBeNull();
  });

  it("no source → produces no quote (absence is honest, never blocks)", () => {
    expect(produceQuote(null)).toBeNull();
    expect(produceQuote("nav menu")).toBeNull();
  });
});

describe("V2-6 — event date rides ONLY when visibly date-shaped (never inferred)", () => {
  it("a real ISO date rides; prose / bare year / absent → null", () => {
    expect(produceQuote(SOURCE, "2024-03-15")!.event_date).toBe("2024-03-15");
    expect(produceQuote(SOURCE, "last spring")!.event_date).toBeNull();
    expect(produceQuote(SOURCE, "2024")!.event_date).toBeNull();
    expect(produceQuote(SOURCE, null)!.event_date).toBeNull();
  });
});

describe("V2-6 — normalizeUrlKey (stable join key)", () => {
  it("strips scheme/www/trailing-slash/query/hash", () => {
    expect(normalizeUrlKey("https://www.edgewood.org/about/")).toBe("edgewood.org/about");
    expect(normalizeUrlKey("http://edgewood.org/about?x=1#y")).toBe("edgewood.org/about");
    expect(normalizeUrlKey("https://edgewood.org/")).toBe("edgewood.org/");
    expect(normalizeUrlKey("not a url")).toBe("");
  });
});
