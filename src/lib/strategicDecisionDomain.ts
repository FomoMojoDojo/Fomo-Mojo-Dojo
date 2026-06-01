/**
 * Strategic Decision Domain
 *
 * First-class strategic decision objects. A decision represents a QUESTION
 * under active evaluation — NOT a route, recommendation, project, or task.
 *
 * Examples of well-formed decision questions:
 *   "Should we standardize onboarding before scaling wholesale?"
 *   "Should we narrow positioning toward operational reliability?"
 *   "Should we defer expansion until customer validation stabilizes?"
 *
 * Two orthogonal dimensions per decision:
 *
 *   decision_state  — what are we doing with this question
 *                     (non-linear: can weaken, re-open, destabilize)
 *
 *   confidence_state — how safe is commitment right now
 *                     (NOT certainty — "safe to commit" is the right frame)
 *
 * Decision memory is compressed strategic evolution, not an audit log.
 * Confidence movement is a directional history, not a score dashboard.
 *
 * Design principles:
 *   - Pure functions (deterministic, no side effects, no Supabase imports)
 *   - Non-linear state machine (decisions are not workflow tickets)
 *   - Conservative derivation (never overstate confidence)
 *   - Stale propagation degrades confidence ceilings, does not suppress
 */

// ─── Core types ───────────────────────────────────────────────────────────────

export type DecisionState =
  | "exploratory"       // gathering signal; question is open, not yet pressed
  | "under_validation"  // validation activities are explicitly underway
  | "stabilizing"       // signal converging; question is narrowing
  | "commit_ready"      // sufficient confidence to make the call
  | "committed"         // the call has been made; in operational execution
  | "destabilizing"     // something weakened the basis for this decision
  | "reframing"         // the question itself is shifting
  | "retired";          // closed / no longer active

export type ConfidenceState =
  | "low"          // insufficient signal
  | "directional"  // signal points a direction; not yet grounded
  | "building"     // evidence accumulating across multiple layers
  | "strong"       // multi-layer, validated, customer-grounded
  | "contradicted"; // direct contradicting evidence present

export type DecisionRouteRelationship =
  | "expression"       // this route is an operational expression of the decision
  | "validation_path"  // this route validates this decision question
  | "contradicting"    // this route provides contradicting operational pressure
  | "prerequisite";    // this route must progress before the decision can advance

export type ConfidenceMovementDirection =
  | "strengthening"
  | "weakening"
  | "stable";

// ─── JSONB payload types (match the migration column shapes) ──────────────────

export type EvidenceItem = {
  id: string;
  statement: string;
  source: string;
  weight?: "high" | "medium" | "low";
};

export type ContradictingEvidenceItem = {
  id: string;
  statement: string;
  source: string;
  severity: "high" | "medium" | "low";
};

export type ValidationRequirement = {
  requirement: string;
  status: "open" | "met" | "bypassed";
};

export type ConfidenceMovementEntry = {
  at: string;
  direction: ConfidenceMovementDirection;
  reason: string;
  triggered_by?: string;
};

export type DecisionMemoryEntry = {
  at: string;
  entry: string;
};

// ─── Database row types ───────────────────────────────────────────────────────

export type StrategicDecisionRow = {
  id: string;
  company_id: string;
  title: string;
  decision_question: string;
  decision_state: DecisionState;
  confidence_state: ConfidenceState;
  current_posture: string | null;
  supporting_evidence: EvidenceItem[];
  contradicting_evidence: ContradictingEvidenceItem[];
  validation_requirements: ValidationRequirement[];
  blocked_by: string[];
  affected_positioning: boolean;
  affected_capabilities: string[];
  affected_job_steps: string[];
  supporting_hypothesis_ids: string[];
  active_tension_ids: string[];
  confidence_movement: ConfidenceMovementEntry[];
  decision_memory: DecisionMemoryEntry[];
  stale_dependencies: string[];
  last_meaningful_change_at: string | null;
  source: "user_defined" | "ai_derived" | "route_promoted";
  created_at: string;
  updated_at: string;
};

export type DecisionRouteRow = {
  id: string;
  company_id: string;
  decision_id: string;
  route_id: string;
  relationship: DecisionRouteRelationship;
  sort_order: number;
  created_at: string;
};

// ─── State machine ────────────────────────────────────────────────────────────
//
// Intentionally non-linear. Decisions:
//   - can weaken (committed → destabilizing)
//   - can re-open (destabilizing → exploratory)
//   - can reframe (any active state → reframing)
//   - can skip states when evidence jumps (exploratory → stabilizing)
//
// The only terminal state is "retired".

const ALLOWED_TRANSITIONS: Record<DecisionState, DecisionState[]> = {
  exploratory:      ["under_validation", "stabilizing", "destabilizing", "reframing", "retired"],
  under_validation: ["stabilizing", "commit_ready", "destabilizing", "reframing", "retired"],
  stabilizing:      ["commit_ready", "under_validation", "destabilizing", "reframing", "retired"],
  commit_ready:     ["committed", "stabilizing", "destabilizing", "reframing", "retired"],
  committed:        ["destabilizing", "reframing", "retired"],
  destabilizing:    ["exploratory", "under_validation", "reframing", "retired"],
  reframing:        ["exploratory", "under_validation", "retired"],
  retired:          [],
};

export function canTransitionDecisionState(from: DecisionState, to: DecisionState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isDecisionTerminal(state: DecisionState): boolean {
  return state === "retired";
}

export function isDecisionActive(state: DecisionState): boolean {
  return state !== "retired";
}

export const DECISION_STATE_LABELS: Record<DecisionState, string> = {
  exploratory:      "Exploring",
  under_validation: "Under Validation",
  stabilizing:      "Stabilizing",
  commit_ready:     "Commit Ready",
  committed:        "Committed",
  destabilizing:    "Destabilizing",
  reframing:        "Reframing",
  retired:          "Retired",
};

export const CONFIDENCE_STATE_LABELS: Record<ConfidenceState, string> = {
  low:          "Low signal",
  directional:  "Directional",
  building:     "Building",
  strong:       "Strong",
  contradicted: "Contradicted",
};

// ─── Confidence state derivation ─────────────────────────────────────────────
//
// "How safe is commitment right now?" — not "how certain are we."
// Conservative: stale proof caps the ceiling at directional.
// Contradicting evidence always wins.

export type ConfidenceInputSignals = {
  hasCustomerBehavioralProof: boolean;
  hasMultiLayerEvidence: boolean;
  hasContradictingEvidence: boolean;
  hasAnyEvidence: boolean;
  customerProofIsStale: boolean;
};

export function deriveConfidenceState(signals: ConfidenceInputSignals): ConfidenceState {
  if (signals.hasContradictingEvidence) return "contradicted";
  // Stale customer proof caps at directional regardless of other evidence
  if (signals.customerProofIsStale) {
    return signals.hasAnyEvidence ? "directional" : "low";
  }
  if (signals.hasCustomerBehavioralProof && signals.hasMultiLayerEvidence) return "strong";
  if (signals.hasAnyEvidence && signals.hasMultiLayerEvidence) return "building";
  if (signals.hasAnyEvidence) return "directional";
  return "low";
}

// ─── Stale propagation ────────────────────────────────────────────────────────
//
// Stale dependencies degrade decision state and confidence ceilings.
// Stale proof does not suppress — it caps confidence.
// Contradiction destabilizes decisions that have committed.

export type StalePropagationResult = {
  shouldDestabilize: boolean;
  suggestedConfidenceState: ConfidenceState | null;
  reason: string | null;
};

export function evaluateStalePropagation(input: {
  currentDecisionState: DecisionState;
  currentConfidenceState: ConfidenceState;
  hasStaleCustomerProof: boolean;
  hasContradictedHypothesis: boolean;
  hasBlockingTension: boolean;
  hasCapabilityGap: boolean;
}): StalePropagationResult {
  const { currentDecisionState, currentConfidenceState } = input;

  // Contradicted hypothesis destabilizes committed or commit_ready decisions
  if (
    input.hasContradictedHypothesis &&
    (currentDecisionState === "committed" || currentDecisionState === "commit_ready")
  ) {
    return {
      shouldDestabilize: true,
      suggestedConfidenceState: "contradicted",
      reason: "A supporting hypothesis was contradicted — the commitment basis needs review.",
    };
  }

  // Stale customer proof caps confidence at directional (even if multi-layer)
  if (
    input.hasStaleCustomerProof &&
    (currentConfidenceState === "strong" || currentConfidenceState === "building")
  ) {
    return {
      shouldDestabilize: false,
      suggestedConfidenceState: "directional",
      reason: "Customer proof has aged — confidence ceiling lowered until re-validated.",
    };
  }

  // Blocking tension prevents commit_ready — push back to stabilizing territory
  if (input.hasBlockingTension && currentDecisionState === "commit_ready") {
    return {
      shouldDestabilize: true,
      suggestedConfidenceState: null,
      reason: "An unresolved commitment-blocking tension prevents commit-readiness.",
    };
  }

  // Capability gap holds commit_ready in stabilizing — does not destabilize
  if (input.hasCapabilityGap && currentDecisionState === "commit_ready") {
    return {
      shouldDestabilize: false,
      suggestedConfidenceState: null,
      reason: "Capability gaps hold this decision in stabilizing state.",
    };
  }

  return { shouldDestabilize: false, suggestedConfidenceState: null, reason: null };
}

// ─── Decision memory ──────────────────────────────────────────────────────────
//
// Compressed strategic evolution — NOT an audit log.
// Append-only semantically. Older entries compress out at MEMORY_MAX_ENTRIES.
//
// Example entries (institutional, never alarm-language):
//   "Customer validation weakened the operational-reliability interpretation."
//   "Contradiction pressure stabilized after customer interviews."
//   "This decision has remained unresolved across multiple reviews."

const MEMORY_MAX_ENTRIES = 20;

export function appendDecisionMemory(
  existing: DecisionMemoryEntry[],
  entry: string,
  at?: string,
): DecisionMemoryEntry[] {
  const next: DecisionMemoryEntry = { at: at ?? new Date().toISOString(), entry };
  const updated = [...existing, next];
  return updated.length > MEMORY_MAX_ENTRIES
    ? updated.slice(updated.length - MEMORY_MAX_ENTRIES)
    : updated;
}

export function latestMemoryEntry(memory: DecisionMemoryEntry[]): DecisionMemoryEntry | null {
  return memory.length > 0 ? memory[memory.length - 1] : null;
}

// ─── Confidence movement ──────────────────────────────────────────────────────

export function addConfidenceMovement(
  existing: ConfidenceMovementEntry[],
  direction: ConfidenceMovementDirection,
  reason: string,
  triggeredBy?: string,
): ConfidenceMovementEntry[] {
  const entry: ConfidenceMovementEntry = {
    at: new Date().toISOString(),
    direction,
    reason,
    ...(triggeredBy != null ? { triggered_by: triggeredBy } : {}),
  };
  return [...existing, entry];
}

export function latestConfidenceDirection(
  movement: ConfidenceMovementEntry[],
): ConfidenceMovementDirection | null {
  return movement.length > 0 ? movement[movement.length - 1].direction : null;
}

// ─── Suggested next action ────────────────────────────────────────────────────

export function suggestDecisionNextAction(decision: Pick<StrategicDecisionRow, "decision_state" | "validation_requirements" | "blocked_by">): string {
  const openRequirements = decision.validation_requirements.filter(
    (r) => r.status === "open",
  ).length;

  switch (decision.decision_state) {
    case "exploratory":
      return "Gather customer and market signals to establish a directional read.";
    case "under_validation":
      return openRequirements > 0
        ? `Close ${openRequirements} open validation requirement${openRequirements === 1 ? "" : "s"} before assessing commitment readiness.`
        : "Assess whether signal is sufficient to move to stabilizing.";
    case "stabilizing":
      return decision.blocked_by.length > 0
        ? "Resolve blocking dependencies before this decision can reach commit-readiness."
        : "Confirm customer grounding and resolve remaining tensions to reach commit-readiness.";
    case "commit_ready":
      return "Decision is ready — make the call or identify what is holding the commitment.";
    case "committed":
      return "Monitor for destabilizing signals — capability gaps, contradicting evidence, or hypothesis collapse.";
    case "destabilizing":
      return "Identify what weakened this decision and decide whether to reframe or reopen validation.";
    case "reframing":
      return "Restate the decision question and re-enter validation with the new framing.";
    case "retired":
      return "This decision is closed.";
    default:
      return "Review decision state and next validation requirements.";
  }
}

// ─── Validation requirement helpers ──────────────────────────────────────────

export function openValidationCount(requirements: ValidationRequirement[]): number {
  return requirements.filter((r) => r.status === "open").length;
}

export function isCommitmentBlocked(decision: Pick<StrategicDecisionRow, "blocked_by" | "active_tension_ids">): boolean {
  return decision.blocked_by.length > 0 || decision.active_tension_ids.length > 0;
}
