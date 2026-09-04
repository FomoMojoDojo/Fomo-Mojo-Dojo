// LISTING CLASS — the ONE pure home of the prose-vs-listing predicates the prose-only paths branch on
// (operator ruling 2026-09-04, step 8). No Deno, no DB: importable by vitest without pulling the edge modules.
/** evidencePhase1: a listing draft skips the prose quote producer and the E4 excerpt guard. */
export function isListingDraft(d: { evidence_class?: string | null } | null | undefined): boolean {
  return !!d && d.evidence_class === "listing";
}
/** signalRecurrence: prose recurrence counts prose rows only. */
export function recurrenceEligibleRow(row: { evidence_class?: string | null }): boolean {
  return row.evidence_class !== "listing";
}
/** relevanceBackstop: the token-overlap router never sees a listing-backed pair. */
export function backstopSkipsListingPair(listingBacked: ReadonlySet<string>, publicClaimId: string | null | undefined): boolean {
  return !!publicClaimId && listingBacked.has(publicClaimId);
}
