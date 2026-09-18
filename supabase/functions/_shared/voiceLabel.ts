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

/** A synthesis row by either mark: the voice label, or the mint-site marker raw_payload.source_type='analysis'
 *  (the 100 pre-D1 rows carried the marker but not the label — the restamp aligns them; readers that pick a
 *  "page signal" must refuse the row on either mark, not trust the stamp alone). */
export function isAnalysisRow(row: { voice_class?: string | null; raw_payload?: unknown } | null | undefined): boolean {
  if (isAnalysisLabelled(row)) return true;
  const rp = row?.raw_payload;
  return !!rp && typeof rp === "object" && (rp as { source_type?: unknown }).source_type === ANALYSIS_VOICE;
}
