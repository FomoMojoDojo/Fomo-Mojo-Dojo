// ── Claim State Machine — Gate Check Functions ────────────────────────────────
//
// Pure functions. No DB calls, no side effects.
// Each function checks whether a specific transition is allowed given the
// current claim state and its associated evidence.
//
// Evidence requirements sourced from spec §2.
// Decision §5.1 Option A: non-need claims reach Focus via signal triangulation,
//   no ODI grammar required. validation_method discriminator is a v2 extension.

import type {
  ClaimForGate,
  ClaimSignalRefForGate,
  OdiNeedForGate,
  RouteForGate,
  TensionForGate,
  ManagedOutcomeForGate,
  GateCheckResult,
  ClaimState,
} from "./types.ts";
import { isNeedClaim, isSkipTransition, CLAIM_STATE_ORDER } from "./types.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function supporting(refs: ClaimSignalRefForGate[]): ClaimSignalRefForGate[] {
  return refs.filter((r) => r.relationship === "supports");
}

function contradicting(refs: ClaimSignalRefForGate[]): ClaimSignalRefForGate[] {
  return refs.filter((r) => r.relationship === "contradicts");
}

function qualifying(refs: ClaimSignalRefForGate[]): ClaimSignalRefForGate[] {
  return refs.filter((r) => r.relationship === "qualifies");
}

function ok(): GateCheckResult {
  return { allowed: true, blockers: [] };
}

function blocked(...reasons: string[]): GateCheckResult {
  return { allowed: false, blockers: reasons };
}

function merge(...results: GateCheckResult[]): GateCheckResult {
  const allBlockers = results.flatMap((r) => r.blockers);
  return { allowed: allBlockers.length === 0, blockers: allBlockers };
}

// ── Skip-state guard (applied before any gate) ────────────────────────────────

export function checkNoSkip(
  fromState: ClaimState,
  toState: ClaimState,
): GateCheckResult {
  if (isSkipTransition(fromState, toState)) {
    const fromIdx = CLAIM_STATE_ORDER.indexOf(fromState);
    const skippedState = CLAIM_STATE_ORDER[fromIdx + 1];
    return blocked(
      `Cannot skip from '${fromState}' to '${toState}' — must pass through '${skippedState}' first`,
    );
  }
  return ok();
}

// ── Gate 1: Outside View → Diagnose ──────────────────────────────────────────
//
// Requirements (spec §2.1):
//   • At least one org-band signal linked via 'supports',
//     with directness IN ('direct','inferred') and structure_level != 'raw'
//   • Total supporting signals ≥ 2 (reaching multi_source triangulation)
//
// What does NOT count:
//   • baseline/outside-band only signals
//   • weak org signals without corroboration
//   • raw-structure signals (not yet extracted/interpreted)

export function checkOutsideViewToDiagnose(
  claim: Pick<ClaimForGate, "state" | "id">,
  refs: ClaimSignalRefForGate[],
): GateCheckResult {
  if (claim.state !== "outside_view") {
    return blocked(`Claim state is '${claim.state}', not 'outside_view'`);
  }

  const supportingRefs = supporting(refs);
  const blockers: string[] = [];

  const hasQualifyingOrgSignal = supportingRefs.some(
    (r) =>
      r.signal.signal_band === "organization" &&
      r.signal.directness !== "weak" &&
      r.signal.structure_level !== "raw",
  );

  if (!hasQualifyingOrgSignal) {
    blockers.push(
      "No qualifying organizational signal — need a direct or inferred org signal " +
        "with structure_level of 'extracted' or 'interpreted'",
    );
  }

  if (supportingRefs.length < 2) {
    blockers.push(
      `Only ${supportingRefs.length} supporting signal(s) — need at least 2 ` +
        "for multi_source triangulation",
    );
  }

  return { allowed: blockers.length === 0, blockers };
}

// ── Gate 2: Diagnose → Focus ──────────────────────────────────────────────────
//
// Requirements (spec §2.2):
//   For ALL claims:
//     • At least one customer-band supporting signal
//     • No unaddressed contradictions
//       (a contradiction is addressed when any 'qualifies' ref exists, or
//        when the contradicting signal itself has validation_status='contradicted')
//
//   For NEED claims (claim_type IN ('customer_outcome','unmet_need')):
//     • need_statement non-null (ODI grammar — enforced by presence only in v1)
//     • importance ≥ 1 on linked odi_need
//     • opportunity_score computed (non-zero OR importance > 0 with satisfaction scored)
//
//   For NON-NEED claims (decision §5.1 Option A):
//     • ≥2 customer-band signals with directness IN ('direct','inferred')
//       OR 1 direct customer + 1 org with framing_fit='strong'
//     • At least 1 signal with validation_status='validated'

export function checkDiagnoseToFocus(
  claim: Pick<ClaimForGate, "state" | "id" | "claim_type" | "need_statement">,
  refs: ClaimSignalRefForGate[],
  odiNeed?: OdiNeedForGate,
): GateCheckResult {
  if (claim.state !== "diagnose") {
    return blocked(`Claim state is '${claim.state}', not 'diagnose'`);
  }

  const supportingRefs = supporting(refs);
  const contradictingRefs = contradicting(refs);
  const qualifyingRefs = qualifying(refs);
  const blockers: string[] = [];

  // Universal: customer-band signal required
  const hasCustomerSignal = supportingRefs.some(
    (r) => r.signal.signal_band === "customer",
  );
  if (!hasCustomerSignal) {
    blockers.push("No customer-band signal supporting this claim");
  }

  // Universal: unaddressed contradictions
  const hasQualifyingRefs = qualifyingRefs.length > 0;
  const allContradictionsResolvedInSignal = contradictingRefs.every(
    (r) => r.signal.validation_status === "contradicted",
  );
  if (contradictingRefs.length > 0 && !hasQualifyingRefs && !allContradictionsResolvedInSignal) {
    blockers.push(
      `${contradictingRefs.length} contradiction(s) not yet addressed — add a ` +
        "'qualifies' signal or mark the contradicting signal as contradicted",
    );
  }

  if (isNeedClaim(claim.claim_type)) {
    // Need-claim specific requirements
    if (!claim.need_statement || claim.need_statement.trim() === "") {
      blockers.push(
        "ODI-formatted need_statement required for need claims " +
          "(verb + object of verb + contextual clarifier)",
      );
    }
    if (!odiNeed) {
      blockers.push("Associated odi_need scoring record required");
    } else {
      if (odiNeed.importance < 1) {
        blockers.push(
          `Importance score is ${odiNeed.importance} — must be ≥ 1 (0 means unscored)`,
        );
      }
    }
  } else {
    // Non-need claims: signal triangulation gate (§5.1 Option A)
    const directCustomerSignals = supportingRefs.filter(
      (r) =>
        r.signal.signal_band === "customer" && r.signal.directness !== "weak",
    );
    const strongOrgSignals = supportingRefs.filter(
      (r) =>
        r.signal.signal_band === "organization" &&
        r.signal.framing_fit === "strong",
    );

    const meetsTriangulation =
      directCustomerSignals.length >= 2 ||
      (directCustomerSignals.length >= 1 && strongOrgSignals.length >= 1);

    if (!meetsTriangulation) {
      blockers.push(
        "Non-need claim requires ≥2 direct/inferred customer signals, " +
          "or 1 direct customer signal + 1 org signal with framing_fit='strong' " +
          "(decision §5.1 Option A — validation_method discriminator is v2)",
      );
    }

    const hasValidatedSignal = supportingRefs.some(
      (r) => r.signal.validation_status === "validated",
    );
    if (!hasValidatedSignal) {
      blockers.push(
        "At least one supporting signal must have validation_status='validated'",
      );
    }
  }

  return { allowed: blockers.length === 0, blockers };
}

// ── Gate 3: Focus → Flow ──────────────────────────────────────────────────────
//
// Requirements (spec §2.3):
//   • action_category set on claim
//   • A route is linked to this claim
//   • Route has ≥1 step with status IN ('in_progress','complete')
//   • No active commitment-blocker tension for the linked route
//   • Monitoring anchor: ≥1 complete/in-progress step OR ≥1 managed_outcome

export function checkFocusToFlow(
  claim: Pick<ClaimForGate, "state" | "id" | "action_category">,
  linkedRoute: RouteForGate | null,
  activeTensions: TensionForGate[],
  managedOutcomes: ManagedOutcomeForGate[],
): GateCheckResult {
  if (claim.state !== "focus") {
    return blocked(`Claim state is '${claim.state}', not 'focus'`);
  }

  const blockers: string[] = [];

  if (!claim.action_category) {
    blockers.push(
      "action_category must be set (fix/improve/create) before transitioning to Flow",
    );
  }

  if (!linkedRoute) {
    blockers.push("No route linked to this claim — assign a route first");
  } else {
    const steps = linkedRoute.steps_json ?? [];
    const startedSteps = steps.filter(
      (s) => s.status === "in_progress" || s.status === "complete",
    );
    if (startedSteps.length === 0) {
      blockers.push(
        "Linked route has no started steps — at least one step must be " +
          "in_progress or complete",
      );
    }

    const blockerTension = activeTensions.find(
      (t) =>
        t.is_commitment_blocker && t.blocked_commitments.includes(linkedRoute.id),
    );
    if (blockerTension) {
      blockers.push(
        "An active commitment-blocker tension is blocking this route — " +
          "resolve the tension before committing to Flow",
      );
    }

    // Monitoring anchor: step progress satisfies it (checked above) OR managed_outcome
    const hasStartedSteps = (linkedRoute.steps_json ?? []).some(
      (s) => s.status === "in_progress" || s.status === "complete",
    );
    const hasMonitoringAnchor = hasStartedSteps || managedOutcomes.length > 0;
    if (!hasMonitoringAnchor) {
      blockers.push(
        "No monitoring anchor — start a route step or define a managed outcome",
      );
    }
  }

  return { allowed: blockers.length === 0, blockers };
}

// ── Regression detectors ──────────────────────────────────────────────────────
//
// These are pure checks that return true when a backward transition is warranted.
// The machine calls them to auto-demote claims when evidence events occur.

/**
 * Should a 'diagnose' claim regress to 'outside_view'?
 * Trigger: all org-band supporting signals are gone or contradicted.
 */
export function shouldRegressDiagnoseToOutsideView(
  refs: ClaimSignalRefForGate[],
): boolean {
  const activeOrgSupports = supporting(refs).filter(
    (r) =>
      r.signal.signal_band === "organization" &&
      r.signal.directness !== "weak" &&
      r.signal.validation_status !== "contradicted",
  );
  return activeOrgSupports.length === 0;
}

/**
 * Should a 'focus' claim regress to 'diagnose'?
 * Trigger: primary customer signal withdrawn/contradicted (triangulation drops),
 *   or for need claims: importance drops below 1.
 */
export function shouldRegressFocusToDiagnose(
  refs: ClaimSignalRefForGate[],
  odiNeed?: OdiNeedForGate,
): boolean {
  const activeCustomerSupports = supporting(refs).filter(
    (r) =>
      r.signal.signal_band === "customer" &&
      r.signal.validation_status !== "contradicted",
  );
  if (activeCustomerSupports.length === 0) return true;
  if (odiNeed !== undefined && odiNeed.importance < 1) return true;
  return false;
}

/**
 * Should a 'flow' claim regress to 'focus'?
 * Trigger: linked route stale, OR new direct contradicting customer signal.
 */
export function shouldRegressFlowToFocus(
  linkedRoute: RouteForGate | null,
  refs: ClaimSignalRefForGate[],
): boolean {
  if (!linkedRoute) return true;
  if (linkedRoute.stale_reason !== null) return true;
  if (linkedRoute.dependency_state === "stale") return true;
  const hasDirectCustomerContradiction = refs.some(
    (r) =>
      r.relationship === "contradicts" &&
      r.signal.signal_band === "customer" &&
      r.signal.directness === "direct",
  );
  return hasDirectCustomerContradiction;
}
