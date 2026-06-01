/**
 * Canonical strategic object ontology.
 *
 * This file defines the seven canonical objects of the strategic reasoning system
 * and the relationship, lens, and narrative types that connect them. It is the
 * authoritative type layer for all object-centric views and lenses — nothing here
 * is tied to a specific database schema or UI component.
 *
 * Naming conventions vs. existing files:
 * - `OntologyObjectKind`  — the 7 canonical ontology objects (this file).
 *   Distinct from `StrategicObjectType` in strategicGraphDomain.ts, which covers
 *   lower-level artifact tracking types (signal, claim, job_step, route, etc.).
 * - `SourceLayer`         — full-name source tiers ("organization", not "org").
 *   Parallel to `SignalTier` in strategicObject.ts, which uses abbreviated forms
 *   for display. Use SourceLayer for ontology logic; SignalTier for UI cells.
 * - `AuthorityBand`       — the 3-band signal weighting system lives in
 *   signalAuthority.ts. SourceLayer is the 4-layer ontological classification.
 */

// ─── 1. Primitives ─────────────────────────────────────────────────────────────

/** The seven canonical objects of the strategic reasoning system. */
export type OntologyObjectKind =
  | "strategic_direction"
  | "strategic_route"
  | "market_tension"
  | "customer_need"
  | "strategic_signal"
  | "confidence_domain"
  | "assumption";

/**
 * Source-layer classification for signals and evidence.
 * Uses full names ("organization") — parallel to SignalTier ("org") in
 * strategicObject.ts, which is the abbreviated display variant.
 */
export type SourceLayer =
  | "outside"          // public research, competitive intelligence, baselines
  | "organization"     // uploaded org documents, internal data
  | "customer"         // primary research, interviews, validated data
  | "market_validation"; // confirmed market signal, competitive proof

/**
 * Product-phase labels. Distinct from AuthorityPhase in signalAuthority.ts,
 * which is the signal-weighting phase (pre_diagnosis/diagnose/focus/flow).
 */
export type ProductPhase = "foundation" | "refine" | "decision";

/** Authority weight for each source layer. Higher = more authoritative. */
export const SOURCE_AUTHORITY_WEIGHTS: Record<SourceLayer, number> = {
  customer:            1.0,
  organization:        0.85,
  market_validation:   0.7,
  outside:             0.6,
} as const;

// ─── 2. Hero capability ────────────────────────────────────────────────────────

/**
 * StrategicDirection leads when the system is explaining orientation.
 * StrategicRoute leads when explaining commitment, action, or movement.
 */
export type HeroMode =
  | "orientation"  // StrategicDirection: "here is where we are going"
  | "commitment"   // StrategicRoute: "here is what we are doing"
  | "action"       // StrategicRoute: elevated when actively in execution
  | "movement"     // StrategicRoute: elevated when a delta / change is the story
  | "none";

export type HeroCapability = {
  heroCapable: boolean;
  supportedHeroModes: HeroMode[];
  /** The mode this object uses when it leads the hero section by default. */
  defaultHeroMode: HeroMode;
};

// ─── 3. Narrative & display metadata ──────────────────────────────────────────

/** Per-source-layer signal count breakdown attached to any strategic object. */
export type EvidenceShape = {
  outside: number;
  organization: number;
  customer: number;
  market_validation: number;
  /** Total signals classified as supporting the object. */
  supporting: number;
  /** Total signals classified as contradicting the object. */
  contradicting: number;
  /** Explicitly flagged evidence gaps. */
  missing: number;
};

/** A reference to an originating document or artifact. */
export type SourceRef = {
  id: string;
  label: string;
  sourceLayer: SourceLayer;
  url?: string;
  createdAt: string;
};

/**
 * Narrative and display metadata shared by every canonical object.
 * Populates the hero section, inspect panels, and lens outputs.
 */
export type NarrativeMetadata = {
  /** Short, context-aware label used in hero positions and card headers. */
  headline: string;
  /** 1–3 sentence summary suitable for compressed card view. */
  summary: string;
  /** Plain-language confidence grade surfaced to users. */
  confidenceLabel: "none" | "low" | "moderate" | "strong" | "validated";
  /** Signal distribution across source layers. */
  evidenceShape: EvidenceShape;
  /** Which product phases this object is most prominent in. */
  phaseRelevance: ProductPhase[];
  /** Whether this object has a dedicated inspect panel. */
  inspectable: boolean;
  /** Traceable source documents and artifacts for this object. */
  sourceRefs: SourceRef[];
};

// ─── 4. Reconciliation metadata ───────────────────────────────────────────────
//
// Reconciliation is NOT a full canonical object.
// It is represented as:
//   (a) first-class relationship types ("reconciles", "diverges_from")
//   (b) a first-class lens type ("reconciliation")
//   (c) ReconciliationFlag on LensOutput — surfaced when inspecting any object
//       that participates in an unresolved contradiction
//
// The rich reconciliation narrative logic lives in reconciliationNarrative.ts.
// This type captures the lightweight flag that the ontology layer carries.

export type ReconciliationFlag = {
  /** The two object IDs that are in conflict or are being reconciled. */
  conflictingObjectIds: [string, string];
  /** Their ontology kinds. */
  conflictingObjectKinds: [OntologyObjectKind, OntologyObjectKind];
  /** Plain-language description of what is in conflict. */
  description: string;
  /**
   * Authority weights for each side. The first weight corresponds to the first
   * conflicting object, the second to the second.
   */
  authorityWeights: [number, number];
  resolution: "pending" | "user_resolved" | "signal_resolved" | "deferred";
  resolvedBySignalId?: string;
};

// ─── 5. Relationship types ─────────────────────────────────────────────────────

export const RELATIONSHIP_TYPES = [
  "realizes",       // StrategicDirection → StrategicRoute (direction is realized through routes)
  "aligns_with",    // StrategicRoute → StrategicDirection (route coherence check)
  "addresses",      // StrategicRoute → MarketTension; MarketTension → CustomerNeed
  "serves",         // StrategicRoute → CustomerNeed
  "rests_on",       // StrategicRoute | StrategicDirection → Assumption
  "supports",       // StrategicSignal → StrategicRoute | StrategicDirection | ConfidenceDomain
  "contradicts",    // StrategicSignal → StrategicRoute | StrategicDirection
  "validates",      // StrategicSignal → Assumption
  "weakens",        // StrategicSignal → ConfidenceDomain (opposing evidence reduces score)
  "unlocks",        // StrategicRoute → StrategicRoute (this route enables that one)
  "depends_on",     // StrategicRoute → StrategicRoute (prerequisite relationship)
  "reframes",       // Lens changes the reading of an object; MarketTension → CustomerNeed
  "reconciles",     // Connects two objects that were in contradiction and are converging
  "diverges_from",  // Marks two objects as in active, unresolved tension
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/**
 * How well-established this relationship is.
 * "definitive"  — directly observed, high-authority signal
 * "strong"      — multiple corroborating signals
 * "moderate"    — some evidence, no strong contradiction
 * "weak"        — inferred, thin evidence
 * "inferred"    — derived algorithmically with no direct signal
 */
export type RelationshipStrength =
  | "definitive"
  | "strong"
  | "moderate"
  | "weak"
  | "inferred";

/**
 * Lifecycle state of the relationship itself.
 * "active"    — relationship is current and contributing
 * "stale"     — a dependency changed; relationship needs re-evaluation
 * "resolved"  — was contested or reconciling; now settled
 * "contested" — active contradiction between the two objects
 */
export type RelationshipState =
  | "active"
  | "stale"
  | "resolved"
  | "contested";

/** A typed, directional edge between two canonical strategic objects. */
export type StrategicObjectRelationship = {
  id: string;
  type: RelationshipType;
  fromId: string;
  fromKind: OntologyObjectKind;
  toId: string;
  toKind: OntologyObjectKind;
  strength: RelationshipStrength;
  state: RelationshipState;
  /** ISO timestamp — stale when a contributing object changes after this. */
  lastEvaluatedAt: string;
  /**
   * Present only on "reconciles" and "diverges_from" relationships.
   * Carries the reconciliation flag for surface in lens outputs.
   */
  reconciliation?: ReconciliationFlag;
  metadata?: Record<string, unknown>;
};

// ─── 6. Lens types ─────────────────────────────────────────────────────────────

export const LENS_TYPES = [
  "positioning",
  "customer_reality",
  "evidence",
  "validation",
  "strategy_cascade",
  "market_dynamics",
  "reconciliation",
  "confidence",
] as const;

export type LensType = (typeof LENS_TYPES)[number];

/**
 * Which object kinds each lens is permitted to inspect.
 * Lenses that attempt to inspect an unsupported kind should be suppressed.
 */
export const LENS_SUPPORTED_OBJECTS: Record<LensType, readonly OntologyObjectKind[]> = {
  positioning:      ["strategic_direction", "strategic_route", "market_tension"],
  customer_reality: ["customer_need", "strategic_route", "market_tension", "strategic_direction"],
  evidence:         ["strategic_direction", "strategic_route", "market_tension", "customer_need", "strategic_signal", "confidence_domain", "assumption"],
  validation:       ["strategic_route", "assumption", "strategic_direction"],
  strategy_cascade: ["strategic_route", "strategic_direction"],
  market_dynamics:  ["market_tension", "strategic_route", "strategic_signal"],
  reconciliation:   ["strategic_direction", "strategic_route", "market_tension", "customer_need", "assumption"],
  confidence:       ["confidence_domain", "strategic_route", "strategic_direction"],
} as const;

/** A single collapsible section within a lens output. */
export type LensSection = {
  id: string;
  label: string;
  /** Primary prose or structured summary for this section. */
  content: string;
  /** Whether this section renders expanded by default. */
  defaultExpanded: boolean;
  sourceRefs: SourceRef[];
  /** Cross-object links rendered within this section. */
  relationships: StrategicObjectRelationship[];
};

/** The rendered output of applying a lens to a specific object. */
export type LensOutput = {
  lensType: LensType;
  targetId: string;
  targetKind: OntologyObjectKind;
  headline: string;
  sections: LensSection[];
  /**
   * Reconciliation flags surfaced by this lens.
   * Always populated for the "reconciliation" lens; may also appear in
   * "evidence" and "validation" lenses when contradictions are detected.
   */
  reconciliationFlags: ReconciliationFlag[];
  generatedAt: string;
};

/** Static descriptor for a lens — its capabilities and scope. */
export type StrategicLens = {
  type: LensType;
  label: string;
  description: string;
  supportedObjectKinds: readonly OntologyObjectKind[];
  /** Whether this lens tab appears expanded by default in the inspect panel. */
  defaultExpanded: boolean;
};

// ─── 7. Canonical object types ─────────────────────────────────────────────────

// ── StrategicDirection ──

export type DirectionLifecycle = "set" | "validated" | "challenged" | "revised";

/**
 * The organization's committed answer to "where to play and how to win."
 *
 * Hero role: leads when the system is explaining ORIENTATION — where the
 * company is going, what it has committed to, how it reads the landscape.
 * Routes lead when the focus shifts to commitment, action, or movement.
 */
export type StrategicDirection = {
  readonly _kind: "strategic_direction";
  id: string;
  companyId: string;
  winningAspiration: string;
  whereToPlay: string[];
  howToWin: string[];
  capabilities: string[];
  lifecycle: DirectionLifecycle;
  setAt: string;
  lastRevisedAt?: string;
  /**
   * ID of the strategy_cascade ConfidenceDomain that scores this direction.
   * Null until a confidence domain has been computed.
   */
  confidenceDomainId?: string;
  narrative: NarrativeMetadata;
  /**
   * StrategicDirection is hero-capable.
   * defaultHeroMode is always "orientation".
   */
  hero: HeroCapability & { defaultHeroMode: "orientation" };
  /** Populated at render time from the relationship graph; not stored. */
  relationships?: StrategicObjectRelationship[];
};

// ── StrategicRoute ──

export type RouteCategory = "fix" | "improve" | "create";

export type RouteLifecycle = "inferred" | "active" | "stale" | "validated" | "superseded";

export type DirectionAlignment = "aligned" | "partial" | "challenged" | "unknown";

/**
 * A specific, time-bounded path to capture value.
 *
 * Hero role: leads when explaining COMMITMENT (we are doing this),
 * ACTION (this is the current execution focus), or MOVEMENT (this changed).
 * StrategicDirection leads when the framing is orientation.
 */
export type StrategicRoute = {
  readonly _kind: "strategic_route";
  id: string;
  companyId: string;
  title: string;
  category: RouteCategory;
  ptsValue: number;
  effort: "low" | "medium" | "high";
  /** 2–3 plain-language bullets explaining why this route was surfaced. */
  whyThisMatters: string[];
  steps: { id: string; title: string; status: string }[];
  evidence: { id: string; title: string; status: string }[];
  /**
   * Internal: which frameworks generated this route.
   * NEVER surfaced raw in user-facing strings — use generationContextLabel().
   */
  frameworksUsed: string[];
  directionId?: string;
  directionAlignment: DirectionAlignment;
  lifecycle: RouteLifecycle;
  narrative: NarrativeMetadata;
  /**
   * StrategicRoute is hero-capable.
   * defaultHeroMode is "commitment". Elevated to "action" or "movement"
   * by the rendering layer based on phase and delta context.
   */
  hero: HeroCapability & {
    defaultHeroMode: "commitment";
    activeHeroMode?: "action" | "movement";
  };
  relationships?: StrategicObjectRelationship[];
};

// ── MarketTension ──

export type TensionLifecycle = "detected" | "validated" | "addressed" | "resolved" | "dormant";

export type TensionMomentum = "intensifying" | "stable" | "resolving";

/**
 * An observable, unresolved dynamic in the market — a gap between what
 * customers need and what the market provides, or a conflict between
 * competing forces. Tensions explain WHY routes exist.
 */
export type MarketTension = {
  readonly _kind: "market_tension";
  id: string;
  companyId: string;
  label: string;
  description: string;
  /** 0–100: how significant this tension is for the current direction. */
  severity: number;
  momentum: TensionMomentum;
  sourceLayer: SourceLayer;
  lifecycle: TensionLifecycle;
  detectedAt: string;
  narrative: NarrativeMetadata;
  relationships?: StrategicObjectRelationship[];
};

// ── CustomerNeed ──

export type ServiceState = "under_served" | "over_served" | "appropriately_served";

export type NeedLifecycle = "inferred" | "validated" | "monitored" | "retired";

/**
 * A specific, measurable desired outcome a job performer wants to achieve.
 * ODI-native: direction-neutral, immutable statement, scoreable.
 * The opportunity score is the primary ranking signal.
 */
export type CustomerNeed = {
  readonly _kind: "customer_need";
  id: string;
  companyId: string;
  desiredOutcome: string;
  /** 0–10, customer-stated or inferred. */
  importance: number;
  /** 0–10, current level of satisfaction with existing solutions. */
  satisfaction: number;
  /** Computed: (importance − satisfaction) × importance */
  opportunityScore: number;
  serviceState: ServiceState;
  journeyKey: string;
  stepNumber: number;
  stepLabel: string;
  sourcePath: string;
  sourceLayer: SourceLayer;
  lifecycle: NeedLifecycle;
  narrative: NarrativeMetadata;
  relationships?: StrategicObjectRelationship[];
};

// ── StrategicSignal ──

export type SignalLifecycle = "ingested" | "active" | "stale" | "superseded" | "archived";

/**
 * A discrete, sourced piece of evidence that affects the confidence or
 * direction of a strategic object. Signals are atomic: one claim, one source,
 * one authority weight. Everything else is derived from their combinations.
 */
export type StrategicSignal = {
  readonly _kind: "strategic_signal";
  id: string;
  companyId: string;
  claim: string;
  sourceLayer: SourceLayer;
  /** "document" | "research" | "inference" | "synthesis" | "baseline" | "manual" */
  sourceType: string;
  /** 0–1, derived from sourceLayer via SOURCE_AUTHORITY_WEIGHTS. */
  authorityWeight: number;
  lifecycle: SignalLifecycle;
  ingestedAt: string;
  sourceDocumentId?: string;
  sourceDocumentLabel?: string;
  narrative: NarrativeMetadata;
  relationships?: StrategicObjectRelationship[];
};

// ── ConfidenceDomain ──

export const CONFIDENCE_DOMAIN_TYPES = [
  "customer_insight",
  "strategy_cascade",
  "market_dynamics",
  "route_completeness",
  "gtm_execution",
] as const;

export type ConfidenceDomainType = (typeof CONFIDENCE_DOMAIN_TYPES)[number];

export type DomainLifecycle = "calculated" | "stable" | "degrading" | "recovering";

export type ConfidenceDomainComponent = {
  key: string;
  label: string;
  /** 0–1 normalized component score. */
  score: number;
  /** Relative weight in the domain composite score. */
  weight: number;
};

/**
 * A scored, structured assessment of how well-evidenced a specific area of
 * strategic knowledge is. The MojoScore is a composite of domain scores.
 * Unvalidated Assumptions are the primary suppressor of domain scores.
 */
export type ConfidenceDomain = {
  readonly _kind: "confidence_domain";
  id: string;
  companyId: string;
  domainType: ConfidenceDomainType;
  label: string;
  /** 0–100 composite score. */
  score: number;
  components: ConfidenceDomainComponent[];
  /** IDs of unvalidated Assumptions currently suppressing this domain's score. */
  suppressorAssumptionIds: string[];
  lifecycle: DomainLifecycle;
  lastCalculatedAt: string;
  /** Plain-language: what evidence is missing that would raise this score. */
  gapNarrative: string;
  narrative: NarrativeMetadata;
  relationships?: StrategicObjectRelationship[];
};

// ── Assumption ──

export type AssumptionStatus = "unvalidated" | "testing" | "confirmed" | "invalidated";

export type AssumptionRiskLevel = "low" | "medium" | "high" | "critical";

export type AssumptionLifecycle = "inferred" | "explicit" | "testing" | "confirmed" | "invalidated";

/**
 * An explicit belief that a Route or Direction depends on being true
 * but has not yet been validated. Assumptions are the bridge between
 * current evidence and future commitment. Unvalidated high-risk assumptions
 * are the primary mechanism that suppresses confidence domain scores.
 */
export type Assumption = {
  readonly _kind: "assumption";
  id: string;
  companyId: string;
  statement: string;
  status: AssumptionStatus;
  riskLevel: AssumptionRiskLevel;
  /** Plain-language: what breaks or weakens if this assumption is false. */
  riskDescription: string;
  /** What signal or test would confirm or deny this assumption. */
  validationPath?: string;
  underliesKind: "strategic_route" | "strategic_direction";
  underliesId: string;
  validatedBySignalId?: string;
  invalidatedBySignalId?: string;
  lifecycle: AssumptionLifecycle;
  createdAt: string;
  updatedAt: string;
  narrative: NarrativeMetadata;
  relationships?: StrategicObjectRelationship[];
};

// ─── 8. Union type and type guards ─────────────────────────────────────────────

/** Discriminated union of all canonical strategic objects. */
export type StrategicOntologyObject =
  | StrategicDirection
  | StrategicRoute
  | MarketTension
  | CustomerNeed
  | StrategicSignal
  | ConfidenceDomain
  | Assumption;

export function isStrategicDirection(obj: StrategicOntologyObject): obj is StrategicDirection {
  return obj._kind === "strategic_direction";
}

export function isStrategicRoute(obj: StrategicOntologyObject): obj is StrategicRoute {
  return obj._kind === "strategic_route";
}

export function isMarketTension(obj: StrategicOntologyObject): obj is MarketTension {
  return obj._kind === "market_tension";
}

export function isCustomerNeed(obj: StrategicOntologyObject): obj is CustomerNeed {
  return obj._kind === "customer_need";
}

export function isStrategicSignal(obj: StrategicOntologyObject): obj is StrategicSignal {
  return obj._kind === "strategic_signal";
}

export function isConfidenceDomain(obj: StrategicOntologyObject): obj is ConfidenceDomain {
  return obj._kind === "confidence_domain";
}

export function isAssumption(obj: StrategicOntologyObject): obj is Assumption {
  return obj._kind === "assumption";
}

/**
 * Returns true for objects that can occupy the hero position.
 * Currently: StrategicDirection and StrategicRoute.
 */
export function isHeroCapable(
  obj: StrategicOntologyObject,
): obj is StrategicDirection | StrategicRoute {
  return obj._kind === "strategic_direction" || obj._kind === "strategic_route";
}

/**
 * Returns true if the given lens type is permitted to inspect the given
 * object kind. Use this to suppress lens tabs that have no applicable content.
 */
export function isLensCompatible(lensType: LensType, kind: OntologyObjectKind): boolean {
  return (LENS_SUPPORTED_OBJECTS[lensType] as readonly string[]).includes(kind);
}
