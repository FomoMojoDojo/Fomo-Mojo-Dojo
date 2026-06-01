/**
 * Confidence Discipline
 *
 * Authority-calibration layer that sits above register, temporal posture, and
 * static phrase systems. When evidence is thin, hypotheses are fresh, or
 * convergence is ungrounded, discipline cools language and suppresses
 * premature certainty before it reaches the user.
 *
 * Priority order enforced across the phrase system:
 *   discipline → register → temporal → static fallback
 *
 * Core distinctions enforced:
 *   - Fragmented vs. not yet differentiated (immature ambiguity is NOT fragmentation)
 *   - Convergence backed by behavioral proof vs. org-only alignment
 *   - Escalation warranted vs. escalation inflation without customer evidence
 *   - Structural constraint vs. active constraint (maturity threshold required)
 *
 * Design principles:
 *   - Deterministic (pure function, same inputs → same outputs)
 *   - Conservative (cools, does not suppress)
 *   - Restraint flags are internal only — never exposed in user-facing text
 *   - Composable (DisciplineAssessment is a plain object with methods)
 */

import type { UnifiedConfidencePosture } from "@/lib/strategicCenterSurface";
import type { TemporalPosture } from "@/lib/strategicTemporalState";
import type { ExecutiveRegister } from "@/lib/executiveRegister";

// ─── Restraint flags (internal only) ─────────────────────────────────────────

/**
 * Internal signals that drive cooling behavior.
 * Not user-facing — never render these labels or values directly.
 */
export type RestraintFlags = {
  /**
   * High-confidence posture asserted (coherent / stabilizing) but hypotheses
   * are fresh and no customer behavioral proof is present. Language claiming
   * coherence or stability is not yet warranted.
   */
  prematureCertainty: boolean;
  /**
   * Multiple signals align without behavioral validation to ground the convergence.
   * Common pattern: org-only signals all pointing the same direction → "coherent"
   * language fires before customer behavior confirms the direction.
   */
  falseConvergence: boolean;
  /**
   * Escalation register is active but there is no customer behavioral proof and
   * hypotheses are fresh. Strong commitment / exposure language is inflation, not
   * accurate characterization.
   */
  escalationWithoutProof: boolean;
  /**
   * Confidence posture is "fragmented" but state is fresh and routes are few.
   * This is undifferentiated early-stage direction-setting, not true fragmentation.
   * "Fragmented" implies competing committed paths — this is just "not yet chosen."
   */
  immatureAmbiguity: boolean;
};

// ─── Public type ──────────────────────────────────────────────────────────────

export type DisciplineAssessment = {
  readonly restraintFlags: RestraintFlags;
  /** Register after discipline cooling. May be downgraded from the raw register. */
  readonly cooledRegister: ExecutiveRegister;
  /** True when at least one restraint flag is active. Callers use this to skip overhead. */
  readonly active: boolean;
  /**
   * Applies phrase-level cooling to a string.
   * Safe to call on any phrase — returns the input unchanged when no cooling applies.
   * Idempotent: re-applying on an already-cooled phrase is safe.
   */
  coolPhrase(phrase: string): string;
  /**
   * Returns true when a phrase over-asserts given the current evidence state.
   * Used by the conductor to prefer an alternative phrase from the same family.
   * Does not suppress — if all phrases over-assert, the cooled version is used.
   */
  assertsTooMuch(phrase: string): boolean;
};

// ─── Customer proof signal IDs ────────────────────────────────────────────────

/** Signal IDs that indicate behavioral customer proof is present. */
const BEHAVIORAL_PROOF_POSTURES = new Set<string>(["grounded", "converging"]);

// ─── Phrase cooling arrays ────────────────────────────────────────────────────
//
// Each entry: [pattern, replacement].
// Patterns are written to match only the specific over-certain phrases likely to
// appear from the phrase families — not arbitrary text. Applied in order.
//
// Cooling philosophy: restore appropriate hedging, do not over-hedge.
//   Too cold: "Validation the constraint." (Phase 8 error)
//   Appropriate: "Validation is the active constraint."
//   Too hot: "Validation established."  (premature certainty)
//   Cooled: "Validation forming."

const PREMATURE_CERTAINTY_COOLINGS: [RegExp, string][] = [
  [/\bestablished\b/gi, "forming"],
  // Replace "holding" in all forms — preserves surrounding word casing since only "holding" is matched
  [/\bholding\b/gi, "building"],
  [/\bconfirm(s|ed|ing)? the direction\b/gi, "are beginning to align with the direction"],
];

const FALSE_CONVERGENCE_COOLINGS: [RegExp, string][] = [
  [/\bcoherence (is )?strengthening\b/gi, "direction becoming more consistent"],
  [/\bcoherent\b(?! hypothesis| posture)/gi, "more consistent"],
  [/\balignment building\b/gi, "alignment beginning"],
  [/\bvalidation strengthening\b/gi, "validation beginning to build"],
  [/\bsignal alignment building\b/gi, "signals starting to align"],
  [/\bCustomer confirmation accumulating\b/gi, "Customer signals starting to accumulate."],
];

const ESCALATION_WITHOUT_PROOF_COOLINGS: [RegExp, string][] = [
  [/\bready to commit\b/gi, "approaching commitment"],
  [/\bcommitment stage\b/gi, "commitment decision"],
  [/\bat commitment pressure\b/gi, "near commitment pressure"],
  [/\bscaling without validation\b/gi, "direction ahead of validation"],
  [/\bProof absent\. Exposure increasing\.\b/gi, "Proof absent. Commitment risk present."],
  [/\bblocking forward progress\b/gi, "limiting forward progress"],
  [/\bIdentity conflict under commitment pressure\b/gi, "Identity alignment unresolved near commitment."],
];

const IMMATURE_AMBIGUITY_COOLINGS: [RegExp, string][] = [
  [/\bPortfolio fragmented at commitment stage\b/gi, "Direction not yet differentiated — no clear commitment path"],
  [/\bPortfolio fragmented\b/gi, "Direction not yet differentiated"],
  [/\bNo route ready to commit\b/gi, "No differentiated lead path yet"],
  [/\bFragmentation blocking forward progress\b/gi, "Lack of differentiation limiting forward movement"],
  [/\bNo clear path ahead\b/gi, "No differentiated path has emerged yet"],
  [/\bRoute clarity absent\b/gi, "Route differentiation still forming"],
  [/\bCustomer signals fragmented\. No consistent thread\.\b/gi, "Customer signals not yet consistent. No clear thread has emerged."],
  [/\bfragmented\b(?! across layers| across routes| across)/gi, "not yet differentiated"],
];

// ─── Over-assertion detection ─────────────────────────────────────────────────

// Patterns that indicate a phrase is over-asserting given active restraint flags.
// The conductor uses this to skip to the next phrase in the family rather than
// cooling the selected one (which can produce awkward results mid-phrase).
const OVER_ASSERTION_VOCABULARY: RegExp[] = [
  /\bestablished\b/i,
  /\bproof holding\b/i,
  /\bcoherence holding\b/i,
  /\bcommitment stage\b/i,
  /\bblocking forward progress\b/i,
  /\bbinding constraint\b/i,
  /\bpersisting across cycles\b/i,
  /\bscaling without\b/i,
];

// ─── Register cooling ─────────────────────────────────────────────────────────

function coolRegister(
  register: ExecutiveRegister,
  flags: RestraintFlags,
): ExecutiveRegister {
  // Escalation without behavioral proof → structural_pressure.
  // "Active danger" requires confirmed exposure — absent proof means "serious but not proven."
  if (register === "escalation" && flags.escalationWithoutProof) {
    return "structural_pressure";
  }

  // Stabilized with premature certainty or false convergence → converging.
  // "Stabilized" phrases ("established", "holding", "confirmed") require grounded evidence.
  // "Converging" gives appropriately forward-leaning language without claiming arrival.
  if (
    register === "stabilized" &&
    (flags.prematureCertainty || flags.falseConvergence)
  ) {
    return "converging";
  }

  return register;
}

// ─── Restraint flag derivation ────────────────────────────────────────────────

function deriveRestraintFlags(args: {
  confidencePosture: UnifiedConfidencePosture;
  temporalPosture: TemporalPosture;
  register: ExecutiveRegister;
  hasCustomerBehavioralProof: boolean;
  routeCount: number;
}): RestraintFlags {
  const {
    confidencePosture,
    temporalPosture,
    register,
    hasCustomerBehavioralProof,
    routeCount,
  } = args;
  const { proofGapMaturity, momentum } = temporalPosture;
  const isFresh = proofGapMaturity === "fresh";

  // Premature certainty: high-confidence posture claimed, hypotheses still fresh,
  // no behavioral customer proof to ground the claim.
  const prematureCertainty =
    (confidencePosture === "coherent" || confidencePosture === "stabilizing") &&
    isFresh &&
    !hasCustomerBehavioralProof;

  // False convergence: signals appearing to align but no behavioral validation.
  // Only applies to postures above "directional" — directional language is already hedged.
  const falseConvergence =
    isFresh &&
    !hasCustomerBehavioralProof &&
    (confidencePosture === "stabilizing" || confidencePosture === "coherent") &&
    momentum !== "weakening";

  // Escalation without proof: escalation register active, but hypotheses are fresh
  // and no behavioral customer proof. Escalation language implies proven exposure.
  const escalationWithoutProof =
    register === "escalation" && !hasCustomerBehavioralProof && isFresh;

  // Immature ambiguity: "fragmented" posture with fresh hypotheses and few routes.
  // True fragmentation requires committed competing paths. Early-stage direction-setting
  // with 1–2 routes is undifferentiated, not fragmented.
  const immatureAmbiguity =
    confidencePosture === "fragmented" && isFresh && routeCount <= 2;

  return {
    prematureCertainty,
    falseConvergence,
    escalationWithoutProof,
    immatureAmbiguity,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function assessConfidenceDiscipline(args: {
  confidencePosture: UnifiedConfidencePosture;
  temporalPosture: TemporalPosture;
  register: ExecutiveRegister;
  /**
   * True when the customer reality posture is "grounded" or "converging" —
   * indicating actual behavioral evidence, not inference.
   * Derives from: customerReality.posture === "grounded" || "converging"
   */
  hasCustomerBehavioralProof: boolean;
  /**
   * Total number of routes in the portfolio.
   * Used to distinguish true fragmentation (many competing paths) from
   * undifferentiated early-stage routing (few or no routes yet defined).
   */
  routeCount: number;
}): DisciplineAssessment {
  const { temporalPosture, register } = args;
  const isFresh = temporalPosture.proofGapMaturity === "fresh";

  const restraintFlags = deriveRestraintFlags(args);
  const active = Object.values(restraintFlags).some(Boolean);
  const cooledRegister = active ? coolRegister(register, restraintFlags) : register;

  function coolPhrase(phrase: string): string {
    if (!active) return phrase;
    let result = phrase;

    if (restraintFlags.prematureCertainty) {
      for (const [pattern, replacement] of PREMATURE_CERTAINTY_COOLINGS) {
        result = result.replace(pattern, replacement);
      }
    }
    if (restraintFlags.falseConvergence) {
      for (const [pattern, replacement] of FALSE_CONVERGENCE_COOLINGS) {
        result = result.replace(pattern, replacement);
      }
    }
    if (restraintFlags.escalationWithoutProof) {
      for (const [pattern, replacement] of ESCALATION_WITHOUT_PROOF_COOLINGS) {
        result = result.replace(pattern, replacement);
      }
    }
    if (restraintFlags.immatureAmbiguity) {
      for (const [pattern, replacement] of IMMATURE_AMBIGUITY_COOLINGS) {
        result = result.replace(pattern, replacement);
      }
    }
    return result;
  }

  function assertsTooMuch(phrase: string): boolean {
    if (!active) return false;

    for (const pattern of OVER_ASSERTION_VOCABULARY) {
      if (!pattern.test(phrase)) continue;

      // "established" → too much when premature certainty or false convergence
      if (/\bestablished\b/i.test(phrase) && (restraintFlags.prematureCertainty || restraintFlags.falseConvergence)) {
        return true;
      }
      // "proof holding" / "coherence holding" → too much when premature certainty
      if (/\bholding\b/i.test(phrase) && restraintFlags.prematureCertainty) {
        return true;
      }
      // "commitment stage" / "blocking forward progress" → too much without proof
      if (/commitment stage|blocking forward progress/i.test(phrase) && restraintFlags.escalationWithoutProof) {
        return true;
      }
      // "binding constraint" / "persisting across cycles" → too much when fresh
      if (/binding constraint|persisting across cycles/i.test(phrase) && isFresh) {
        return true;
      }
      // "scaling without" → too much without proof
      if (/scaling without/i.test(phrase) && restraintFlags.escalationWithoutProof) {
        return true;
      }
    }
    return false;
  }

  return {
    restraintFlags,
    cooledRegister,
    active,
    coolPhrase,
    assertsTooMuch,
  };
}

// ─── Customer proof helper ────────────────────────────────────────────────────

/**
 * Derives the hasCustomerBehavioralProof flag from a customer reality posture string.
 * Convenience helper for callers that have the posture string available.
 */
export function hasCustomerBehavioralProofFromPosture(
  posture: string | null | undefined,
): boolean {
  return posture != null && BEHAVIORAL_PROOF_POSTURES.has(posture);
}
