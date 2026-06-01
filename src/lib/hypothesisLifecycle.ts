/**
 * Hypothesis lifecycle — pure state-machine for strategic hypothesis evolution.
 *
 * All functions are pure (no DB writes, no side effects).
 * The caller is responsible for persisting the returned transition deltas.
 *
 * State machine:
 *   inferred ──strengthen──► emerging ──strengthen──► strengthened
 *            └─make_unstable─► unstable ◄─weaken─────────┘
 *   emerging ──make_unstable─► unstable ──strengthen──► emerging
 *   {inferred|emerging|strengthened|unstable} ──contradict──► contradicted
 *   {inferred|emerging|strengthened|unstable|contradicted} ──retire──► retired
 *
 * Reframing creates a new hypothesis and marks the original as "reframed" (is_active=false).
 * Supersession marks a hypothesis as inactive with a forward pointer to its replacement.
 */

import type {
  StrategicHypothesis,
  StrategicHypothesisState,
  StrategicHypothesisDraft,
} from "./strategicHypothesisDomain";

// ─── Transition types ─────────────────────────────────────────────────────────

export type HypothesisTransitionKind =
  | "strengthen"
  | "weaken"
  | "make_unstable"
  | "contradict"
  | "retire";

export type HypothesisTransition = {
  kind: HypothesisTransitionKind;
  previousState: StrategicHypothesisState;
  nextState: StrategicHypothesisState;
  reason: string | null;
  /** True when the transition creates review pressure on downstream routes. */
  isCommitmentImpact: boolean;
};

export type ReframingResult = {
  /**
   * Delta to write back to the original hypothesis row.
   * Intentionally narrow — preserves the original statement by never including it.
   */
  retired: {
    id: string;
    hypothesis_state: "reframed";
    is_active: false;
    reframed_reason: string;
  };
  /** New hypothesis draft. Caller assigns a fresh UUID before inserting. */
  successor: StrategicHypothesisDraft;
  /** Lineage metadata — useful for event logging. */
  lineage: { fromId: string; toKey: string; reason: string };
};

export type SupessionDelta = {
  id: string;
  superseded_by_id: string;
  is_active: false;
};

export type DownstreamImpact = {
  staleRouteIds: string[];
  /** high = contradicted, medium = unstable/weakened, low = no impact */
  pressure: "high" | "medium" | "low";
  /** One-sentence plain-language note for display. Empty string when no impact. */
  note: string;
};

// ─── Valid state transitions ──────────────────────────────────────────────────

const TRANSITIONS: Partial<
  Record<StrategicHypothesisState, Partial<Record<HypothesisTransitionKind, StrategicHypothesisState>>>
> = {
  inferred:     { strengthen: "emerging",     make_unstable: "unstable",  contradict: "contradicted", retire: "retired" },
  emerging:     { strengthen: "strengthened", weaken: "unstable",         make_unstable: "unstable",  contradict: "contradicted", retire: "retired" },
  strengthened: { weaken: "unstable",                                     contradict: "contradicted", retire: "retired" },
  unstable:     { strengthen: "emerging",                                 contradict: "contradicted", retire: "retired" },
  contradicted: { retire: "retired" },
  // reframed and retired are terminal — no outbound transitions
  reframed:     {},
  retired:      {},
};

// ─── Core transition function ─────────────────────────────────────────────────

export function transitionHypothesis(
  hypothesis: Pick<StrategicHypothesis, "hypothesis_state">,
  kind: HypothesisTransitionKind,
  reason?: string | null,
): HypothesisTransition | null {
  const nextState = TRANSITIONS[hypothesis.hypothesis_state]?.[kind];
  if (!nextState) return null;

  return {
    kind,
    previousState: hypothesis.hypothesis_state,
    nextState,
    reason: reason ?? null,
    isCommitmentImpact: nextState === "contradicted" || nextState === "unstable",
  };
}

// ─── Named transition helpers ─────────────────────────────────────────────────

export function strengthenHypothesis(
  hypothesis: Pick<StrategicHypothesis, "hypothesis_state">,
  reason?: string | null,
): HypothesisTransition | null {
  return transitionHypothesis(hypothesis, "strengthen", reason);
}

export function weakenHypothesis(
  hypothesis: Pick<StrategicHypothesis, "hypothesis_state">,
  reason?: string | null,
): HypothesisTransition | null {
  return transitionHypothesis(hypothesis, "weaken", reason);
}

export function makeUnstable(
  hypothesis: Pick<StrategicHypothesis, "hypothesis_state">,
  reason?: string | null,
): HypothesisTransition | null {
  return transitionHypothesis(hypothesis, "make_unstable", reason);
}

export function contradictHypothesis(
  hypothesis: Pick<StrategicHypothesis, "hypothesis_state">,
  reason?: string | null,
): HypothesisTransition | null {
  return transitionHypothesis(hypothesis, "contradict", reason);
}

export function retireHypothesis(
  hypothesis: Pick<StrategicHypothesis, "hypothesis_state">,
  reason?: string | null,
): HypothesisTransition | null {
  return transitionHypothesis(hypothesis, "retire", reason);
}

// ─── Supersession ─────────────────────────────────────────────────────────────

/**
 * Mark a hypothesis as inactive with a forward pointer to its successor.
 * Returns null if the hypothesis is already retired (nothing to supersede).
 */
export function supersedeCascade(
  hypothesis: Pick<StrategicHypothesis, "id" | "hypothesis_state">,
  successorId: string,
): SupessionDelta | null {
  if (hypothesis.hypothesis_state === "retired") return null;
  return {
    id: hypothesis.id,
    superseded_by_id: successorId,
    is_active: false,
  };
}

// ─── Reframing ────────────────────────────────────────────────────────────────

function normalizeHypothesisKey(kind: string, statement: string): string {
  return (
    kind +
    ":" +
    statement
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, "_")
      .slice(0, 100)
      .replace(/_+$/, "")
  );
}

/**
 * Reframe a hypothesis: mark the original as "reframed" (is_active=false) and
 * produce a successor draft that inherits company_id, kind, and topic while
 * starting fresh on confidence, validation_state, and what_must_be_true.
 *
 * Lineage is preserved via successor.reframed_from_hypothesis_id = original.id.
 * The original statement is NEVER modified — only hypothesis_state and is_active change.
 */
export function reframeHypothesis(args: {
  original: StrategicHypothesis;
  newStatement: string;
  reason: string;
}): ReframingResult {
  const { original, newStatement, reason } = args;
  const toKey = normalizeHypothesisKey(original.hypothesis_kind, newStatement);

  return {
    retired: {
      id: original.id,
      hypothesis_state: "reframed",
      is_active: false,
      reframed_reason: reason,
    },
    successor: {
      company_id: original.company_id,
      hypothesis_key: toKey,
      statement: newStatement,
      hypothesis_kind: original.hypothesis_kind,
      // Successor starts from scratch — must re-earn confidence
      hypothesis_state: "inferred",
      topic: original.topic,
      confidence: "low",
      validation_state: "unvalidated",
      what_must_be_true: [],
      source_run_id: null,
      reframed_from_hypothesis_id: original.id,
      superseded_by_id: null,
      reframed_reason: null,
      originating_context: original.originating_context,
      is_active: true,
      raw_payload: null,
    },
    lineage: { fromId: original.id, toKey, reason },
  };
}

// ─── Downstream impact ────────────────────────────────────────────────────────

/**
 * Derive which downstream routes are stale after a hypothesis transition.
 * Only `contradicted` (high) and `unstable` (medium) transitions create stale pressure.
 */
export function deriveDownstreamImpact(args: {
  transition: HypothesisTransition;
  linkedRouteIds: string[];
  hypothesisStatement: string;
}): DownstreamImpact {
  const { transition, linkedRouteIds, hypothesisStatement } = args;

  const isHigh = transition.nextState === "contradicted";
  const isMedium = transition.nextState === "unstable";

  if (!isHigh && !isMedium) {
    return { staleRouteIds: [], pressure: "low", note: "" };
  }

  const excerpt =
    hypothesisStatement.length > 80
      ? hypothesisStatement.slice(0, 77) + "..."
      : hypothesisStatement;

  return {
    staleRouteIds: linkedRouteIds,
    pressure: isHigh ? "high" : "medium",
    note: isHigh
      ? `Routes linked to "${excerpt}" may need revalidation — the underlying hypothesis is now contradicted.`
      : `Routes linked to "${excerpt}" should be reviewed — the underlying hypothesis has conflicting evidence.`,
  };
}
