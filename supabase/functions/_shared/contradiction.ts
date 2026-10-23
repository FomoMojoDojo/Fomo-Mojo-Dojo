// ── THE CONTRADICTION CHECK (operator ruling 50, 2026-10-22; filed as 44) ────────────────────────────────────────────
//
// WHY. Spectrum's staged positioning (5e861337) said "nationwide coverage" and its staged strategy (109af21c) "customers
// nationwide" while the pool's own rows say Spectrum serves 41 states (45 after the merger). Both lines were re-stamped our
// read by the page-words rule — but an our-read line still may not say what the record contradicts.
//
// THE RULE. A line that asserts a NATIONAL scope (nationwide, countrywide, coast-to-coast, across/throughout the country /
// nation / U.S. / United States, all 50 states, every/all states or markets) contradicts a pooled row that states
// "N states" with N < 50; a line that asserts a GLOBAL scope (global, worldwide, around the world, every/all countries)
// contradicts a pooled row that states "N countries". The pool is the read's own rows, our read excluded. The line is
// LICENSED when a row it cites states the scope itself (a "nationwide 5G access" row licenses a line citing it). Every
// line is checked, our-read lines included, in every kind.
//   stage    GUARD 5d, after level and before the judge; one re-ask from the shared budget naming the row and its bound;
//            a second failure refuses
//   promote  re-run against the live re-read; FAILS CLOSED
// Pure: no I/O, no model. No company or host terms.

export const CONTRADICTION_VERSION = "2026-10-22.1" as const;
export const NATIONAL_SCOPE = /\b(nationwide|nation-wide|countrywide|coast[- ]to[- ]coast|(?:across|throughout) the (?:country|nation|u\.?\s?s\.?|united states)|all 50 states|(?:every|all) (?:state|states|market|markets))\b/i;
export const GLOBAL_SCOPE = /\b(global(?:ly)?|worldwide|world-wide|around the world|every country|all countries)\b/i;
const BOUND_STATES = /\b(\d{1,2})\s+(?:u\.?s\.?\s+)?states\b/i;
const BOUND_COUNTRIES = /\b(\d{1,3})\s+countries\b/i;

export type ContradictionLine = { field?: string; text: string; refs: readonly string[] };
export type ContradictionHit = { field: string; text: string; scope: string; row: string; bound: string };

/** Every contradiction in `lines`. `textOf(ref)` is a row's verified page words; `pool` the read's non-our-read rows. */
export function contradictionHits(
  lines: readonly ContradictionLine[], textOf: (ref: string) => string, pool: ReadonlyArray<{ ref: string; text: string }>,
): ContradictionHit[] {
  const hits: ContradictionHit[] = [];
  const checks = [
    { scope: NATIONAL_SCOPE, bound: BOUND_STATES, bounds: (n: number) => n < 50 },
    { scope: GLOBAL_SCOPE, bound: BOUND_COUNTRIES, bounds: (_n: number) => true },
  ];
  for (const l of lines) {
    for (const c of checks) {
      const m = c.scope.exec(l.text);
      if (!m) continue;
      if (l.refs.some((r) => c.scope.test(textOf(r)))) continue;          // a cited row states the scope: licensed
      for (const row of pool) {
        const b = c.bound.exec(row.text);
        if (b && c.bounds(Number(b[1]))) { hits.push({ field: l.field ?? "", text: l.text, scope: m[1].toLowerCase(), row: row.ref, bound: b[0] }); break; }
      }
    }
  }
  return hits;
}

export function contradictionDetail(hits: readonly ContradictionHit[], rowName: (ref: string) => string = (r) => r): string | null {
  return hits.length
    ? hits.map((h) => `${h.field || "(root)"}: "${h.scope}" — the record bounds it: ${rowName(h.row)} states "${h.bound}"`).join("; ")
    : null;
}
