// ── H2 (operator ruling, 2026-10-14): which read a read REPLACED ────────────────────────────────
//
// Its own module because the harness (c1c2-continuity-cost.ts) runs its work at import time and
// exits; a test that imported the rule from there would run the whole sweep.
export type PairableRead = {
  id: string; company_id: string; kind: string; created_at: string;
  superseded_by?: string | null;
};

/**
 * The predecessor of a read is the row whose `superseded_by` names it — the read it actually
 * replaced, as the promote recorded.
 *
 * "The most recent row created before this one" is NOT the same thing, and the Edgewood promote of
 * 2026-10-14 showed why: cc5f64e3 superseded 5efba9ef (2026-10-08), while f09e5199 (2026-10-14) sits
 * between them by date — a read that was staged, held through four rulings and then discarded,
 * never current for a moment. Dating alone paired cc5f64e3 against a read it never replaced, and the
 * continuity question ("did this read drop a line from the read it replaced?") was being asked of
 * the wrong pair.
 *
 * The date fallback REMAINS, for rows promoted before superseded_by was being set: there, nothing
 * names a predecessor and the previous row by date is the best available answer. It is a fallback,
 * not the rule.
 */
export function predecessorOf<T extends PairableRead>(read: T, all: readonly T[]): T | undefined {
  const replaced = all.find((x) => x.superseded_by === read.id);
  if (replaced) return replaced;
  return all
    .filter((x) => x.company_id === read.company_id && x.kind === read.kind && x.created_at < read.created_at)
    .at(-1);
}
