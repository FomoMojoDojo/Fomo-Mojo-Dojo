// ── THE BRIEF'S SIGNED LINES, FILLED (SP-446, 2026-11-19) ─────────────────────────────────────────
//
// The mapping from a derived fact to a signed string. `src/lib/briefSections.ts` stays pure and says
// WHICH floor a thin spot missed; this file says it in the words the operator signed.
import { thinFloors } from "@/lib/briefSections";
import type { NeedTally } from "@/lib/needEvidenceCounting";
import { WORKSPACE_STRINGS, brandLabel, withheldLine } from "./workspaceNav";

/** B-7 — which of the bar's two floors a thin spot missed. */
export function thinReasonLine(t: NeedTally): string {
  const { fewQuotes, fewSites } = thinFloors(t);
  if (fewQuotes && fewSites) return WORKSPACE_STRINGS.thinTooFewBoth;
  if (fewSites) return WORKSPACE_STRINGS.thinTooFewSites;
  return WORKSPACE_STRINGS.thinTooFewQuotes;
}

/** B-8 — what the merger rule withheld from this need. */
export function thinWithheldLine(t: NeedTally): string {
  return withheldLine(t.coxUndated, t.coxPreMerger);
}

/** The per-brand polarity counts, as the Brief prints them: "spectrum 3/35/3", keyed by B-"working /
 *  not working / mixed" (SP-445). Brands in a stable order so two runs read the same. */
export function brandPolarityLines(t: NeedTally): string[] {
  return Object.keys(t.byBrandPolarity).sort().map((brand) => {
    const by = t.byBrandPolarity[brand];
    return `${brandLabel(brand)} ${by.working ?? 0}/${by["not working"] ?? 0}/${by.mixed ?? 0}`;
  });
}
