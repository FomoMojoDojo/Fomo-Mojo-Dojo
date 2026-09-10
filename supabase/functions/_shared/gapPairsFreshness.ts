// GAP-PAIRS FRESHNESS (2026-09-09) — a stale artifact must not block its own refresh.
//
// WHAT WENT WRONG. Riverlane's public-vs-public deltas were computed at 17:25:56, when the company
// had ZERO own-words claims; the gap-pairs step had to fall back to the weaker `inference` declared
// side. Its 7 own-words claims landed at 20:55:06, from the resume. Nothing recomputed the deltas,
// and the cold open has since reported on ONE inferred claim while seven verbatim self-descriptions
// sat unpaired. The step's first-fill guard is what kept it that way: `alreadyPresent` returns true
// when public-vs-public deltas exist, so the stale set was its own reason not to recompute.
//
// THE PREDICATE. Presence is no longer enough — the deltas must also be NEWER than the declared side
// they were computed against. Older deltas than claims means the declared side changed underneath
// them, so the step runs again.
//
// Deliberately one-directional: this re-runs on a NEWER declared side, never on the passage of time.
// A company whose own-words have not moved is not recomputed, however old its deltas are.

export type FreshnessInput = {
  /** Newest own_words claim created_at, or null when the company has none. */
  newestOwnWordsAt: string | null;
  /** Newest public_vs_public claim_delta computed_at, or null when none exist. */
  newestDeltaAt: string | null;
};

export type FreshnessVerdict = {
  stale: boolean;
  reason: "no_claims" | "no_deltas" | "claims_newer" | "deltas_current";
};

/**
 * Are the deltas stale relative to the declared side?
 *
 * no claims  → never stale (nothing to be out of date with; leave the existing guard's answer alone)
 * no deltas  → not "stale"; there is nothing to supersede, and plain presence already says run
 * claims newer than deltas → STALE, recompute
 */
export function gapPairsStaleness(input: FreshnessInput): FreshnessVerdict {
  if (!input.newestOwnWordsAt) return { stale: false, reason: "no_claims" };
  if (!input.newestDeltaAt) return { stale: false, reason: "no_deltas" };
  const claims = Date.parse(input.newestOwnWordsAt);
  const deltas = Date.parse(input.newestDeltaAt);
  if (!Number.isFinite(claims) || !Number.isFinite(deltas)) return { stale: false, reason: "deltas_current" };
  return claims > deltas
    ? { stale: true, reason: "claims_newer" }
    : { stale: false, reason: "deltas_current" };
}

/**
 * The full first-fill answer for the gap-pairs step: present AND fresh ⇒ skip.
 * `present` is the existing predicate's result (a completed integrity row, or any deltas).
 */
export function gapPairsAlreadyPresent(present: boolean, freshness: FreshnessVerdict): boolean {
  if (!present) return false;
  return !freshness.stale;
}
