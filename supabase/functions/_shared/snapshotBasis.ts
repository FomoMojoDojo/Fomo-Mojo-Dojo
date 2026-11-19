// ── WHICH SNAPSHOTS ARE PAGES (A6, 2026-11-18) ────────────────────────────────────────────────────────────────────────
// retainPublicPages (excerptVerification.ts) stores the search tool's SNIPPET for a cited URL as an outside_page_snapshots
// row — about 150 characters and "...", fetch_status 'ok', structured.basis_kind 'cited_text' — so a verdict made against
// it stays repeatable. It is not the page. A reader that asks "is this on the page" (or "what is the newest page") skips
// it; the row itself stays stored, labelled as it already is. A URL whose only snapshots are snippets has NO page snapshot.
export const SEARCH_SNIPPET_BASIS = "cited_text" as const;

/** true unless the snapshot is a stored search snippet (structured.basis_kind 'cited_text') */
export function isPageSnapshot(structured: unknown): boolean {
  return !(structured && typeof structured === "object" && (structured as { basis_kind?: unknown }).basis_kind === SEARCH_SNIPPET_BASIS);
}

/** The same rule as an SQL predicate over an outside_page_snapshots row (alias optional). */
export function pageSnapshotSql(alias = ""): string {
  const a = alias ? `${alias}.` : "";
  return `coalesce(${a}structured->>'basis_kind','') <> '${SEARCH_SNIPPET_BASIS}'`;
}
