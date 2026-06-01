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

  // All 4 cells always rendered. present=false cells show "Not yet classified." per plan spec.
  return [
    { tier: "outside", label: "Outside Signals", present: outsidePresent },
    { tier: "org", label: "Organization Signals", present: hasNonMissingEvidence },
    {
      tier: "customer",
      label: "Customer Signals",
      present: hasCustomerEvidence,
      detail: hasCustomerEvidence ? undefined : "Not yet classified.",
    },
    { tier: "market", label: "Market Validation", present: hasCompleteEvidence },
  ];
}

// Derive source-layer cells for a need based on source_path.
// Always returns all 4 cells so the TierGrid fills both columns evenly.
// Absent cells show "Not yet classified." — matching routeSignalTiers behavior.
export function needSignalTiers(sourcePath: string | null | undefined): TierCellData[] {
  const s = String(sourcePath || "").trim().toLowerCase();
  const isOutside = s.includes("baseline") || s.includes("public") || s.includes("social");
  const isOrg = !isOutside && (s.includes("upload") || s.includes("org") || s.includes("company") || s.includes("file"));
  const isCustomer = isPrimaryNeedsSourcePath(sourcePath);

  return [
    { tier: "outside",  label: "Outside Signals",      present: isOutside,  detail: isOutside  ? undefined : "Not yet classified." },
    { tier: "org",      label: "Organization Signals",  present: isOrg,      detail: isOrg      ? undefined : "Not yet classified." },
    { tier: "customer", label: "Customer Signals",      present: isCustomer, detail: isCustomer ? undefined : "Not yet classified." },
    { tier: "market",   label: "Market Validation",     present: false,      detail: "Not yet classified." },
  ];
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
