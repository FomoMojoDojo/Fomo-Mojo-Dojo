// First Read — the single derivation of a Check item's in-place annotation.
//
// CheckItemRow (the meeting screen) and the export serializer both read this, so
// the leave-behind cannot render a verdict differently than the meeting did. The
// band-lift decision (a confirmed finding → Customer-Evidenced) lives here once,
// via the same liftBand/baselineFindingBand helpers the rest of the flow uses.

import { BAND_LABELS } from "@/lib/evidenceBands";
import { baselineFindingBand, liftBand } from "@/lib/firstRead/bandLift";
import type { CheckItem } from "@/hooks/useFirstReadCapture";

export const CHECK_KIND_LABEL: Record<CheckItem["kind"], string> = {
  finding: "Finding",
  market: "Market",
  differentiator: "Differentiator",
};

export function checkItemDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}

export type CheckItemAnnotation =
  | { kind: "confirmed"; bandLabel: string; date: string } // bandLabel "" for non-finding confirmations
  | { kind: "rejected"; date: string }
  | { kind: "not_important"; date: string } // OC-2: true-but-immaterial capture note
  | { kind: "corrected"; text: string }
  | null;

export function checkItemAnnotation(item: CheckItem): CheckItemAnnotation {
  if (item.verdict === "confirmed") {
    const band = item.kind === "finding" ? liftBand(baselineFindingBand(), true) : null;
    return { kind: "confirmed", bandLabel: band ? BAND_LABELS[band] : "", date: checkItemDate(item.capturedAt) };
  }
  if (item.verdict === "rejected") return { kind: "rejected", date: checkItemDate(item.capturedAt) };
  if (item.verdict === "not_important") return { kind: "not_important", date: checkItemDate(item.capturedAt) };
  if (item.verdict === "corrected" && item.correctionText) return { kind: "corrected", text: item.correctionText };
  return null;
}
