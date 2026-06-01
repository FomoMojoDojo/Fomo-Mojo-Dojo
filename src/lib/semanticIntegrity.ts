/**
 * Semantic Integrity Audit
 *
 * Cross-layer consistency enforcer. Detects semantic impossibilities that arise
 * when multiple orchestration layers interact: register vs. temporal state,
 * attention posture vs. decay state, commitment language vs. proof maturity.
 *
 * This layer is read-only — it produces an audit result but does not modify any
 * output. Violations are internal signals for calibration and trust monitoring.
 * Nothing in this audit should appear in user-facing language as a label or badge.
 *
 * Severity tiers:
 *   blocking  — semantically impossible state; a layer has produced an inconsistency
 *   warning   — plausible but inconsistent; language calibration may be off
 *   advisory  — tension present; worth monitoring but not necessarily a system error
 *
 * Checks (by Part):
 *   Part 1 — Cross-layer semantic impossibilities
 *   Part 2 — Language tier violations
 *   Part 3 — Sacred concept protection
 *   Part 4 — Tone collision detection
 *   Part 5 — Register guardrails
 *
 * Trust score:
 *   100 = clean, self-consistent
 *   Each blocking violation: −30
 *   Each warning violation: −10
 *   Each advisory violation: −3
 *   Clamped to [0, 100]
 */

import type { ExecutiveRegister } from "@/lib/executiveRegister";
import type { DisciplineAssessment } from "@/lib/confidenceDiscipline";
import type { UnifiedConfidencePosture } from "@/lib/strategicCenterSurface";
import type { TemporalPosture } from "@/lib/strategicTemporalState";
import type { AttentionContext } from "@/lib/strategicAttention";
import type { DecayContext } from "@/lib/strategicDecay";
import type { GovernanceDrift } from "@/lib/decisionOperations";
import type { OperatingMode } from "@/lib/operatingMode";
import type { CustomerRealityPosture } from "@/lib/customerRealityNarrative";

// ─── Language tiers ───────────────────────────────────────────────────────────

/**
 * Semantic tier system for executive language.
 * Each tier defines the evidence maturity and state prerequisites required
 * before language at that tier is appropriate.
 *
 * These are not rendered to users. They are used by the integrity audit to
 * detect when language claims a tier the evidence cannot support.
 */
export type LanguageTier = 1 | 2 | 3 | 4;

export const LANGUAGE_TIER_LABELS: Record<LanguageTier, string> = {
  1: "Exploratory",   // forming, directional, emerging, early, unvalidated
  2: "Converging",    // strengthening, cohering, building, gaining confidence
  3: "Operational",   // commitment-ready, stable, validated, decision-ready
  4: "Structural",    // entrenched, persistent, structural, systemic, institutional
};

/**
 * Vocabulary anchors per tier.
 * Not used for string-scanning — used as reference documentation for
 * phrase authors and discipline cooling rules.
 */
export const LANGUAGE_TIER_VOCABULARY: Record<LanguageTier, readonly string[]> = {
  1: ["forming", "directional", "emerging", "early", "unvalidated", "possible", "investigational"],
  2: ["strengthening", "cohering", "building", "supported", "gaining confidence", "accumulating"],
  3: ["commitment-ready", "stable", "validated", "repeatable", "decision-ready", "holding", "established"],
  4: ["entrenched", "persistent", "structural", "systemic", "institutional", "across cycles"],
};

/**
 * Minimum evidence tier required for each register.
 * Register must not claim a tier its evidence state cannot support.
 */
export const REGISTER_MINIMUM_TIER: Record<ExecutiveRegister, LanguageTier> = {
  exploratory:        1,
  converging:         2,
  structural_pressure:4,
  stabilized:         3,
  escalation:         3,
};

// ─── Public types ─────────────────────────────────────────────────────────────

export type ViolationSeverity = "blocking" | "warning" | "advisory";

export type SemanticViolation = {
  readonly code: string;
  readonly severity: ViolationSeverity;
  readonly description: string;
  /** Which orchestration layers are in conflict. */
  readonly layers: readonly string[];
};

export type SemanticIntegrityInput = {
  register: ExecutiveRegister;
  /** Discipline assessment — needed to detect inflation between raw and cooled register. */
  discipline: DisciplineAssessment | null;
  confidencePosture: UnifiedConfidencePosture;
  temporalPosture: TemporalPosture | null;
  attention: AttentionContext | null;
  decay: DecayContext | null;
  /** Posture string from CustomerRealityNarrative. */
  customerRealityPosture: CustomerRealityPosture | null;
  /** True when customer reality posture is "grounded" or "converging". */
  hasCustomerBehavioralProof: boolean;
  governanceDrift: GovernanceDrift;
  /** Route names currently marked safe-to-commit. */
  safeToCommit: string[];
  /** True when any route in the portfolio is in "stalled" or "gated" lifecycle state. */
  portfolioHasStalledOrGatedRoutes: boolean;
  operatingMode: OperatingMode;
};

export type SemanticIntegrity = {
  readonly violations: readonly SemanticViolation[];
  readonly isClean: boolean;
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly advisoryCount: number;
  /**
   * Aggregate trust signal: 0–100.
   * 100 = all layers self-consistent; decreases with each violation.
   * Internal-only — never surface as a score label to users.
   */
  readonly trustScore: number;
};

// ─── Trust score calculation ──────────────────────────────────────────────────

function computeTrustScore(violations: SemanticViolation[]): number {
  let score = 100;
  for (const v of violations) {
    if (v.severity === "blocking") score -= 30;
    else if (v.severity === "warning") score -= 10;
    else score -= 3;
  }
  return Math.max(0, Math.min(100, score));
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Runs the full semantic integrity audit across all orchestration layers.
 * Returns a read-only audit result — does not modify any layer outputs.
 *
 * All checks are structural (state-based), not string-scanning.
 * String-scanning of phrase output is fragile and belongs in discipline.coolPhrase,
 * not in cross-layer consistency checking.
 */
export function auditSemanticIntegrity(
  input: SemanticIntegrityInput,
): SemanticIntegrity {
  const {
    register,
    discipline,
    confidencePosture,
    temporalPosture,
    attention,
    decay,
    customerRealityPosture,
    hasCustomerBehavioralProof,
    governanceDrift,
    safeToCommit,
    portfolioHasStalledOrGatedRoutes,
    operatingMode,
  } = input;

  const violations: SemanticViolation[] = [];
  const proofGapMaturity = temporalPosture?.proofGapMaturity ?? null;
  const contradictionPressure = temporalPosture?.contradictionPressure ?? null;
  const momentum = temporalPosture?.momentum ?? null;

  // ─── Part 1: Cross-layer semantic impossibilities ─────────────────────────

  // A route cannot be "safe to commit" without behavioral customer evidence.
  // Internal alignment, org coherence, or inference are not behavioral proof.
  if (safeToCommit.length > 0 && !hasCustomerBehavioralProof) {
    violations.push({
      code: "COMMITMENT_WITHOUT_BEHAVIORAL_PROOF",
      severity: "blocking",
      description:
        "Route marked safe-to-commit without customer behavioral evidence. " +
        "Commitment readiness requires behavioral proof, not inference or internal alignment.",
      layers: ["decisionSystem.safeToCommit", "customerRealityNarrative.posture"],
    });
  }

  // Focused attention posture without a dominant concern is an internal inconsistency.
  // Focused posture means one critical thing dominates — if nothing is identified, the posture is wrong.
  if (attention?.posture === "focused" && !attention.dominantConcern) {
    violations.push({
      code: "FOCUSED_WITHOUT_DOMINANT_CONCERN",
      severity: "blocking",
      description:
        "Focused attention posture active but no dominant concern identified. " +
        "Focused posture requires a specific critical thread — this is an internal miscalibration.",
      layers: ["strategicAttention.posture", "strategicAttention.dominantConcern"],
    });
  }

  // Conditions cannot be stabilizing while active contradiction pressure persists.
  // conditionsStabilizing requires contradictionPressure === "none" | "isolated" by construction,
  // but verify defensively to catch any future logic drift.
  if (
    decay?.conditionsStabilizing &&
    (contradictionPressure === "accumulating" || contradictionPressure === "entrenched")
  ) {
    violations.push({
      code: "STABILIZING_WITH_ACTIVE_CONTRADICTION",
      severity: "blocking",
      description:
        "Conditions declared stabilizing while active contradiction pressure is accumulating or entrenched. " +
        "These states are mutually exclusive — a decay rule or temporal state derivation has drifted.",
      layers: ["strategicDecay.conditionsStabilizing", "strategicTemporalState.contradictionPressure"],
    });
  }

  // ─── Part 2: Language tier violations ────────────────────────────────────

  // Stabilized register (Tier 3 language) is not warranted without proof maturity.
  // Tier 3 claims "established", "validated", "holding" — none of these apply when
  // hypotheses are fresh and no behavioral customer proof is present.
  if (
    register === "stabilized" &&
    proofGapMaturity === "fresh" &&
    !hasCustomerBehavioralProof
  ) {
    violations.push({
      code: "STABILIZED_REGISTER_WITHOUT_PROOF",
      severity: "warning",
      description:
        "Stabilized register active with fresh hypotheses and no behavioral customer proof. " +
        "Tier 3 language (established, validated, holding) is not warranted. " +
        "Discipline should have caught this — check cooledRegister alignment.",
      layers: ["executiveRegister", "strategicTemporalState.proofGapMaturity", "customerRealityNarrative"],
    });
  }

  // Structural pressure (Tier 4 language) requires temporal maturity.
  // "Structural" implies persistence across cycles — fresh state cannot be structural.
  if (
    register === "structural_pressure" &&
    proofGapMaturity === "fresh" &&
    contradictionPressure !== "accumulating" &&
    contradictionPressure !== "entrenched"
  ) {
    violations.push({
      code: "STRUCTURAL_PRESSURE_FRESH_STATE",
      severity: "warning",
      description:
        "Structural pressure register active without temporal maturity or accumulated contradiction. " +
        "Structural language requires at least aging proof gap or accumulating contradiction pressure.",
      layers: ["executiveRegister", "strategicTemporalState.proofGapMaturity", "strategicTemporalState.contradictionPressure"],
    });
  }

  // ─── Part 3: Sacred concept protection ───────────────────────────────────

  // Customer proof is "inferred" but attention posture is "stable" — this means the
  // system has assessed the situation as stable while the customer proof signal is missing.
  // Stable posture requires absence of active concerns — but missing proof IS an active concern
  // and should prevent "stable" from being a valid posture.
  if (
    customerRealityPosture === "inferred" &&
    attention?.posture === "stable"
  ) {
    violations.push({
      code: "PROOF_ABSENT_STABLE_POSTURE",
      severity: "warning",
      description:
        "Customer proof is inferred (not behavioral) but attention posture is stable. " +
        "Missing customer evidence is an active concern — stable posture may be over-compressing it.",
      layers: ["customerRealityNarrative.posture", "strategicAttention.posture"],
    });
  }

  // Structural pressure requires time — isolated contradiction cannot be structural.
  // This guards against the temporal state engine misfiring on a single fresh contradiction.
  if (
    register === "structural_pressure" &&
    contradictionPressure === "isolated" &&
    proofGapMaturity !== "structural"
  ) {
    violations.push({
      code: "STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION",
      severity: "warning",
      description:
        "Structural pressure register active with only an isolated contradiction and no structural proof gap. " +
        "Structural language requires entrenched contradiction or a structural proof gap duration.",
      layers: ["executiveRegister", "strategicTemporalState.contradictionPressure", "strategicTemporalState.proofGapMaturity"],
    });
  }

  // Stabilization requires governance alignment. If governance drift is unresolved,
  // the system is not stable — one dimension of it is misfiring.
  if (decay?.conditionsStabilizing && governanceDrift.any) {
    violations.push({
      code: "STABILIZING_WITH_GOVERNANCE_DRIFT",
      severity: "warning",
      description:
        "Conditions declared stabilizing while portfolio governance drift is active. " +
        "Stabilization requires governance alignment — decay may be over-compressing active pressure.",
      layers: ["strategicDecay.conditionsStabilizing", "decisionOperations.governanceDrift"],
    });
  }

  // Stabilized register while governance drift unresolved — similar but distinct.
  // Stabilized register claims "mature coherence" — that's incompatible with governance drift.
  if (register === "stabilized" && governanceDrift.any) {
    violations.push({
      code: "STABILIZED_REGISTER_WITH_GOVERNANCE_DRIFT",
      severity: "warning",
      description:
        "Stabilized register (mature coherence, low volatility) active while governance drift is unresolved. " +
        "Register may over-compress active pressure from portfolio imbalance or commitment drift.",
      layers: ["executiveRegister", "decisionOperations.governanceDrift"],
    });
  }

  // ─── Part 4: Tone collision detection ─────────────────────────────────────

  // Decay background note + focused posture are semantically incompatible.
  // Background note says "this is settled structural background."
  // Focused posture says "there is an acute critical concern dominating attention."
  // Both cannot be simultaneously accurate.
  if (decay != null && decay.backgroundNote !== null && attention?.posture === "focused") {
    violations.push({
      code: "DECAY_NOTE_WITH_FOCUSED_POSTURE",
      severity: "warning",
      description:
        "Decay background note active while attention posture is focused. " +
        "Background note signals structural calm; focused posture signals acute critical pressure. " +
        "These are incompatible — either the contradiction has genuinely cooled or it is still acute.",
      layers: ["strategicDecay.backgroundNote", "strategicAttention.posture"],
    });
  }

  // Stable attention posture with escalation register is a confidence temperature mismatch.
  // Escalation implies urgent active exposure; stable implies no urgency. One is wrong.
  if (attention?.posture === "stable" && register === "escalation") {
    violations.push({
      code: "STABLE_POSTURE_ESCALATION_REGISTER",
      severity: "warning",
      description:
        "Stable attention posture paired with escalation register. " +
        "Escalation implies active urgent exposure; stable implies no urgency. " +
        "One of these is miscalibrated — likely the register derivation is ahead of the attention model.",
      layers: ["strategicAttention.posture", "executiveRegister"],
    });
  }

  // Coherent confidence posture while committed routes are stalled or gated.
  // "Coherent" claims high confidence, customer grounded, positioning coherent — but
  // blocked portfolio state contradicts the claimed operational stability.
  if (confidencePosture === "coherent" && portfolioHasStalledOrGatedRoutes) {
    violations.push({
      code: "COHERENT_POSTURE_WITH_BLOCKED_ROUTES",
      severity: "advisory",
      description:
        "Coherent confidence posture while one or more routes are stalled or gated. " +
        "Coherent posture implies operational health — blocked portfolio state adds pressure not yet reflected.",
      layers: ["strategicCenterSurface.confidencePosture", "decisionOperations.lifecycleState"],
    });
  }

  // ─── Part 5: Register guardrails ─────────────────────────────────────────

  // Escalation register inflated: discipline cooled it, but the raw register is still "escalation."
  // This means escalation-level language is firing but evidence doesn't support it.
  // The discipline handles phrase-level cooling — this flags the register-level mismatch.
  if (
    register === "escalation" &&
    discipline?.cooledRegister !== "escalation"
  ) {
    violations.push({
      code: "ESCALATION_REGISTER_COOLED_BY_DISCIPLINE",
      severity: "warning",
      description:
        "Escalation register active but confidence discipline cooled it to a lower register. " +
        "Escalation-level urgency is not supported by the current evidence — language inflation risk.",
      layers: ["executiveRegister", "confidenceDiscipline.cooledRegister"],
    });
  }

  // Exploratory register in a stabilizing state is a miscalibration.
  // If conditions are stabilizing, the register should have elevated to at least converging.
  if (register === "exploratory" && decay?.conditionsStabilizing) {
    violations.push({
      code: "EXPLORATORY_REGISTER_IN_STABLE_STATE",
      severity: "advisory",
      description:
        "Exploratory register (low certainty, forming signals) active while conditions are stabilizing. " +
        "Register derivation may not have received current decay or temporal state context.",
      layers: ["executiveRegister", "strategicDecay.conditionsStabilizing"],
    });
  }

  // Decide mode (commitment review) while customer proof is inferred.
  // Decide mode implies commitment readiness — but inferred proof means there's no
  // behavioral evidence. The mode implies a confidence the state doesn't support.
  if (operatingMode === "decide" && customerRealityPosture === "inferred") {
    violations.push({
      code: "DECIDE_MODE_WITHOUT_CUSTOMER_PROOF",
      severity: "advisory",
      description:
        "Operating in Decide mode (commitment review) while customer proof is inferred. " +
        "Decide mode implies commitment readiness — inferred customer proof cannot ground that claim.",
      layers: ["operatingMode", "customerRealityNarrative.posture"],
    });
  }

  // Weakening momentum is incompatible with "stabilized" register.
  // Weakening means confidence is deteriorating — stabilized claims the opposite.
  if (register === "stabilized" && momentum === "weakening") {
    violations.push({
      code: "STABILIZED_REGISTER_WEAKENING_MOMENTUM",
      severity: "warning",
      description:
        "Stabilized register active while strategic momentum is weakening. " +
        "Weakening momentum signals deteriorating confidence — stabilized claims the opposite.",
      layers: ["executiveRegister", "strategicTemporalState.momentum"],
    });
  }

  // ─── Aggregate ────────────────────────────────────────────────────────────

  // Sort by severity so callers always see the most critical issues first.
  const SEVERITY_ORDER: Record<ViolationSeverity, number> = { blocking: 0, warning: 1, advisory: 2 };
  violations.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const blockingCount = violations.filter((v) => v.severity === "blocking").length;
  const warningCount  = violations.filter((v) => v.severity === "warning").length;
  const advisoryCount = violations.filter((v) => v.severity === "advisory").length;

  return {
    violations: violations as readonly SemanticViolation[],
    isClean: violations.length === 0,
    blockingCount,
    warningCount,
    advisoryCount,
    trustScore: computeTrustScore(violations),
  };
}
