import type { ActionGroup, ActionItem, HealthSubscore, OnboardingMapConfig } from "@/lib/clientOnboardingMojoMapConfig";

type OwnershipStatusLabel = "Strong" | "Emerging" | "Fragile" | "At Risk";
type OwnershipTone = "served" | "monitor" | "gap";

type ScoredAction = {
  groupId: ActionGroup["id"];
  item: ActionItem;
  isCritical: boolean;
  isOwned: boolean;
  isClearOwner: boolean;
  isActiveFixImprove: boolean;
  progress: number;
};

export type OnboardingOwnershipScoreModel = {
  baseMojoScore: number;
  finalMojoScore: number;
  ownershipMultiplier: number;
  ownershipScore: number;
  ownershipStatusLabel: OwnershipStatusLabel;
  ownershipTone: OwnershipTone;
  coverageScore: number;
  clarityScore: number;
  commitmentScore: number;
  criticalActionsCount: number;
  ownedCriticalActionsCount: number;
  unownedCriticalActionsCount: number;
  activeFixImproveActionsCount: number;
  unownedActiveFixImproveActionsCount: number;
  hasOwnershipWarning: boolean;
  headlineInsight: string;
  ownershipSubscoreInsight: string;
  potentialScoreLift: number;
  subscores: HealthSubscore[];
  topLifts: string[];
};

const DONE_STATUSES = new Set(["done", "complete", "completed"]);
const AMBIGUOUS_OWNER_PATTERN = /[,/&+]|\band\b/i;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function normalizeStatus(value: string | undefined) {
  return (value || "").trim().toLowerCase();
}

function isDoneStatus(status: string | undefined) {
  return DONE_STATUSES.has(normalizeStatus(status));
}

function isActiveStatus(status: string | undefined) {
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  if (isDoneStatus(normalized)) return false;
  return normalized !== "not_started";
}

function statusProgress(status: string | undefined) {
  const normalized = normalizeStatus(status);
  if (normalized === "in_progress") return 0.9;
  if (DONE_STATUSES.has(normalized)) return 1;
  if (normalized === "planned") return 0.55;
  if (normalized === "not_started") return 0.2;
  if (normalized === "stalled" || normalized === "blocked") return 0.1;
  return 0.45;
}

function hasPrimaryOwner(primaryOwner: string | undefined) {
  return Boolean(primaryOwner?.trim());
}

function isClearOwner(primaryOwner: string | undefined) {
  if (!hasPrimaryOwner(primaryOwner)) return false;
  return !AMBIGUOUS_OWNER_PATTERN.test(primaryOwner as string);
}

function hasPriorityMetadata(groups: ActionGroup[]) {
  return groups.some((group) =>
    group.items.some((item) => typeof (item as ActionItem & { priority?: unknown }).priority === "string"),
  );
}

function isCriticalByPriority(item: ActionItem) {
  const priority = String((item as ActionItem & { priority?: unknown }).priority || "")
    .trim()
    .toLowerCase();
  return ["critical", "highest", "high", "p0", "p1"].includes(priority);
}

function flattenScoredActions(groups: ActionGroup[]): ScoredAction[] {
  const usePriority = hasPriorityMetadata(groups);
  return groups.flatMap((group) =>
    group.items.map((item) => {
      const criticalFromGroup =
        group.id === "fix" || (group.id === "improve" && !isDoneStatus(item.status));
      return {
        groupId: group.id,
        item,
        isCritical: usePriority ? isCriticalByPriority(item) : criticalFromGroup,
        isOwned: hasPrimaryOwner(item.ownership.primaryOwner),
        isClearOwner: isClearOwner(item.ownership.primaryOwner),
        isActiveFixImprove:
          (group.id === "fix" || group.id === "improve") && isActiveStatus(item.status),
        progress: statusProgress(item.status),
      };
    }),
  );
}

function ownershipMultiplierForScore(score: number) {
  if (score >= 80) return 1.0;
  if (score >= 60) return 0.85;
  if (score >= 40) return 0.65;
  return 0.4;
}

function ownershipStatusLabel(score: number): OwnershipStatusLabel {
  if (score >= 80) return "Strong";
  if (score >= 60) return "Emerging";
  if (score >= 40) return "Fragile";
  return "At Risk";
}

function ownershipToneFromLabel(label: OwnershipStatusLabel): OwnershipTone {
  if (label === "Strong") return "served";
  if (label === "Emerging") return "monitor";
  return "gap";
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function withOwnershipSubscore(subscores: HealthSubscore[], ownershipScore: number): HealthSubscore[] {
  const ownershipSubscore: HealthSubscore = {
    id: "ownership_strength",
    label: "Ownership Strength",
    value: round1(ownershipScore),
  };
  const filtered = subscores.filter((subscore) => subscore.id !== ownershipSubscore.id);
  return [...filtered, ownershipSubscore];
}

export function getOnboardingOwnershipScoreModel(
  map: OnboardingMapConfig,
): OnboardingOwnershipScoreModel {
  const scoredActions = flattenScoredActions(map.actionGroups);
  const criticalActions = scoredActions.filter((action) => action.isCritical);
  const ownedCriticalActions = criticalActions.filter((action) => action.isOwned);
  const clearCriticalActions = criticalActions.filter((action) => action.isClearOwner);
  const activeFixImproveActions = scoredActions.filter((action) => action.isActiveFixImprove);
  const unownedActiveFixImproveActions = activeFixImproveActions.filter((action) => !action.isOwned);
  const stalledOwnedCriticalActions = ownedCriticalActions.filter((action) => action.progress < 0.5);

  const criticalActionsCount = criticalActions.length;
  const ownedCriticalActionsCount = ownedCriticalActions.length;
  const unownedCriticalActionsCount = Math.max(criticalActionsCount - ownedCriticalActionsCount, 0);
  const activeFixImproveActionsCount = activeFixImproveActions.length;
  const unownedActiveFixImproveActionsCount = unownedActiveFixImproveActions.length;

  const coverageScore =
    criticalActionsCount > 0 ? (ownedCriticalActionsCount / criticalActionsCount) * 100 : 0;
  const clarityScore =
    criticalActionsCount > 0 ? (clearCriticalActions.length / criticalActionsCount) * 100 : 0;

  let commitmentScore =
    ownedCriticalActionsCount > 0
      ? (ownedCriticalActions.reduce((sum, action) => sum + action.progress, 0) /
          ownedCriticalActionsCount) *
        100
      : 0;

  if (ownedCriticalActionsCount > 0) {
    const stalledRatio = stalledOwnedCriticalActions.length / ownedCriticalActionsCount;
    if (stalledRatio > 0.75) commitmentScore *= 0.6;
    else if (stalledRatio > 0.5) commitmentScore *= 0.75;
  }

  const unownedActiveRatio =
    activeFixImproveActionsCount > 0
      ? unownedActiveFixImproveActionsCount / activeFixImproveActionsCount
      : 0;
  const hasOwnershipWarning =
    activeFixImproveActionsCount > 0 && unownedActiveRatio > 0.2;

  let ownershipScore =
    coverageScore * 0.4 + clarityScore * 0.3 + commitmentScore * 0.3;

  if (hasOwnershipWarning) {
    ownershipScore *= 0.85;
  }

  const allCriticalOwnedAndClear =
    criticalActionsCount > 0 &&
    ownedCriticalActionsCount === criticalActionsCount &&
    clearCriticalActions.length === criticalActionsCount;
  const activeOwnedCriticalRatio =
    ownedCriticalActionsCount > 0
      ? ownedCriticalActions.filter((action) => action.progress >= 0.85).length /
        ownedCriticalActionsCount
      : 0;
  if (allCriticalOwnedAndClear && activeOwnedCriticalRatio >= 0.6) {
    ownershipScore += 8;
  }

  ownershipScore = round1(clamp(ownershipScore, 0, 100));
  const ownershipMultiplier = ownershipMultiplierForScore(ownershipScore);
  const baseMojoScore = clamp(Number(map.health.overallScore) || 0, 0, 100);
  const finalMojoScore = round1(baseMojoScore * ownershipMultiplier);
  const potentialScoreLift = round1(clamp(baseMojoScore - finalMojoScore, 0, 100));
  const ownershipStatus = ownershipStatusLabel(ownershipScore);
  const ownershipTone = ownershipToneFromLabel(ownershipStatus);

  const headlineInsight =
    unownedCriticalActionsCount > 0
      ? "Missing ownership is reducing your likelihood of progress."
      : hasOwnershipWarning || commitmentScore < 60
        ? "Ownership is uneven and may slow progress."
        : "Ownership is strong. Momentum is likely to hold.";

  const ownershipSubscoreInsight =
    unownedCriticalActionsCount > 0
      ? `${unownedCriticalActionsCount} critical action${unownedCriticalActionsCount === 1 ? " has" : "s have"} no owner`
      : hasOwnershipWarning
        ? "Ownership is limiting progress"
        : "Ownership is strong across current priorities";

  return {
    baseMojoScore,
    finalMojoScore,
    ownershipMultiplier,
    ownershipScore,
    ownershipStatusLabel: ownershipStatus,
    ownershipTone,
    coverageScore: round1(clamp(coverageScore, 0, 100)),
    clarityScore: round1(clamp(clarityScore, 0, 100)),
    commitmentScore: round1(clamp(commitmentScore, 0, 100)),
    criticalActionsCount,
    ownedCriticalActionsCount,
    unownedCriticalActionsCount,
    activeFixImproveActionsCount,
    unownedActiveFixImproveActionsCount,
    hasOwnershipWarning,
    headlineInsight,
    ownershipSubscoreInsight,
    potentialScoreLift,
    subscores: withOwnershipSubscore(map.health.subscores, ownershipScore),
    topLifts: uniqueStrings([
      ...map.health.topLifts,
      ...(unownedCriticalActionsCount > 0 ? ["Assign clear primary owners to critical actions"] : []),
      ...(commitmentScore < 60 ? ["Move owned actions from planned to in-progress faster"] : []),
    ]).slice(0, 5),
  };
}
