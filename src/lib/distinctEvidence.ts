// ── DISTINCT EVIDENCE COUNTING (SP-426, 2026-11-19) ──────────────────────────────────────────────
//
// Every counter over signals counts DISTINCT SENTENCES, not rows. A document analysed more than once
// stores the same sentence many times (SP-F49), and duplication exists within a single analysis run
// too, so retiring superseded rows cannot by itself make a count right.
//
// The identity is `signals.content_identity`, stamped at mint by
// supabase/functions/_shared/contentIdentity.ts (`signalContentIdentity`). It is NOT recomputed here:
// normalizing at read time would be a second implementation of a rule that is deliberately
// single-sourced, and the SQL/TS parity ruling (contentIdentity.ts:6-9) exists to stop exactly that.
//
// A NULL identity is NEVER FOLDED. A row with no excerpt, and every row on a company the backfill
// does not touch (CB1 58b2b15b is never written, SP-426), carries NULL. Such a row counts once, on
// its own id. So on those rows the count is identical to the pre-SP-426 row count — the fallback can
// only ever over-count, never silently collapse two different sentences into one.

export type IdentifiableEvidence = { id: string; content_identity?: string | null };

/** The distinct-evidence key of a row: its stored identity, or its own id when it has none. */
export function evidenceKey(row: IdentifiableEvidence): string {
  const ci = typeof row.content_identity === "string" ? row.content_identity.trim() : "";
  return ci === "" ? `id:${row.id}` : `ci:${ci}`;
}

/** How many distinct sentences this set of rows represents. */
export function countDistinctEvidence(rows: readonly IdentifiableEvidence[]): number {
  return new Set(rows.map(evidenceKey)).size;
}

/** The first row of each distinct sentence, in the order given — order-stable and deterministic, so
 *  a render built from it cannot reshuffle between reads. */
export function dedupeByContentIdentity<T extends IdentifiableEvidence>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = evidenceKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
