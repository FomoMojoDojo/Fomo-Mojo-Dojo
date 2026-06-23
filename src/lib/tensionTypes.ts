/**
 * Strategic tensions — unresolved conflicts with downstream implications.
 *
 * A tension is not a problem or recommendation. It is an unresolved strategic
 * pressure that exists BETWEEN systems: between customer evidence and org
 * capability, between positioning claims and validation state, between route
 * commitments and confidence levels.
 *
 * Tensions are suggestive, inspectable, and revisable — not conclusions.
 */

export type TensionStatus =
  | "emerging"       // newly detected, not yet confirmed
  | "strengthening"  // evidence accumulating
  | "unresolved"     // active, no movement toward resolution
  | "splitting"      // evidence pulling in two directions simultaneously
  | "reframed"       // the original tension was redefined
  | "weakened"       // evidence is reducing the tension
  | "resolved"       // sufficiently addressed
  | "retired";       // no longer relevant to current direction

export type TensionSource =
  | "route_conflict"                  // multiple routes pulling in conflicting directions
  | "customer_positioning_mismatch"   // what customers need vs what positioning claims
  | "capability_positioning_mismatch" // capability gaps undermining positioning claims
  | "confidence_instability"          // routes built on insufficient evidence
  | "commitment_blocked"              // routes ready but proof is missing
  | "unvalidated_scale_pressure"      // scaling commitment ahead of validation
  | "need_route_gap"                  // high-priority needs with no execution path
  | "hypothesis_contradiction"        // active hypothesis contradicted by evidence
  | "over_concentration"              // portfolio bets concentrated in one direction
  | "user_defined";                   // manually entered by user

export type TensionPressure = "low" | "medium" | "high" | "critical";

export interface StrategicTension {
  /** Stable identifier — derived tensions use deterministic IDs, stored use UUID */
  id: string;
  /** Plain-language statement of the unresolved conflict. Max 160 chars. */
  statement: string;
  /** One-line sub-detail explaining what drives this tension. */
  detail: string;
  status: TensionStatus;
  /** 0–1: how confident the system is that this tension is real */
  confidence: number;
  source: TensionSource;
  pressure: TensionPressure;
  /** Route IDs affected by this tension */
  affected_routes: string[];
  /** Need IDs this tension relates to */
  affected_needs: string[];
  affected_positioning: boolean;
  affected_strategy: boolean;
  /** Route IDs whose commitment is blocked by this tension */
  blocked_commitments: string[];
  /** What evidence or action would indicate this is resolving */
  resolution_signals: string[];
  /** What must be true before this tension can be resolved */
  validation_requirements: string[];
  /** Whether this tension is blocking a safe route commitment */
  is_commitment_blocker: boolean;
  /** "derived" = computed at runtime; "stored" = persisted in DB */
  created_from: "derived" | "stored";
}

/** Input required by the derivation engine — all fields optional */
export interface TensionDerivationInput {
  routes?: import("@/hooks/useRoutes").RouteRow[];
  needs?: import("@/hooks/useOdiNeeds").OdiNeedRow[];
  canvas?: import("@/lib/types").PositioningCanvas | null;
  cascade?: import("@/lib/types").StrategyCascade | null;
  sourceSignals?: import("@/lib/sourceConfidence").SourceConfidenceSignals;
  portfolio?: import("@/lib/decisionSystem").DecisionPortfolio;
  hypotheses?: import("@/hooks/useStrategicHypotheses").HypothesisProvenanceCard[];
  positioningStrength?: import("@/lib/positioningStrength").PositioningStrengthResult;
}

/** Filter tensions to those relevant for a given page context */
export type TensionContext =
  | "routes"
  | "strategy"
  | "positioning"
  | "needs"
  | "council";
