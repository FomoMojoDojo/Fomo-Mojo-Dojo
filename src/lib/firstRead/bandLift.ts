// First Read · Gate 2 — evidence-band lift (render-time only).
//
// Operator ruling: a single client confirmation lifts a finding's evidence band
// to customer_evidenced, live. The lift is a RENDER-TIME derivation — no schema
// change, no findings-table write. The verdict row IS the evidence; this helper
// only reads it.
//
// A public outside-read finding is DIRECTIONAL by nature (plausible, inferred
// from public signal, not yet backed by a customer voice). A client confirming
// it in the room IS that customer voice → customer_evidenced. The lift only ever
// RAISES; it never lowers a band that is already higher.

import { type EvidenceBand } from "@/lib/evidenceBands";

const BAND_ORDER: EvidenceBand[] = [
  "hypothesis_only",
  "directional_not_validated",
  "customer_evidenced",
  "market_validated",
  "proven_path",
  "sustained_performance",
];

const rank = (b: EvidenceBand): number => BAND_ORDER.indexOf(b);

// The band an outside-read finding sits at before any client attestation.
export const baselineFindingBand = (): EvidenceBand => "directional_not_validated";

// Given a finding's baseline band and whether the client has CONFIRMED it,
// return the rendered band. A confirmation is direct customer evidence.
export function liftBand(baseline: EvidenceBand, hasConfirmedAttestation: boolean): EvidenceBand {
  if (!hasConfirmedAttestation) return baseline;
  return rank("customer_evidenced") > rank(baseline) ? "customer_evidenced" : baseline;
}
