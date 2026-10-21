// ── RULING 4 (operator, 2026-10-21) — A WEB_SEARCH ROW'S EXCERPT IS THE TOOL'S cited_text, OR BLANK ─────────────────────
//
// Every new outside row minted from a Claude web_search call stores, as evidence_excerpt, one cited_text span the tool
// returned for that row's URL — verbatim, the whole span — or nothing. Never the model's summary: run 81's five cited
// Spectrum rows carried the model's own words as their excerpts (excerpt_guard basis "none"). claim_text may stay our
// summary (the E4 law); only the excerpt is held to the page.
//
// The match: the drafted excerpt (normalizeForHash) must be contained in a span the tool cited for the SAME URL
// (normalizeUrlKey); the stored excerpt is then that span. No span contains it ⇒ the excerpt is emptied and the dropped
// text kept as excerpt_guard.unverified_excerpt. Basis label: websearch_cited_text. Pure — no I/O, no model.
import { normalizeForHash } from "./contentIdentity.ts";
import { normalizeUrlKey } from "../../../src/lib/firstRead/quoteProducer.ts";

export const WEBSEARCH_CITED_TEXT = "websearch_cited_text" as const;

export type CitedTextVerdict =
  | { kind: "no_excerpt" }
  | { kind: "cited"; evidence_excerpt: string }
  | { kind: "blanked"; evidence_excerpt: ""; unverified_excerpt: string; reason: "no_cited_text_for_url" | "not_in_cited_text" };

export function citedTextExcerpt(excerpt: string | null | undefined, url: string | null | undefined, spans: ReadonlyMap<string, readonly string[]>): CitedTextVerdict {
  const raw = String(excerpt ?? "");
  const nx = normalizeForHash(raw);
  if (!nx) return { kind: "no_excerpt" };
  const list = spans.get(normalizeUrlKey(String(url ?? ""))) ?? [];
  if (list.length === 0) return { kind: "blanked", evidence_excerpt: "", unverified_excerpt: raw, reason: "no_cited_text_for_url" };
  const hit = list.find((c) => normalizeForHash(c).includes(nx));
  return hit ? { kind: "cited", evidence_excerpt: hit } : { kind: "blanked", evidence_excerpt: "", unverified_excerpt: raw, reason: "not_in_cited_text" };
}
