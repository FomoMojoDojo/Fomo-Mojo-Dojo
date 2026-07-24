// V2-5b — render-side containment collapse for Act 3 (NO writes; stored candidates are
// untouched — the wide-first law holds for analysis, this is the room render only).
//
// CONTAINMENT RULE: normalize whitespace + case; item A is "contained" in item B when
// A's normalized text is a substring of B's. The fuller text wins; equal texts keep the
// earliest. Order-stable and deterministic. Used for (a) the Message band containment
// dedupe and (b) folding near-duplicate markets whose WHO-label is contained in another.

export function normalizeForContainment(s: string | null | undefined): string {
  return (typeof s === "string" ? s : "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Keep only the fullest of any containment-related items, in original order. When one
 *  item's normalized text is a substring of another's, the shorter (contained) one is
 *  dropped; equal texts keep the earliest occurrence. */
export function dedupeByContainment<T>(items: T[], getText: (t: T) => string): T[] {
  const norms = items.map((it) => normalizeForContainment(getText(it)));
  const keep = items.map(() => true);
  for (let i = 0; i < items.length; i++) {
    if (!norms[i]) { keep[i] = false; continue; } // empty → drop
    for (let j = 0; j < items.length; j++) {
      if (i === j || !keep[j]) continue;
      if (norms[j].includes(norms[i])) {
        // i is contained in j → drop i, UNLESS they're equal and i is the earliest.
        if (norms[i].length < norms[j].length) { keep[i] = false; break; }
        if (norms[i] === norms[j] && j < i) { keep[i] = false; break; } // duplicate: keep earlier
      }
    }
  }
  return items.filter((_, i) => keep[i]);
}

export interface CollapsibleMarket<J> {
  /** the WHO-label used for containment (e.g. executor_statement). */
  who: string;
  /** the job items carried under this WHO. */
  jobs: J[];
}

/** Fold near-duplicate markets: when market A's WHO is contained in market B's WHO, A
 *  folds under B — B (the fullest WHO) renders once and the folded jobs MERGE, deduped by
 *  the same containment rule. Order-stable: each surviving group keeps its earliest
 *  member's position. Containment is transitive; an empty WHO stays its own group. */
export function collapseMarketsByWho<J>(
  markets: Array<CollapsibleMarket<J>>,
  getJobText: (j: J) => string,
): Array<CollapsibleMarket<J>> {
  const n = markets.length;
  const norms = markets.map((m) => normalizeForContainment(m.who));
  // root[i] = index of the FULLEST WHO that contains norms[i] (transitive by inclusion);
  // ties (equal WHO) resolve to the earliest index. Empty WHO → its own root.
  const root = markets.map((_, i) => {
    if (!norms[i]) return i;
    let best = i;
    for (let j = 0; j < n; j++) {
      if (!norms[j] || !norms[j].includes(norms[i])) continue;
      if (norms[j].length > norms[best].length || (norms[j].length === norms[best].length && j < best)) best = j;
    }
    return best;
  });
  const groups = new Map<number, { who: string; jobs: J[]; firstIdx: number }>();
  for (let i = 0; i < n; i++) {
    const r = root[i];
    const g = groups.get(r);
    if (!g) groups.set(r, { who: markets[r].who, jobs: [...markets[i].jobs], firstIdx: i });
    else { g.jobs.push(...markets[i].jobs); g.firstIdx = Math.min(g.firstIdx, i); }
  }
  return [...groups.values()]
    .sort((a, b) => a.firstIdx - b.firstIdx)
    .map((g) => ({ who: g.who, jobs: dedupeByContainment(g.jobs, getJobText) }));
}
