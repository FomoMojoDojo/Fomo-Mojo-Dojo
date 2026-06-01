/**
 * Assumption Evolution — derivation engine for Phase 26 (Reframing + Assumption Evolution).
 *
 * Pure module — no hooks, no side effects.
 * Classifies assumptions by lifecycle stage, surfaces reframing events,
 * identifies downstream staleness, and generates conditional commitment language.
 *
 * Backwards compatible: all new statuses gracefully fall through for old data.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AssumptionEvolutionStatus =
  // Phase 23 originals
  | "untested" | "validating" | "validated" | "invalidated"
  // Phase 26 additions
  | "emerging" | "directional" | "strengthening" | "unstable" | "contradicted" | "reframed" | "retired";

/**
 * Where in its lifecycle an assumption sits.
 * - forming:  early; direction not yet clear
 * - active:   under active evaluation; may be strengthening, unstable, or contradicted
 * - resolved: definitively confirmed
 * - reframed: interpretation shifted; prior statement preserved
 * - retired:  no longer relevant to the current strategic direction
 */
export type AssumptionEvolutionStage =
  | "forming"
  | "active"
  | "resolved"
  | "reframed"
  | "retired";

/**
 * Minimal assumption shape accepted by the evolution engine.
 * Compatible with StrategicAssumption from useStrategicAssumptions.ts and
 * with Phase 26 extended rows that carry additional fields.
 */
export type AssumptionForEvolution = {
  id: string;
  assumption: string;
  status: string;
  prior_statement?: string | null;
  reframed_from_id?: string | null;
  invalidated_reason?: string | null;
  supporting_evidence?: unknown[];
  contradicting_evidence?: unknown[];
  related_tension_ids?: string[];
  affected_route_ids?: string[];
};

export type EvolvedAssumption = {
  id: string;
  statement: string;
  status: AssumptionEvolutionStatus;
  stage: AssumptionEvolutionStage;
  /** False for retired or invalidated assumptions — exclude from active reasoning. */
  isActive: boolean;
  /** True for contradicted or unstable — highest concern. */
  isUnstable: boolean;
  /** True if this assumption was deliberately reframed from a prior interpretation. */
  hasReframing: boolean;
  priorStatement: string | null;
  affectedRouteIds: string[];
  relatedTensionIds: string[];
};

export type ReframingEvent = {
  assumptionId: string;
  priorStatement: string;
  newStatement: string;
};

export type StalenessSignal = {
  routeId: string;
  causingAssumptionId: string;
  causingStatement: string;
};

// ─── Stage classification ─────────────────────────────────────────────────────

export function classifyEvolutionStage(status: string): AssumptionEvolutionStage {
  switch (status) {
    case "untested":
    case "emerging":
    case "directional":
      return "forming";

    case "validating":
    case "strengthening":
    case "unstable":
    case "contradicted":
    case "invalidated":
      return "active";

    case "validated":
      return "resolved";

    case "reframed":
      return "reframed";

    case "retired":
      return "retired";

    default:
      return "forming";
  }
}

function safeStatus(raw: string): AssumptionEvolutionStatus {
  const known: AssumptionEvolutionStatus[] = [
    "untested", "validating", "validated", "invalidated",
    "emerging", "directional", "strengthening", "unstable", "contradicted", "reframed", "retired",
  ];
  return known.includes(raw as AssumptionEvolutionStatus)
    ? (raw as AssumptionEvolutionStatus)
    : "untested";
}

// ─── Stage ordering (lower = shown first) ────────────────────────────────────

const STAGE_SORT: Record<AssumptionEvolutionStage, number> = {
  active:   0, // unstable/contradicted surface first
  forming:  1,
  resolved: 2,
  reframed: 3,
  retired:  4,
};

function stageSort(stage: AssumptionEvolutionStage): number {
  return STAGE_SORT[stage] ?? 5;
}

// ─── Core derivation ──────────────────────────────────────────────────────────

/**
 * Classify assumptions by evolution stage and annotate with movement metadata.
 * Sorted: unstable/contradicted first, then forming, resolved, reframed, retired.
 */
export function deriveAssumptionEvolution(
  assumptions: AssumptionForEvolution[],
): EvolvedAssumption[] {
  const evolved = assumptions.map((a): EvolvedAssumption => {
    const status = safeStatus(a.status);
    const stage = classifyEvolutionStage(status);
    const isUnstable = status === "contradicted" || status === "unstable";
    const isActive = stage !== "retired" && status !== "invalidated";

    return {
      id: a.id,
      statement: a.assumption,
      status,
      stage,
      isActive,
      isUnstable,
      hasReframing: stage === "reframed" && Boolean(a.prior_statement),
      priorStatement: a.prior_statement ?? null,
      affectedRouteIds: a.affected_route_ids ?? [],
      relatedTensionIds: a.related_tension_ids ?? [],
    };
  });

  // Unstable assumptions float to the top within their stage group
  evolved.sort((a, b) => {
    const stageA = stageSort(a.stage);
    const stageB = stageSort(b.stage);
    if (stageA !== stageB) return stageA - stageB;
    // Within same stage: unstable first
    if (a.isUnstable !== b.isUnstable) return a.isUnstable ? -1 : 1;
    return 0;
  });

  return evolved;
}

// ─── Reframing events ─────────────────────────────────────────────────────────

/**
 * Returns reframing events — assumptions whose interpretation shifted.
 * Only surfaced when `status === "reframed"` and `prior_statement` is present,
 * so the system doesn't report reframings that haven't been deliberately recorded.
 */
export function deriveReframingEvents(
  assumptions: AssumptionForEvolution[],
): ReframingEvent[] {
  return assumptions
    .filter((a) => a.status === "reframed" && a.prior_statement)
    .map((a) => ({
      assumptionId: a.id,
      priorStatement: a.prior_statement!,
      newStatement: a.assumption,
    }));
}

// ─── Downstream staleness ─────────────────────────────────────────────────────

/**
 * Returns routes that are affected by at least one unstable or contradicted assumption.
 * These routes should be flagged as conditionally committed — their basis is in question.
 */
export function deriveDownstreamStaleness(
  assumptions: AssumptionForEvolution[],
): StalenessSignal[] {
  const signals: StalenessSignal[] = [];

  for (const a of assumptions) {
    if (a.status !== "contradicted" && a.status !== "unstable") continue;
    const routeIds = a.affected_route_ids ?? [];
    for (const routeId of routeIds) {
      signals.push({
        routeId,
        causingAssumptionId: a.id,
        causingStatement: a.assumption,
      });
    }
  }

  return signals;
}

// ─── Conditional commitment language ─────────────────────────────────────────

type RouteAssumptionLike = {
  statement: string;
  status?: string;
  critical?: boolean;
};

/**
 * Generates conditional commitment language for a route based on its critical assumptions.
 * Returns null if there are no unproven critical assumptions.
 *
 * Example output: "Assumes market timing hypothesis is validated."
 */
export function deriveConditionalCommitmentLanguage(
  routeAssumptions: RouteAssumptionLike[],
): string | null {
  const critical = routeAssumptions.filter(
    (a) => a.critical && (a.status === "unproven" || a.status === "untested" || !a.status),
  );

  if (critical.length === 0) return null;

  const first = critical[0].statement.replace(/\.$/, "").toLowerCase();

  if (critical.length === 1) {
    return `Assumes ${first} is validated.`;
  }

  const second = critical[1].statement.replace(/\.$/, "").toLowerCase();
  const remaining = critical.length - 2;
  if (remaining <= 0) {
    return `Assumes ${first} and ${second} are validated.`;
  }
  return `Assumes ${first}, ${second}, and ${remaining} other assumption${remaining === 1 ? "" : "s"} are validated.`;
}

// ─── Homepage line ────────────────────────────────────────────────────────────

/**
 * Generates a one-quiet-line summary of assumption evolution state.
 * Returns null if there's nothing worth surfacing.
 *
 * Interpretive, not mechanical: "1 belief contradicted." not "1 record changed."
 */
export function buildAssumptionMovementLine(
  evolved: EvolvedAssumption[],
): string | null {
  const contradicted = evolved.filter((e) => e.status === "contradicted").length;
  const unstable    = evolved.filter((e) => e.status === "unstable").length;
  const reframed    = evolved.filter((e) => e.stage === "reframed").length;

  const parts: string[] = [];

  if (contradicted > 0) {
    parts.push(`${contradicted} belief${contradicted === 1 ? "" : "s"} contradicted`);
  } else if (unstable > 0) {
    parts.push(`${unstable} assumption${unstable === 1 ? "" : "s"} unstable`);
  }

  if (reframed > 0) {
    parts.push(`${reframed} belief${reframed === 1 ? "" : "s"} reframed`);
  }

  if (parts.length === 0) return null;
  return `${parts.join("; ")}.`;
}
