// OWN-WORDS INTEGRITY FLAGS (Gate B, 2026-09-09) — one home for the three booleans beat 4 reads off
// the `first_read_own_words` integrity records, so the difference between them is stated once.
//
// The extractor is two-phase and writes a DIFFERENT status per phase:
//   plan  → status 'planned'   (snapshots + frozen candidates; NOTHING written to claims)
//   write → status 'completed' (claims materialized from the frozen plan)
//
// Before this gate the client-visible empty note keyed off `looked`, a bare existence check over all
// statuses. On Riverlane (2026-09-09) the plan finished after the gateway cut its caller and wrote a
// 'planned' row with admitted=7; the write never fired. The client was therefore told "we found no
// verbatim self-descriptions" about a company whose own site had produced seven quotable candidates.
// `writeCompleted` is the honest gate for that note: only a completed WRITE has earned it.

export type OwnWordsIntegrityRow = {
  status: string | null;
  admitted?: number | null;
  excluded_by_rule?: { mode?: string | null } | null;
};

/** Any record at all — the extraction was attempted. NOT sufficient for the client empty note. */
export function ownWordsLookedFrom(rows: readonly OwnWordsIntegrityRow[]): boolean {
  return rows.length > 0;
}

/** A run in the operator sense: a completed record exists. Gates the operator "not meeting-ready" line. */
export function ownWordsRunFrom(rows: readonly OwnWordsIntegrityRow[]): boolean {
  return rows.some((r) => r.status === "completed");
}

/**
 * A COMPLETED WRITE run exists. Only the write path writes 'completed'
 * (supabase/functions/extract-own-words/index.ts:138, mode:'write'); the plan path writes 'planned'
 * (:317). The mode check is belt-and-braces so a future 'completed' from another phase cannot
 * silently re-arm the client note. A missing mode on a completed row is treated as a write, which
 * keeps every pre-existing completed record behaving exactly as it did.
 */
export function ownWordsWriteCompletedFrom(rows: readonly OwnWordsIntegrityRow[]): boolean {
  return rows.some((r) => r.status === "completed" && (r.excluded_by_rule?.mode ?? "write") === "write");
}
