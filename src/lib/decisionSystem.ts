/**
 * Decision System — portfolio orchestration for strategic commitment.
 *
 * Turns route rationales + strategic center context into:
 * - Per-route commitment states and sequencing postures
 * - Dependency intelligence (prerequisite and enabled routes)
 * - Portfolio balance assessment
 * - Calm, specific escalation callouts
 *
 * Answers executive questions:
 *   What should we commit to?   → safeToCommit
 *   What is too early?          → tooEarly
 *   What is blocked?            → blocked
 *   What is converging?         → converging
 *   What should happen next?    → portfolioNextMove + escalations
 *
 * Compression rules:
 * - No gantt-chart language ("sprint", "dependency cleared")
 * - No PM software feel ("ticket", "blocker", "status update")
 * - Prefer: commitment posture, sequencing narrative, dependency narrative
 * - Escalations are calm, specific, and actionable (≤ 3 per portfolio)
 * - Route sequencing is descriptive, not prescriptive
 */

import type { RouteRow } from "@/views/Routes/useRoutes";
import type { RouteRationale } from "@/lib/routeRationale";
import type { StrategicCenter } from "@/lib/strategicCenter";
import type { CustomerRealityNarrative } from "@/lib/customerRealityNarrative";
import type { PositioningLensNarrative } from "@/lib/positioningLensNarrative";
import type { DisciplineAssessment } from "@/lib/confidenceDiscipline";
import type { EvidenceAgingState } from "@/lib/evidenceAging";
import { resolveRefineNarrativePhase } from "@/lib/refinePreviewPhaseOrchestration";
import {
  buildDecisionOperationsContext,
  deriveDecisionLifecycleState,
  deriveCommitmentMaturity,
  deriveReviewPressure,
  LIFECYCLE_LABELS,
  COMMITMENT_MATURITY_LABELS,
  type DecisionLifecycleState,
  type CommitmentMaturity,
  type ReviewPressure,
  type DecisionOperationsContext,
} from "@/lib/decisionOperations";

// ─── Public types ────────────────────────────────────────────────────────────────

/**
 * Six mutually exclusive commitment states per route.
 * Derived from confidence, movement, readiness, customer grounding, and assumption risk.
 */
export type CommitmentState =
  | "explore"    // investigating — directional only, not ready to invest
  | "validate"   // testing — enough signal to pursue, not yet safe to commit
  | "commit"     // committed — confidence sufficient for resource allocation
  | "scale"      // scaling — validated, committing broader resources
  | "pause"      // paused — weakening signal, hold spending until signal recovers
  | "unwind";    // unwinding — contradicted, commitment was premature or conditions changed

/**
 * Six sequencing postures describing where this route sits relative to others.
 */
export type SequencingPosture =
  | "safe_to_validate"                // evidence is sufficient to begin validation now
  | "needs_prerequisite_proof"        // a foundational route must validate before this one
  | "waiting_on_customer_confirmation" // customer signal is the missing gate
  | "operationally_blocked"           // operational gaps must close first
  | "sequencing_conflict"             // conflicting commitment with another active route
  | "ready_for_broader_commitment";   // confidence strong enough to broaden investment

/**
 * Six portfolio balance states across all routes.
 */
export type PortfolioState =
  | "converging"           // most routes strengthening toward commitment
  | "fragmented"           // routes scattered across states with no clear momentum
  | "over_concentrated"    // too many routes in the same category or state
  | "validation_heavy"     // most routes stuck in explore/validate
  | "scaling_ahead"        // committing faster than confidence supports
  | "balanced";            // reasonable mix of exploration and commitment

export type EscalationItem = {
  severity: "warning" | "notice";
  /** Short label (≤8 words). */
  title: string;
  /** One-sentence specific detail. */
  detail: string;
  /** Route IDs this escalation applies to. */
  routeIds: string[];
};

export type RouteDecision = {
  routeId: string;
  routeTitle: string;
  category: string;
  commitmentState: CommitmentState;
  /** Why this commitment state was assigned — one sentence. */
  commitmentRationale: string;
  sequencingPosture: SequencingPosture;
  /** Narrative describing this route's position in the sequence — one sentence. */
  sequencingNarrative: string;
  /** IDs of routes that should reach commitment before this one. */
  prerequisiteRouteIds: string[];
  /** IDs of routes that this route unlocks or makes safer. */
  enabledRouteIds: string[];
  /** Why this route is blocked, if applicable. */
  blockedReason: string | null;
  /** Whether it is safe to broaden investment in this route now. */
  isSafeToScale: boolean;
  /** Single-sentence escalation note if this specific route needs attention. Null otherwise. */
  escalationNote: string | null;
  // ─── Decision operations (Phase 11) ───────────────────────────────────────
  /** Where this route sits in the decision lifecycle. */
  lifecycleState: DecisionLifecycleState;
  /** User-facing label for lifecycleState. */
  lifecycleLabel: string;
  /** How institutionally grounded this commitment is. */
  commitmentMaturity: CommitmentMaturity;
  /** User-facing label for commitmentMaturity. */
  commitmentMaturityLabel: string;
  /** Whether a governance review of this commitment is warranted. */
  reviewPressure: ReviewPressure;
};

export type DecisionPortfolio = {
  portfolioState: PortfolioState;
  portfolioStateLabel: string;
  /** One-sentence narrative characterising the portfolio. */
  portfolioNarrative: string;
  /** What the portfolio most needs to move forward — one sentence. */
  portfolioNextMove: string;
  /** Top 1–3 calm escalations, ordered by severity. */
  escalations: EscalationItem[];
  /** Per-route decisions. */
  routes: RouteDecision[];
  /** Counts per commitment state. */
  commitCounts: Record<CommitmentState, number>;
  /** Titles of routes that are safe to commit to now. */
  safeToCommit: string[];
  /** Titles of routes that need more proof before commitment. */
  tooEarly: string[];
  /** Titles of routes that are blocked by sequencing or operational gaps. */
  blocked: string[];
  /** Titles of routes that are converging toward commitment. */
  converging: string[];
  // ─── Decision operations (Phase 11) ──────────────────────────────────────
  /** Portfolio-level governance assessment — drift detection and signals. */
  decisionOps: DecisionOperationsContext;
};

// ─── Commitment state derivation ─────────────────────────────────────────────────

const COMMITMENT_RATIONALE: Record<CommitmentState, (r: RouteRationale) => string> = {
  unwind:   (r) => `Confidence is directly contradicted — ${r.couldWeaken || "the evidence no longer supports this direction"}.`,
  pause:    (r) => r.movement === "weaken"
    ? `Signal is weakening — pause until it recovers.`
    : `Readiness is on hold — resolve the blocking uncertainty before proceeding.`,
  scale:    (_) => `Confidence is strong and customer signal is present — safe to scale.`,
  commit:   (r) => `Evidence supports commitment — ${r.whatSupportsIt || "multiple signals point to this route"}.`,
  validate: (r) => r.readiness === "Commit"
    ? `Internally coherent — needs customer proof before commitment.`
    : `${r.mustBecomeTrue || "The core assumption still needs testing"} before committing.`,
  explore:  (r) => `${r.whyThisRouteExists || "This route is directional"} — investigate before investing.`,
};

function deriveCommitmentState(
  rationale: RouteRationale,
  centerConfidence: StrategicCenter["confidence"],
  customerProofAgingState: EvidenceAgingState = "fresh",
): CommitmentState {
  const { confidenceLabel, movement, readiness, supportShape } = rationale;
  const customerProofStale = customerProofAgingState === "stale";

  // Unwind: actively contradicted with no recovery signal
  if (
    confidenceLabel === "Contradicted by recent evidence" &&
    movement === "weaken" &&
    readiness === "Hold"
  ) {
    return "unwind";
  }

  // Pause: movement is weakening OR explicitly on hold
  if (movement === "weaken" || readiness === "Hold") {
    return "pause";
  }

  // Scale: committed + strong multi-signal confidence + fresh customer proof + center not low
  if (
    readiness === "Commit" &&
    confidenceLabel === "Supported by multiple validated signals" &&
    supportShape.customer > 0 &&
    !customerProofStale &&
    centerConfidence !== "low"
  ) {
    return "scale";
  }

  // Commit: readiness = Commit + customer proof present + not stale
  if (readiness === "Commit" && supportShape.customer > 0 && !customerProofStale) {
    return "commit";
  }

  // Validate: readiness = Commit without customer proof, with stale proof, OR readiness = Validate
  if (readiness === "Commit" || readiness === "Validate") {
    return "validate";
  }

  // Explore: investigate state or unknown
  return "explore";
}

// ─── Sequencing posture derivation ───────────────────────────────────────────────

function categoryOrder(category: string): number {
  const cat = String(category).toLowerCase();
  if (cat === "fix")     return 0;
  if (cat === "improve") return 1;
  if (cat === "create")  return 2;
  return 1;
}

function deriveSequencingPosture(
  route: RouteRow,
  decision: CommitmentState,
  allRoutes: RouteRow[],
  allRationales: RouteRationale[],
): SequencingPosture {
  const thisOrder = categoryOrder(route.category);
  const rationaleMap = new Map(allRationales.map((r) => [r.routeId, r]));
  const thisRationale = rationaleMap.get(route.id);

  // sequencing_conflict: this route is at commit AND another at commit with opposing category
  if (decision === "commit" || decision === "scale") {
    const otherCommitted = allRoutes.filter((r) => {
      if (r.id === route.id) return false;
      const d = rationaleMap.get(r.id);
      return d && (d.readiness === "Commit") && categoryOrder(r.category) !== thisOrder;
    });
    if (otherCommitted.length > 0 && thisOrder === 2) {
      // Create committed while fix/improve also committed — potential conflict
      return "sequencing_conflict";
    }
  }

  // ready_for_broader_commitment: commit state + strong confidence
  if (
    (decision === "commit" || decision === "scale") &&
    thisRationale?.confidenceLabel === "Supported by multiple validated signals"
  ) {
    return "ready_for_broader_commitment";
  }

  // operationally_blocked: this is improve or create AND fix routes are still at explore/validate
  if (thisOrder > 0) {
    const fixRoutesBelowCommit = allRoutes.filter((r) => {
      if (r.id === route.id) return false;
      const cat = String(r.category).toLowerCase();
      const d = rationaleMap.get(r.id);
      return cat === "fix" && d && (d.readiness === "Investigate" || d.readiness === "Validate");
    });
    if (fixRoutesBelowCommit.length > 0) {
      return "operationally_blocked";
    }
  }

  // needs_prerequisite_proof: route has unproven critical assumptions
  const criticalUnproven = (route.assumptions_json ?? []).filter(
    (a) => a.critical && a.status === "unproven",
  );
  if (criticalUnproven.length > 0 && decision === "validate") {
    return "needs_prerequisite_proof";
  }

  // waiting_on_customer_confirmation: validate + no customer signal
  if (
    (decision === "validate" || decision === "explore") &&
    (thisRationale?.supportShape.customer ?? 0) === 0
  ) {
    return "waiting_on_customer_confirmation";
  }

  // Default: safe_to_validate
  return "safe_to_validate";
}

const SEQUENCING_NARRATIVES: Record<SequencingPosture, (route: RouteRow, prereqs: RouteRow[]) => string> = {
  safe_to_validate:                 (r) => `${r.title} is ready to validate.`,
  needs_prerequisite_proof:         (r) => `${r.title} has unproven critical assumptions — resolve before validating.`,
  waiting_on_customer_confirmation: (r) => `${r.title} is waiting on customer confirmation.`,
  operationally_blocked:            (r, ps) => ps.length > 0
    ? `${r.title} can't validate until ${ps.map((p) => p.title).join(" and ")} ${ps.length === 1 ? "is" : "are"} resolved.`
    : `${r.title} can't validate until operational gaps close.`,
  sequencing_conflict:              (r) => `${r.title} is committed while foundational routes remain unresolved.`,
  ready_for_broader_commitment:     (r) => `${r.title} has sufficient evidence — safe to scale.`,
};

// ─── Prerequisite and enabled route derivation ───────────────────────────────────

function tokenize(text: string): Set<string> {
  const STOP = new Set(["a", "an", "the", "is", "are", "to", "of", "in", "on", "by", "for", "with", "and", "or", "this", "that", "route", "will", "can", "be"]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

function routeTokens(route: RouteRow): Set<string> {
  const parts = [
    route.title,
    route.short_description ?? "",
    ...(route.why_this_matters_json ?? []),
  ].join(" ");
  return tokenize(parts);
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

function derivePrerequisiteRouteIds(
  route: RouteRow,
  allRoutes: RouteRow[],
  allRationales: RouteRationale[],
): string[] {
  const thisOrder = categoryOrder(route.category);
  const rationaleMap = new Map(allRationales.map((r) => [r.routeId, r]));
  const thisTokens = routeTokens(route);

  return allRoutes
    .filter((r) => {
      if (r.id === route.id) return false;
      const rOrder = categoryOrder(r.category);
      const rRationale = rationaleMap.get(r.id);
      // Must be a lower-order category or same category but with lower confidence
      const isFoundational = rOrder < thisOrder;
      // Only include if at explore/validate (not yet committed — still relevant gate)
      const notYetCommitted = !rRationale || (rRationale.readiness !== "Commit" && rRationale.readiness !== "Hold");
      // Require some token overlap to avoid unrelated dependencies
      const hasOverlap = tokenOverlap(thisTokens, routeTokens(r)) >= 0.08;
      return isFoundational && notYetCommitted && hasOverlap;
    })
    .map((r) => r.id);
}

function deriveEnabledRouteIds(
  route: RouteRow,
  allRoutes: RouteRow[],
): string[] {
  const thisOrder = categoryOrder(route.category);
  const thisTokens = routeTokens(route);

  return allRoutes
    .filter((r) => {
      if (r.id === route.id) return false;
      const rOrder = categoryOrder(r.category);
      const isDownstream = rOrder > thisOrder;
      const hasOverlap = tokenOverlap(thisTokens, routeTokens(r)) >= 0.08;
      return isDownstream && hasOverlap;
    })
    .map((r) => r.id);
}

// ─── Safety to scale ─────────────────────────────────────────────────────────────

function isSafeToScale(
  decision: CommitmentState,
  rationale: RouteRationale,
  centerConfidence: StrategicCenter["confidence"],
): boolean {
  return (
    (decision === "commit" || decision === "scale") &&
    rationale.confidenceLabel !== "Still highly uncertain" &&
    rationale.confidenceLabel !== "Contradicted by recent evidence" &&
    rationale.confidenceLabel !== "Customer validation missing" &&
    !rationale.movement.startsWith("weaken") &&
    centerConfidence !== "low"
  );
}

// ─── Per-route escalation notes ───────────────────────────────────────────────────

function deriveEscalationNote(
  decision: CommitmentState,
  rationale: RouteRationale,
  centerConfidence: StrategicCenter["confidence"],
): string | null {
  if (
    (decision === "commit" || decision === "scale") &&
    centerConfidence === "low"
  ) {
    return "Committed while overall confidence is still low — validate the foundation before scaling.";
  }
  if (
    (decision === "commit" || decision === "scale") &&
    rationale.supportShape.customer === 0
  ) {
    return "Committed without customer signal — add customer validation before expanding.";
  }
  if (rationale.confidenceLabel === "Contradicted by recent evidence" && decision !== "unwind" && decision !== "pause") {
    return "Confidence is contradicted but commitment is not paused — review before the next cycle.";
  }
  return null;
}

// ─── Portfolio state derivation ───────────────────────────────────────────────────

const PORTFOLIO_STATE_LABELS: Record<PortfolioState, string> = {
  converging:         "Portfolio converging",
  fragmented:         "Portfolio fragmented",
  over_concentrated:  "Over-concentrated",
  validation_heavy:   "Validation-heavy",
  scaling_ahead:      "Scaling ahead",
  balanced:           "Balanced",
};

const PORTFOLIO_NARRATIVES: Record<PortfolioState, string> = {
  converging:         "Routes strengthening toward commitment.",
  fragmented:         "Routes scattered — no clear momentum or sequencing.",
  over_concentrated:  "Portfolio concentrated in one area — exposure limited.",
  validation_heavy:   "Most routes stuck in validate — a commitment decision is needed.",
  scaling_ahead:      "Committing faster than overall confidence supports.",
  balanced:           "Reasonable balance of exploration, validation, and commitment.",
};

function derivePortfolioState(
  routes: RouteDecision[],
  center: StrategicCenter,
): PortfolioState {
  if (routes.length === 0) return "balanced";

  const counts = routes.reduce(
    (acc, r) => { acc[r.commitmentState] = (acc[r.commitmentState] ?? 0) + 1; return acc; },
    {} as Partial<Record<CommitmentState, number>>,
  );

  const total = routes.length;
  const exploring = (counts.explore ?? 0) + (counts.validate ?? 0);
  const committing = (counts.commit ?? 0) + (counts.scale ?? 0);
  const paused = (counts.pause ?? 0) + (counts.unwind ?? 0);

  // Scaling ahead of confidence: any committed route when center is low
  if (center.confidence === "low" && committing > 0) {
    return "scaling_ahead";
  }

  // Over-concentrated: ≥75% of routes in same category
  const categoryCounts = routes.reduce(
    (acc, r) => { acc[r.category] = (acc[r.category] ?? 0) + 1; return acc; },
    {} as Record<string, number>,
  );
  const maxCategory = Math.max(...Object.values(categoryCounts));
  if (total >= 2 && maxCategory / total >= 0.75) {
    return "over_concentrated";
  }

  // Validation heavy: ≥70% in explore/validate
  if (exploring / total >= 0.70 && total >= 2) {
    return "validation_heavy";
  }

  // Converging: ≥50% of routes moving toward commitment (strengthen/narrow movement)
  const convergingRoutes = routes.filter((r) =>
    r.commitmentState === "commit" ||
    r.commitmentState === "scale" ||
    r.commitmentState === "validate",
  );
  if (convergingRoutes.length / total >= 0.50 && paused === 0) {
    return "converging";
  }

  // Fragmented: 3+ different states, no majority, multiple paused
  const uniqueStates = new Set(routes.map((r) => r.commitmentState)).size;
  if (uniqueStates >= 3 && paused > 0) {
    return "fragmented";
  }

  return "balanced";
}

// ─── Escalation derivation ────────────────────────────────────────────────────────

function deriveEscalations(
  routes: RouteDecision[],
  rationales: RouteRationale[],
  center: StrategicCenter,
  customerReality: CustomerRealityNarrative | null,
): EscalationItem[] {
  const escalations: EscalationItem[] = [];
  const rationaleMap = new Map(rationales.map((r) => [r.routeId, r]));

  // 1. Scaling ahead of confidence (warning)
  const scalingAhead = routes.filter(
    (r) => (r.commitmentState === "commit" || r.commitmentState === "scale") &&
    center.confidence === "low",
  );
  if (scalingAhead.length > 0) {
    escalations.push({
      severity: "warning",
      title: "Committing faster than confidence supports",
      detail: `${scalingAhead.length === 1 ? "One route is" : `${scalingAhead.length} routes are`} committed while overall confidence is still low — validate the foundation before scaling.`,
      routeIds: scalingAhead.map((r) => r.routeId),
    });
  }

  // 2. Contradicted route still active — not paused (warning)
  const contradictedActive = routes.filter((r) => {
    const rat = rationaleMap.get(r.routeId);
    return rat?.confidenceLabel === "Contradicted by recent evidence" &&
      r.commitmentState !== "pause" &&
      r.commitmentState !== "unwind";
  });
  if (contradictedActive.length > 0) {
    escalations.push({
      severity: "warning",
      title: "Contradicted route still active",
      detail: `${contradictedActive.length === 1 ? "One route has" : `${contradictedActive.length} routes have`} contradicted confidence but ${contradictedActive.length === 1 ? "is" : "are"} not paused — review before the next cycle.`,
      routeIds: contradictedActive.map((r) => r.routeId),
    });
  }

  // 3. Committed routes without customer proof (warning if multiple, notice if one)
  const committedNoCustomer = routes.filter((r) => {
    const rat = rationaleMap.get(r.routeId);
    return (r.commitmentState === "commit" || r.commitmentState === "scale") &&
      (rat?.supportShape.customer ?? 0) === 0;
  });
  if (committedNoCustomer.length > 0) {
    escalations.push({
      severity: committedNoCustomer.length >= 2 ? "warning" : "notice",
      title: "Committed without customer validation",
      detail: `${committedNoCustomer.length === 1 ? "One committed route has" : `${committedNoCustomer.length} committed routes have`} no customer signal — add customer evidence before expanding.`,
      routeIds: committedNoCustomer.map((r) => r.routeId),
    });
  }

  // 4. Contradictory routes both committed (notice)
  const committedRoutes = routes.filter((r) => r.commitmentState === "commit" || r.commitmentState === "scale");
  const fixCommitted = committedRoutes.filter((r) => String(r.category).toLowerCase() === "fix");
  const createCommitted = committedRoutes.filter((r) => String(r.category).toLowerCase() === "create");
  if (fixCommitted.length > 0 && createCommitted.length > 0 && escalations.length < 3) {
    escalations.push({
      severity: "notice",
      title: "Fix and Create routes both committed",
      detail: "Committing to operational fixes and new creation simultaneously can spread execution focus — confirm the sequencing is intentional.",
      routeIds: [...fixCommitted.map((r) => r.routeId), ...createCommitted.map((r) => r.routeId)],
    });
  }

  // 5. Customer validation lagging commitment (notice)
  const customerLagging =
    customerReality?.posture === "inferred" || customerReality?.posture === "directional";
  if (customerLagging && committedRoutes.length > 0 && escalations.length < 3) {
    escalations.push({
      severity: "notice",
      title: "Customer validation lagging commitment",
      detail: "Routes are committed but customer grounding is thin — direction may be validated internally but not yet by customers.",
      routeIds: committedRoutes.map((r) => r.routeId),
    });
  }

  // Deduplicate by routeId overlap and cap at 3
  return escalations.slice(0, 3);
}

// ─── Portfolio next-move derivation ──────────────────────────────────────────────

function derivePortfolioNextMove(
  portfolioState: PortfolioState,
  routes: RouteDecision[],
  phase: string,
): string {
  const narrativePhase = resolveRefineNarrativePhase(phase);

  if (portfolioState === "scaling_ahead") {
    return "Pause new investment and validate the strategic center before expanding committed routes.";
  }
  if (portfolioState === "validation_heavy") {
    const validateRoutes = routes.filter((r) => r.commitmentState === "validate");
    if (validateRoutes.length > 0) {
      return `Bring ${validateRoutes[0].routeTitle} to a commitment decision — resolve the pending validation before adding new routes.`;
    }
    return "Resolve outstanding validation before adding new exploratory routes.";
  }
  if (portfolioState === "fragmented") {
    return "Consolidate around the strongest route — reduce the number of active bets until one reaches commitment.";
  }
  if (portfolioState === "converging") {
    const commitReady = routes.find((r) => r.commitmentState === "validate" && r.isSafeToScale);
    if (commitReady) {
      return `${commitReady.routeTitle} is closest to commitment — prioritize validating this route's remaining assumptions.`;
    }
    return "The portfolio is converging — focus on the highest-confidence route to reach commitment first.";
  }
  if (portfolioState === "over_concentrated") {
    return "The portfolio is concentrated in one area — consider whether an adjacent route would reduce assumption risk.";
  }

  if (narrativePhase === "pre_diagnosis") {
    return "Gather enough signal across the portfolio to identify which route deserves first-mover investment.";
  }
  if (narrativePhase === "diagnose") {
    const explore = routes.find((r) => r.commitmentState === "explore");
    return explore
      ? `${explore.routeTitle} is still exploratory — gather evidence before committing to a direction.`
      : "Build enough customer signal to move at least one route from validate to commit.";
  }
  if (narrativePhase === "focus") {
    const ready = routes.find((r) => r.sequencingPosture === "ready_for_broader_commitment");
    return ready
      ? `${ready.routeTitle} has sufficient evidence — commit and begin execution planning.`
      : "Identify the strongest route and commit to it before spreading focus further.";
  }

  return "Keep the highest-confidence route active and watch for weakening signals in committed paths.";
}

// ─── Main export ─────────────────────────────────────────────────────────────────

export function buildDecisionPortfolio(args: {
  routes: RouteRow[];
  rationales: RouteRationale[];
  strategicCenter: StrategicCenter;
  customerReality: CustomerRealityNarrative | null;
  positioningNarrative: PositioningLensNarrative | null;
  phase: string;
  /** Optional — discipline restraint flags drive ReviewPressure derivation. */
  discipline?: DisciplineAssessment | null;
  /**
   * Optional — worst aging state of customer proof signals in the portfolio.
   * When "stale", routes that are otherwise commit-ready are held at "validate".
   * Defaults to "fresh" for backward compatibility when not provided.
   */
  customerProofAgingState?: EvidenceAgingState;
}): DecisionPortfolio {
  const { routes, rationales, strategicCenter, customerReality, positioningNarrative, phase, discipline } = args;
  const customerProofAging: EvidenceAgingState = args.customerProofAgingState ?? "fresh";
  const rationaleMap = new Map(rationales.map((r) => [r.routeId, r]));

  const routeDecisions: RouteDecision[] = routes.map((route) => {
    const rationale = rationaleMap.get(route.id) ?? null;
    const centerConfidence = strategicCenter.confidence;

    const commitmentState = rationale
      ? deriveCommitmentState(rationale, centerConfidence, customerProofAging)
      : "explore";

    const prerequisiteRouteIds = derivePrerequisiteRouteIds(route, routes, rationales);
    const enabledRouteIds = deriveEnabledRouteIds(route, routes);

    const sequencingPosture = deriveSequencingPosture(route, commitmentState, routes, rationales);

    const prereqRoutes = routes.filter((r) => prerequisiteRouteIds.includes(r.id));
    const sequencingNarrative = SEQUENCING_NARRATIVES[sequencingPosture](route, prereqRoutes);

    let commitmentRationale = rationale
      ? COMMITMENT_RATIONALE[commitmentState](rationale)
      : `${route.title} does not yet have sufficient signal to assess commitment posture.`;

    // When stale customer proof is holding a commit-ready route at validate,
    // the rationale should describe evidence aging rather than missing proof.
    if (
      commitmentState === "validate" &&
      rationale?.readiness === "Commit" &&
      rationale.supportShape.customer > 0 &&
      customerProofAging === "stale"
    ) {
      commitmentRationale = "Internally coherent — but customer proof has aged since last collection. Re-validate before committing.";
    }

    const safeToScaleFlag = rationale
      ? isSafeToScale(commitmentState, rationale, centerConfidence)
      : false;

    const escalationNote = rationale
      ? deriveEscalationNote(commitmentState, rationale, centerConfidence)
      : null;

    const blockedReason: string | null =
      sequencingPosture === "operationally_blocked"
        ? prereqRoutes.length > 0
          ? `Waiting on: ${prereqRoutes.map((r) => r.title).join(", ")}.`
          : "Operational gaps must close before this route can validate."
        : sequencingPosture === "needs_prerequisite_proof"
          ? "Unproven critical assumptions are blocking validation."
          : null;

    // Decision operations: per-route lifecycle + maturity + review pressure
    const lifecycleState = rationale
      ? deriveDecisionLifecycleState(commitmentState, rationale)
      : "exploring";
    const commitmentMaturity = rationale
      ? deriveCommitmentMaturity(commitmentState, rationale)
      : "intellectually_interesting";
    const reviewPressure = rationale
      ? deriveReviewPressure(commitmentState, lifecycleState, rationale, discipline)
      : { warranted: false, note: null };

    return {
      routeId: route.id,
      routeTitle: route.title,
      category: String(route.category).toLowerCase(),
      commitmentState,
      commitmentRationale,
      sequencingPosture,
      sequencingNarrative,
      prerequisiteRouteIds,
      enabledRouteIds,
      blockedReason,
      isSafeToScale: safeToScaleFlag,
      escalationNote,
      lifecycleState,
      lifecycleLabel: LIFECYCLE_LABELS[lifecycleState],
      commitmentMaturity,
      commitmentMaturityLabel: COMMITMENT_MATURITY_LABELS[commitmentMaturity],
      reviewPressure,
    };
  });

  // Enrich with positioning coherence context for notes
  if (positioningNarrative) {
    const contradictingIds = new Set(positioningNarrative.contradictingRoutes.map((r) => r.routeId));
    for (const d of routeDecisions) {
      if (contradictingIds.has(d.routeId) && d.escalationNote === null) {
        d.escalationNote = "This route conflicts with the current positioning direction — validate strategic fit before scaling.";
      }
    }
  }

  const portfolioState = derivePortfolioState(routeDecisions, strategicCenter);
  const portfolioNextMove = derivePortfolioNextMove(portfolioState, routeDecisions, phase);
  const escalations = deriveEscalations(routeDecisions, rationales, strategicCenter, customerReality);

  const commitCounts: Record<CommitmentState, number> = {
    explore: 0,
    validate: 0,
    commit: 0,
    scale: 0,
    pause: 0,
    unwind: 0,
  };
  for (const d of routeDecisions) commitCounts[d.commitmentState]++;

  const decisionOps = buildDecisionOperationsContext({
    routeEntries: routeDecisions.map((d) => ({
      routeId: d.routeId,
      commitmentState: d.commitmentState,
    })),
    rationales,
    portfolioState,
    discipline,
  });

  return {
    portfolioState,
    portfolioStateLabel: PORTFOLIO_STATE_LABELS[portfolioState],
    portfolioNarrative: PORTFOLIO_NARRATIVES[portfolioState],
    portfolioNextMove,
    escalations,
    routes: routeDecisions,
    commitCounts,
    safeToCommit: routeDecisions
      .filter((r) => r.commitmentState === "commit" || r.commitmentState === "scale")
      .map((r) => r.routeTitle),
    tooEarly: routeDecisions
      .filter((r) => r.commitmentState === "explore")
      .map((r) => r.routeTitle),
    blocked: routeDecisions
      .filter((r) => r.blockedReason !== null || r.commitmentState === "pause")
      .map((r) => r.routeTitle),
    converging: routeDecisions
      .filter((r) => r.commitmentState === "validate" || r.commitmentState === "commit")
      .map((r) => r.routeTitle),
    decisionOps,
  };
}
