export type OpportunityActionLabel = "Fix" | "Improve" | "Create";
export type OpportunityActionTone = {
  border: string;
  bg: string;
  fg: string;
};

export function opportunityActionFromPriorityTier(
  tier: string | null | undefined,
): OpportunityActionLabel {
  const normalized = String(tier || "").trim().toLowerCase();
  if (normalized === "focus") return "Fix";
  if (normalized === "defer") return "Create";
  return "Improve";
}

export function opportunityActionFromNeedScore(
  score: number | null | undefined,
): OpportunityActionLabel {
  const normalized = Number(score);
  if (!Number.isFinite(normalized)) return "Improve";
  if (normalized >= 13) return "Fix";
  if (normalized >= 9) return "Improve";
  return "Create";
}

export function opportunityActionTone(label: OpportunityActionLabel): OpportunityActionTone {
  if (label === "Fix") {
    return { border: "#FBCFB7", bg: "#FFF1EA", fg: "#B45309" };
  }
  if (label === "Improve") {
    return { border: "#C8DAFF", bg: "#EEF4FF", fg: "#355EA8" };
  }
  return { border: "#BFE7D6", bg: "#EAF8F3", fg: "#2F7A66" };
}
