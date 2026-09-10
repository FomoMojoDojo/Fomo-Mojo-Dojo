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
  reason: "no_claims" | "no_deltas_with_claims" | "claims_newer" | "deltas_current";
  /** Both timestamps, so the ledger note can show its working. */
  newestOwnWordsAt?: string | null;
  newestDeltaAt?: string | null;
};

/**
 * Are the deltas stale relative to the declared side?
 *
 * no claims                → never stale; there is nothing to be out of date with.
 * claims but NO deltas     → STALE (2026-09-10). Presence can come from a completed or
 *                            skipped_empty_input `first_read_gap_pairs` integrity row rather than
 *                            from deltas, and that row alone was enough to skip forever: a company
 *                            whose gap pairs ran early and found nothing to pair, then later gained
 *                            own-words claims, would never pair them. An integrity row is a record
 *                            that we looked, not evidence that the looking is still current.
 * claims newer than deltas → STALE, recompute.
 */
export function gapPairsStaleness(input: FreshnessInput): FreshnessVerdict {
  const stamps = { newestOwnWordsAt: input.newestOwnWordsAt, newestDeltaAt: input.newestDeltaAt };
  if (!input.newestOwnWordsAt) return { stale: false, reason: "no_claims", ...stamps };
  if (!input.newestDeltaAt) return { stale: true, reason: "no_deltas_with_claims", ...stamps };
  const claims = Date.parse(input.newestOwnWordsAt);
  const deltas = Date.parse(input.newestDeltaAt);
  if (!Number.isFinite(claims) || !Number.isFinite(deltas)) return { stale: false, reason: "deltas_current", ...stamps };
  return claims > deltas
    ? { stale: true, reason: "claims_newer", ...stamps }
    : { stale: false, reason: "deltas_current", ...stamps };
}

/** The ledger note for a gap-pairs decision — it shows its working, both timestamps included. */
export function gapPairsFreshnessNote(f: FreshnessVerdict): string {
  const claim = f.newestOwnWordsAt ?? "none";
  const delta = f.newestDeltaAt ?? "none";
  switch (f.reason) {
    case "deltas_current":
      return `fresh — newest claim ${claim} ≤ newest delta ${delta}`;
    case "claims_newer":
      return `stale — recomputed · newest claim ${claim} > newest delta ${delta}`;
    case "no_deltas_with_claims":
      return `stale — recomputed · newest claim ${claim}, no deltas yet (an integrity row is not evidence)`;
    case "no_claims":
      return `fresh — no own-words claims to pair (newest delta ${delta})`;
  }
}

/**
 * The full first-fill answer for the gap-pairs step: present AND fresh ⇒ skip.
 * `present` is the existing predicate's result (a completed integrity row, or any deltas).
 */
export function gapPairsAlreadyPresent(present: boolean, freshness: FreshnessVerdict): boolean {
  if (!present) return false;
  return !freshness.stale;
}
