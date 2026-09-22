// "Who you serve" — the beat's row order (operator ruling R1, 2026-09-22). Pure.
//
// WHY THIS EXISTS. The beat used to take PostgREST's order and apply one stable sort putting
// lens-active keys first. PostgREST with no ORDER BY returns HEAP order, so any UPDATE to a row moved
// it to the end of the beat — a retraction, or even a retraction rolled straight back, silently
// re-ordered a client-visible surface with no data change behind it. Replacing a definition (retract
// the old, write the new) would move the group to the end for the same reason.
//
// THE RULE, in order:
//   1. lens-active keys first (unchanged — the portfolio state the operator set);
//   2. then ascending FIRST-SEEN time: MIN(created_at) across EVERY row sharing (company_id,
//      journey_key), retracted rows INCLUDED. This is what makes a replacement inherit the position
//      of the row it replaces: the retracted original still carries the key's first-seen time, so the
//      new row lands where the old one was rather than at the end.
//   3. then journey_key ascending — a total order, so equal timestamps (a bulk insert in one
//      statement shares now()) can never leave the order to chance.
//
// The beat still renders LIVE rows only. Retracted rows contribute their created_at to the key's
// first-seen time and nothing else: they are never returned by this function.

/** A live row as the beat will render it. */
export type OrderableRow = { journey_key: string | null };
/** first-seen per journey_key = MIN(created_at) over every row on the key, retracted included. */
export type FirstSeen = ReadonlyMap<string, string>;

/** Build the first-seen index from EVERY row on the company (live and retracted). */
export function firstSeenByKey(rows: ReadonlyArray<{ journey_key: string | null; created_at: string | null }>): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const key = (r.journey_key ?? "").trim();
    const at = (r.created_at ?? "").trim();
    if (!key || !at) continue;
    const prior = out.get(key);
    if (prior === undefined || at < prior) out.set(key, at);
  }
  return out;
}

/** The ruled order. Total and deterministic: two runs over the same data give the same sequence,
 *  whatever order the rows arrive in. */
export function orderWhoYouServe<T extends OrderableRow>(
  rows: readonly T[],
  activeKeys: ReadonlySet<string | null>,
  firstSeen: FirstSeen,
): T[] {
  const keyOf = (r: T) => (r.journey_key ?? "").trim();
  const seenOf = (r: T) => firstSeen.get(keyOf(r)) ?? "";
  return [...rows].sort((a, b) => {
    const activeDelta = Number(activeKeys.has(b.journey_key)) - Number(activeKeys.has(a.journey_key));
    if (activeDelta !== 0) return activeDelta;
    // A key with no first-seen time sorts after one that has it, never at random.
    const sa = seenOf(a); const sb = seenOf(b);
    if (sa !== sb) { if (!sa) return 1; if (!sb) return -1; return sa < sb ? -1 : 1; }
    return keyOf(a).localeCompare(keyOf(b));
  });
}
