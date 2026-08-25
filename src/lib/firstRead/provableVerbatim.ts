// RENDER-HONESTY DOWNGRADE (gate 1, 2026-08-25). A First Read excerpt may be wrapped in quote
// marks (claiming "these are their exact words") ONLY when we can prove verbatimness. Today the
// only provable ground truth is own-words: a signal verified against its own_words_page_snapshots
// raw page text with fidelity='verbatim' (own_words_candidates.judge_keep + judge_fidelity). Every
// OTHER signal — outside reviews/press (no raw page stored), market_context, competitor, analysis —
// is unprovable and must render UN-QUOTED with its OUTSIDE · {host} · {date} attribution.
//
// DEFAULT-DENY: keep-quote is the exception (own-words verbatim), not an enumerate-outside allow-list —
// safer against unlisted voice classes. isProvablyVerbatim is the single predicate all three quote
// paths (beat 2 "What the world says", beat 5 findings quotes, cold-open rung-3) gate on. The set is
// built once at the loader from own_words_candidates; the render just reads a boolean flag.
//
// This gate removes only the false verbatim CLAIM. The excerpt TEXT stays visible; a fabricated
// append (E4) or a thinned claim (E2) is a separate, later gate.

/** The ONE predicate: a signal renders as a verbatim quote only if it is in the provable-verbatim
 *  set (own-words, snapshot-verified fidelity='verbatim'). Everything else → false → downgrade. */
export function isProvablyVerbatim(
  signalId: string | null | undefined,
  provableVerbatimIds: ReadonlySet<string>,
): boolean {
  return !!signalId && provableVerbatimIds.has(signalId);
}

// When an excerpt is downgraded to un-quoted, strip stray leading/trailing quote characters the
// extractor may have baked into the stored text (straight + curly, single + double), so no orphan
// mark remains beside the now-unquoted attribution. DISPLAY-ONLY — never mutates stored data, and
// only trims the OUTER edges (interior quotes, e.g. a nested 'title', are left intact).
export function stripEdgeQuotes(text: string): string {
  return text.trim().replace(/^["'‘’“”]+/, "").replace(/["'‘’“”]+$/, "").trim();
}
