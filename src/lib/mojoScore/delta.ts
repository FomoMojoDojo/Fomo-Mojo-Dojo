// Δ SINCE LAST RUN (Gate 2, 2026-09-10) — the change between a company's two most recent scores
// OF THE SAME METHODOLOGY.
//
// WHY THE METHODOLOGY SCOPE IS THE WHOLE POINT. `mojo_scores` holds at least three families:
// `v1.1.0` (the internal snapshot), `outside-v1.0.0` and `outside-v1.1.0` (the public-record read).
// They are different scales measuring different things, so subtracting across them produces a number
// that looks like movement and is not. Cafe Barra 2 would read 35 → 21 as a fall of 14 when nothing
// about the company changed: the first is an internal score, the second an outside one.
//
// "Current methodology" is the methodology of the company's NEWEST row. A methodology with a single
// row has no previous value to compare against, so there is no Δ — the cell renders an em dash. That
// is an honest empty, not a zero: 7 of 18 scored companies are in exactly that state.
//
// Insert-only table, so "previous" means the second-newest row, never a mutated one.

export type ScoreRowLike = {
  total_score: number | string;
  methodology_version: string;
  computed_at: string;
};

export type ScoreDelta = {
  current: number;
  previous: number;
  /** current − previous, within one methodology. Signed; may be 0. */
  delta: number;
  methodology: string;
  currentAt: string;
  previousAt: string;
};

const asNum = (v: number | string): number => (typeof v === "number" ? v : Number(v));

/**
 * Null when there is no row, or when the current methodology has only one — never a fabricated 0,
 * and never a subtraction across two methodologies.
 */
export function scoreDelta(rows: readonly ScoreRowLike[]): ScoreDelta | null {
  if (!rows || rows.length === 0) return null;

  // Newest first, BY computed_at — insertion order is not ordering.
  const sorted = [...rows].sort((a, b) => (a.computed_at < b.computed_at ? 1 : a.computed_at > b.computed_at ? -1 : 0));
  const methodology = sorted[0].methodology_version;

  const sameFamily = sorted.filter((r) => r.methodology_version === methodology);
  if (sameFamily.length < 2) return null; // single row in the current family ⇒ no Δ

  const current = asNum(sameFamily[0].total_score);
  const previous = asNum(sameFamily[1].total_score);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;

  return {
    current,
    previous,
    delta: current - previous,
    methodology,
    currentAt: sameFamily[0].computed_at,
    previousAt: sameFamily[1].computed_at,
  };
}

/** The Δ cell string: signed, one decimal, em dash when there is nothing to compare. */
export function formatScoreDelta(d: ScoreDelta | null): string {
  if (!d) return "—";
  const n = d.delta;
  const abs = Math.abs(n).toFixed(1);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`; // U+2212 MINUS SIGN, not a hyphen
  return "0.0";
}

/** Signed palette token for the Δ cell. */
export function scoreDeltaTone(d: ScoreDelta | null): "positive" | "negative" | "flat" | "none" {
  if (!d) return "none";
  if (d.delta > 0) return "positive";
  if (d.delta < 0) return "negative";
  return "flat";
}
