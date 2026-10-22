// ── CITATIONS BECOME THE ROWS (operator ruling 2026-10-21, re-run brief ruling 1) ─────────────────────────────────────────
//
// The Anthropic web_search tool attaches citations { url, title, cited_text } to the model's PROSE text blocks; a JSON
// answer carries none, which is why run 82 minted 45 web_search rows with blank excerpts. The web_search lanes now ask
// for cited prose, and rows are built from the citations ONLY:
//   * every cited sentence (a text block that carries citations) → one row per citation: claim_text = the sentence (our
//     summary), evidence_excerpt = that citation's cited_text, VERBATIM (page words — the Oct 16 law), url/title from the
//     citation. The voice is decided afterwards by the one authority (own hosts → own voice, related hosts → entity).
//   * an uncited sentence mints nothing.
//   * one row per (url, normalized cited_text); a cited_text whose content identity matches an existing row's excerpt for
//     the company is not re-minted.
//   * a citation whose url is on an excluded host (the company's exclude list, any confirmed entity's exclude list) mints
//     nothing.
// Pure — no I/O, no model.
import { normalizeForHash } from "./contentIdentity.ts";
import { normalizeUrlKey } from "../../../src/lib/firstRead/quoteProducer.ts";

export type Citation = { url: string; title: string; cited_text: string };
export type CitedSentence = { text: string; citations: Citation[] };
export type CitationEntry = { url: string; title: string; sentence: string; cited_text: string; snippet: string; voice_class: string; bucket: string; source_type: string; confidence: number; citation: true };
export type CitationStats = { text_blocks: number; cited_blocks: number; uncited_blocks: number; citations: number; excluded: number; duplicate_in_run: number; duplicate_existing: number; entries: number };

/** Every text block with its citations, in response order. A block with no citations has citations: []. */
export function citedSentences(responseData: unknown): CitedSentence[] {
  const blocks = Array.isArray((responseData as { content?: unknown })?.content) ? (responseData as { content: unknown[] }).content : [];
  const out: CitedSentence[] = [];
  for (const b of blocks) {
    if (!b || (b as { type?: unknown }).type !== "text") continue;
    const text = String((b as { text?: unknown }).text ?? "");
    const cits = Array.isArray((b as { citations?: unknown }).citations) ? (b as { citations: unknown[] }).citations : [];
    const citations: Citation[] = [];
    for (const c of cits) {
      const url = String((c as { url?: unknown })?.url ?? "").trim();
      const cited = typeof (c as { cited_text?: unknown })?.cited_text === "string" ? (c as { cited_text: string }).cited_text : "";
      if (!url || !cited.trim()) continue;
      citations.push({ url, title: String((c as { title?: unknown })?.title ?? "").trim(), cited_text: cited });
    }
    out.push({ text, citations });
  }
  return out;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}
const onHost = (host: string, d: string) => { const x = String(d || "").toLowerCase().replace(/^www\./, ""); return !!x && (host === x || host.endsWith(`.${x}`)); };

/** The rows a web_search response may mint: one entry per citation of a cited sentence, deduped, exclusions dropped. */
export function citationEntries(responseData: unknown, opts: { excludeHosts: readonly string[]; existingExcerpts: ReadonlySet<string> }): { entries: CitationEntry[]; stats: CitationStats } {
  const sentences = citedSentences(responseData);
  const stats: CitationStats = { text_blocks: sentences.length, cited_blocks: 0, uncited_blocks: 0, citations: 0, excluded: 0, duplicate_in_run: 0, duplicate_existing: 0, entries: 0 };
  const seen = new Set<string>();
  const entries: CitationEntry[] = [];
  for (const s of sentences) {
    if (s.citations.length === 0) { if (s.text.trim()) stats.uncited_blocks++; continue; } // an uncited sentence mints nothing
    stats.cited_blocks++;
    const sentence = s.text.replace(/\s+/g, " ").trim();
    for (const c of s.citations) {
      stats.citations++;
      const host = hostOf(c.url);
      if (!host || opts.excludeHosts.some((d) => onHost(host, d))) { stats.excluded++; continue; }
      const norm = normalizeForHash(c.cited_text);
      const key = `${normalizeUrlKey(c.url)}\n${norm}`;
      if (seen.has(key)) { stats.duplicate_in_run++; continue; }
      seen.add(key);
      if (opts.existingExcerpts.has(norm)) { stats.duplicate_existing++; continue; }
      entries.push({ url: c.url, title: c.title, sentence: sentence || c.cited_text, cited_text: c.cited_text, snippet: c.cited_text, voice_class: "outside_voice_about_client", bucket: "outside_voice_signal", source_type: "public_web", confidence: 60, citation: true });
    }
  }
  stats.entries = entries.length;
  return { entries, stats };
}

/** The raw text blocks + citations of a response, verbatim — the snapshot a cited_text is byte-compared against. */
export function rawCitationSnapshot(responseData: unknown): { model: unknown; stop_reason: unknown; usage: unknown; text_blocks: unknown[]; searches: unknown[] } {
  const d = (responseData ?? {}) as { model?: unknown; stop_reason?: unknown; usage?: unknown; content?: unknown[] };
  const blocks = Array.isArray(d.content) ? d.content : [];
  return {
    model: d.model ?? null, stop_reason: d.stop_reason ?? null, usage: d.usage ?? null,
    text_blocks: blocks.filter((b) => (b as { type?: unknown })?.type === "text"),
    searches: blocks.filter((b) => (b as { type?: unknown })?.type === "server_tool_use").map((b) => (b as { input?: unknown }).input ?? null),
  };
}
