/**
 * Semantic Integrity Enforcement
 *
 * Adapter layer that translates semantic integrity audit results into safe
 * expression overrides. Sits downstream of all orchestration layers and
 * upstream of rendering.
 *
 * Design principles:
 *   - Governs expression, not truth. No data changes — only posture and
 *     language framing become safer.
 *   - Additive suppression: corrections only reduce certainty, never inflate it.
 *   - Register travels one direction: down. Never upgrades.
 *   - Posture travels one direction: toward less assertive. Never escalates.
 *   - Multiple violations: most conservative outcome wins.
 *   - Advisory violations: observed, not enforced (they are tensions, not errors).
 *
 * Dependency order (no circular imports):
 *   semanticIntegrity → semanticIntegrityEnforcement → (view)
 *
 * Nothing in this module should be user-facing. appliedCorrections is for
 * developer testing only and must never render in production UI.
 */

import type { SemanticIntegrity } from "@/lib/semanticIntegrity";
import type { ExecutiveRegister } from "@/lib/executiveRegister";
import type { AttentionPosture } from "@/lib/strategicAttention";
import type { UnifiedConfidencePosture } from "@/lib/strategicCenterSurface";
import type { OperatingMode } from "@/lib/operatingMode";

// ─── Register conservatism order ─────────────────────────────────────────────
// Lower number = more conservative (more hedged). Enforcement only moves DOWN.

const REGISTER_CONSERVATISM: Record<ExecutiveRegister, number> = {
  exploratory:         1,
  converging:          2,
  stabilized:          3,
  structural_pressure: 4,
  escalation:          5,
};

function mostConservativeRegister(
  a: ExecutiveRegister,
  b: ExecutiveRegister,
): ExecutiveRegister {
  return REGISTER_CONSERVATISM[a] <= REGISTER_CONSERVATISM[b] ? a : b;
}

// ─── Posture assertiveness order ──────────────────────────────────────────────
// Lower number = less assertive. Enforcement only moves DOWN.

const POSTURE_ASSERTIVENESS: Record<AttentionPosture, number> = {
  stable:     1,
  fragmented: 2,
  watchful:   2,
  focused:    3,
};

function leastAssertivePosture(
  a: AttentionPosture,
  b: AttentionPosture,
): AttentionPosture {
  return POSTURE_ASSERTIVENESS[a] <= POSTURE_ASSERTIVENESS[b] ? a : b;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export type SemanticEnforcement = {
  /**
   * Register safe for phrase selection. May be downgraded from the raw register
   * when violations indicate the current register overstates conditions.
   */
  readonly safeRegister: ExecutiveRegister;
  /**
   * Attention posture safe for signal quota enforcement and landscape framing.
   * May be downgraded when focused posture is unjustified or proof is absent.
   */
  readonly safeAttentionPosture: AttentionPosture;
  /**
   * When true, commitment-ready framing should not appear.
   * port-safe-commit signal is downgraded; Decide mode is framed as review only.
   */
  readonly suppressCommitmentLanguage: boolean;
  /**
   * When true, Tier 4 language (structural, entrenched, persistent) is unavailable.
   * Register downgrade already handles phrase selection — this flag is additional
   * signal for callers that need explicit awareness (e.g., rendering guards).
   */
  readonly suppressStructuralLanguage: boolean;
  /**
   * When true, customer proof gap signals must remain visible.
   * Prevents customer_proof signals from being quota-suppressed when proof is absent
   * but posture is treating the state as stable.
   */
  readonly forceCustomerProofVisibility: boolean;
  /**
   * When true, the focused landscape framing (directive resolution lines) should
   * not render. Conductor uses standard landscape line instead.
   * Handled by passing safeAttentionPosture to the conductor — this flag is
   * informational for callers that need explicit awareness.
   */
  readonly suppressFocusedLandscape: boolean;
  /**
   * Override descriptor for the operating mode bar when enforcement changes framing.
   * Null when no override is needed.
   * Example: "Commitment review" when Decide mode is active but commitment is suppressed.
   */
  readonly safeModeDescriptor: string | null;
  /**
   * Audit trail of corrections applied. Internal only — for developer tests.
   * MUST NOT be rendered in production UI.
   */
  readonly appliedCorrections: readonly string[];
};

// ─── Main export ──────────────────────────────────────────────────────────────

export function deriveSemanticEnforcement(args: {
  integrity: SemanticIntegrity;
  register: ExecutiveRegister;
  attentionPosture: AttentionPosture;
  confidencePosture: UnifiedConfidencePosture;
  operatingMode: OperatingMode;
}): SemanticEnforcement {
  const { integrity, register, attentionPosture, operatingMode } = args;

  // If audit is clean, no enforcement needed — return raw state unchanged.
  // Advisory-only violations also get no enforcement (tensions, not errors).
  const enforceable = integrity.violations.filter(
    (v) => v.severity === "blocking" || v.severity === "warning",
  );

  if (enforceable.length === 0) {
    return {
      safeRegister: register,
      safeAttentionPosture: attentionPosture,
      suppressCommitmentLanguage: false,
      suppressStructuralLanguage: false,
      forceCustomerProofVisibility: false,
      suppressFocusedLandscape: false,
      safeModeDescriptor: null,
      appliedCorrections: [],
    };
  }

  const codes = new Set(integrity.violations.map((v) => v.code));
  const corrections: string[] = [];

  // Running state — only moves in the conservative direction.
  let safeRegister = register;
  let safeAttentionPosture = attentionPosture;
  let suppressCommitmentLanguage = false;
  let suppressStructuralLanguage = false;
  let forceCustomerProofVisibility = false;
  let suppressFocusedLandscape = false;

  // ─── Helper: safe register downgrade ─────────────────────────────────────
  function downgradeRegister(target: ExecutiveRegister, reason: string): void {
    const next = mostConservativeRegister(safeRegister, target);
    if (next !== safeRegister) {
      corrections.push(`${reason} → register ${safeRegister} → ${next}`);
      safeRegister = next;
    }
  }

  // ─── Helper: safe posture downgrade ──────────────────────────────────────
  function downgradePosture(target: AttentionPosture, reason: string): void {
    const next = leastAssertivePosture(safeAttentionPosture, target);
    if (next !== safeAttentionPosture) {
      corrections.push(`${reason} → posture ${safeAttentionPosture} → ${next}`);
      safeAttentionPosture = next;
    }
  }

  // ─── Blocking violations — highest priority enforcement ───────────────────

  // COMMITMENT_WITHOUT_BEHAVIORAL_PROOF
  // Route marked safe-to-commit without customer behavioral evidence.
  // Suppress all commitment framing; downgrade escalation register if active.
  if (codes.has("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF")) {
    suppressCommitmentLanguage = true;
    corrections.push("COMMITMENT_WITHOUT_BEHAVIORAL_PROOF → suppressCommitmentLanguage");
    downgradeRegister("structural_pressure", "COMMITMENT_WITHOUT_BEHAVIORAL_PROOF");
  }

  // FOCUSED_WITHOUT_DOMINANT_CONCERN
  // Focused attention posture lacks a critical thread — posture is internally inconsistent.
  // Downgrade to watchful; suppress focused landscape framing.
  if (codes.has("FOCUSED_WITHOUT_DOMINANT_CONCERN")) {
    downgradePosture("watchful", "FOCUSED_WITHOUT_DOMINANT_CONCERN");
    suppressFocusedLandscape = true;
    corrections.push("FOCUSED_WITHOUT_DOMINANT_CONCERN → suppressFocusedLandscape");
  }

  // STABILIZING_WITH_ACTIVE_CONTRADICTION
  // Decay claims stability while active contradiction persists — a logic drift.
  // Suppress structural language; this state is not actually stable.
  if (codes.has("STABILIZING_WITH_ACTIVE_CONTRADICTION")) {
    suppressStructuralLanguage = true;
    corrections.push("STABILIZING_WITH_ACTIVE_CONTRADICTION → suppressStructuralLanguage");
    downgradeRegister("converging", "STABILIZING_WITH_ACTIVE_CONTRADICTION");
  }

  // ─── Warning violations — language calibration corrections ────────────────

  // STABILIZED_REGISTER_WITHOUT_PROOF
  // Stabilized register claims "established", "validated", "holding" without proof.
  // Downgrade to converging — evidence is building, not arrived.
  if (codes.has("STABILIZED_REGISTER_WITHOUT_PROOF")) {
    downgradeRegister("converging", "STABILIZED_REGISTER_WITHOUT_PROOF");
  }

  // STABILIZED_REGISTER_WITH_GOVERNANCE_DRIFT
  // Stabilized register claims mature coherence while governance is drifting.
  // Downgrade to converging — not stable, still tracking active drift.
  if (codes.has("STABILIZED_REGISTER_WITH_GOVERNANCE_DRIFT")) {
    downgradeRegister("converging", "STABILIZED_REGISTER_WITH_GOVERNANCE_DRIFT");
  }

  // STABILIZED_REGISTER_WEAKENING_MOMENTUM
  // Stabilized register while confidence is deteriorating.
  // Downgrade to structural_pressure — conditions are under active stress.
  if (codes.has("STABILIZED_REGISTER_WEAKENING_MOMENTUM")) {
    downgradeRegister("structural_pressure", "STABILIZED_REGISTER_WEAKENING_MOMENTUM");
  }

  // STRUCTURAL_PRESSURE_FRESH_STATE
  // Structural language without temporal maturity — Tier 4 claim without Tier 4 evidence.
  // Downgrade to converging; suppress structural language.
  if (codes.has("STRUCTURAL_PRESSURE_FRESH_STATE")) {
    suppressStructuralLanguage = true;
    corrections.push("STRUCTURAL_PRESSURE_FRESH_STATE → suppressStructuralLanguage");
    downgradeRegister("converging", "STRUCTURAL_PRESSURE_FRESH_STATE");
  }

  // STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION
  // Structural framing with only an isolated contradiction — not entrenched.
  // Same treatment as fresh state: downgrade and suppress structural language.
  if (codes.has("STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION")) {
    suppressStructuralLanguage = true;
    corrections.push("STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION → suppressStructuralLanguage");
    downgradeRegister("converging", "STRUCTURAL_CLAIM_ISOLATED_CONTRADICTION");
  }

  // PROOF_ABSENT_STABLE_POSTURE
  // Customer proof is missing but attention posture is stable — proof gap suppressed.
  // Force proof visibility; soften posture to watchful to allow proof signals to surface.
  if (codes.has("PROOF_ABSENT_STABLE_POSTURE")) {
    forceCustomerProofVisibility = true;
    corrections.push("PROOF_ABSENT_STABLE_POSTURE → forceCustomerProofVisibility");
    downgradePosture("watchful", "PROOF_ABSENT_STABLE_POSTURE");
  }

  // ESCALATION_REGISTER_COOLED_BY_DISCIPLINE
  // Discipline already cooled the register — enforce the cooled posture at the
  // register level so escalation-family phrases don't bypass discipline cooling.
  if (codes.has("ESCALATION_REGISTER_COOLED_BY_DISCIPLINE")) {
    downgradeRegister("structural_pressure", "ESCALATION_REGISTER_COOLED_BY_DISCIPLINE");
  }

  // STABLE_POSTURE_ESCALATION_REGISTER
  // Posture says calm; register says urgent. Posture wins — register follows downward.
  if (codes.has("STABLE_POSTURE_ESCALATION_REGISTER")) {
    downgradeRegister("structural_pressure", "STABLE_POSTURE_ESCALATION_REGISTER");
  }

  // DECAY_NOTE_WITH_FOCUSED_POSTURE
  // Background note (structural calm) is incompatible with focused posture (acute pressure).
  // Trust the decay assessment — suppress the focused landscape framing.
  if (codes.has("DECAY_NOTE_WITH_FOCUSED_POSTURE")) {
    suppressFocusedLandscape = true;
    corrections.push("DECAY_NOTE_WITH_FOCUSED_POSTURE → suppressFocusedLandscape");
  }

  // ─── Mode descriptor override ─────────────────────────────────────────────
  // Decide mode should remain accessible but reframe as review when commitment
  // language is suppressed — commitment decision ≠ commitment action here.
  let safeModeDescriptor: string | null = null;
  if (suppressCommitmentLanguage && operatingMode === "decide") {
    safeModeDescriptor = "Commitment review";
    corrections.push("suppressCommitmentLanguage + decide mode → safeModeDescriptor: Commitment review");
  }

  return {
    safeRegister,
    safeAttentionPosture,
    suppressCommitmentLanguage,
    suppressStructuralLanguage,
    forceCustomerProofVisibility,
    suppressFocusedLandscape,
    safeModeDescriptor,
    appliedCorrections: corrections,
  };
}
