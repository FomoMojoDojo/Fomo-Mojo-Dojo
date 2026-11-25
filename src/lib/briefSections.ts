// ── THE BRIEF'S SECTIONS, DERIVED (SP-445 / SP-446 / SP-449, 2026-11-19) ──────────────────────────
//
// Pure functions over the SP-406 tally. Nothing here is stored and nothing here restates a counting
// rule: `tallyNeed` (src/lib/needEvidenceCounting.ts) is the one authority for what counts, and these
// functions only sort the needs it has tallied into the Brief's bands.
//
// "AT THE BAR" (SP-445, signed): `meets && (counted === BAR_QUOTES || sites === BAR_SITES)` — a need
// that CLEARS the bar and sits exactly on one of its two floors. The `meets` term is load-bearing and
// was missing from the first draft: without it the predicate marked N6 and N8 — both 2 counted from 2
// sites, i.e. FAILURES of the quote floor — as "at the bar", when they are thin spots.
// This module stays PURE: it maps no value to prose. The signed strings live in the workspace
// register (WORKSPACE_STRINGS) and the view does the mapping, so src/lib never imports a view.
import { BAR_QUOTES, BAR_SITES, type NeedTally } from "./needEvidenceCounting.ts";

export type NeedWithTally<T> = { need: T; tally: NeedTally };

/** SP-445: clears the bar, and sits exactly on one of its floors. */
export function isAtTheBar(t: NeedTally): boolean {
  return t.meets && (t.counted === BAR_QUOTES || t.sites.length === BAR_SITES);
}

/** The polarity totals a need's counted quotes carry, summed across brands. */
export function polarityTotals(t: NeedTally): { working: number; notWorking: number; mixed: number } {
  let working = 0, notWorking = 0, mixed = 0;
  for (const by of Object.values(t.byBrandPolarity)) {
    working += by.working ?? 0;
    notWorking += by["not working"] ?? 0;
    mixed += by.mixed ?? 0;
  }
  return { working, notWorking, mixed };
}

/** SP-674: how many counted quotes each brand carries, most first — the brand split that replaced
 *  the per-brand polarity triple. Stored brand values; the view maps them to labels. */
export function brandTotals(t: NeedTally): Array<{ brand: string; counted: number }> {
  return Object.keys(t.byBrandPolarity).map((brand) => {
    const by = t.byBrandPolarity[brand];
    return { brand, counted: (by.working ?? 0) + (by["not working"] ?? 0) + (by.mixed ?? 0) };
  }).filter((b) => b.counted > 0).sort((a, b) => b.counted - a.counted || a.brand.localeCompare(b.brand));
}

/** HOTSPOTS (B-2): the needs that clear the bar, most-evidenced first. */
export function hotspots<T>(rows: readonly NeedWithTally<T>[]): NeedWithTally<T>[] {
  return rows.filter((r) => r.tally.meets)
    .sort((a, b) => b.tally.counted - a.tally.counted || b.tally.sites.length - a.tally.sites.length);
}

/** WHAT WORKS (SP-449): the needs whose counted quotes include a `working` polarity, ranked by how
 *  many say so. A need can appear here AND in hotspots — the same outcome can be met for some
 *  customers and missed for others, and the brief must not hide either side. */
export function whatWorks<T>(rows: readonly NeedWithTally<T>[]): Array<NeedWithTally<T> & { working: number }> {
  return rows.map((r) => ({ ...r, working: polarityTotals(r.tally).working }))
    .filter((r) => r.working > 0)
    .sort((a, b) => b.working - a.working || b.tally.counted - a.tally.counted);
}

/** THIN SPOTS (B-3): the needs that do not clear the bar, least-evidenced first. */
export function thinSpots<T>(rows: readonly NeedWithTally<T>[]): NeedWithTally<T>[] {
  return rows.filter((r) => !r.tally.meets)
    .sort((a, b) => a.tally.counted - b.tally.counted || a.tally.sites.length - b.tally.sites.length);
}

/** Which of the bar's two floors a thin spot missed. The view turns this into B-7. */
export function thinFloors(t: NeedTally): { fewQuotes: boolean; fewSites: boolean } {
  return { fewQuotes: t.counted < BAR_QUOTES, fewSites: t.sites.length < BAR_SITES };
}
