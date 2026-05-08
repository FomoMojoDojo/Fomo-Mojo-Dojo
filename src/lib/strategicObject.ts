import { isPrimaryNeedsSourcePath } from "@/lib/evidenceBands";

export type SignalTier = "outside" | "org" | "customer" | "market";

export type TierLabel =
  | "Outside Signals"
  | "Organization Signals"
  | "Customer Signals"
  | "Market Validation";

export const TIER_LABELS: Record<SignalTier, TierLabel> = {
  outside: "Outside Signals",
  org: "Organization Signals",
  customer: "Customer Signals",
  market: "Market Validation",
};

export type TierCellData = {
  tier: SignalTier;
  label: TierLabel;
  present: boolean;
  detail?: string;
};

// Derive source-layer cells for a route based on existing fields.
// Customer Signals cell is omitted entirely from the returned array if hasCustomerEvidence is false.
export function routeSignalTiers({
  frameworksUsed,
  hasNonMissingEvidence,
  hasCompleteEvidence,
  hasCustomerEvidence,
}: {
  frameworksUsed: string[];
  hasNonMissingEvidence: boolean;
  hasCompleteEvidence: boolean;
  hasCustomerEvidence: boolean;
}): TierCellData[] {
  const fw = frameworksUsed.map((f) => f.toLowerCase());
  const outsidePresent =
    fw.some((f) => f.includes("jtbd") || f.includes("odi") || f.includes("public") || f.includes("baseline"));

  const cells: TierCellData[] = [
    { tier: "outside", label: "Outside Signals", present: outsidePresent },
    { tier: "org", label: "Organization Signals", present: hasNonMissingEvidence },
  ];

  // Customer Signals: only included if there is qualifying customer evidence
  if (hasCustomerEvidence) {
    cells.push({ tier: "customer", label: "Customer Signals", present: true });
  }

  cells.push({ tier: "market", label: "Market Validation", present: hasCompleteEvidence });
  return cells;
}

// Derive source-layer cells for a need based on source_path.
// Customer Signals cell is omitted unless isPrimaryNeedsSourcePath confirms primary research.
export function needSignalTiers(sourcePath: string | null | undefined): TierCellData[] {
  const s = String(sourcePath || "").trim().toLowerCase();
  const isOutside = s.includes("baseline") || s.includes("public") || s.includes("social");
  const isOrg = !isOutside && (s.includes("upload") || s.includes("org") || s.includes("company") || s.includes("file"));
  const isCustomer = isPrimaryNeedsSourcePath(sourcePath);

  const cells: TierCellData[] = [
    { tier: "outside", label: "Outside Signals", present: isOutside },
    { tier: "org", label: "Organization Signals", present: isOrg },
  ];

  if (isCustomer) {
    cells.push({ tier: "customer", label: "Customer Signals", present: true });
  }

  cells.push({ tier: "market", label: "Market Validation", present: false });
  return cells;
}

// Generation context label from frameworks_used — framed as "how it was generated", not "evidence from".
export function generationContextLabel(frameworksUsed: string[], objectId?: string): string {
  if (objectId?.startsWith("derived-")) return "Inferred from your data";
  const fw = frameworksUsed.map((f) => f.toLowerCase());
  if (fw.some((f) => f.includes("jtbd") || f === "odi")) return "Customer research framework";
  if (fw.some((f) => f.includes("strategy"))) return "Strategy inputs";
  if (fw.some((f) => f.includes("public") || f.includes("baseline"))) return "Public research baseline";
  if (fw.includes("manual_override")) return "Manually adjusted";
  if (fw.length === 0) return "Research and strategy inputs";
  return "Research and strategy inputs";
}
