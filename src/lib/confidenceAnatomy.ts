/**
 * Confidence Anatomy Engine
 *
 * Derives inspectable confidence reasoning from strategic decision signals.
 * Every posture, movement, and unlock path is explicitly derived — never opaque.
 *
 * MojoScore is the compressed expression of this anatomy, not a mysterious metric.
 *
 * Priority ordering (highest urgency first):
 *   contradiction → tension blocking → capability gaps → validation gaps
 *   → evidence staleness → dependency drift → coherence erosion
 *
 * Design principles:
 *   - Pure functions (no side effects, no Supabase)
 *   - Editorial output — reasoning first, numbers last
 *   - Temporal awareness — history shapes posture
 *   - Inspectable decomposition — every posture is explainable
 */

import type {
  ConfidenceMovementEntry,
  DecisionMemoryEntry,
  ValidationRequirement,
} from "./strategicDecisionDomain";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConfidenceDimensionId =
  | "validation_maturity"
  | "customer_proof_strength"
  | "contradiction_pressure"
  | "unresolved_tension_pressure"
  | "capability_readiness"
  | "evidence_freshness"
  | "dependency_stability"
  | "decision_stability"
  | "strategic_coherence"
  | "market_support";

export type ConfidencePosture = "strong" | "building" | "directional" | "fragile" | "absent";

// Derived anatomy movement — richer than the event-log ConfidenceMovementDirection
export type AnatomyMovement =
  | "strengthening"
  | "stabilizing"
  | "weakening"
  | "destabilizing"
  | "unresolved";

export type ConfidenceDimension = {
  id: ConfidenceDimensionId;
  label: string;
  posture: ConfidencePosture;
  movement: AnatomyMovement;
  strengtheningFactors: string[];
  weakeningFactors: string[];
  staleConditions: string[];
  unresolvedBlockers: string[];
};

export type UnlockPath = {
  action: string;
  targetDimension: ConfidenceDimensionId;
  expectedImpact: "high" | "medium" | "low";
  blockedBy: string | null;
};

export type ReadinessLayer = {
  id: "current" | "near_term" | "structural";
  label: string;
  narrative: string;
  boundedBy: string[];
  unlockConditions: string[];
};

export type ConfidenceAnatomyReport = {
  dimensions: ConfidenceDimension[];
  overallPosture: ConfidencePosture;
  overallMovement: AnatomyMovement;
  pressurePoints: string[];
  unlockPaths: UnlockPath[];
  temporalNote: string | null;
  readinessLayers: ReadinessLayer[];
  decompositionNarrative: string;
};

/**
 * All input signals needed to build a confidence anatomy report.
 * Build with buildDecisionOnlyContext() for decision-level signals alone,
 * or populate fully when richer evidence/hypothesis/council context is available.
 */
export type ConfidenceInputContext = {
  decisionState: string;
  confidenceState: string;
  confidenceMovement: ConfidenceMovementEntry[];
  decisionMemory: DecisionMemoryEntry[];
  validationRequirements: ValidationRequirement[];
  blockedBy: string[];
  activeTensionIds: string[];
  staleDependencies: string[];
  supportingHypothesisIds: string[];

  hasContradictingEvidence: boolean;
  hasStaleCustomerProof: boolean;
  hasActiveBlockingTension: boolean;
  hasCapabilityGap: boolean;
  hasMultiLayerEvidence: boolean;
  hasCustomerBehavioralProof: boolean;
  hasAnyEvidence: boolean;
  evidenceFreshness: "fresh" | "aging" | "stale";

  contradictedHypothesisCount: number;
  activeHypothesisCount: number;

  councilPendingCount: number;
  councilLongPendingCount: number;

  lastMeaningfulChangeAt: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const DIMENSION_LABELS: Record<ConfidenceDimensionId, string> = {
  validation_maturity:          "Validation Maturity",
  customer_proof_strength:      "Customer Proof Strength",
  contradiction_pressure:       "Contradiction Pressure",
  unresolved_tension_pressure:  "Tension Pressure",
  capability_readiness:         "Capability Readiness",
  evidence_freshness:           "Evidence Freshness",
  dependency_stability:         "Dependency Stability",
  decision_stability:           "Decision Stability",
  strategic_coherence:          "Strategic Coherence",
  market_support:               "Market Support",
};

export const POSTURE_RANK: Record<ConfidencePosture, number> = {
  strong: 4, building: 3, directional: 2, fragile: 1, absent: 0,
};

const READINESS_NARRATIVES: Record<ConfidencePosture, string> = {
  strong:      "Confidence is strong — commitment is safe under current evidence.",
  building:    "Confidence is building — approaching commitment readiness.",
  directional: "Confidence is directional — validation continues before commitment.",
  fragile:     "Confidence is fragile — key signals are weakening or absent.",
  absent:      "Confidence is insufficient — commitment would be premature.",
};

const UNLOCK_ACTIONS: Record<ConfidenceDimensionId, { action: string; impact: "high" | "medium" | "low" }> = {
  validation_maturity:         { action: "Close open validation requirements before advancing",          impact: "high" },
  customer_proof_strength:     { action: "Conduct direct customer behavioral interviews",                impact: "high" },
  contradiction_pressure:      { action: "Resolve contradicting evidence through direct testing",        impact: "high" },
  unresolved_tension_pressure: { action: "Resolve or formally classify active tensions",                 impact: "medium" },
  capability_readiness:        { action: "Resolve identified capability gaps or reframe the commitment", impact: "high" },
  evidence_freshness:          { action: "Refresh stale customer evidence with current interviews",      impact: "medium" },
  dependency_stability:        { action: "Address stale or blocked dependencies",                        impact: "medium" },
  decision_stability:          { action: "Re-validate the decision question before advancing",           impact: "high" },
  strategic_coherence:         { action: "Reconcile contradicted hypotheses with current evidence",      impact: "medium" },
  market_support:              { action: "Gather outside research to support the direction",             impact: "low" },
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function mkDim(
  id: ConfidenceDimensionId,
  posture: ConfidencePosture,
  movement: AnatomyMovement,
  sf: string[],
  wf: string[],
  sc: string[],
  ub: string[],
): ConfidenceDimension {
  return { id, label: DIMENSION_LABELS[id], posture, movement, strengtheningFactors: sf, weakeningFactors: wf, staleConditions: sc, unresolvedBlockers: ub };
}

function postureMovement(posture: ConfidencePosture, latestDir: string | null): AnatomyMovement {
  if (!latestDir) {
    if (posture === "absent")  return "destabilizing";
    if (posture === "fragile") return "weakening";
    if (posture === "strong")  return "stabilizing";
    return "unresolved";
  }
  if (latestDir === "strengthening") {
    return posture === "absent" || posture === "fragile" ? "stabilizing" : "strengthening";
  }
  if (latestDir === "weakening") {
    return posture === "absent" ? "destabilizing" : "weakening";
  }
  // "stable"
  return posture === "strong" || posture === "building" ? "stabilizing" : "unresolved";
}

// ─── Dimension builders ───────────────────────────────────────────────────────

function buildValidationMaturity(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const openReqs = ctx.validationRequirements.filter((r) => r.status === "open").length;
  const metReqs  = ctx.validationRequirements.filter((r) => r.status === "met").length;
  const total    = ctx.validationRequirements.length;
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];

  let posture: ConfidencePosture;
  if (["committed", "commit_ready"].includes(ctx.decisionState) && openReqs === 0 && metReqs > 0) {
    posture = "strong";
    sf.push(`${metReqs} requirement${metReqs > 1 ? "s" : ""} confirmed`);
  } else if (["committed", "commit_ready", "stabilizing"].includes(ctx.decisionState) && metReqs > 0) {
    posture = "building";
    sf.push(`${metReqs} of ${total} requirements met`);
    if (openReqs > 0) ub.push(`${openReqs} requirement${openReqs > 1 ? "s" : ""} still open`);
  } else if (ctx.decisionState === "under_validation") {
    posture = "directional";
    sf.push("Active validation in progress");
    if (openReqs > 0) ub.push(`${openReqs} open requirement${openReqs > 1 ? "s" : ""}`);
  } else if (total === 0) {
    posture = "absent";
    ub.push("No validation requirements defined");
  } else {
    posture = "fragile";
    if (openReqs > 0) ub.push(`${openReqs} requirement${openReqs > 1 ? "s" : ""} unresolved`);
    wf.push("Validation not yet progressing");
  }
  return mkDim("validation_maturity", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildCustomerProofStrength(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  let posture: ConfidencePosture;

  if (ctx.hasCustomerBehavioralProof && !ctx.hasStaleCustomerProof) {
    posture = "strong";
    sf.push("Customer behavioral proof in place");
    if (ctx.hasMultiLayerEvidence) sf.push("Supported by multi-layer evidence");
  } else if (ctx.hasCustomerBehavioralProof && ctx.hasStaleCustomerProof) {
    posture = "directional";
    sc.push("Customer proof exists but is stale");
    wf.push("Stale customer proof weakens commitment safety");
  } else if (ctx.hasMultiLayerEvidence) {
    posture = "building";
    sf.push("Multi-layer evidence present");
    ub.push("Direct customer behavioral proof still needed");
  } else if (ctx.hasAnyEvidence) {
    posture = "directional";
    sf.push("Some evidence available");
    ub.push("Evidence not yet multi-layer or behavioral");
  } else {
    posture = "absent";
    ub.push("No customer behavioral proof");
  }
  return mkDim("customer_proof_strength", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildContradictionPressure(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  let posture: ConfidencePosture;

  if (ctx.confidenceState === "contradicted") {
    posture = "absent";
    wf.push("Confidence state is contradicted");
    if (ctx.contradictedHypothesisCount > 0) wf.push(`${ctx.contradictedHypothesisCount} hypothesis${ctx.contradictedHypothesisCount > 1 ? "es" : ""} contradicted`);
    ub.push("Contradiction must be addressed before advancing");
  } else if (ctx.hasContradictingEvidence && ctx.contradictedHypothesisCount > 0) {
    posture = "fragile";
    wf.push("Contradicting evidence present");
    wf.push(`${ctx.contradictedHypothesisCount} hypothesis${ctx.contradictedHypothesisCount > 1 ? "es" : ""} contradicted`);
    ub.push("Resolve contradictions before committing");
  } else if (ctx.hasContradictingEvidence) {
    posture = "fragile";
    wf.push("Contradicting evidence exists");
    ub.push("Contradicting signals need investigation");
  } else if (ctx.contradictedHypothesisCount > 0) {
    posture = "directional";
    wf.push(`${ctx.contradictedHypothesisCount} underlying hypothesis${ctx.contradictedHypothesisCount > 1 ? "es" : ""} contradicted`);
  } else {
    posture = "strong";
    sf.push("No contradicting evidence detected");
  }
  if (ctx.councilLongPendingCount > 0 && POSTURE_RANK[posture] > POSTURE_RANK["directional"]) {
    posture = "directional";
    wf.push(`${ctx.councilLongPendingCount} long-pending council recommendation${ctx.councilLongPendingCount > 1 ? "s" : ""} unresolved`);
  }
  return mkDim("contradiction_pressure", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildTensionPressure(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  const tensionCount = ctx.activeTensionIds.length;
  let posture: ConfidencePosture;

  if (ctx.hasActiveBlockingTension) {
    posture = "absent";
    wf.push("Active blocking tension present");
    ub.push("Blocking tension must resolve before commitment advances");
  } else if (tensionCount > 2) {
    posture = "fragile";
    wf.push(`${tensionCount} active tensions unresolved`);
    ub.push("Reduce active tensions to improve commitment safety");
  } else if (tensionCount > 0) {
    posture = "directional";
    wf.push(`${tensionCount} active tension${tensionCount > 1 ? "s" : ""} present`);
    ub.push("Monitor and classify remaining tensions");
  } else {
    posture = "strong";
    sf.push("No active strategic tensions");
  }
  return mkDim("unresolved_tension_pressure", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildCapabilityReadiness(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  const blockedCount    = ctx.blockedBy.length;
  const hypothesisCount = ctx.supportingHypothesisIds.length;
  let posture: ConfidencePosture;

  if (ctx.hasCapabilityGap && blockedCount > 0) {
    posture = "absent";
    wf.push("Capability gap confirmed");
    ub.push(`Blocked by ${blockedCount} dependency${blockedCount > 1 ? "s" : ""}`);
  } else if (ctx.hasCapabilityGap) {
    posture = "fragile";
    wf.push("Capability gap identified");
    ub.push("Resolve capability gap before committing");
  } else if (blockedCount > 0) {
    posture = "fragile";
    ub.push(`${blockedCount} blocking dependency${blockedCount > 1 ? "s" : ""} present`);
    wf.push("Blocking dependencies threaten commitment timeline");
  } else if (hypothesisCount > 2) {
    posture = "building";
    sf.push(`${hypothesisCount} supporting hypotheses active`);
  } else {
    posture = "directional";
    if (hypothesisCount > 0) sf.push(`${hypothesisCount} supporting hypothesis${hypothesisCount > 1 ? "es" : ""} active`);
    else sf.push("No capability blockers identified");
  }
  return mkDim("capability_readiness", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildEvidenceFreshness(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  let posture: ConfidencePosture;

  if (ctx.evidenceFreshness === "fresh" && ctx.hasMultiLayerEvidence) {
    posture = "strong";
    sf.push("Evidence is current and multi-layer");
  } else if (ctx.evidenceFreshness === "fresh") {
    posture = "building";
    sf.push("Evidence is current");
  } else if (ctx.evidenceFreshness === "aging") {
    posture = "directional";
    sc.push("Evidence aging — refresh recommended");
  } else {
    posture = ctx.staleDependencies.length > 0 ? "fragile" : "directional";
    sc.push("Evidence is stale");
    if (ctx.staleDependencies.length > 0) wf.push(`${ctx.staleDependencies.length} stale dependenc${ctx.staleDependencies.length > 1 ? "ies" : "y"} detected`);
    ub.push("Refresh evidence before advancing commitment");
  }
  return mkDim("evidence_freshness", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildDependencyStability(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  const staleCount   = ctx.staleDependencies.length;
  const blockedCount = ctx.blockedBy.length;
  let posture: ConfidencePosture;

  if (staleCount > 2 || (staleCount > 0 && blockedCount > 1)) {
    posture = "fragile";
    if (staleCount > 0) sc.push(`${staleCount} stale dependenc${staleCount > 1 ? "ies" : "y"}`);
    if (blockedCount > 0) ub.push(`${blockedCount} active blocker${blockedCount > 1 ? "s" : ""}`);
  } else if (blockedCount > 0) {
    posture = "fragile";
    ub.push(`${blockedCount} blocker${blockedCount > 1 ? "s" : ""} present`);
    wf.push("Blocking dependencies threaten commitment timeline");
  } else if (staleCount > 0) {
    posture = "directional";
    sc.push(`${staleCount} dependency${staleCount > 1 ? "s" : ""} becoming stale`);
  } else {
    posture = "strong";
    sf.push("All dependencies stable");
  }
  return mkDim("dependency_stability", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildDecisionStability(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  let posture: ConfidencePosture;

  if (ctx.decisionState === "destabilizing") {
    posture = "absent";
    wf.push("Decision is actively destabilizing");
    ub.push("Address the destabilizing signal before re-committing");
  } else if (ctx.decisionState === "reframing") {
    posture = "fragile";
    wf.push("Decision question is being reframed");
    ub.push("Settle the reframe before advancing commitment");
  } else if (ctx.decisionState === "committed" && latestDir === "strengthening") {
    posture = "strong";
    sf.push("Committed and continuing to strengthen");
  } else if (ctx.decisionState === "committed" || ctx.decisionState === "commit_ready") {
    posture = "building";
    sf.push(`Decision in ${ctx.decisionState === "committed" ? "committed" : "commit-ready"} state`);
    if (ctx.confidenceMovement.length > 0) sf.push(`${ctx.confidenceMovement.length} movement entr${ctx.confidenceMovement.length > 1 ? "ies" : "y"} recorded`);
  } else if (latestDir === "weakening") {
    posture = "fragile";
    wf.push("Confidence movement is weakening");
  } else {
    posture = "directional";
    sf.push("Decision progressing without active destabilization");
  }
  return mkDim("decision_stability", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildStrategicCoherence(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  const active       = ctx.activeHypothesisCount;
  const contradicted = ctx.contradictedHypothesisCount;
  let posture: ConfidencePosture;

  if (active > 2 && contradicted === 0) {
    posture = "strong";
    sf.push(`${active} active supporting hypotheses`);
  } else if (active > 0 && contradicted === 0) {
    posture = "building";
    sf.push(`${active} active hypothesis${active > 1 ? "es" : ""}`);
  } else if (contradicted > active) {
    posture = "absent";
    wf.push(`${contradicted} hypothes${contradicted > 1 ? "es" : "is"} contradicted — exceeds active count`);
    ub.push("Strategic basis is undermined — reconcile contradictions");
  } else if (contradicted > 0) {
    posture = "fragile";
    wf.push(`${contradicted} hypothesis${contradicted > 1 ? "es" : ""} contradicted`);
    ub.push("Reconcile contradicted hypotheses");
  } else {
    posture = "directional";
    sf.push("No contradicted hypotheses");
  }
  return mkDim("strategic_coherence", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

function buildMarketSupport(ctx: ConfidenceInputContext, latestDir: string | null): ConfidenceDimension {
  const sf: string[] = [], wf: string[] = [], sc: string[] = [], ub: string[] = [];
  let posture: ConfidencePosture;

  if (ctx.hasMultiLayerEvidence && ctx.hasCustomerBehavioralProof) {
    posture = "strong";
    sf.push("Multi-layer evidence with customer behavioral proof");
  } else if (ctx.hasMultiLayerEvidence) {
    posture = "building";
    sf.push("Multi-layer evidence present");
    ub.push("Direct customer proof would complete the signal picture");
  } else if (ctx.hasAnyEvidence) {
    posture = "directional";
    sf.push("Some supporting evidence available");
    ub.push("Evidence not yet multi-layer");
  } else {
    posture = "absent";
    ub.push("No outside or market evidence available");
    wf.push("Direction unsupported by market signals");
  }
  if (ctx.hasStaleCustomerProof) sc.push("Customer proof exists but aging");
  return mkDim("market_support", posture, postureMovement(posture, latestDir), sf, wf, sc, ub);
}

// ─── Aggregation and derivation ───────────────────────────────────────────────

function aggregatePosture(dimensions: ConfidenceDimension[]): ConfidencePosture {
  const avg = dimensions.reduce((sum, d) => sum + POSTURE_RANK[d.posture], 0) / dimensions.length;
  if (avg >= 3.5) return "strong";
  if (avg >= 2.5) return "building";
  if (avg >= 1.5) return "directional";
  if (avg >= 0.5) return "fragile";
  return "absent";
}

function deriveOverallPosture(dimensions: ConfidenceDimension[]): ConfidencePosture {
  const criticalIds: ConfidenceDimensionId[] = [
    "contradiction_pressure",
    "decision_stability",
    "unresolved_tension_pressure",
  ];
  for (const id of criticalIds) {
    if (dimensions.find((d) => d.id === id)?.posture === "absent") return "absent";
  }
  for (const id of criticalIds) {
    if (dimensions.find((d) => d.id === id)?.posture === "fragile") {
      const agg = aggregatePosture(dimensions);
      return POSTURE_RANK[agg] > POSTURE_RANK["fragile"] ? "fragile" : agg;
    }
  }
  return aggregatePosture(dimensions);
}

function deriveOverallMovement(dimensions: ConfidenceDimension[], ctx: ConfidenceInputContext): AnatomyMovement {
  if (ctx.confidenceMovement.length === 0) return "unresolved";
  const movements       = dimensions.map((d) => d.movement);
  const destCount       = movements.filter((m) => m === "destabilizing").length;
  const weakCount       = movements.filter((m) => m === "weakening").length;
  const strengthCount   = movements.filter((m) => m === "strengthening").length;
  const latestDir       = ctx.confidenceMovement[ctx.confidenceMovement.length - 1].direction;

  if (destCount >= 2) return "destabilizing";
  if (weakCount > strengthCount && weakCount >= 3) return "weakening";
  if (strengthCount > weakCount && strengthCount >= 3) return "strengthening";
  if (latestDir === "strengthening" && strengthCount >= 1) return "strengthening";
  if (latestDir === "weakening" && (weakCount >= 1 || destCount >= 1)) return "weakening";
  return "stabilizing";
}

function derivePressurePoints(dimensions: ConfidenceDimension[]): string[] {
  return dimensions
    .filter((d) => d.posture === "absent" || d.posture === "fragile")
    .sort((a, b) => POSTURE_RANK[a.posture] - POSTURE_RANK[b.posture])
    .map((d) => d.unresolvedBlockers[0] ?? `${d.label} needs attention`)
    .slice(0, 3);
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

export function deriveUnlockPaths(dimensions: ConfidenceDimension[], ctx: ConfidenceInputContext): UnlockPath[] {
  const paths: UnlockPath[] = [];
  const needsUnlock = [...dimensions]
    .filter((d) => d.posture === "absent" || d.posture === "fragile")
    .sort((a, b) => POSTURE_RANK[a.posture] - POSTURE_RANK[b.posture]);

  for (const d of needsUnlock) {
    const template = UNLOCK_ACTIONS[d.id];
    paths.push({
      action: template.action,
      targetDimension: d.id,
      expectedImpact: template.impact,
      blockedBy: d.unresolvedBlockers[0] ?? null,
    });
  }
  if (ctx.councilLongPendingCount > 0) {
    paths.push({
      action: `Address ${ctx.councilLongPendingCount} long-pending council recommendation${ctx.councilLongPendingCount > 1 ? "s" : ""}`,
      targetDimension: "decision_stability",
      expectedImpact: "medium",
      blockedBy: "Pending advisory input",
    });
  }
  return paths.slice(0, 5);
}

export function buildTemporalNote(ctx: ConfidenceInputContext): string | null {
  const movement = ctx.confidenceMovement;
  if (movement.length === 0) {
    if (ctx.lastMeaningfulChangeAt) {
      const days = Math.floor((Date.now() - new Date(ctx.lastMeaningfulChangeAt).getTime()) / 86400000);
      if (days > 30) return `No confidence movement recorded in ${days} days — awaiting new signal.`;
    }
    return null;
  }
  const recent           = movement.slice(-5);
  const last             = recent[recent.length - 1];
  const prev             = recent.length > 1 ? recent[recent.length - 2] : null;
  const strengtheningCount = recent.filter((m) => m.direction === "strengthening").length;
  const weakeningCount     = recent.filter((m) => m.direction === "weakening").length;

  if (recent.length >= 3 && recent.every((m) => m.direction === "strengthening")) return "Confidence has been building consistently.";
  if (recent.length >= 3 && recent.every((m) => m.direction === "weakening"))      return "Confidence has been declining across recent signals.";
  if (last.direction === "weakening" && prev?.direction === "strengthening")        return "Recent validation has begun to weaken earlier progress.";
  if (last.direction === "strengthening" && weakeningCount > 0)                    return "Confidence is recovering after earlier contradictions.";
  if (recent.every((m) => m.direction === "stable"))                               return "Confidence has been holding without new signal.";
  if (weakeningCount > strengtheningCount) return "More weakening signals than strengthening in recent history.";
  if (strengtheningCount > weakeningCount) return "Net strengthening across recent evidence.";
  return null;
}

export function buildDecompositionNarrative(
  dimensions: ConfidenceDimension[],
  overallPosture: ConfidencePosture,
): string {
  const sorted   = [...dimensions].sort((a, b) => POSTURE_RANK[b.posture] - POSTURE_RANK[a.posture]);
  const strongest = sorted[0];
  const weakest   = sorted[sorted.length - 1];

  if (overallPosture === "strong") {
    return `Confidence is strong, anchored by ${strongest.label.toLowerCase()} and consistent directional evidence.`;
  }
  if (overallPosture === "absent") {
    return `${weakest.label} is absent — this is the primary constraint on confidence progression.`;
  }
  const strengthPhrase = POSTURE_RANK[strongest.posture] >= 3
    ? ` — supported by ${strongest.label.toLowerCase()}` : "";
  const weakPhrase = POSTURE_RANK[weakest.posture] <= 1
    ? `, held back by ${weakest.label.toLowerCase()}` : "";
  return `Confidence is ${overallPosture}${strengthPhrase}${weakPhrase}.`;
}

function buildReadinessLayers(
  dimensions: ConfidenceDimension[],
  overallPosture: ConfidencePosture,
  unlockPaths: UnlockPath[],
): ReadinessLayer[] {
  const boundedBy = dimensions
    .filter((d) => d.posture === "absent" || d.posture === "fragile")
    .flatMap((d) => d.unresolvedBlockers.slice(0, 1))
    .slice(0, 3);

  const topUnlocks = unlockPaths.filter((u) => u.expectedImpact === "high").slice(0, 2);
  const nearTermNarrative = topUnlocks.length > 0
    ? `If ${topUnlocks.map((u) => u.action.toLowerCase()).slice(0, 1).join(" and ")}, commitment readiness improves.`
    : "Continue current validation trajectory.";

  const structuralDimIds: ConfidenceDimensionId[] = ["strategic_coherence", "capability_readiness", "decision_stability"];
  const structuralBlockers = dimensions.filter(
    (d) => structuralDimIds.includes(d.id) && (d.posture === "fragile" || d.posture === "absent"),
  );
  const structuralNarrative = structuralBlockers.length > 0
    ? `Full structural confidence requires ${structuralBlockers.map((d) => d.label.toLowerCase()).join(", ")} to stabilize.`
    : "Structural foundations are in place for sustained confidence.";

  return [
    {
      id: "current",
      label: "Current Readiness",
      narrative: READINESS_NARRATIVES[overallPosture],
      boundedBy,
      unlockConditions: topUnlocks.slice(0, 1).map((u) => u.action),
    },
    {
      id: "near_term",
      label: "Near-Term Potential",
      narrative: nearTermNarrative,
      boundedBy: [],
      unlockConditions: topUnlocks.map((u) => u.action),
    },
    {
      id: "structural",
      label: "Structural Upside",
      narrative: structuralNarrative,
      boundedBy: structuralBlockers.map((d) => d.label),
      unlockConditions: structuralBlockers.flatMap((d) => d.unresolvedBlockers).slice(0, 3),
    },
  ];
}

// ─── Context builder helpers ──────────────────────────────────────────────────

/**
 * Builds a minimal ConfidenceInputContext using only decision-level signals.
 * Evidence/hypothesis/council signals default to conservative values.
 * Use when full evidence context isn't available at the call site.
 */
export function buildDecisionOnlyContext(decision: {
  decision_state: string;
  confidence_state: string;
  confidence_movement: ConfidenceMovementEntry[];
  decision_memory: DecisionMemoryEntry[];
  validation_requirements?: ValidationRequirement[];
  blocked_by?: string[];
  active_tension_ids?: string[];
  stale_dependencies?: string[];
  supporting_hypothesis_ids?: string[];
  last_meaningful_change_at?: string | null;
}): ConfidenceInputContext {
  return {
    decisionState:           decision.decision_state,
    confidenceState:         decision.confidence_state,
    confidenceMovement:      decision.confidence_movement ?? [],
    decisionMemory:          decision.decision_memory ?? [],
    validationRequirements:  decision.validation_requirements ?? [],
    blockedBy:               decision.blocked_by ?? [],
    activeTensionIds:        decision.active_tension_ids ?? [],
    staleDependencies:       decision.stale_dependencies ?? [],
    supportingHypothesisIds: decision.supporting_hypothesis_ids ?? [],

    hasContradictingEvidence: decision.confidence_state === "contradicted",
    hasStaleCustomerProof:    false,
    hasActiveBlockingTension: (decision.active_tension_ids ?? []).length > 0,
    hasCapabilityGap:         (decision.blocked_by ?? []).length > 0,
    hasMultiLayerEvidence:    decision.confidence_state === "strong" || decision.confidence_state === "building",
    hasCustomerBehavioralProof: decision.confidence_state === "strong",
    hasAnyEvidence:           decision.confidence_state !== "low",
    evidenceFreshness:        "aging",

    contradictedHypothesisCount: 0,
    activeHypothesisCount:       0,
    councilPendingCount:         0,
    councilLongPendingCount:     0,

    lastMeaningfulChangeAt: decision.last_meaningful_change_at ?? null,
  };
}

export function isPostureAtRisk(posture: ConfidencePosture): boolean {
  return posture === "absent" || posture === "fragile";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildConfidenceAnatomyReport(ctx: ConfidenceInputContext): ConfidenceAnatomyReport {
  const latestDir = ctx.confidenceMovement.length > 0
    ? ctx.confidenceMovement[ctx.confidenceMovement.length - 1].direction
    : null;

  const dimensions: ConfidenceDimension[] = [
    buildValidationMaturity(ctx, latestDir),
    buildCustomerProofStrength(ctx, latestDir),
    buildContradictionPressure(ctx, latestDir),
    buildTensionPressure(ctx, latestDir),
    buildCapabilityReadiness(ctx, latestDir),
    buildEvidenceFreshness(ctx, latestDir),
    buildDependencyStability(ctx, latestDir),
    buildDecisionStability(ctx, latestDir),
    buildStrategicCoherence(ctx, latestDir),
    buildMarketSupport(ctx, latestDir),
  ];

  const overallPosture        = deriveOverallPosture(dimensions);
  const overallMovement       = deriveOverallMovement(dimensions, ctx);
  const pressurePoints        = derivePressurePoints(dimensions);
  const unlockPaths           = deriveUnlockPaths(dimensions, ctx);
  const temporalNote          = buildTemporalNote(ctx);
  const readinessLayers       = buildReadinessLayers(dimensions, overallPosture, unlockPaths);
  const decompositionNarrative = buildDecompositionNarrative(dimensions, overallPosture);

  return {
    dimensions,
    overallPosture,
    overallMovement,
    pressurePoints,
    unlockPaths,
    temporalNote,
    readinessLayers,
    decompositionNarrative,
  };
}
