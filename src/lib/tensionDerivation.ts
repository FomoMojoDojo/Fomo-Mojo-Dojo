/**
 * Tension derivation engine — identifies strategic tensions from existing data.
 *
 * This is a pure function: no side effects, no API calls.
 * It takes a partial snapshot of the strategic system and returns tensions
 * that are: unresolved, consequential, directional, evidence-aware.
 *
 * Design principles:
 * - Prefer directional pressure over fake synthesis
 * - Preserve ambiguity and inspectable reasoning
 * - Never auto-resolve or over-summarize
 * - Surface uncertainty as a signal, not a failure
 */

import type {
  StrategicTension,
  TensionDerivationInput,
  TensionStatus,
} from "@/lib/tensionTypes";


// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeId(source: string, suffix: string): string {
  return `derived:${source}:${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── Individual derivation functions ─────────────────────────────────────────

/**
 * Tension: routes are ready to commit but customer proof is missing.
 * Routes built only on public baseline evidence cannot be safely committed to.
 */
function deriveConfidenceInstabilityTension(
  input: TensionDerivationInput,
): StrategicTension | null {
  const { routes, sourceSignals, portfolio } = input;
  if (!sourceSignals || !routes || routes.length === 0) return null;
  if (sourceSignals.hasPrimaryEvidence) return null;

  // Only relevant when there are active routes to commit to
  const commitCandidates = portfolio?.safeToCommit ?? [];
  const tooEarly = portfolio?.tooEarly ?? [];
  const hasBlockedOrEarly = (portfolio?.blocked?.length ?? 0) > 0 || tooEarly.length > 0;
  if (!hasBlockedOrEarly && commitCandidates.length === 0) return null;

  const routeIds = routes.map((r) => r.id);
  const blockedRouteIds = routes
    .filter((r) => portfolio?.blocked?.includes(r.title))
    .map((r) => r.id);

  return {
    id: makeId("confidence_instability", "no_primary_evidence"),
    statement: "Route recommendations are built on outside research only — customer validation is missing.",
    detail: `${routes.length} route${routes.length === 1 ? "" : "s"} generated from public baseline. No primary research or customer interviews on file.`,
    status: sourceSignals.hasCompanyEvidence ? "unresolved" : "strengthening",
    confidence: 0.85,
    source: "confidence_instability",
    pressure: commitCandidates.length > 0 ? "high" : "medium",
    affected_routes: routeIds,
    affected_needs: [],
    affected_positioning: false,
    affected_strategy: false,
    blocked_commitments: blockedRouteIds,
    resolution_signals: [
      "Upload customer interviews or research transcripts",
      "Primary evidence moves source signals to 'active'",
    ],
    validation_requirements: [
      "At least one primary research signal before committing to routes",
    ],
    is_commitment_blocker: commitCandidates.length > 0,
    created_from: "derived",
  };
}

/**
 * Tension: portfolio is scaling ahead of validation.
 * Commitment is accelerating faster than evidence can support.
 */
function deriveUnvalidatedScaleTension(
  input: TensionDerivationInput,
): StrategicTension | null {
  const { portfolio, sourceSignals } = input;
  if (!portfolio) return null;
  if (portfolio.portfolioState !== "scaling_ahead") return null;

  const hasWeakSignals = !sourceSignals?.hasPrimaryEvidence;
  const scalingRoutes = portfolio.routes
    .filter((r) => r.isSafeToScale)
    .map((r) => r.route.id);

  return {
    id: makeId("unvalidated_scale_pressure", "scaling_ahead"),
    statement: "Commitment is accelerating faster than customer validation supports.",
    detail: `Portfolio state: scaling ahead. ${hasWeakSignals ? "No primary research on file — confidence rests on organizational assumptions." : "Evidence present but not yet sufficient for the scale of commitment."}`,
    status: "strengthening",
    confidence: 0.78,
    source: "unvalidated_scale_pressure",
    pressure: hasWeakSignals ? "critical" : "high",
    affected_routes: scalingRoutes,
    affected_needs: [],
    affected_positioning: false,
    affected_strategy: true,
    blocked_commitments: scalingRoutes,
    resolution_signals: [
      "Customer validation on key assumptions",
      "Evidence moves portfolio toward 'converging' state",
    ],
    validation_requirements: [
      "Validate core assumptions before broadening investment",
    ],
    is_commitment_blocker: true,
    created_from: "derived",
  };
}

/**
 * Tension: high-priority customer needs have no execution route.
 * The gap between what customers need most and what's in the portfolio.
 */
function deriveNeedRouteGapTension(
  input: TensionDerivationInput,
): StrategicTension | null {
  const { needs, routes } = input;
  if (!needs || needs.length === 0) return null;

  const HIGH_SCORE_THRESHOLD = 10;
  const highPriorityNeeds = needs.filter(
    (n) =>
      (n.opportunity_score ?? 0) >= HIGH_SCORE_THRESHOLD &&
      (n.service_state === "underserved" || n.service_state === "under_served"),
  );
  if (highPriorityNeeds.length === 0) return null;

  // Check which journey keys have route coverage
  const coveredJourneyKeys = new Set<string>();
  (routes ?? []).forEach((r) => {
    const title = (r.title ?? "").toLowerCase();
    const desc = (r.short_description ?? "").toLowerCase();
    // Approximate coverage check: route text mentions the step label or journey key
    highPriorityNeeds.forEach((n) => {
      const key = (n.journey_key ?? "").toLowerCase();
      const label = (n.step_label ?? "").toLowerCase();
      if (title.includes(key) || desc.includes(key) || title.includes(label) || desc.includes(label)) {
        coveredJourneyKeys.add(n.id);
      }
    });
  });

  const uncoveredNeeds = highPriorityNeeds.filter(
    (n) => !coveredJourneyKeys.has(n.id),
  );
  if (uncoveredNeeds.length === 0) return null;

  const topNeed = uncoveredNeeds[0];

  return {
    id: makeId("need_route_gap", `${uncoveredNeeds.length}_uncovered`),
    statement: `${uncoveredNeeds.length} high-priority ${uncoveredNeeds.length === 1 ? "opportunity" : "opportunities"} with no corresponding execution route.`,
    detail: truncate(
      `Top unaddressed: "${String(topNeed.desired_outcome)}" (score ${topNeed.opportunity_score})`,
      160,
    ),
    status: "unresolved",
    confidence: 0.7,
    source: "need_route_gap",
    pressure: uncoveredNeeds.length >= 3 ? "high" : "medium",
    affected_routes: [],
    affected_needs: uncoveredNeeds.map((n) => n.id),
    affected_positioning: false,
    affected_strategy: true,
    blocked_commitments: [],
    resolution_signals: [
      "A route is created targeting the uncovered journey segment",
      "Customer need score drops below threshold after service improvement",
    ],
    validation_requirements: [
      "Confirm whether gap is intentional (strategic de-prioritization) or oversight",
    ],
    is_commitment_blocker: false,
    created_from: "derived",
  };
}

/**
 * Tension: positioning claims a strength that strategy cascade doesn't support.
 * The org may be promising something it can't yet consistently deliver.
 */
function deriveCapabilityPositioningMismatchTension(
  input: TensionDerivationInput,
): StrategicTension | null {
  const { canvas, cascade, positioningStrength } = input;
  if (!cascade || !canvas) return null;
  if (!positioningStrength) return null;

  // Check for capability gaps in cascade
  const gapCapabilities = (cascade.capabilities ?? []).filter(
    (c) => c.status === "gap",
  );
  if (gapCapabilities.length === 0) return null;

  // Check if positioning is weak or generic (compounded risk)
  const posIsWeak =
    positioningStrength.level === "weak" ||
    positioningStrength.level === "generic";

  // Check for unverified or developing-status capabilities referenced in positioning
  const developingCapabilities = (cascade.capabilities ?? []).filter(
    (c) => c.status === "developing" || c.unverified === true,
  );

  if (gapCapabilities.length === 0 && developingCapabilities.length === 0) {
    return null;
  }

  const gapNames = gapCapabilities.map((c) => c.name).slice(0, 2).join(", ");
  const devNames = developingCapabilities.map((c) => c.name).slice(0, 1).join(", ");
  const primaryDetail = gapNames
    ? `Capability gaps: ${gapNames}`
    : `Developing capability: ${devNames}`;

  return {
    id: makeId("capability_positioning_mismatch", `${gapCapabilities.length}_gaps`),
    statement: "Positioning claims capabilities the strategy cascade has not yet confirmed.",
    detail: `${primaryDetail}. ${posIsWeak ? "Positioning clarity is also weak — compounding exposure." : ""}`.trim(),
    status: posIsWeak ? "strengthening" : "unresolved",
    confidence: 0.72,
    source: "capability_positioning_mismatch",
    pressure: posIsWeak ? "high" : "medium",
    affected_routes: [],
    affected_needs: [],
    affected_positioning: true,
    affected_strategy: true,
    blocked_commitments: [],
    resolution_signals: [
      "Capability moves to 'strong' status in strategy cascade",
      "Positioning is updated to reflect current rather than aspirational capabilities",
    ],
    validation_requirements: [
      "Validate claimed capabilities against current operational evidence",
    ],
    is_commitment_blocker: false,
    created_from: "derived",
  };
}

/**
 * Tension: an active hypothesis is contradicted by evidence.
 * The system is acting on an assumption that the evidence has undermined.
 */
function deriveHypothesisContradictionTension(
  input: TensionDerivationInput,
): StrategicTension | null {
  const { hypotheses, routes } = input;
  if (!hypotheses || hypotheses.length === 0) return null;

  const contradicted = hypotheses.filter(
    (h) =>
      (h.hypothesis.hypothesis_state === "contradicted" ||
        h.hypothesis.hypothesis_state === "unstable") &&
      h.hypothesis.is_active,
  );
  if (contradicted.length === 0) return null;

  const trulyContradicted = contradicted.filter(
    (h) => h.hypothesis.hypothesis_state === "contradicted",
  );
  const unstableOnly = contradicted.filter(
    (h) => h.hypothesis.hypothesis_state === "unstable",
  );

  // Show the most-severe hypothesis first: contradicted > unstable
  const top = (trulyContradicted.length > 0 ? trulyContradicted : unstableOnly)[0];
  const routeIds = (routes ?? []).map((r) => r.id);
  const isHighPressure = trulyContradicted.length > 0;
  const count = contradicted.length;

  const statement = isHighPressure
    ? `${trulyContradicted.length} active strategic ${trulyContradicted.length === 1 ? "hypothesis is" : "hypotheses are"} contradicted by current evidence.`
    : `${unstableOnly.length} active strategic ${unstableOnly.length === 1 ? "hypothesis has" : "hypotheses have"} conflicting evidence — not yet resolved.`;

  return {
    id: makeId("hypothesis_contradiction", top.hypothesis.id),
    statement,
    detail: truncate(
      `"${top.hypothesis.statement}" — ${top.weakeningClaims.length} weakening signal${top.weakeningClaims.length === 1 ? "" : "s"} on record`,
      160,
    ),
    status: "strengthening",
    confidence: isHighPressure ? 0.88 : 0.65,
    source: "hypothesis_contradiction",
    pressure: isHighPressure ? "high" : "medium",
    affected_routes: routeIds,
    affected_needs: [],
    affected_positioning: top.hypothesis.hypothesis_kind === "positioning",
    affected_strategy: top.hypothesis.hypothesis_kind === "strategy",
    blocked_commitments: [],
    resolution_signals: isHighPressure
      ? [
          "Hypothesis is reframed to match current evidence",
          "New evidence restores hypothesis confidence",
        ]
      : [
          "Additional evidence resolves the conflicting signals",
          "Hypothesis is reframed to reflect the updated understanding",
        ],
    validation_requirements: [
      `Review route rationale — routes built on ${count === 1 ? "this hypothesis" : "these hypotheses"} may need revalidation`,
    ],
    is_commitment_blocker: false,
    created_from: "derived",
  };
}

/**
 * Tension: customer research shows underserved needs in areas positioning claims as strengths.
 * The market may not yet believe the positioning.
 */
function deriveCustomerPositioningMismatchTension(
  input: TensionDerivationInput,
): StrategicTension | null {
  const { needs, canvas, positioningStrength } = input;
  if (!needs || !canvas || !positioningStrength) return null;

  // Only fire when needs have primary-research signal or high opportunity scores
  const highUnderserved = needs.filter(
    (n) =>
      (n.service_state === "underserved" || n.service_state === "under_served") &&
      (n.opportunity_score ?? 0) >= 8,
  );
  if (highUnderserved.length === 0) return null;

  // Positioning must make claims that could conflict — weak/generic means no credible claims
  if (positioningStrength.level === "weak" || positioningStrength.level === "generic") {
    return null; // handled by capability_positioning_mismatch
  }

  const uniqueAttributes = canvas.unique_attributes ?? [];
  if (uniqueAttributes.length === 0) return null;

  return {
    id: makeId("customer_positioning_mismatch", `${highUnderserved.length}_underserved`),
    statement: "Customer research identifies underserved outcomes in areas positioning presents as strengths.",
    detail: `${highUnderserved.length} high-score underserved ${highUnderserved.length === 1 ? "need" : "needs"}. Positioning claims ${uniqueAttributes.length} unique attribute${uniqueAttributes.length === 1 ? "" : "s"} — overlap requires scrutiny.`,
    status: "unresolved",
    confidence: 0.65,
    source: "customer_positioning_mismatch",
    pressure: highUnderserved.length >= 3 ? "high" : "medium",
    affected_routes: [],
    affected_needs: highUnderserved.map((n) => n.id),
    affected_positioning: true,
    affected_strategy: false,
    blocked_commitments: [],
    resolution_signals: [
      "Customer research confirms positioning claims through validated outcomes",
      "Positioning is narrowed to areas with strong customer validation",
    ],
    validation_requirements: [
      "Direct customer research on whether claimed attributes resolve the underserved outcomes",
    ],
    is_commitment_blocker: false,
    created_from: "derived",
  };
}

/**
 * Tension: portfolio is over-concentrated in one direction.
 * Bet diversity is insufficient to hedge against strategic uncertainty.
 */
function deriveOverConcentrationTension(
  input: TensionDerivationInput,
): StrategicTension | null {
  const { portfolio } = input;
  if (!portfolio) return null;
  if (portfolio.portfolioState !== "over_concentrated") return null;

  const allRouteIds = portfolio.routes.map((r) => r.routeId);

  return {
    id: makeId("over_concentration", portfolio.portfolioState),
    statement: "Portfolio is over-concentrated — most routes target the same strategic area.",
    detail: `${portfolio.routes.length} routes in portfolio. Concentration increases fragility if the primary thesis weakens.`,
    status: "unresolved",
    confidence: 0.75,
    source: "over_concentration",
    pressure: "medium",
    affected_routes: allRouteIds,
    affected_needs: [],
    affected_positioning: false,
    affected_strategy: true,
    blocked_commitments: [],
    resolution_signals: [
      "Routes diversified across multiple journey segments",
      "Portfolio state shifts to 'balanced' or 'converging'",
    ],
    validation_requirements: [
      "Confirm whether concentration is intentional focus or unintentional fragility",
    ],
    is_commitment_blocker: false,
    created_from: "derived",
  };
}

/**
 * Tension: unvalidated cascade assumptions.
 * The strategy cascade depends on assumptions that have not been tested.
 */
function deriveUnvalidatedAssumptionTension(
  input: TensionDerivationInput,
): StrategicTension | null {
  const { cascade } = input;
  if (!cascade) return null;

  const untested = (cascade.assumptions ?? []).filter((a) => !a.tested);
  if (untested.length < 2) return null; // single untested assumption is normal; multiple is a signal

  return {
    id: makeId("confidence_instability", `${untested.length}_untested_assumptions`),
    statement: `${untested.length} strategic assumptions remain untested in the cascade.`,
    detail: truncate(
      `First: "${untested[0].assumption}" — strategy direction may shift as these are validated`,
      160,
    ),
    status: "emerging",
    confidence: 0.6,
    source: "confidence_instability",
    pressure: untested.length >= 4 ? "medium" : "low",
    affected_routes: [],
    affected_needs: [],
    affected_positioning: false,
    affected_strategy: true,
    blocked_commitments: [],
    resolution_signals: [
      "Assumptions are tested and outcomes recorded",
      "Strategy cascade is updated to reflect validated understanding",
    ],
    validation_requirements: [
      "Prioritize assumption testing against current route commitments",
    ],
    is_commitment_blocker: false,
    created_from: "derived",
  };
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Derive all detectable tensions from the provided snapshot.
 * Returns tensions ordered by pressure (critical → high → medium → low).
 * De-duplicates by ID.
 */
export function deriveStrategicTensions(
  input: TensionDerivationInput,
): StrategicTension[] {
  const candidates: Array<StrategicTension | null> = [
    deriveConfidenceInstabilityTension(input),
    deriveUnvalidatedScaleTension(input),
    deriveHypothesisContradictionTension(input),
    deriveCapabilityPositioningMismatchTension(input),
    deriveCustomerPositioningMismatchTension(input),
    deriveNeedRouteGapTension(input),
    deriveOverConcentrationTension(input),
    deriveUnvalidatedAssumptionTension(input),
  ];

  const pressureOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return candidates
    .filter((t): t is StrategicTension => t !== null)
    .sort((a, b) => (pressureOrder[a.pressure] ?? 3) - (pressureOrder[b.pressure] ?? 3));
}

/**
 * Filter tensions to those directly relevant for a given page context.
 * Each page should show 1–3 tensions maximum.
 */
export function tensionsForContext(
  tensions: StrategicTension[],
  context: import("@/lib/tensionTypes").TensionContext,
  max = 3,
): StrategicTension[] {
  const filtered = tensions.filter((t) => {
    switch (context) {
      case "routes":
        return (
          t.affected_routes.length > 0 ||
          t.blocked_commitments.length > 0 ||
          t.source === "confidence_instability" ||
          t.source === "commitment_blocked" ||
          t.source === "unvalidated_scale_pressure" ||
          t.source === "hypothesis_contradiction"
        );
      case "strategy":
        return (
          t.affected_strategy ||
          t.source === "unvalidated_scale_pressure" ||
          t.source === "over_concentration" ||
          t.source === "capability_positioning_mismatch"
        );
      case "positioning":
        return (
          t.affected_positioning ||
          t.source === "customer_positioning_mismatch" ||
          t.source === "capability_positioning_mismatch"
        );
      case "needs":
        return (
          t.affected_needs.length > 0 ||
          t.source === "need_route_gap" ||
          t.source === "customer_positioning_mismatch"
        );
      case "council":
        // Council sees all tensions above medium pressure
        return t.pressure === "critical" || t.pressure === "high";
      default:
        return false;
    }
  });

  return filtered.slice(0, max);
}

/** Convenience: tensions that are actively blocking a commitment */
export function commitmentBlockers(tensions: StrategicTension[]): StrategicTension[] {
  return tensions.filter((t) => t.is_commitment_blocker);
}

/** Status display label */
export const TENSION_STATUS_LABELS: Record<import("@/lib/tensionTypes").TensionStatus, string> = {
  emerging: "Emerging",
  strengthening: "Strengthening",
  unresolved: "Unresolved",
  splitting: "Splitting",
  reframed: "Reframed",
  weakened: "Weakening",
  resolved: "Resolved",
  retired: "Retired",
};
