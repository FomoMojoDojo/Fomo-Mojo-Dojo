/**
 * Strategic Center Surface — unified orchestration engine.
 *
 * Synthesizes StrategicCenter + CustomerRealityNarrative + PositioningLensNarrative
 * + ConfidenceLandscape + RouteRationales into a single opinionated output that
 * drives the command view layout.
 *
 * Answers six questions:
 *   What are we betting on?  → centerHeadline
 *   Why?                     → supportingThemes (callers use strategicCenter directly)
 *   What weakens it?         → topTensions + topContradiction
 *   What's moving?           → leadRoute.contradictionPressure + phaseAttentionItems
 *   What deserves attention? → phaseAttentionItems
 *   What next?               → lead route enrichment
 *
 * Compression rules (enforced here, not in the UI):
 * - max 2 tensions   (topTensions)
 * - max 1 contradiction   (topContradiction)
 * - max 1 biggest unresolved assumption   (biggestUnresolvedAssumption)
 * - max 2 phase attention items   (phaseAttentionItems)
 *
 * State ranking (descending priority):
 * 1. Decision portfolio pressure (validation-heavy / fragmented + no safe commit path)
 * 2. Customer proof gap (direction outrunning validated customer reality)
 * 3. Customer validation converging (positive signal)
 * 4. Route / customer / positioning fragmentation
 * 5. Hard positioning contradiction (explicit contradicted posture)
 * 6. Positioning stabilizing (encouraging)
 * 7. Public divergence (weaker ambient signal — only if nothing more decision-relevant fires)
 * 8. Direction cohering (default)
 */

import type { StrategicCenter } from "@/lib/strategicCenter";
import type { CustomerRealityNarrative } from "@/lib/customerRealityNarrative";
import type { PositioningLensNarrative } from "@/lib/positioningLensNarrative";
import type { ConfidenceLandscapeDomain } from "@/lib/refinePreviewConfidenceLandscape";
import type { RouteRationale } from "@/lib/routeRationale";
import type { DecisionPortfolio } from "@/lib/decisionSystem";
import { resolveRefineNarrativePhase } from "@/lib/refinePreviewPhaseOrchestration";

// ─── Public types ────────────────────────────────────────────────────────────────

/**
 * Six mutually exclusive confidence postures synthesised across all signal layers.
 */
export type UnifiedConfidencePosture =
  | "speculative"   // low center confidence; customer reality inferred or directional
  | "directional"   // medium center confidence; customer reality non-contradicted
  | "stabilizing"   // high center confidence; customer converging or better
  | "coherent"      // high center confidence + customer grounded + positioning coherent
  | "fragmented"    // route/customer/positioning fragmented
  | "contradicted"; // any explicit contradiction across signal layers

/**
 * Six mutually exclusive center state descriptions.
 */
export type CenterStateKey =
  | "direction_cohering"
  | "strategy_outrunning_proof"
  | "positioning_stabilizing"
  | "customer_validation_converging"
  | "route_confidence_fragmented"
  | "perception_conflicts_emphasis";

export type EnrichedLeadRoute = {
  routeId: string;
  routeTitle: string;
  category: string;
  /**
   * From the positioning lens — does this route reinforce, weaken, or conflict with
   * current positioning coherence?
   */
  positioningCoherence: "reinforces" | "weakens" | "mixed" | "neutral";
  /** Based on whether the route is backed by validated customer signals. */
  customerGrounding: "validated" | "directional" | "inferred";
  /** Simplified read of route confidence. */
  confidencePosture: "thin" | "directional" | "strong";
  /** True when this route is weakening, on hold, or contradicted by recent evidence. */
  contradictionPressure: boolean;
};

export type StrategicCenterSurface = {
  /** Primary headline for the command center. */
  centerHeadline: string;
  centerStateKey: CenterStateKey;
  /** Short label shown as a badge/cap above the headline. */
  centerStateLabel: string;
  confidencePosture: UnifiedConfidencePosture;
  confidencePostureLabel: string;
  /**
   * Top 1–2 highest-signal tensions for the current phase.
   * Drawn from strategic center, customer reality, and positioning layers.
   */
  topTensions: string[];
  /**
   * Single highest-risk contradiction across signal layers.
   * Null when no explicit contradiction exists.
   */
  topContradiction: string | null;
  /**
   * Single biggest unresolved assumption still floating above the direction.
   * Different from topContradiction — this is uncertain, not conflicted.
   */
  biggestUnresolvedAssumption: string | null;
  /** Lead route enriched with cross-layer context. Null when no routes exist. */
  leadRoute: EnrichedLeadRoute | null;
  /** 1–2 items most deserving attention in the current phase. */
  phaseAttentionItems: string[];
};

// ─── Posture labels ──────────────────────────────────────────────────────────────

const CONFIDENCE_POSTURE_LABELS: Record<UnifiedConfidencePosture, string> = {
  speculative:  "Speculative",
  directional:  "Directional",
  stabilizing:  "Stabilizing",
  coherent:     "Coherent",
  fragmented:   "Fragmented",
  contradicted: "Contradicted",
};

/**
 * Returns a discipline-cooled confidence posture label.
 *
 * When discipline restraint flags are active, certain high-confidence labels
 * overstate the evidence base. This helper substitutes a more accurately
 * calibrated label without changing the underlying posture derivation.
 *
 * Use this in place of surface.confidencePostureLabel when a discipline
 * assessment has been computed for the current strategic state.
 */
export function disciplinedPostureLabel(
  posture: UnifiedConfidencePosture,
  discipline: {
    restraintFlags: {
      prematureCertainty: boolean;
      falseConvergence: boolean;
      immatureAmbiguity: boolean;
    };
  },
): string {
  const { prematureCertainty, falseConvergence, immatureAmbiguity } = discipline.restraintFlags;

  if (posture === "coherent" && (prematureCertainty || falseConvergence)) {
    return "Becoming more consistent";
  }
  if (posture === "stabilizing" && (prematureCertainty || falseConvergence)) {
    return "Beginning to stabilize";
  }
  if (posture === "fragmented" && immatureAmbiguity) {
    return "Not yet differentiated";
  }
  return CONFIDENCE_POSTURE_LABELS[posture];
}

const CENTER_STATE_LABELS: Record<CenterStateKey, string> = {
  direction_cohering:            "Direction cohering",
  strategy_outrunning_proof:     "Proof gap",
  positioning_stabilizing:       "Positioning stabilizing",
  customer_validation_converging:"Validation converging",
  route_confidence_fragmented:   "Confidence fragmented",
  perception_conflicts_emphasis: "Perception gap",
};

// ─── Center state derivation ─────────────────────────────────────────────────────

function deriveCenterStateKey(args: {
  strategicCenter: StrategicCenter;
  customerReality: CustomerRealityNarrative | null;
  positioningNarrative: PositioningLensNarrative | null;
  routeRationales: RouteRationale[];
  decisionPortfolio: DecisionPortfolio | null;
}): CenterStateKey {
  const { strategicCenter, customerReality, positioningNarrative, routeRationales, decisionPortfolio } = args;

  // 1. Decision portfolio pressure — validation-heavy or fragmented with no safe commit path
  //    takes priority over ambient perception signals.
  if (decisionPortfolio) {
    const portfolioStalled =
      decisionPortfolio.portfolioState === "validation_heavy" ||
      decisionPortfolio.portfolioState === "fragmented";
    const noCommitPath = decisionPortfolio.safeToCommit.length === 0;
    if (portfolioStalled && noCommitPath) {
      // If customer reality is also weak, frame as proof gap; otherwise as fragmentation.
      const customerWeak =
        !customerReality ||
        customerReality.posture === "inferred" ||
        customerReality.posture === "directional";
      return customerWeak ? "strategy_outrunning_proof" : "route_confidence_fragmented";
    }
    // Scaling ahead of customer confidence → proof gap
    if (decisionPortfolio.portfolioState === "scaling_ahead" && strategicCenter.customerLag) {
      return "strategy_outrunning_proof";
    }
  }

  // 2. Customer proof gap — strategy is outrunning validated customer reality.
  //    Ranked before perception conflict because this is more decision-consequential.
  const directionOutrunning =
    customerReality?.posture === "directional" && strategicCenter.confidence !== "low";
  if (directionOutrunning) {
    return "strategy_outrunning_proof";
  }

  // 3. Customer validation converging (positive signal).
  const customerConverging =
    customerReality?.posture === "converging" || customerReality?.posture === "grounded";
  if (customerConverging) {
    return "customer_validation_converging";
  }

  // 4. Fragmentation across any layer.
  const routeFragmented =
    routeRationales.length >= 2 &&
    routeRationales.filter((r) => r.movement === "weaken" || r.readiness === "Hold").length >=
      Math.ceil(routeRationales.length / 2);
  const customerFragmented = customerReality?.posture === "fragmented";
  const positioningFragmented = positioningNarrative?.posture === "fragmented";
  if (routeFragmented || customerFragmented || positioningFragmented) {
    return "route_confidence_fragmented";
  }

  // 5. Hard positioning contradiction — explicit contradicted posture.
  //    More specific than ambient public divergence; surfaces here rather than at #1
  //    so customer proof gap and fragmentation can outrank it.
  if (positioningNarrative?.posture === "contradicted") {
    return "perception_conflicts_emphasis";
  }

  // 6. Positioning stabilising (encouraging).
  const positioningStabilising =
    positioningNarrative?.posture === "coherent" || positioningNarrative?.posture === "emerging";
  if (positioningStabilising && strategicCenter.confidence !== "low") {
    return "positioning_stabilizing";
  }

  // 7. Public divergence — weaker ambient signal.
  //    Only surfaces when no more decision-relevant condition has fired above.
  const publicDivergence =
    Boolean(strategicCenter.publicContextLabel) && strategicCenter.hasMeaningfulDivergence;
  if (publicDivergence) {
    return "perception_conflicts_emphasis";
  }

  // 8. Default.
  return "direction_cohering";
}

function buildCenterHeadline(
  stateKey: CenterStateKey,
  strategicCenter: StrategicCenter,
  leadRationale: RouteRationale | null,
  customerReality: CustomerRealityNarrative | null,
): string {
  const center = strategicCenter.label;
  const publicLabel = strategicCenter.publicContextLabel;

  switch (stateKey) {
    case "direction_cohering": {
      if (center) return `Direction is converging around ${center}.`;
      return "Direction is converging.";
    }
    case "strategy_outrunning_proof": {
      if (center && leadRationale?.mustBecomeTrue) {
        return `The strategy is moving toward ${center}. Customer proof hasn't caught up.`;
      }
      if (center) {
        return `The emphasis on ${center} is ahead of customer validation.`;
      }
      return "Strategy is ahead of customer proof.";
    }
    case "positioning_stabilizing": {
      if (center) return `Positioning is stabilizing around ${center}.`;
      return "Positioning is stabilizing.";
    }
    case "customer_validation_converging": {
      if (center) {
        return `Customer validation is converging around ${center}.`;
      }
      if (customerReality?.validatedNeedCount && customerReality.validatedNeedCount > 0) {
        return `Customer validation is converging — ${customerReality.validatedNeedCount} need${customerReality.validatedNeedCount > 1 ? "s" : ""} confirmed.`;
      }
      return "Customer validation is converging.";
    }
    case "route_confidence_fragmented": {
      if (center) {
        return `Route confidence is fragmented. No clear commitment path around ${center}.`;
      }
      return "Route confidence is fragmented — no clear lead path.";
    }
    case "perception_conflicts_emphasis": {
      if (publicLabel && center) {
        return `Outside perception reads as ${publicLabel}. The direction toward ${center} hasn't landed.`;
      }
      if (publicLabel) {
        return `Outside still reads as ${publicLabel} — strategy needs to close that gap.`;
      }
      if (center) {
        return `Public perception conflicts with the emphasis on ${center}.`;
      }
      return "Public perception conflicts with the current strategic emphasis.";
    }
  }
}

// ─── Unified confidence posture ──────────────────────────────────────────────────

function deriveConfidencePosture(args: {
  strategicCenter: StrategicCenter;
  customerReality: CustomerRealityNarrative | null;
  positioningNarrative: PositioningLensNarrative | null;
  leadRationale: RouteRationale | null;
}): UnifiedConfidencePosture {
  const { strategicCenter, customerReality, positioningNarrative, leadRationale } = args;

  // Contradicted takes priority
  const contradictedCenter = customerReality?.posture === "contradicted";
  const contradictedPositioning = positioningNarrative?.posture === "contradicted";
  const contradictedRoute = leadRationale?.confidenceLabel === "Contradicted by recent evidence";
  if (contradictedCenter || contradictedPositioning || contradictedRoute) {
    return "contradicted";
  }

  // Fragmented next
  const fragmentedCustomer = customerReality?.posture === "fragmented";
  const fragmentedPositioning = positioningNarrative?.posture === "fragmented";
  if (fragmentedCustomer || fragmentedPositioning) {
    return "fragmented";
  }

  // Coherent — high confidence + grounded customer + coherent positioning
  if (
    strategicCenter.confidence === "high" &&
    customerReality?.posture === "grounded" &&
    (positioningNarrative?.posture === "coherent" || positioningNarrative == null)
  ) {
    return "coherent";
  }

  // Stabilizing — high confidence + customer not fragmented/contradicted
  if (
    strategicCenter.confidence === "high" &&
    customerReality?.posture !== "fragmented" &&
    customerReality?.posture !== "contradicted"
  ) {
    return "stabilizing";
  }

  // Directional — medium confidence
  if (strategicCenter.confidence === "medium") {
    return "directional";
  }

  // Default: speculative
  return "speculative";
}

// ─── Tension + contradiction collection ──────────────────────────────────────────

function collectTensions(args: {
  strategicCenter: StrategicCenter;
  customerReality: CustomerRealityNarrative | null;
  positioningNarrative: PositioningLensNarrative | null;
}): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  function addIfNew(text: string) {
    const key = text.trim().toLowerCase().slice(0, 60);
    if (!seen.has(key) && text.trim()) {
      seen.add(key);
      result.push(text.trim());
    }
  }

  // Strategic center tensions first (highest authority)
  for (const tension of args.strategicCenter.unresolvedTensions) {
    addIfNew(tension);
  }

  // Customer reality conflicts (warning-severity first)
  if (args.customerReality) {
    const warnings = args.customerReality.conflicts
      .filter((c) => c.severity === "warning")
      .map((c) => c.description);
    const notices = args.customerReality.conflicts
      .filter((c) => c.severity === "notice")
      .map((c) => c.description);
    for (const t of [...warnings, ...notices]) addIfNew(t);
  }

  // Positioning tensions
  if (args.positioningNarrative) {
    for (const t of args.positioningNarrative.tensions) {
      addIfNew(t.description);
    }
  }

  return result.slice(0, 2);
}

function findTopContradiction(args: {
  positioningNarrative: PositioningLensNarrative | null;
  customerReality: CustomerRealityNarrative | null;
  strategicCenter: StrategicCenter;
  topTensions: string[];
}): string | null {
  const { positioningNarrative, customerReality, strategicCenter, topTensions } = args;
  const topTensionSet = new Set(topTensions.map((t) => t.trim().toLowerCase().slice(0, 60)));

  // Prefer explicit positioning contradiction
  if (
    positioningNarrative?.posture === "contradicted" &&
    positioningNarrative.tensions.length > 0
  ) {
    return positioningNarrative.tensions[0].description;
  }

  // Customer reality warning conflict not already in topTensions
  if (customerReality) {
    const warning = customerReality.conflicts.find(
      (c) =>
        c.severity === "warning" &&
        !topTensionSet.has(c.description.trim().toLowerCase().slice(0, 60)),
    );
    if (warning) return warning.description;
  }

  // Strategic center tension not already surfaced
  for (const tension of strategicCenter.unresolvedTensions) {
    const key = tension.trim().toLowerCase().slice(0, 60);
    if (!topTensionSet.has(key)) return tension;
  }

  return null;
}

function findBiggestUnresolvedAssumption(args: {
  customerReality: CustomerRealityNarrative | null;
  strategicCenter: StrategicCenter;
  topTensions: string[];
  topContradiction: string | null;
}): string | null {
  const { customerReality, strategicCenter, topTensions, topContradiction } = args;
  const already = new Set(
    [...topTensions, topContradiction ?? ""]
      .map((t) => t.trim().toLowerCase().slice(0, 60))
      .filter(Boolean),
  );

  if (customerReality?.unresolved.length) {
    const candidate = customerReality.unresolved[0];
    const key = candidate.trim().toLowerCase().slice(0, 60);
    if (!already.has(key)) return candidate;
  }

  for (const tension of strategicCenter.unresolvedTensions) {
    const key = tension.trim().toLowerCase().slice(0, 60);
    if (!already.has(key)) return tension;
  }

  return null;
}

// ─── Lead route enrichment ───────────────────────────────────────────────────────

function deriveLeadRouteCustomerGrounding(
  rationale: RouteRationale,
): EnrichedLeadRoute["customerGrounding"] {
  if (rationale.supportShape.customer > 0) return "directional";
  if (
    rationale.confidenceLabel === "Supported by multiple validated signals" ||
    rationale.confidenceLabel === "Evidence is starting to converge"
  ) {
    return "directional";
  }
  return "inferred";
}

function deriveLeadRouteConfidencePosture(
  rationale: RouteRationale,
): EnrichedLeadRoute["confidencePosture"] {
  if (
    rationale.confidenceLabel === "Supported by multiple validated signals" ||
    rationale.confidenceLabel === "Evidence is starting to converge"
  ) {
    return "strong";
  }
  if (
    rationale.confidenceLabel === "Still highly uncertain" ||
    rationale.readiness === "Hold" ||
    rationale.movement === "weaken"
  ) {
    return "thin";
  }
  return "directional";
}

function enrichLeadRoute(
  rationale: RouteRationale,
  positioningNarrative: PositioningLensNarrative | null,
): EnrichedLeadRoute {
  // Positioning coherence from narrative reinforcing / contradicting lists
  let positioningCoherence: EnrichedLeadRoute["positioningCoherence"] = "neutral";
  if (positioningNarrative) {
    const reinforcing = positioningNarrative.reinforcingRoutes.find(
      (r) => r.routeId === rationale.routeId,
    );
    const contradicting = positioningNarrative.contradictingRoutes.find(
      (r) => r.routeId === rationale.routeId,
    );
    if (reinforcing && contradicting) positioningCoherence = "mixed";
    else if (reinforcing) positioningCoherence = "reinforces";
    else if (contradicting) positioningCoherence = "weakens";
  }

  return {
    routeId: rationale.routeId,
    routeTitle: rationale.routeTitle,
    category: "", // caller fills in from RouteRow if needed
    positioningCoherence,
    customerGrounding: deriveLeadRouteCustomerGrounding(rationale),
    confidencePosture: deriveLeadRouteConfidencePosture(rationale),
    contradictionPressure:
      rationale.movement === "weaken" ||
      rationale.readiness === "Hold" ||
      rationale.confidenceLabel === "Contradicted by recent evidence",
  };
}

// ─── Phase attention items ────────────────────────────────────────────────────────

function derivePhaseAttentionItems(args: {
  phase: string;
  strategicCenter: StrategicCenter;
  customerReality: CustomerRealityNarrative | null;
  positioningNarrative: PositioningLensNarrative | null;
  leadRationale: RouteRationale | null;
  confidenceDomains: ConfidenceLandscapeDomain[];
  validationCadencePressure?: "none" | "warming" | "urgent";
}): string[] {
  const { phase, strategicCenter, customerReality, positioningNarrative, leadRationale, confidenceDomains, validationCadencePressure } = args;
  const narrativePhase = resolveRefineNarrativePhase(phase);
  const items: string[] = [];

  if (narrativePhase === "pre_diagnosis") {
    // Surface perception + market conflicts
    if (strategicCenter.publicContextLabel) {
      items.push(`Outside perception is reading as ${strategicCenter.publicContextLabel}.`);
    }
    if (strategicCenter.customerLag) {
      items.push("Customer proof is missing — direction is outside signals only.");
    }
    if (items.length === 0) {
      items.push("Direction needs internal grounding before commitment.");
    }
  } else if (narrativePhase === "diagnose") {
    // Customer grounding + direction coherence
    if (customerReality?.posture === "inferred" || customerReality?.posture === "directional") {
      items.push("Customer grounding is weak — direction is ahead of validated proof.");
    }
    if (strategicCenter.hasMeaningfulDivergence) {
      items.push("Competing themes still pulling the direction.");
    }
    if (items.length === 0 && customerReality?.unresolved.length) {
      items.push(customerReality.unresolved[0]);
    }
  } else if (narrativePhase === "focus") {
    // Route positioning coherence + contradiction pressure
    if (leadRationale?.contradictionPressure || leadRationale?.readiness === "Hold") {
      items.push("The lead route has weakening signals.");
    }
    if (positioningNarrative?.posture === "fragmented" || positioningNarrative?.posture === "contradicted") {
      items.push("Routes are pulling positioning in conflicting directions.");
    }
    if (items.length === 0) {
      const weakDomain = confidenceDomains.find(
        (d) => d.state === "Early signal" && d.key === "customer_proof",
      );
      if (weakDomain) items.push(weakDomain.whatIncreasesConfidence);
    }
  } else {
    // flow: movement + contradiction drift
    if (leadRationale?.movement === "weaken") {
      items.push("Lead route confidence is weakening.");
    }
    if (strategicCenter.unresolvedTensions.length > 0) {
      items.push(strategicCenter.unresolvedTensions[0]);
    }
    if (items.length === 0 && customerReality?.conflicts.length) {
      items.push(customerReality.conflicts[0].description);
    }
  }

  // Validation cadence: customer proof exists but is aging/stale.
  // Only add when not already covered by the "missing" case above.
  if (items.length < 2 && validationCadencePressure === "urgent") {
    items.push("Customer validation is stale.");
  } else if (items.length < 2 && validationCadencePressure === "warming") {
    items.push("Customer validation signals are aging.");
  }

  return items.slice(0, 2);
}

// ─── Main export ─────────────────────────────────────────────────────────────────

export function buildStrategicCenterSurface(args: {
  strategicCenter: StrategicCenter;
  customerReality: CustomerRealityNarrative | null;
  positioningNarrative: PositioningLensNarrative | null;
  confidenceDomains: ConfidenceLandscapeDomain[];
  routeRationales: RouteRationale[];
  leadRationale: RouteRationale | null;
  phase: string;
  decisionPortfolio?: DecisionPortfolio | null;
  /** Optional — validation cadence pressure from evidence aging. Influences phaseAttentionItems. */
  validationCadencePressure?: "none" | "warming" | "urgent";
}): StrategicCenterSurface {
  const {
    strategicCenter,
    customerReality,
    positioningNarrative,
    confidenceDomains,
    routeRationales,
    leadRationale,
    phase,
    decisionPortfolio = null,
  } = args;

  const centerStateKey = deriveCenterStateKey({
    strategicCenter,
    customerReality,
    positioningNarrative,
    routeRationales,
    decisionPortfolio,
  });

  const centerHeadline = buildCenterHeadline(centerStateKey, strategicCenter, leadRationale, customerReality);
  const centerStateLabel = CENTER_STATE_LABELS[centerStateKey];

  const confidencePosture = deriveConfidencePosture({
    strategicCenter,
    customerReality,
    positioningNarrative,
    leadRationale,
  });
  const confidencePostureLabel = CONFIDENCE_POSTURE_LABELS[confidencePosture];

  const topTensions = collectTensions({
    strategicCenter,
    customerReality,
    positioningNarrative,
  });

  const topContradiction = findTopContradiction({
    positioningNarrative,
    customerReality,
    strategicCenter,
    topTensions,
  });

  const biggestUnresolvedAssumption = findBiggestUnresolvedAssumption({
    customerReality,
    strategicCenter,
    topTensions,
    topContradiction,
  });

  const leadRoute =
    leadRationale ? enrichLeadRoute(leadRationale, positioningNarrative) : null;

  const phaseAttentionItems = derivePhaseAttentionItems({
    phase,
    strategicCenter,
    customerReality,
    positioningNarrative,
    leadRationale: leadRationale ?? null,
    confidenceDomains,
    validationCadencePressure: args.validationCadencePressure,
  });

  return {
    centerHeadline,
    centerStateKey,
    centerStateLabel,
    confidencePosture,
    confidencePostureLabel,
    topTensions,
    topContradiction,
    biggestUnresolvedAssumption,
    leadRoute,
    phaseAttentionItems,
  };
}
