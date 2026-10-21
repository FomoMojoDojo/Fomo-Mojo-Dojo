// V2-6c — quote supply for the claude_websearch engine.
//
// V2-6 wired the verbatim-quote PRODUCER against the searx-crawl `evidence[].extracted`
// text, keyed by URL. The default-engine flip to claude_websearch broke that URL
// identity (the V2-6b-D diagnosis): on the default path the minted signals carry the
// URLs Claude's OWN web_search returned, not the searx-crawl URLs, so the crawl map
// never joins and produceQuote lifts nothing.
//
// The Anthropic web_search server tool attaches inline citations to the model's text
// blocks: each `web_search_result_location` citation carries { url, cited_text }.
// `cited_text` is the SOURCE'S OWN snippet — the only readable per-citation source text
// the tool result surfaces (the `web_search_tool_result` blocks carry only opaque
// `encrypted_content`). We retain that snippet VERBATIM, keyed by normalizeUrlKey(url),
// so the SAME producer can lift a byte-exact line on the default engine — it just needs
// a basis to lift from. The signals_quote_verbatim CHECK (liftVerbatimQuote) stays the
// sole authority: a snippet that isn't byte-exact against what we retain lifts nothing
// (absence is honest). Forward-capture only — never synthesized, never padded.

import { normalizeUrlKey } from "./quoteProducer.ts";

// Mirror the crawl-side gate in the ok-synthesis branch: a basis shorter than the
// producer's MIN_LEN (40) can never yield a >=40-char verbatim quote, so retaining it
// buys nothing. A snippet-only basis at or above this length is lawful — the produced
// quote is then a byte-exact substring of the snippet.
const MIN_BASIS_LEN = 40;

/**
 * Walk an Anthropic Messages response's content blocks and collect, per URL, the
 * VERBATIM cited source text the web_search citations carry.
 *
 * Returns normalizeUrlKey(url) -> cited_text. When a single URL carries multiple
 * citations, the LONGEST snippet wins — a fuller basis for the producer, and still one
 * verbatim tool-result span (never a concatenation or any other synthesis). The
 * retained value is always exactly one `cited_text` the tool result carried.
 *
 * Snippets shorter than MIN_BASIS_LEN are dropped. Absence is honest: a response with
 * no web_search citations returns an empty map, and the signals stay quote-less.
 */
export function extractCitationSourceText(responseData: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, b] of extractCitationBasis(responseData)) out.set(key, b.cited_text);
  return out;
}

/** One citation basis: the url AS THE TOOL RETURNED IT and the snippet it carried. */
export type CitationBasis = { url: string; cited_text: string };

/**
 * Step (a) of the excerpt-fidelity fix (operator ruling 2026-10-16). The SAME walk as
 * extractCitationSourceText, keeping the url beside the snippet. The url travels with the
 * WINNING snippet (longest), so a reader that stores the page under "the form the signals
 * carry" has the tool's own url to store it under — not the normalized key, which no
 * signals.source_url ever equals (0 of 69 retained rows joined a signal on 2026-10-16).
 */
export function extractCitationBasis(responseData: unknown): Map<string, CitationBasis> {
  const out = new Map<string, CitationBasis>();
  const blocks = Array.isArray((responseData as { content?: unknown })?.content)
    ? (responseData as { content: unknown[] }).content
    : [];
  for (const block of blocks) {
    if (!block || (block as { type?: unknown }).type !== "text") continue;
    const citations = Array.isArray((block as { citations?: unknown }).citations)
      ? (block as { citations: unknown[] }).citations
      : [];
    for (const c of citations) {
      // web_search_result_location is the web-search citation shape; be defensive and
      // accept any citation carrying BOTH a url and a cited_text (never invent either).
      const url = String((c as { url?: unknown })?.url || "").trim();
      const cited = typeof (c as { cited_text?: unknown })?.cited_text === "string"
        ? (c as { cited_text: string }).cited_text
        : "";
      if (!url || cited.trim().length < MIN_BASIS_LEN) continue;
      const key = normalizeUrlKey(url);
      if (!key) continue;
      const prev = out.get(key);
      // Longest single snippet wins — no concatenation, no padding.
      if (prev === undefined || cited.length > prev.cited_text.length) out.set(key, { url, cited_text: cited });
    }
  }
  return out;
}

/** normalizeUrlKey(url) -> the url the tool returned, for the winning snippet of each key. */
export function extractCitationUrls(responseData: unknown): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, b] of extractCitationBasis(responseData)) out.set(key, b.url);
  return out;
}

// ── Step (a): WHAT KIND OF BASIS a retained page is, and under which url the signals carry it ────
//
// retainPublicPages used to store every basis as an unlabelled "page" under its normalized key. Two
// facts were lost: whether the text is a FETCHED PAGE (the crawl's extracted text, up to 12k chars)
// or a SEARCH SNIPPET (the tool's cited_text, one span), and which url the minted signals carry. The
// meta map carries both, keyed exactly as the merged source-text map is keyed, so the guard can label
// each retained row and store it under a joinable url.
export type RetainedBasisKind = "crawl" | "cited_text";
export type RetainedBasisMeta = { url: string; kind: RetainedBasisKind };

/**
 * Crawl wins on collision — the SAME rule mergeCitationSourceText applies, so the label agrees with
 * the text that was actually kept. `crawlUrls` must be the urls whose extracted text ENTERED the map
 * (the caller's loop decides that, by the producer's MIN_LEN); a crawl url whose text was too short
 * to retain is not a crawl basis, and the citation that supplied the key is labelled as such.
 */
export function basisMetaFor(args: {
  crawlUrls: Iterable<string>;
  citationUrlByKey: ReadonlyMap<string, string>;
  merged: ReadonlyMap<string, string>;
}): Map<string, RetainedBasisMeta> {
  const out = new Map<string, RetainedBasisMeta>();
  for (const u of args.crawlUrls) {
    const url = String(u ?? "").trim();
    const key = normalizeUrlKey(url);
    if (!key || !args.merged.has(key) || out.has(key)) continue;
    out.set(key, { url, kind: "crawl" });
  }
  for (const [key, url] of args.citationUrlByKey) {
    if (!key || !args.merged.has(key) || out.has(key)) continue;
    out.set(key, { url: String(url ?? "").trim() || key, kind: "cited_text" });
  }
  return out;
}

export interface CitationMergeReport {
  /** Citation URLs newly contributed to the crawl map (URLs the crawl lacked). */
  added: number;
  /** Citation URLs the crawl already covered — crawl wins, citation is dropped. */
  collisions: number;
}

/**
 * Merge a citation-sourced source-text map INTO the crawl-sourced map, IN PLACE.
 *
 * Crawl entries win on key collision (a full fetched page is a fuller basis than a
 * search snippet). Both maps are already keyed by normalizeUrlKey, so the merge does no
 * re-keying — a miss here is a genuine URL mismatch, not a normalization gap (GOAL 3).
 * Returns a report for the run log. An empty citation map (the OpenAI path) is a no-op.
 */
export function mergeCitationSourceText(
  crawlMap: Map<string, string>,
  citationMap: Map<string, string>,
): CitationMergeReport {
  let added = 0;
  let collisions = 0;
  for (const [key, text] of citationMap) {
    if (!key) continue;
    if (crawlMap.has(key)) {
      collisions++; // crawl wins — fuller basis
      continue;
    }
    crawlMap.set(key, text);
    added++;
  }
  return { added, collisions };
}

/**
 * RULING 4 (2026-10-21) — every cited_text span the web_search tool returned, per URL, in response order, VERBATIM.
 * extractCitationBasis keeps the longest span per URL (a basis for the quote producer); the excerpt rule needs every span,
 * because an excerpt is lawful only when it IS one of the tool's own spans. Empty spans are dropped; nothing is joined.
 */
export function extractCitedSpans(responseData: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const blocks = Array.isArray((responseData as { content?: unknown })?.content) ? (responseData as { content: unknown[] }).content : [];
  for (const block of blocks) {
    if (!block || (block as { type?: unknown }).type !== "text") continue;
    const citations = Array.isArray((block as { citations?: unknown }).citations) ? (block as { citations: unknown[] }).citations : [];
    for (const c of citations) {
      const url = String((c as { url?: unknown })?.url || "").trim();
      const cited = typeof (c as { cited_text?: unknown })?.cited_text === "string" ? (c as { cited_text: string }).cited_text : "";
      if (!url || !cited.trim()) continue;
      const key = normalizeUrlKey(url);
      if (!key) continue;
      const list = out.get(key) ?? [];
      if (!list.includes(cited)) list.push(cited);
      out.set(key, list);
    }
  }
  return out;
}
