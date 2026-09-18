// ── The analysis label wins over the own-host test (operator ruling S1, signed 2026-09-18) ──────────
//
// A synthesis row (a top_hypotheses read, raw_payload.source_type='analysis') is OUR reading of the record. It
// carries the company's own URL by construction (the ingest passes the website as source_url), so every decider
// that ran the own-host test FIRST stamped it client_voice: classifyVoice (claimProvenance.ts), its client mirror
// (useSignalLandscape.ts) and the ingest overlay (public-baseline). 100 rows across 8 companies were stamped that
// way before D1 (6496b28f, 2026-08-07) started minting hypotheses as 'analysis'; the rebuild then minted 10
// public_observed claims out of analysis text, the own-words corpus took the rows as "the URL's page signal"
// (36 claims / 77 candidates), and CB2's supersede sweep took 10 of them (integrity 758).
//
// ONE predicate, used by every decider BEFORE any URL / bucket / evidence_class test: an entry labelled
// 'analysis' is 'analysis', whatever its URL. Pure — importable by edge functions and the client alike.
export const ANALYSIS_VOICE = "analysis" as const;

export function isAnalysisLabelled(entry: { voice_class?: string | null } | null | undefined): boolean {
  return String(entry?.voice_class ?? "").trim() === ANALYSIS_VOICE;
}

// ── S2 (signed 2026-09-18): a synthesis row is identified by SHAPE ───────────────────────────────────────
//
// raw_payload.hypothesis is written by ONE site — the top_hypotheses loop of mapPublicBaselineOutputToSignals
// (src/lib/evidenceMappers.ts) — and by nothing else. Rows minted there before 1e94d754 (2026-06-08) carry
// neither the marker nor the label (51 rows: Edgewood 6, FomoMojoDojo 4, IAQM 36, CB1 5); the lazy stamper
// (storeSupplement.ts) read only the URL and stamped 45 of them client_voice. The shape needs no stamp to be
// true, so every decider honours it: marker and label are honoured, neither is required.
const SYNTHESIS_SHAPE_KEY = "hypothesis";

function payloadOf(row: { raw_payload?: unknown } | null | undefined): Record<string, unknown> | null {
  const rp = row?.raw_payload;
  return rp && typeof rp === "object" && !Array.isArray(rp) ? (rp as Record<string, unknown>) : null;
}

/** The synthesis shape: raw_payload carries the `hypothesis` key (the top_hypotheses mint shape). */
export function isSynthesisShaped(row: { raw_payload?: unknown } | null | undefined): boolean {
  const rp = payloadOf(row);
  return !!rp && Object.prototype.hasOwnProperty.call(rp, SYNTHESIS_SHAPE_KEY);
}

/** A synthesis row by ANY of three marks — the voice label, the mint-site marker raw_payload.source_type='analysis',
 *  or the shape (raw_payload.hypothesis). The 100 pre-D1 rows carried the marker but not the label; the 51
 *  pre-1e94d754 rows carry neither. Readers that pick a "page signal" or class a voice refuse the row on any
 *  mark — never on the stamp alone. */
export function isAnalysisRow(row: { voice_class?: string | null; raw_payload?: unknown } | null | undefined): boolean {
  if (isAnalysisLabelled(row)) return true;
  const rp = payloadOf(row);
  if (!rp) return false;
  return rp.source_type === ANALYSIS_VOICE || Object.prototype.hasOwnProperty.call(rp, SYNTHESIS_SHAPE_KEY);
}

/** A PAGE-shaped row: one the baseline ingest minted from a fetched page — raw_payload carries the page's own
 *  address (`url` for an outside-voice item, `page_url` for a site read / regeneration, `path` for a receipts
 *  page) — and is not a synthesis row. The own-words "page signal" pick admits only these (S2 ruling 2): a row
 *  with no page address has no page to be the signal OF. */
const PAGE_SHAPE_KEYS = ["url", "page_url", "path"] as const;
export function isPageShapedRow(row: { voice_class?: string | null; raw_payload?: unknown } | null | undefined): boolean {
  if (isAnalysisRow(row)) return false;
  const rp = payloadOf(row);
  return !!rp && PAGE_SHAPE_KEYS.some((k) => Object.prototype.hasOwnProperty.call(rp, k));
}
