// RELEVANCE BACKSTOP — the SINGLE shared selector for the relevance overlay (build gate 2026-08-26).
//
// A claim_delta verdict row carries a machine-authored relevance overlay: relevance_verdict is
// 'relevant' | 'orthogonal' | NULL (unjudged). An 'orthogonal' row is a CONFIRMED/CONTRADICTED
// verdict whose paired public source does not speak to the specific declared assertion — the only
// bond is the shared company/topic. Such a row must be OUT of the active set: it stops counting in
// beat-4's echoes/contradicts numbers, the cold-open ladder, and the beat-1 mirror. It is NOT
// deleted — it still renders in place, struck through, so the record of the judgment is visible.
//
// This is the ONE predicate every consumer imports (beat-4 gap counts + render, the Check act's
// deltaItems assembly, the cold-open counts). NULL/undefined (unjudged) and 'relevant' are ACTIVE;
// only 'orthogonal' is inactive. So on any company the backstop has not been run against
// (relevance_verdict all NULL), every consumer behaves exactly as before this gate.

export type RelevanceVerdict = "relevant" | "orthogonal" | null | undefined;

export const RELEVANCE_ORTHOGONAL = "orthogonal" as const;

/** True iff the verdict row participates in the active set (counts + un-struck render).
 *  Only a positively-judged 'orthogonal' row is inactive; NULL (unjudged) and 'relevant' are active. */
export function isRelevanceActive(v: RelevanceVerdict): boolean {
  return v !== RELEVANCE_ORTHOGONAL;
}

/** True iff the row was struck by the backstop (renders line-through in place). */
export function isRelevanceStruck(v: RelevanceVerdict): boolean {
  return v === RELEVANCE_ORTHOGONAL;
}
