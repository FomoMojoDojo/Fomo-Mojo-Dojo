/**
 * Decision Operations
 *
 * Operational strategic governance layer sitting above the commitment state system.
 * Answers:
 *   Where is this route in its decision journey?       → DecisionLifecycleState
 *   How institutionally grounded is the commitment?    → CommitmentMaturity
 *   Is a commitment review warranted?                  → ReviewPressure
 *   Is the portfolio drifting from governance norms?   → GovernanceDrift
 *
 * NOT: project management, execution tracking, or task systems.
 * IS:  governance of strategic commitments and review cadence.
 *
 * Language targets (institutional, never alarming):
 *   "Validation sufficient for broader commitment."
 *   "Commitment pressure rising ahead of proof."
 *   "Re-evaluation warranted."
 *   "Assumptions remain unresolved."
 *
 * Design principles:
 *   - Pure functions (deterministic, no side effects)
 *   - Conservative (governance language, not PM language)
 *   - Composable (plain objects, no class instances)
 *   - Additive (no existing decisionSystem types modified here)
 */

import type { CommitmentState, PortfolioState } from "@/lib/decisionSystem";
import type { RouteRationale } from "@/lib/routeRationale";
import type { DisciplineAssessment } from "@/lib/confidenceDiscipline";

// ─── Decision lifecycle state ─────────────────────────────────────────────────

/**
 * Eight-state lifecycle describing where a route sits in its decision journey.
 * NOT the same as CommitmentState — lifecycle adds governance context:
 * is the route moving, blocked, or overdue for review?
 */
export type DecisionLifecycleState =
  | "exploring"        // gathering signals — directional, no commitment direction yet
  | "validating"       // actively testing core assumptions toward commitment
  | "advancing"        // assumptions confirming — commitment is the immediate next decision
  | "committed"        // resources allocated, path locked
  | "gated"            // validation stalled — movement absent, assumptions unresolved
  | "stalled"          // movement halted — hold condition active, no forward path clear
  | "re-evaluating"    // committed but contradicted — governance review required
  | "de-escalating";   // unwinding commitment after contradiction or strategic shift

export const LIFECYCLE_LABELS: Record<DecisionLifecycleState, string> = {
  exploring:        "Exploring",
  validating:       "Validating",
  advancing:        "Advancing",
  committed:        "Committed",
  gated:            "Gated",
  stalled:          "Stalled",
  "re-evaluating":  "Re-evaluating",
  "de-escalating":  "De-escalating",
};

// ─── Commitment maturity ──────────────────────────────────────────────────────

/**
 * How institutionally grounded is the commitment?
 * Orthogonal to CommitmentState — a route can be at "commit" state but only
 * "strategically_directional" if it lacks customer behavioral validation.
 */
export type CommitmentMaturity =
  | "intellectually_interesting"  // directional only — no resource investment yet
  | "strategically_directional"   // strategy acknowledges it, limited commitment
  | "operationally_ready"         // commitment made with customer validation
  | "institutionally_committed";  // scaling — broadly adopted across the organization

export const COMMITMENT_MATURITY_LABELS: Record<CommitmentMaturity, string> = {
  intellectually_interesting: "Intellectually interesting",
  strategically_directional:  "Strategically directional",
  operationally_ready:        "Operationally ready",
  institutionally_committed:  "Institutionally committed",
};

// ─── Review pressure ──────────────────────────────────────────────────────────

/**
 * Whether a governance review of this route's commitment is warranted.
 * Conservative — only fires on clear governance signals, not routine state transitions.
 */
export type ReviewPressure = {
  warranted: boolean;
  /** One institutional sentence. Null when no review is warranted. */
  note: string | null;
};

// ─── Portfolio governance drift ───────────────────────────────────────────────

/**
 * Five drift patterns indicating the portfolio is operating outside healthy governance norms.
 * Flags are internal — they drive governance signals, not direct user labels.
 */
export type GovernanceDrift = {
  /** Committing faster than overall confidence supports. */
  overcommitted: boolean;
  /** Exploration continues without any route advancing toward commitment. */
  perpetualExploration: boolean;
  /** Two or more routes gated with no movement toward validation. */
  validationBottleneck: boolean;
  /** All committed routes have zero customer behavioral proof. */
  driftingCommitment: boolean;
  /** Portfolio over-concentrated in one route category (fix / improve / create). */
  categoryImbalance: boolean;
  /** True when at least one drift flag is active — shortcut for callers. */
  any: boolean;
};

export type PortfolioGovernanceState =
  | "healthy"
  | "overextended"
  | "stalled"
  | "bottlenecked"
  | "drifting";

export const PORTFOLIO_GOVERNANCE_LABELS: Record<PortfolioGovernanceState, string> = {
  healthy:      "Portfolio governance on track",
  overextended: "Commitment ahead of validation",
  stalled:      "Exploration without advancement",
  bottlenecked: "Validation bottleneck",
  drifting:     "Commitment drifting from proof",
};

// ─── Per-route derivation ─────────────────────────────────────────────────────

export function deriveDecisionLifecycleState(
  commitmentState: CommitmentState,
  rationale: RouteRationale,
): DecisionLifecycleState {
  if (commitmentState === "unwind") return "de-escalating";
  if (commitmentState === "pause") return "stalled";
  if (commitmentState === "scale") return "committed";

  if (
    commitmentState === "commit" &&
    rationale.confidenceLabel === "Contradicted by recent evidence"
  ) return "re-evaluating";

  // Advancing: commitment locked and signal strengthening — ready to broaden
  if (commitmentState === "commit" && rationale.movement === "strengthen") return "advancing";

  if (commitmentState === "commit") return "committed";

  // Gated: validate state but movement is not progressing
  if (
    commitmentState === "validate" &&
    (rationale.movement === "remain_unresolved" || rationale.movement === "split")
  ) return "gated";

  if (commitmentState === "validate") return "validating";

  return "exploring";
}

export function deriveCommitmentMaturity(
  commitmentState: CommitmentState,
  rationale: RouteRationale,
): CommitmentMaturity {
  if (commitmentState === "scale") return "institutionally_committed";

  if (
    (commitmentState === "commit" || commitmentState === "scale") &&
    rationale.supportShape.customer > 0
  ) return "operationally_ready";

  if (
    commitmentState === "commit" ||
    commitmentState === "validate" ||
    rationale.supportShape.organization > 0
  ) return "strategically_directional";

  return "intellectually_interesting";
}

export function deriveReviewPressure(
  commitmentState: CommitmentState,
  lifecycleState: DecisionLifecycleState,
  rationale: RouteRationale,
  discipline?: DisciplineAssessment | null,
): ReviewPressure {
  // Contradicted while committed — highest governance priority
  if (lifecycleState === "re-evaluating") {
    return { warranted: true, note: "Re-evaluation warranted. Confidence contradicted while committed." };
  }

  // Committed without customer behavioral proof
  if (
    (commitmentState === "commit" || commitmentState === "scale") &&
    rationale.supportShape.customer === 0
  ) {
    return { warranted: true, note: "Commitment review overdue. Validation sufficient for broader commitment requires customer proof." };
  }

  // Discipline: escalation pressure without behavioral grounding
  if (discipline?.restraintFlags.escalationWithoutProof) {
    return { warranted: true, note: "Commitment pressure rising ahead of proof." };
  }

  // Gated: validation has plateaued — unresolved assumptions blocking forward movement
  if (lifecycleState === "gated") {
    return { warranted: true, note: "Validation has plateaued. Assumptions remain unresolved." };
  }

  // Stalled with no movement — hold conditions unreviewed
  if (lifecycleState === "stalled" && rationale.movement === "remain_unresolved") {
    return { warranted: true, note: "Assumptions remain unresolved. Review hold conditions before the next cycle." };
  }

  return { warranted: false, note: null };
}

// ─── Route ops assembly ───────────────────────────────────────────────────────

export type RouteDecisionOps = {
  routeId: string;
  lifecycleState: DecisionLifecycleState;
  lifecycleLabel: string;
  commitmentMaturity: CommitmentMaturity;
  commitmentMaturityLabel: string;
  reviewPressure: ReviewPressure;
};

function buildRouteDecisionOps(args: {
  routeId: string;
  commitmentState: CommitmentState;
  rationale: RouteRationale;
  discipline?: DisciplineAssessment | null;
}): RouteDecisionOps {
  const lifecycleState = deriveDecisionLifecycleState(args.commitmentState, args.rationale);
  const commitmentMaturity = deriveCommitmentMaturity(args.commitmentState, args.rationale);
  return {
    routeId: args.routeId,
    lifecycleState,
    lifecycleLabel: LIFECYCLE_LABELS[lifecycleState],
    commitmentMaturity,
    commitmentMaturityLabel: COMMITMENT_MATURITY_LABELS[commitmentMaturity],
    reviewPressure: deriveReviewPressure(
      args.commitmentState,
      lifecycleState,
      args.rationale,
      args.discipline,
    ),
  };
}

// ─── Portfolio governance aggregation ────────────────────────────────────────

function deriveGovernanceDrift(
  routeOps: RouteDecisionOps[],
  rationales: RouteRationale[],
  portfolioState: PortfolioState,
): GovernanceDrift {
  const total = routeOps.length;
  if (total === 0) {
    return {
      overcommitted: false, perpetualExploration: false,
      validationBottleneck: false, driftingCommitment: false,
      categoryImbalance: false, any: false,
    };
  }

  const rationaleMap = new Map(rationales.map((r) => [r.routeId, r]));
  const committed = routeOps.filter(
    (r) => r.lifecycleState === "committed" || r.lifecycleState === "advancing",
  ).length;
  const exploring = routeOps.filter((r) => r.lifecycleState === "exploring").length;
  const gated = routeOps.filter(
    (r) => r.lifecycleState === "gated" || r.lifecycleState === "stalled",
  ).length;

  const overcommitted =
    portfolioState === "scaling_ahead" || (total >= 2 && committed / total > 0.6);

  const perpetualExploration = total >= 2 && (exploring + gated) === total;

  const validationBottleneck = gated >= 2;

  const committedOps = routeOps.filter(
    (r) => r.lifecycleState === "committed" || r.lifecycleState === "advancing",
  );
  const driftingCommitment =
    committedOps.length > 0 &&
    committedOps.every((r) => (rationaleMap.get(r.routeId)?.supportShape.customer ?? 0) === 0);

  const categoryImbalance = portfolioState === "over_concentrated";

  const any =
    overcommitted || perpetualExploration || validationBottleneck ||
    driftingCommitment || categoryImbalance;

  return {
    overcommitted, perpetualExploration, validationBottleneck,
    driftingCommitment, categoryImbalance, any,
  };
}

function derivePortfolioGovernanceState(drift: GovernanceDrift): PortfolioGovernanceState {
  if (drift.overcommitted)        return "overextended";
  // validationBottleneck checked before perpetualExploration — routes stuck in validation
  // are a more specific diagnosis than general lack of advancement.
  if (drift.validationBottleneck) return "bottlenecked";
  if (drift.perpetualExploration) return "stalled";
  if (drift.driftingCommitment)   return "drifting";
  return "healthy";
}

function buildGovernanceSignals(
  drift: GovernanceDrift,
  routeOps: RouteDecisionOps[],
): string[] {
  const signals: string[] = [];

  if (drift.overcommitted) {
    signals.push("Commitment pressure rising ahead of proof. Validate before broadening investment.");
  }
  if (drift.driftingCommitment) {
    signals.push("Committed routes have no customer validation. Review scope before scaling.");
  }
  if (drift.validationBottleneck) {
    signals.push("Validation is the active bottleneck. Multiple routes need customer confirmation.");
  }
  if (drift.perpetualExploration) {
    signals.push("Exploration continues. Evidence is needed to narrow to a primary direction.");
  }

  const reEvaluating = routeOps.filter((r) => r.lifecycleState === "re-evaluating");
  if (reEvaluating.length > 0 && signals.length < 3) {
    const n = reEvaluating.length;
    signals.push(
      `${n === 1 ? "One committed route is" : `${n} committed routes are`} flagged for re-evaluation.`,
    );
  }

  return signals.slice(0, 3);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export type DecisionOperationsContext = {
  routes: RouteDecisionOps[];
  drift: GovernanceDrift;
  portfolioGovernanceState: PortfolioGovernanceState;
  portfolioGovernanceLabel: string;
  /** 1–3 plain-language governance notes for narrative/signal surface use. */
  governanceSignals: string[];
};

export function buildDecisionOperationsContext(args: {
  routeEntries: Array<{ routeId: string; commitmentState: CommitmentState }>;
  rationales: RouteRationale[];
  portfolioState: PortfolioState;
  discipline?: DisciplineAssessment | null;
}): DecisionOperationsContext {
  const { routeEntries, rationales, portfolioState, discipline } = args;
  const rationaleMap = new Map(rationales.map((r) => [r.routeId, r]));

  const routeOps: RouteDecisionOps[] = routeEntries.map((entry) => {
    const rationale = rationaleMap.get(entry.routeId);
    if (!rationale) {
      return {
        routeId: entry.routeId,
        lifecycleState: "exploring",
        lifecycleLabel: LIFECYCLE_LABELS.exploring,
        commitmentMaturity: "intellectually_interesting",
        commitmentMaturityLabel: COMMITMENT_MATURITY_LABELS.intellectually_interesting,
        reviewPressure: { warranted: false, note: null },
      };
    }
    return buildRouteDecisionOps({
      routeId: entry.routeId,
      commitmentState: entry.commitmentState,
      rationale,
      discipline,
    });
  });

  const drift = deriveGovernanceDrift(routeOps, rationales, portfolioState);
  const governanceState = derivePortfolioGovernanceState(drift);

  return {
    routes: routeOps,
    drift,
    portfolioGovernanceState: governanceState,
    portfolioGovernanceLabel: PORTFOLIO_GOVERNANCE_LABELS[governanceState],
    governanceSignals: buildGovernanceSignals(drift, routeOps),
  };
}
