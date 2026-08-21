// R4 (2026-08-20) — findings age + order. PURE. Reuses the freshness lever's EXISTING thresholds
// (FRESHNESS_WINDOW_MONTHS + monthsBetween) — no new age numbers are invented here.
import { FRESHNESS_WINDOW_MONTHS, monthsBetween } from "@/lib/outsideScore/computeOutsideScore";

/** A finding is stale when its earliest backing event_date is > 18 months old, OR undated
 *  (undated counts NOT fresh — the same stated rule the freshness lever uses). The marker
 *  distinguishes an old-but-dated finding ("dated") from one with no known date ("undated"). */
export function classifyFindingAge(
  eventDate: string | null,
  readDate: string | null,
): { stale: boolean; ageMarker: "dated" | "undated" | null } {
  const ageMonths = eventDate && readDate ? monthsBetween(eventDate, readDate) : Number.POSITIVE_INFINITY;
  const stale = !eventDate || ageMonths > FRESHNESS_WINDOW_MONTHS;
  return { stale, ageMarker: !eventDate ? "undated" : stale ? "dated" : null };
}

/** Order: recurrence desc → fresh before stale (at equal recurrence) → recency desc. The
 *  fresh-before-stale key is the R4 addition — removing it lets a stale item outrank a fresh
 *  peer of equal recurrence (the falsification target). */
export function orderFindings<T extends { recurrence: number; stale: boolean; recencyKey: string }>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    b.recurrence - a.recurrence ||
    (a.stale === b.stale ? 0 : a.stale ? 1 : -1) ||
    b.recencyKey.localeCompare(a.recencyKey));
}
