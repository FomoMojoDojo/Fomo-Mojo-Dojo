// V2-6c — quote supply for the claude_websearch engine. The producer and the byte-exact
// CHECK are unchanged; these tests prove the CITATION BASIS feeding them is real,
// verbatim, normalized-keyed, and honestly absent when the tool result carries nothing.

import { describe, it, expect } from "vitest";
import { extractCitationSourceText, mergeCitationSourceText } from "./citationSource";
import { produceQuote, normalizeUrlKey } from "./quoteProducer";
import { liftVerbatimQuote } from "../verbatimQuote";

// A realistic web_search Anthropic response: a final text block whose citations carry
// per-URL cited_text snippets (the source's own words).
const REVIEW_SNIPPET =
  "Staff were compassionate and the crisis unit responded within the hour, my daughter felt safe there.";
const PRESS_SNIPPET =
  "The nonprofit has served Bay Area youth since 1851 and remains the region's only crisis stabilization program for children under twelve.";

function webSearchResponse(citations: Array<{ url: string; cited_text: string }>) {
  return {
    stop_reason: "end_turn",
    content: [
      { type: "server_tool_use", name: "web_search", input: { query: "x" } },
      { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://x", encrypted_content: "OPAQUE" }] },
      {
        type: "text",
        text: "{ ... synthesized JSON ... }",
        citations: citations.map((c) => ({ type: "web_search_result_location", url: c.url, title: "t", cited_text: c.cited_text, encrypted_index: "i" })),
      },
    ],
  };
}

describe("V2-6c — extractCitationSourceText (verbatim per-citation basis, normalized key)", () => {
  it("collects cited_text keyed by normalizeUrlKey(url)", () => {
    const map = extractCitationSourceText(
      webSearchResponse([
        { url: "https://www.yelp.com/biz/edgewood/reviews/", cited_text: REVIEW_SNIPPET },
        { url: "http://sfchronicle.com/edgewood-story?ref=hp#top", cited_text: PRESS_SNIPPET },
      ]),
    );
    expect(map.get("yelp.com/biz/edgewood/reviews")).toBe(REVIEW_SNIPPET);
    expect(map.get("sfchronicle.com/edgewood-story")).toBe(PRESS_SNIPPET);
    expect(map.size).toBe(2);
  });

  it("GOAL 3 — the citation key matches the minted signal's normalized source_url (join proven; raw would miss)", () => {
    const map = extractCitationSourceText(
      webSearchResponse([{ url: "https://www.yelp.com/biz/edgewood/reviews/", cited_text: REVIEW_SNIPPET }]),
    );
    // The minted signal carries a differently-decorated form of the SAME url.
    const signalSourceUrl = "http://yelp.com/biz/edgewood/reviews?ref=search";
    // Producer-side join uses normalizeUrlKey(source_url) — it hits.
    expect(map.get(normalizeUrlKey(signalSourceUrl))).toBe(REVIEW_SNIPPET);
    // FALSIFICATION: had the capture side NOT normalized (keyed by the raw url), the
    // producer's normalized lookup would miss — that is exactly the V2-6b-D miss class.
    const rawKeyed = new Map<string, string>([["https://www.yelp.com/biz/edgewood/reviews/", REVIEW_SNIPPET]]);
    expect(rawKeyed.get(normalizeUrlKey(signalSourceUrl))).toBeUndefined();
  });

  it("no citations → empty map (honest absence; ingestion unaffected)", () => {
    expect(extractCitationSourceText(webSearchResponse([])).size).toBe(0);
    expect(extractCitationSourceText({ content: [{ type: "text", text: "no citations here" }] }).size).toBe(0);
    expect(extractCitationSourceText(null).size).toBe(0);
    expect(extractCitationSourceText({}).size).toBe(0);
  });

  it("drops snippets below the producer's min length (can't yield a >=40-char quote)", () => {
    const map = extractCitationSourceText(
      webSearchResponse([{ url: "https://x.com/p", cited_text: "too short" }]),
    );
    expect(map.size).toBe(0);
  });

  it("no synthesis / no padding — the retained value is exactly one tool-result snippet (longest wins)", () => {
    const shortReal = "Compassionate staff and a calm environment for kids in crisis.";
    const longReal = REVIEW_SNIPPET; // longer, same URL
    const map = extractCitationSourceText(
      webSearchResponse([
        { url: "https://yelp.com/biz/edgewood", cited_text: shortReal },
        { url: "https://yelp.com/biz/edgewood", cited_text: longReal },
      ]),
    );
    const retained = map.get("yelp.com/biz/edgewood")!;
    // Structural: the retained text IS one of the tool-result snippets verbatim, never
    // a concatenation or any added characters.
    expect(retained).toBe(longReal);
    expect(retained).not.toBe(shortReal + "\n" + longReal);
    expect(retained.length).toBe(longReal.length);
  });
});

describe("V2-6c — producer lifts a byte-exact quote from the citation basis", () => {
  it("produceQuote lifts a verbatim line the CHECK admits (snippet-basis lift is lawful)", () => {
    const map = extractCitationSourceText(
      webSearchResponse([{ url: "https://yelp.com/biz/edgewood", cited_text: REVIEW_SNIPPET }]),
    );
    const basis = map.get("yelp.com/biz/edgewood")!;
    const produced = produceQuote(basis, null, "crisis unit responded");
    expect(produced).toBeTruthy();
    // The quote is a byte-exact SUBSTRING of the snippet basis (quote ⊆ snippet).
    expect(basis.includes(produced!.quote)).toBe(true);
    expect(liftVerbatimQuote(basis, produced!.quote)).not.toBeNull(); // the authority agrees
    expect(produced!.quote_source_text).toBe(basis);
  });

  it("FALSIFICATION: a one-char drift in the basis makes the CHECK refuse the same quote", () => {
    const basis = REVIEW_SNIPPET;
    const quote = produceQuote(basis, null, "crisis unit responded")!.quote;
    expect(liftVerbatimQuote(basis, quote)).not.toBeNull(); // verbatim against the real basis
    // Drift the basis by ONE character — the byte-exact CHECK now refuses.
    const drifted = basis.replace("compassionate", "compassionatex");
    expect(drifted).not.toBe(basis);
    expect(liftVerbatimQuote(drifted, quote)).toBeNull();
  });

  it("quote-less citation (boilerplate basis) → no lift; nothing is fabricated", () => {
    const boilerplate = "Cookie policy. We use cookies to improve your experience. © 2024 All rights reserved.";
    const map = extractCitationSourceText(webSearchResponse([{ url: "https://x.com/p", cited_text: boilerplate }]));
    // The basis is retained (>=40 chars) but the producer refuses boilerplate → no quote.
    expect(map.get("x.com/p")).toBe(boilerplate);
    expect(produceQuote(map.get("x.com/p"), null, "x")).toBeNull();
  });
});

describe("V2-6c — mergeCitationSourceText (crawl wins on collision)", () => {
  it("citation URLs the crawl lacks are added; a colliding URL keeps the crawl's fuller basis", () => {
    const crawlPage =
      "Edgewood offers a continuum of mental healthcare for youth and families across the Bay Area, worked backwards from the customer.";
    const crawl = new Map<string, string>([["edgewood.org/about", crawlPage]]);
    const citation = new Map<string, string>([
      ["edgewood.org/about", REVIEW_SNIPPET], // collides with the crawl
      ["yelp.com/biz/edgewood", REVIEW_SNIPPET], // new
    ]);
    const report = mergeCitationSourceText(crawl, citation);
    // Crawl entry untouched (fuller basis wins).
    expect(crawl.get("edgewood.org/about")).toBe(crawlPage);
    // New citation URL added.
    expect(crawl.get("yelp.com/biz/edgewood")).toBe(REVIEW_SNIPPET);
    expect(report).toEqual({ added: 1, collisions: 1 });
  });

  it("an empty citation map (OpenAI path) is a no-op", () => {
    const crawl = new Map<string, string>([["a/b", "some retained page text long enough to matter here."]]);
    const report = mergeCitationSourceText(crawl, new Map());
    expect(report).toEqual({ added: 0, collisions: 0 });
    expect(crawl.size).toBe(1);
  });
});
