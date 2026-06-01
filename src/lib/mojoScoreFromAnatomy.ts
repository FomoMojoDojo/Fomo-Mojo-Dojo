/**
 * MojoScore Re-Derivation from Confidence Anatomy
 *
 * MojoScore is now formally:
 * "Confidence-adjusted strategic readiness."
 *
 * NOT: "How complete is the strategy?"
 *
 * The score answers: "How safe is decisive commitment right now,
 * given the current evidence environment?"
 *
 * Score layers:
 *   Current Readiness   — commitment safety under current signals
 *   Near-Term Potential — what resolves if top blockers clear
 *   Structural Upside   — what becomes possible if foundations stabilize
 *
 * Readiness ceilings:
 *   Critical dimensions (contradiction, stability, tension) act as governors.
 *   High pressure in any governor prevents readiness from rising above its ceiling
 *   regardless of other dimension strengths.
 *
 * Design principles:
 *   - Pure functions (no side effects)
 *   - Inspectable — every ceiling has a named reason
 *   - Non-gamified — no "complete X to unlock Y" mechanics
 *   - Uncertainty-preserving — max structural upside is 88, never 100
 *   - Editorial — posture labels, not raw percentages
 */

import type { ConfidenceMovementEntry } from "./strategicDecisionDomain";
import {
  buildConfidenceAnatomyReport,
  POSTURE_RANK,
  type ConfidenceAnatomyReport,
  type ConfidenceDimension,
  type ConfidenceDimensionId,
  type ConfidenceInputContext,
  type ConfidencePosture,
  type AnatomyMovement,
} from "./confidenceAnatomy";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MojoScoreReadinessReport = {
  currentReadiness:   number;         // 0–100
  nearTermPotential:  number;         // 0–100, if top blockers clear
  structuralUpside:   number;         // 0–88, if foundations stabilize
  readinessCeiling:   number;         // hard cap from most restrictive governor
  ceilingReason:      string | null;  // what's setting the ceiling
  postureLabel:       string;         // editorial readiness label
  movementLabel:      string;         // "Strengthening" / "Stabilizing" / etc.
  movementColor:      string;         // hex safe for portals
  movementExplanation: string | null; // inspectable movement narrative
  unlockableGain:     number;         // how many points top unlock paths release
  topUnlockAction:    string | null;  // what unlocks the most
  temporalSummary:    string | null;  // temporal behavior description
};

type GovernorRule = {
  id: ConfidenceDimensionId;
  triggerPosture: ConfidencePosture;
  ceiling: number;
  reason: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const POSTURE_BASE: Record<ConfidencePosture, number> = {
  strong:      83,
  building:    66,
  directional: 49,
  fragile:     30,
  absent:      10,
};

/**
 * Critical readiness governors.
 * When a dimension reaches the triggerPosture (or worse), readiness is capped at ceiling.
 * Ordered by severity — applyReadinessCeilings takes the most restrictive.
 */
const GOVERNOR_RULES: GovernorRule[] = [
  { id: "contradiction_pressure",      triggerPosture: "absent",  ceiling: 22, reason: "Active contradiction prevents readiness above fragile" },
  { id: "contradiction_pressure",      triggerPosture: "fragile", ceiling: 48, reason: "Unresolved contradictions hold readiness below building" },
  { id: "decision_stability",          triggerPosture: "absent",  ceiling: 20, reason: "Destabilizing decision prevents commitment safety" },
  { id: "decision_stability",          triggerPosture: "fragile", ceiling: 42, reason: "Decision reframing caps readiness in fragile territory" },
  { id: "unresolved_tension_pressure", triggerPosture: "absent",  ceiling: 28, reason: "Active blocking tension prevents safe commitment" },
  { id: "unresolved_tension_pressure", triggerPosture: "fragile", ceiling: 52, reason: "Multiple tensions hold readiness below building" },
  { id: "capability_readiness",        triggerPosture: "absent",  ceiling: 35, reason: "Confirmed capability gap prevents commitment" },
  { id: "capability_readiness",        triggerPosture: "fragile", ceiling: 60, reason: "Capability gap identified — caps below strong readiness" },
  { id: "evidence_freshness",          triggerPosture: "fragile", ceiling: 58, reason: "Stale evidence prevents building-level readiness" },
];

// Score gain from resolving each fragile/absent dimension to directional or better
const NEAR_TERM_GAINS: Partial<Record<ConfidenceDimensionId, number>> = {
  contradiction_pressure:      22,
  decision_stability:          20,
  customer_proof_strength:     16,
  validation_maturity:         14,
  capability_readiness:        13,
  unresolved_tension_pressure: 12,
  evidence_freshness:          10,
  dependency_stability:        8,
  strategic_coherence:         7,
  market_support:              5,
};

export const READINESS_POSTURE_LABELS: Record<ConfidencePosture, string> = {
  strong:      "Strong readiness",
  building:    "Building readiness",
  directional: "Directional readiness",
  fragile:     "Fragile readiness",
  absent:      "Insufficient readiness",
};

export const READINESS_MOVEMENT_LABELS: Record<AnatomyMovement, string> = {
  strengthening: "Strengthening",
  stabilizing:   "Stabilizing",
  weakening:     "Weakening",
  destabilizing: "Destabilizing",
  unresolved:    "Unresolved",
};

export const READINESS_MOVEMENT_COLORS: Record<AnatomyMovement, string> = {
  strengthening: "#5F9B8C",
  stabilizing:   "#6E847F",
  weakening:     "#b06a3c",
  destabilizing: "#c44233",
  unresolved:    "#9298B5",
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Quality modifier derived from non-critical dimension postures.
 * Range: −8 to +8. Centers at 0 when all dims are directional.
 */
function dimensionQualityModifier(dimensions: ConfidenceDimension[]): number {
  const nonCriticalIds: ConfidenceDimensionId[] = [
    "validation_maturity",
    "customer_proof_strength",
    "evidence_freshness",
    "dependency_stability",
    "strategic_coherence",
    "market_support",
  ];
  const nonCritical = dimensions.filter((d) => nonCriticalIds.includes(d.id));
  if (nonCritical.length === 0) return 0;
  const avg = nonCritical.reduce((sum, d) => sum + POSTURE_RANK[d.posture], 0) / nonCritical.length;
  // avg: 0–4, center at 2 (directional), map to −8..+8
  return Math.round((avg - 2) * 4);
}

/**
 * Applies all governor ceiling rules to the dimensions.
 * Returns the most restrictive (lowest) ceiling and its reason.
 */
function applyReadinessCeilings(dimensions: ConfidenceDimension[]): { ceiling: number; reason: string | null } {
  let ceiling = 100;
  let reason: string | null = null;

  for (const rule of GOVERNOR_RULES) {
    const dim = dimensions.find((d) => d.id === rule.id);
    if (!dim) continue;
    // Trigger when dimension posture is at or below the trigger posture
    if (POSTURE_RANK[dim.posture] <= POSTURE_RANK[rule.triggerPosture] && rule.ceiling < ceiling) {
      ceiling = rule.ceiling;
      reason  = rule.reason;
    }
  }
  return { ceiling, reason };
}

/**
 * What the near-term potential ceiling would be after the top unlock path resolves.
 * We relax the most binding governor for the gain calculation.
 */
function nearTermCeiling(dimensions: ConfidenceDimension[], topUnlockDim: ConfidenceDimensionId | null): number {
  const modified = dimensions.map((d) =>
    d.id === topUnlockDim && POSTURE_RANK[d.posture] <= 1
      ? { ...d, posture: "directional" as ConfidencePosture }
      : d,
  );
  return applyReadinessCeilings(modified).ceiling;
}

// ─── Score layer derivation ───────────────────────────────────────────────────

function deriveCurrentReadiness(anatomy: ConfidenceAnatomyReport): number {
  const base    = POSTURE_BASE[anatomy.overallPosture];
  const modifier = dimensionQualityModifier(anatomy.dimensions);
  const uncapped = Math.max(0, Math.min(100, base + modifier));
  const { ceiling } = applyReadinessCeilings(anatomy.dimensions);
  return Math.min(uncapped, ceiling);
}

function deriveNearTermPotential(
  anatomy: ConfidenceAnatomyReport,
  currentReadiness: number,
): { score: number; topDim: ConfidenceDimensionId | null; gain: number } {
  const fragileOrAbsent = anatomy.unlockPaths.filter((p) => p.expectedImpact === "high");
  if (fragileOrAbsent.length === 0) return { score: currentReadiness, topDim: null, gain: 0 };

  const topPath   = fragileOrAbsent[0];
  const topDim    = topPath.targetDimension;
  const gain      = NEAR_TERM_GAINS[topDim] ?? 8;
  const ceiling   = nearTermCeiling(anatomy.dimensions, topDim);
  const candidate = Math.min(currentReadiness + gain, ceiling, 88);
  const actual    = Math.max(candidate, currentReadiness);
  return { score: actual, topDim, gain: actual - currentReadiness };
}

function deriveStructuralUpside(
  anatomy: ConfidenceAnatomyReport,
  nearTermPotential: number,
): number {
  // Structural dims: strategic_coherence, capability_readiness, decision_stability
  const structuralGain = anatomy.dimensions
    .filter((d) =>
      (["strategic_coherence", "capability_readiness", "decision_stability"] as ConfidenceDimensionId[]).includes(d.id) &&
      POSTURE_RANK[d.posture] <= 1,
    )
    .reduce((sum, d) => sum + (NEAR_TERM_GAINS[d.id] ?? 8), 0);

  return Math.min(nearTermPotential + structuralGain, 88);
}

// ─── Movement explanation ─────────────────────────────────────────────────────

function buildMovementExplanation(
  anatomy: ConfidenceAnatomyReport,
  recentMovement: ConfidenceMovementEntry[],
): string | null {
  const parts: string[] = [];
  const last = recentMovement.length > 0 ? recentMovement[recentMovement.length - 1] : null;

  if (last?.reason) {
    const reason = last.reason.trim().replace(/\.$/, "");
    if (last.direction === "strengthening")  parts.push(`Readiness improving — ${reason.charAt(0).toLowerCase() + reason.slice(1)}.`);
    else if (last.direction === "weakening") parts.push(`Readiness under pressure — ${reason.charAt(0).toLowerCase() + reason.slice(1)}.`);
  }

  const { reason: ceilingReason } = applyReadinessCeilings(anatomy.dimensions);
  if (ceilingReason) parts.push(ceilingReason + ".");

  if (parts.length === 0 && anatomy.pressurePoints.length > 0) {
    parts.push(`Held by: ${anatomy.pressurePoints.slice(0, 1).join("; ")}.`);
  }

  return parts.length > 0 ? parts.slice(0, 2).join(" ") : null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildMojoScoreReadinessReport(
  anatomy: ConfidenceAnatomyReport,
  recentMovement: ConfidenceMovementEntry[] = [],
): MojoScoreReadinessReport {
  const currentReadiness      = deriveCurrentReadiness(anatomy);
  const { score: nearTerm, topDim, gain: unlockableGain } = deriveNearTermPotential(anatomy, currentReadiness);
  const structuralUpside      = deriveStructuralUpside(anatomy, nearTerm);
  const { ceiling: readinessCeiling, reason: ceilingReason } = applyReadinessCeilings(anatomy.dimensions);
  const movementExplanation   = buildMovementExplanation(anatomy, recentMovement);

  const topUnlockPath = anatomy.unlockPaths.find((p) => p.targetDimension === topDim) ?? anatomy.unlockPaths[0] ?? null;

  return {
    currentReadiness,
    nearTermPotential: nearTerm,
    structuralUpside,
    readinessCeiling,
    ceilingReason,
    postureLabel:       READINESS_POSTURE_LABELS[anatomy.overallPosture],
    movementLabel:      READINESS_MOVEMENT_LABELS[anatomy.overallMovement],
    movementColor:      READINESS_MOVEMENT_COLORS[anatomy.overallMovement],
    movementExplanation,
    unlockableGain,
    topUnlockAction:    topUnlockPath?.action ?? null,
    temporalSummary:    anatomy.temporalNote,
  };
}

/**
 * Derives which anatomy-adjusted tier best represents the legacy numeric MojoScore.
 * Use to map a stored `mojo_score` into readiness posture language without
 * requiring a full anatomy re-derivation at surfaces that only have the score.
 */
export function postureFromLegacyScore(score: number): ConfidencePosture {
  if (score >= 80) return "strong";
  if (score >= 62) return "building";
  if (score >= 44) return "directional";
  if (score >= 24) return "fragile";
  return "absent";
}

// ─── Company-level readiness derivation ──────────────────────────────────────

export type CompanySignals = {
  mojoScore?: number | null;
  evidenceStatus?: string | null;
};

/**
 * Derives a MojoScoreReadinessReport from company-observable signals without
 * requiring a full strategic decision context. Use for score rails that only
 * have access to the company record (no decision/hypothesis/council data).
 *
 * Invariant guaranteed by construction: currentReadiness ≤ nearTermPotential ≤ structuralUpside.
 */
export function buildReadinessFromCompanySignals(signals: CompanySignals): MojoScoreReadinessReport {
  const score  = Math.max(0, Math.min(100, Number(signals.mojoScore ?? 0)));
  const status = String(signals.evidenceStatus ?? "").toLowerCase();

  // Map score to confidence_state proxy that drives dimension postures in the anatomy engine
  const confidenceState =
    score >= 72 ? "strong"
    : score >= 55 ? "building"
    : score >= 35 ? "directional"
    : "low";

  const hasStrong  = status.includes("baseline_plus") || status.includes("strong");
  const hasMixed   = status.includes("mixed") || status.includes("partial") || status.includes("emerging");
  const hasStale   = status.includes("stale");
  const hasAnyEvid = score > 10 || hasStrong || hasMixed;

  const ctx: ConfidenceInputContext = {
    decisionState: "under_validation",
    confidenceState,
    confidenceMovement: [],
    decisionMemory:     [],
    validationRequirements: [],
    blockedBy:               [],
    activeTensionIds:        [],
    staleDependencies:       [],
    supportingHypothesisIds: [],

    hasContradictingEvidence:   false,
    hasStaleCustomerProof:      hasStale,
    hasActiveBlockingTension:   false,
    hasCapabilityGap:           false,
    hasMultiLayerEvidence:      hasStrong,
    hasCustomerBehavioralProof: hasStrong && status.includes("customer"),
    hasAnyEvidence:             hasAnyEvid,
    evidenceFreshness:          hasStale ? "stale" : hasMixed ? "aging" : "fresh",

    contradictedHypothesisCount: 0,
    activeHypothesisCount:       hasAnyEvid ? 1 : 0,
    councilPendingCount:         0,
    councilLongPendingCount:     0,
    lastMeaningfulChangeAt:      null,
  };

  const anatomy = buildConfidenceAnatomyReport(ctx);
  const report  = buildMojoScoreReadinessReport(anatomy);

  if (
    report.currentReadiness  > report.nearTermPotential ||
    report.nearTermPotential > report.structuralUpside
  ) {
    console.warn(
      "[MojoScore] Invariant violated — current=%d reachable=%d structural=%d signals=%o",
      report.currentReadiness, report.nearTermPotential, report.structuralUpside, signals,
    );
  }

  return report;
}
