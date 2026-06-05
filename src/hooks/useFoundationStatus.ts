import { useMemo } from "react";
import type { PositioningCanvas, StrategyCascade } from "@/lib/types";
import type { RouteRow } from "@/views/Routes/useRoutes";
import type { DirectionEvidence } from "./useDirectionEvidence";

export type FoundationStatus = {
  positioningSet: boolean;
  categoryDefined: boolean;
  buyerDefined: boolean;
  valueDefined: boolean;
  strategyMapped: boolean;
  cascadeElementCount: number;
  directionCount: number;
  wrapPresent: boolean;
  leaningTitle: string | null;
  narrative: string;
  tagline: string;
};

/**
 * Pure computation — exported for unit testing.
 * Derives what's actually grounded from pre-loaded data and generates a
 * smart-friend acknowledgment narrative.
 */
export function computeFoundationStatus(
  positioning: PositioningCanvas | null | undefined,
  cascade: StrategyCascade | null | undefined,
  routes: RouteRow[],
  directionEvidence: DirectionEvidence | null,
): FoundationStatus {
  const categoryDefined = (positioning?.market_category?.trim().length ?? 0) > 0;
  const buyerDefined = (positioning?.best_fit_customers?.trim().length ?? 0) > 0;
  const valueDefined = (positioning?.value_for_customer?.trim().length ?? 0) > 0;
  const positioningSet = categoryDefined && buyerDefined && valueDefined;

  const aspirationDefined = (cascade?.winning_aspiration?.trim().length ?? 0) > 0;
  const whereDefined = (cascade?.where_to_play?.trim().length ?? 0) > 0;
  const howDefined = (cascade?.how_to_win?.trim().length ?? 0) > 0;
  const cascadeElementCount = [aspirationDefined, whereDefined, howDefined].filter(Boolean).length;
  const strategyMapped = cascadeElementCount === 3;

  const topLevelRoutes = routes.filter((r) => r.level === "route");
  const directionCount = topLevelRoutes.length;

  // wrapPresent grounds Foundation on the actual strategic bets (insight-bearing
  // legs), not the empty parent groupings. A bet is "wrapped" when it carries a
  // what_would_have_to_be_true (win-conditions, derived from movement_condition).
  // rejected_alternatives is intentionally NOT required — there is no honest source
  // for it (it would have to be LLM-generated/fabricated). Only legs that carry
  // route_insights_json are gated; ungrounded legs (e.g. operational chores, or an
  // intended-but-ungrounded bet) are exempt by design.
  const insightLegs = routes.filter(
    (r) => r.level === "leg" && r.route_insights_json != null,
  );
  const wrapPresent =
    insightLegs.length > 0 &&
    insightLegs.every((r) => (r.what_would_have_to_be_true?.length ?? 0) > 0);

  const leaningTitle = directionEvidence?.leaning
    ? (directionEvidence.directions.find((d) => d.id === directionEvidence.leaning)?.title ?? null)
    : null;

  // Build narrative sentence by sentence from what's actually true
  const parts: string[] = [];

  if (positioningSet) {
    parts.push("Positioning is set — category, buyer, and value defined.");
  } else if (positioning) {
    const missing = [
      !categoryDefined && "category",
      !buyerDefined && "buyer",
      !valueDefined && "value",
    ].filter(Boolean) as string[];
    if (missing.length > 0) {
      parts.push(`Positioning is partially mapped — ${missing.join(" and ")} still undefined.`);
    }
  } else {
    parts.push("Positioning hasn't been mapped yet.");
  }

  if (strategyMapped) {
    parts.push("Strategy mapped: aspiration, where to play, and how to win.");
  } else if (cascade && cascadeElementCount > 0) {
    parts.push(
      `Strategy in progress — ${cascadeElementCount} of 3 elements filled in.`,
    );
  } else if (cascade !== undefined) {
    parts.push("No strategy direction mapped yet.");
  }

  if (directionCount > 0) {
    const dirWord = directionCount === 1 ? "direction" : "directions";
    const countWord =
      directionCount === 1
        ? "One"
        : directionCount === 2
          ? "Two"
          : directionCount === 3
            ? "Three"
            : String(directionCount);
    const wrapNote = wrapPresent
      ? ", each with alternatives considered and conditions documented"
      : "";
    parts.push(`${countWord} ${dirWord} identified${wrapNote}.`);
    if (leaningTitle) {
      parts.push(`"${leaningTitle}" is already pulling ahead on evidence alone.`);
    }
  }

  const narrative = parts.join(" ") || "Foundation work is underway.";

  // Tagline reflects how much genuine work is in place
  const groundedCount = [positioningSet, strategyMapped, directionCount > 0, wrapPresent].filter(
    Boolean,
  ).length;
  const tagline =
    groundedCount >= 3
      ? "You've done real work here. The foundation is mapped across all four pillars."
      : groundedCount >= 2
        ? "Solid groundwork in place. A few elements still to fill in."
        : "Early-stage foundation — more to build, but a real start.";

  return {
    positioningSet,
    categoryDefined,
    buyerDefined,
    valueDefined,
    strategyMapped,
    cascadeElementCount,
    directionCount,
    wrapPresent,
    leaningTitle,
    narrative,
    tagline,
  };
}

/**
 * Derives foundation status from already-loaded data — no extra network calls.
 * Takes pre-fetched positioning, cascade, routes, and direction evidence.
 */
export function useFoundationStatus(
  _companyId: string | undefined,
  positioning: PositioningCanvas | null | undefined,
  cascade: StrategyCascade | null | undefined,
  routes: RouteRow[],
  directionEvidence: DirectionEvidence | null,
): FoundationStatus | null {
  return useMemo(() => {
    if (!_companyId) return null;
    return computeFoundationStatus(positioning, cascade, routes, directionEvidence);
  }, [_companyId, positioning, cascade, routes, directionEvidence]);
}
