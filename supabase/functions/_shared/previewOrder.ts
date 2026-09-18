// ── The preview's ordering authorities, in a pure, alias-free module (operator ruling 5, signed 2026-09-18).
//
// These lived in src/views/client/firstReadPreview/mapping.ts, which imports through the "@/" alias and so
// cannot be loaded by the edge runtime (which mounts supabase/functions and a fixed set of src/lib files). The
// generator (generate-public-read) must ORDER its inputs by the preview's own keys and never copy them, so the
// functions MOVED here byte-for-byte and mapping.ts re-exports them — one authority, two importers (the preview
// hook and the generator's selectPublicInputs). The client imports _shared files directly, as it already does
// for voiceLabel.ts, contentIdentity.ts and firstReadProvenance.ts.
//
//   • strengthForSignal — R4: strong = recurrence-confirmed; thin = low confidence; else moderate.
//   • orderBeat2Signals — R4 (2026-08-27) FRESH-FIRST: read-date (crawl) desc, then host, then strength,
//     then event date (recent first). Applied to EVERY company (no exceptions).
//   • GAP_VERDICT_ORDER / orderGapPairs — A1: beat-4 order by discussability — contradicted → reverifying →
//     unechoed → confirmed (unspoken last); ties break by evidence strength desc.
//   • gapVerdictForDeltaType — the delta_type → gap verdict mapping (echoed → confirmed, divergent →
//     contradicted, publicly_silent → unechoed); mapping.ts's verdictForDeltaType delegates to it.

export type SignalStrength = "strong" | "moderate" | "thin";
export type GapVerdict = "confirmed" | "contradicted" | "unechoed" | "unspoken";

export function strengthForSignal(
  confidence: string | null | undefined,
  recurrenceConfirmed: boolean,
): SignalStrength {
  if (recurrenceConfirmed) return "strong";
  if ((confidence ?? "").toLowerCase() === "low") return "thin";
  return "moderate";
}

export type Beat2SortableLike = { signal: { strength: SignalStrength; eventDate: string | null }; readDate: string; host: string };
const STRENGTH_ORDER = { strong: 0, moderate: 1, thin: 2 } as const;

/** The beat-2 comparator itself — exported so a caller that must also break the LAST tie (the generator,
 *  which needs a total order for determinism) can append its own key after these four. */
export function compareBeat2(a: Beat2SortableLike, b: Beat2SortableLike): number {
  return b.readDate.localeCompare(a.readDate)                                        // fresh read-date first
    || a.host.localeCompare(b.host)                                             // then host
    || STRENGTH_ORDER[a.signal.strength] - STRENGTH_ORDER[b.signal.strength]     // then strength
    || (b.signal.eventDate ?? "").localeCompare(a.signal.eventDate ?? "");      // then event date (recent first)
}

export function orderBeat2Signals<T extends Beat2SortableLike>(items: T[]): T["signal"][] {
  return [...items].sort(compareBeat2).map((x) => x.signal);
}

export const GAP_VERDICT_ORDER: Record<string, number> = { contradicted: 0, reverifying: 1, unechoed: 2, confirmed: 3, unspoken: 4 };
export function orderGapPairs<T extends { verdict: string; evidenceRank: number }>(pairs: T[]): T[] {
  return [...pairs].sort((a, b) =>
    (GAP_VERDICT_ORDER[a.verdict] ?? 9) - (GAP_VERDICT_ORDER[b.verdict] ?? 9) || b.evidenceRank - a.evidenceRank);
}

export function gapVerdictForDeltaType(deltaType: string): GapVerdict | null {
  switch (deltaType) {
    case "echoed":
      return "confirmed";
    case "divergent":
      return "contradicted";
    case "publicly_silent":
      return "unechoed";
    default:
      return null;
  }
}
