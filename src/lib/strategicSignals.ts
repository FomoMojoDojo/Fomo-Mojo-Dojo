/**
 * Strategic Signal Synthesis
 *
 * Compresses the full evidence landscape into a ranked, grouped set of
 * strategic signals for executive-scanning display.
 *
 * Signal sources (priority order):
 *   1. Decision portfolio pressure (escalations, blocked, commit-ready)
 *   2. Customer reality posture
 *   3. Positioning narrative posture
 *   4. Strategic hypothesis cards (sorted by pressure)
 *
 * Compression rules:
 *   - Max 8 signals total
 *   - Max 3 per group
 *   - Suppress signals whose statement echoes the center headline (token overlap ≥ 0.35)
 *   - Deduplicate by 60-char statement prefix
 *   - No framework language ("hypothesis", "assumption", "confidence level")
 *   - Statements ≤ 120 chars
 */

import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { RouteRationale } from "@/lib/routeRationale";
import type { StrategicCenterSurface } from "@/lib/strategicCenterSurface";
import type { CustomerRealityNarrative } from "@/lib/customerRealityNarrative";
import type { PositioningLensNarrative } from "@/lib/positioningLensNarrative";
import type { DecisionPortfolio } from "@/lib/decisionSystem";
import type { DisciplineAssessment } from "@/lib/confidenceDiscipline";
import { scoreSignalPriority, type AttentionContext } from "@/lib/strategicAttention";
import type { DecayContext } from "@/lib/strategicDecay";

// ─── Public types ──────────────────────────────────────────────────────────────

export type SignalPolarity =
  | "reinforcing"    // strengthens the center direction
  | "weakening"      // undermines the center direction
  | "unresolved"     // unvalidated assumption floating above the direction
  | "contradictory"  // active conflict across signal layers
  | "accelerating"   // momentum building toward commitment
  | "blocked";       // validation or sequencing is blocked

export type SignalPressure = "low" | "medium" | "high";

export type SignalMovement =
  | "strengthening"
  | "weakening"
  | "unchanged"
  | "emerging"
  | "unresolved";

export type SignalRelevance =
  | "strategic_direction"
  | "customer_proof"
  | "positioning"
  | "commitment_pressure"
  | "sequencing"
  | "market_perception";

export type StrategicSignal = {
  id: string;
  statement: string;
  polarity: SignalPolarity;
  pressure: SignalPressure;
  movement: SignalMovement;
  relevance: SignalRelevance;
  /** Expansion text for "why this matters" collapse. */
  whyItMatters: string | null;
  /** Route ID if the signal is linked to a specific route (for inspect trigger). */
  linkedRouteId: string | null;
};

export type StrategicSignalGroup = {
  polarity: SignalPolarity;
  label: string;
  signals: StrategicSignal[];
};

export type StrategicSignalSurface = {
  groups: StrategicSignalGroup[];
  totalCount: number;
  hasBlockingSignals: boolean;
  hasConflictingSignals: boolean;
  /**
   * Number of signals suppressed by attention quota enforcement.
   * Zero when no attention context is provided.
   */
  attentionSuppressedCount: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_SIGNALS = 8;
const MAX_PER_GROUP = 3;
const CENTER_ECHO_THRESHOLD = 0.35;

const GROUP_ORDER: SignalPolarity[] = [
  "accelerating",
  "reinforcing",
  "weakening",
  "contradictory",
  "blocked",
  "unresolved",
];

export const GROUP_LABELS: Record<SignalPolarity, string> = {
  accelerating:  "Accelerating",
  reinforcing:   "Reinforcing",
  weakening:     "Weakening",
  contradictory: "Conflicting",
  blocked:       "Blocked",
  unresolved:    "Unresolved",
};

// ─── Deduplication helpers ────────────────────────────────────────────────────

function tokenOverlap(a: string, b: string): number {
  const tokenize = (s: string) =>
    new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length > 3));
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let shared = 0;
  for (const t of tokA) if (tokB.has(t)) shared++;
  return shared / Math.min(tokA.size, tokB.size);
}

function statementKey(s: string): string {
  return s.trim().toLowerCase().slice(0, 60);
}

function truncate(s: string, max = 120): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── Pressure / ranking helpers ───────────────────────────────────────────────

function pressureScore(p: SignalPressure): number {
  if (p === "high") return 3;
  if (p === "medium") return 2;
  return 1;
}

function relevanceScore(r: SignalRelevance): number {
  if (r === "customer_proof") return 4;
  if (r === "commitment_pressure") return 3;
  if (r === "positioning") return 2;
  return 1;
}

function sortSignals(signals: StrategicSignal[]): StrategicSignal[] {
  return [...signals].sort(
    (a, b) =>
      pressureScore(b.pressure) * 10 + relevanceScore(b.relevance) -
      (pressureScore(a.pressure) * 10 + relevanceScore(a.relevance)),
  );
}

// ─── Hypothesis card → signal ─────────────────────────────────────────────────

function aggregateSourceMix(claims: HypothesisProvenanceCard["supportingClaims"]) {
  return claims.reduce(
    (acc, c) => {
      acc.outside += c.supportShape.outside;
      acc.organization += c.supportShape.organization;
      acc.customer += c.supportShape.customer;
      return acc;
    },
    { outside: 0, organization: 0, customer: 0 },
  );
}

function hypothesisWhyItMatters(
  row: HypothesisProvenanceCard,
  polarity: SignalPolarity,
): string {
  const sourceMix = aggregateSourceMix(row.supportingClaims);
  const hasCustomer = sourceMix.customer > 0;
  const hasOrg = sourceMix.organization > 0;
  const hasOutside = sourceMix.outside > 0;
  const weakeningCount = row.weakeningClaims.length;

  if (polarity === "contradictory") {
    return weakeningCount === 1
      ? "One conflicting thread — this signal is under pressure."
      : `${weakeningCount} conflicting threads — resolve before committing.`;
  }
  if (polarity === "unresolved") {
    return "Still unvalidated — will sharpen as customer and market evidence builds.";
  }
  if (hasCustomer && hasOrg && hasOutside) {
    return "Evidence spans customer, internal, and outside sources.";
  }
  if (hasCustomer && hasOrg) {
    return "Customer and internal evidence align.";
  }
  if (hasCustomer) {
    return "Customer evidence backs this direction.";
  }
  if (hasOrg && hasOutside) {
    return "Internal and outside evidence align — customer validation still missing.";
  }
  if (hasOrg) {
    return "Internal evidence only — customer validation still needed.";
  }
  return "Outside signals only — internal and customer validation missing.";
}

function signalFromHypothesis(
  row: HypothesisProvenanceCard,
): StrategicSignal | null {
  const h = row.hypothesis;
  if (!h.is_active) return null;
  if (h.hypothesis_state === "retired") return null;

  let polarity: SignalPolarity;
  let movement: SignalMovement;

  switch (h.hypothesis_state) {
    case "strengthened":
      polarity = "reinforcing";
      movement = "strengthening";
      break;
    case "emerging":
      polarity = "reinforcing";
      movement = "emerging";
      break;
    case "contradicted":
      polarity = "contradictory";
      movement = "weakening";
      break;
    case "inferred":
      polarity = "unresolved";
      movement = h.hypothesis_kind === "directional_hypothesis" ? "emerging" : "unresolved";
      break;
    case "reframed":
      polarity = "unresolved";
      movement = "unchanged";
      break;
    default:
      return null;
  }

  const pressure: SignalPressure =
    h.confidence === "high" ? "high" : h.confidence === "medium" ? "medium" : "low";

  const sourceMix = aggregateSourceMix(row.supportingClaims);
  const relevance: SignalRelevance =
    sourceMix.customer > 0 ? "customer_proof" : "strategic_direction";

  return {
    id: `hyp-${h.id}`,
    statement: truncate(h.statement),
    polarity,
    pressure,
    movement,
    relevance,
    whyItMatters: hypothesisWhyItMatters(row, polarity),
    linkedRouteId: null,
  };
}

// ─── Customer reality → signals ───────────────────────────────────────────────

function signalsFromCustomerReality(
  reality: CustomerRealityNarrative,
): StrategicSignal[] {
  const { posture, directionGrounding, unresolved, conflicts } = reality;
  const signals: StrategicSignal[] = [];

  switch (posture) {
    case "grounded":
      signals.push({
        id: "cr-grounded",
        statement: "Customer signals confirm the direction.",
        polarity: "reinforcing",
        pressure: "high",
        movement: "strengthening",
        relevance: "customer_proof",
        whyItMatters: directionGrounding || "Customer validation is aligned with the strategy.",
        linkedRouteId: null,
      });
      break;
    case "converging":
      signals.push({
        id: "cr-converging",
        statement: "Customer validation is converging.",
        polarity: "reinforcing",
        pressure: "medium",
        movement: "strengthening",
        relevance: "customer_proof",
        whyItMatters: directionGrounding || "Customer signals are starting to align.",
        linkedRouteId: null,
      });
      break;
    case "directional":
      signals.push({
        id: "cr-directional",
        statement: "Customer proof directional. Not yet confirmed against real decisions.",
        polarity: "unresolved",
        pressure: "medium",
        movement: "emerging",
        relevance: "customer_proof",
        whyItMatters: directionGrounding || "Commitment decisions should wait for stronger customer signal.",
        linkedRouteId: null,
      });
      break;
    case "inferred":
      signals.push({
        id: "cr-inferred",
        statement: "Customer proof missing. Direction ahead of proof.",
        polarity: "unresolved",
        pressure: "high",
        movement: "unresolved",
        relevance: "customer_proof",
        whyItMatters: unresolved[0] ?? "Customer signal is based on inference, not direct validation.",
        linkedRouteId: null,
      });
      break;
    case "contradicted":
      signals.push({
        id: "cr-contradicted",
        statement: conflicts[0]?.description ?? "Customer behavior contradicts the current direction.",
        polarity: "contradictory",
        pressure: "high",
        movement: "weakening",
        relevance: "customer_proof",
        whyItMatters: "Customer behavior is actively contradicting the current strategic read.",
        linkedRouteId: null,
      });
      break;
    case "fragmented":
      signals.push({
        id: "cr-fragmented",
        statement: "Customer signals fragmented. No consistent thread.",
        polarity: "weakening",
        pressure: "medium",
        movement: "unresolved",
        relevance: "customer_proof",
        whyItMatters: "Multiple customer signals are pulling in different directions. Resolve before committing.",
        linkedRouteId: null,
      });
      break;
  }

  return signals;
}

// ─── Positioning narrative → signals ──────────────────────────────────────────

function signalsFromPositioning(
  narrative: PositioningLensNarrative,
): StrategicSignal[] {
  const { posture, tensions, marketPerception, intendedIdentity } = narrative;
  const signals: StrategicSignal[] = [];

  if (posture === "contradicted" && tensions.length > 0) {
    signals.push({
      id: "pos-contradicted",
      statement: truncate(tensions[0].description),
      polarity: "contradictory",
      pressure: "high",
      movement: "weakening",
      relevance: "market_perception",
      whyItMatters: marketPerception && intendedIdentity
        ? `Market still reads as "${marketPerception}" — the intended "${intendedIdentity}" positioning is not landing.`
        : "Public perception and strategic positioning are pulling in opposite directions.",
      linkedRouteId: null,
    });
  } else if (posture === "fragmented") {
    signals.push({
      id: "pos-fragmented",
      statement: "Positioning coherence weakening. Routes diverging.",
      polarity: "weakening",
      pressure: "medium",
      movement: "weakening",
      relevance: "positioning",
      whyItMatters: "Resolve route coherence before hardening the positioning claim.",
      linkedRouteId: null,
    });
  } else if (posture === "emerging" || posture === "coherent") {
    const statement =
      posture === "coherent"
        ? "Positioning coherent across routes."
        : "Positioning stabilizing. Routes and direction aligning.";
    signals.push({
      id: `pos-${posture}`,
      statement,
      polarity: "reinforcing",
      pressure: posture === "coherent" ? "high" : "medium",
      movement: posture === "coherent" ? "strengthening" : "emerging",
      relevance: "positioning",
      whyItMatters: marketPerception
        ? `Market reads as "${marketPerception}". Continued route coherence will sharpen the intended identity.`
        : "Route and positioning coherence is building.",
      linkedRouteId: null,
    });
  }

  return signals;
}

// ─── Decision portfolio → signals ─────────────────────────────────────────────

function signalsFromPortfolio(portfolio: DecisionPortfolio): StrategicSignal[] {
  const signals: StrategicSignal[] = [];

  // Accelerating: routes ready to commit
  if (portfolio.safeToCommit.length > 0) {
    const names = portfolio.safeToCommit.slice(0, 2).join(" and ");
    signals.push({
      id: "port-safe-commit",
      statement:
        portfolio.safeToCommit.length === 1
          ? `${names} ready to commit. Evidence converging.`
          : `${names} ready to commit. Evidence converging.`,
      polarity: "accelerating",
      pressure: "high",
      movement: "strengthening",
      relevance: "commitment_pressure",
      whyItMatters: "Enough signal to move from validation to commitment. Delaying creates unnecessary drag.",
      linkedRouteId: null,
    });
  }

  // Blocked: routes stuck in validation
  if (portfolio.blocked.length > 0) {
    const names = portfolio.blocked.slice(0, 2).join(" and ");
    signals.push({
      id: "port-blocked",
      statement:
        portfolio.blocked.length === 1
          ? `${names} is blocked — prerequisites unresolved.`
          : `${portfolio.blocked.length} routes are blocked — prerequisites unresolved.`,
      polarity: "blocked",
      pressure: "medium",
      movement: "unchanged",
      relevance: "sequencing",
      whyItMatters: "These routes cannot move forward until their prerequisites are resolved.",
      linkedRouteId: null,
    });
  }

  // Converging: routes closing in on commitment
  if (portfolio.converging.length > 0 && portfolio.safeToCommit.length === 0) {
    const names = portfolio.converging.slice(0, 2).join(" and ");
    signals.push({
      id: "port-converging",
      statement:
        portfolio.converging.length === 1
          ? `${names} is converging toward commitment.`
          : `${portfolio.converging.length} routes are converging toward commitment.`,
      polarity: "reinforcing",
      pressure: "medium",
      movement: "strengthening",
      relevance: "commitment_pressure",
      whyItMatters: "Maintain momentum — these routes are on track toward commitment readiness.",
      linkedRouteId: null,
    });
  }

  // Portfolio-level escalation (top 1 only)
  if (portfolio.escalations.length > 0) {
    const esc = portfolio.escalations[0];
    signals.push({
      id: `port-esc-${esc.routeIds.join("-")}`,
      statement: truncate(esc.title),
      polarity: esc.severity === "warning" ? "contradictory" : "weakening",
      pressure: esc.severity === "warning" ? "high" : "medium",
      movement: "weakening",
      relevance: "commitment_pressure",
      whyItMatters: esc.detail,
      linkedRouteId: esc.routeIds[0] ?? null,
    });
  }

  return signals;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildStrategicSignals(args: {
  hypotheses: HypothesisProvenanceCard[];
  routeRationales: RouteRationale[];
  surface: StrategicCenterSurface;
  customerReality: CustomerRealityNarrative | null;
  positioningNarrative: PositioningLensNarrative | null;
  portfolio: DecisionPortfolio;
  phase: string;
  /**
   * Confidence discipline assessment.
   * When provided, discipline cooling is applied to each signal's statement
   * before center-echo suppression — ensuring cooled statements are evaluated
   * for suppression, not the over-certain originals.
   */
  discipline?: DisciplineAssessment | null;
  /**
   * Portfolio governance signals from decisionOps.governanceSignals.
   * When provided, included as "blocked" polarity commitment_pressure signals
   * at medium priority — surfaced when governance drift is active.
   */
  governanceSignals?: string[];
  /**
   * Attention context from buildAttentionContext().
   * When provided, applies priority-based quotas after the signal pipeline:
   * critical/active/ambient signals are capped per posture tier, escalation
   * stacking is collapsed, and suppressed signals are counted.
   */
  attention?: AttentionContext | null;
  /**
   * Hard cap on total signals after the full pipeline (attention + dedup).
   * Intended for operating mode compression (e.g., Scan mode: 4).
   * null or omitted = no additional cap beyond MAX_SIGNALS.
   */
  maxSignals?: number | null;
  /**
   * Strategic decay context from buildDecayContext().
   * When provided, applies signal-level decay — fading/ambient states reduce priority,
   * cooled contradictions are capped at "active", reinforcing signals may compress.
   */
  decay?: DecayContext | null;
  /**
   * When true, port-safe-commit signal is downgraded to "converging" framing.
   * Driven by semantic integrity enforcement when commitment is without behavioral proof.
   */
  suppressCommitmentLanguage?: boolean | null;
  /**
   * When true, customer_proof signals are protected from quota suppression.
   * Driven by semantic integrity enforcement when proof is absent but posture is stable.
   */
  forceCustomerProofVisibility?: boolean | null;
}): StrategicSignalSurface {
  const {
    hypotheses,
    surface,
    customerReality,
    positioningNarrative,
    portfolio,
    discipline = null,
    governanceSignals,
    attention = null,
    maxSignals = null,
    decay = null,
    suppressCommitmentLanguage = false,
    forceCustomerProofVisibility = false,
  } = args;

  const centerHeadline = surface.centerHeadline;
  const seen = new Set<string>();

  function shouldSuppress(statement: string): boolean {
    const key = statementKey(statement);
    if (seen.has(key)) return true;
    if (tokenOverlap(statement, centerHeadline) >= CENTER_ECHO_THRESHOLD) return true;
    return false;
  }

  function admit(signal: StrategicSignal): StrategicSignal | null {
    // Discipline cooling applied before suppression check — cooled statement
    // may differ enough from the center headline to survive suppression.
    const statement = discipline ? discipline.coolPhrase(signal.statement) : signal.statement;
    const cooled: StrategicSignal =
      statement !== signal.statement ? { ...signal, statement } : signal;
    if (shouldSuppress(cooled.statement)) return null;
    seen.add(statementKey(cooled.statement));
    return cooled;
  }

  const allSignals: StrategicSignal[] = [];

  // 1. Portfolio signals (highest priority — decision-consequential)
  for (const rawSig of signalsFromPortfolio(portfolio)) {
    // Enforcement: suppress commitment-ready framing when behavioral proof is absent.
    // Downgrade port-safe-commit from "accelerating/high" to "reinforcing/medium" so it
    // reads as "converging toward commitment" rather than "ready to commit."
    const sig: StrategicSignal =
      suppressCommitmentLanguage && rawSig.id === "port-safe-commit"
        ? {
            ...rawSig,
            statement: rawSig.statement.replace(
              /ready to commit\. Evidence converging\./gi,
              "converging toward commitment. Evidence building.",
            ),
            polarity: "reinforcing" as const,
            pressure: "medium" as const,
          }
        : rawSig;
    const admitted = admit(sig);
    if (admitted) allSignals.push(admitted);
  }

  // 1b. Governance signals — portfolio drift detected by decisionOps
  if (governanceSignals && governanceSignals.length > 0) {
    for (let i = 0; i < Math.min(governanceSignals.length, 2); i++) {
      const sig: StrategicSignal = {
        id: `gov-${i}`,
        statement: truncate(governanceSignals[i]),
        polarity: "blocked",
        pressure: "medium",
        movement: "unresolved",
        relevance: "commitment_pressure",
        whyItMatters: null,
        linkedRouteId: null,
      };
      const admitted = admit(sig);
      if (admitted) allSignals.push(admitted);
    }
  }

  // 2. Customer reality signals
  if (customerReality) {
    for (const sig of signalsFromCustomerReality(customerReality)) {
      const admitted = admit(sig);
      if (admitted) allSignals.push(admitted);
    }
  }

  // 3. Positioning signals
  if (positioningNarrative) {
    for (const sig of signalsFromPositioning(positioningNarrative)) {
      const admitted = admit(sig);
      if (admitted) allSignals.push(admitted);
    }
  }

  // 4. Hypothesis signals (sorted by pressure desc before admission)
  const hypSignals: StrategicSignal[] = hypotheses
    .map(signalFromHypothesis)
    .filter((s): s is StrategicSignal => s !== null);

  const sortedHypSignals = sortSignals(hypSignals);
  for (const sig of sortedHypSignals) {
    if (allSignals.length >= MAX_SIGNALS) break;
    const admitted = admit(sig);
    if (admitted) allSignals.push(admitted);
  }

  // ─── Attention quota enforcement ─────────────────────────────────────────────
  // Applied after the full signal pipeline (dedup + center-echo suppression done above).
  // Quotas are per-posture limits on how many critical/active/ambient signals surface.
  // Escalation stacking (multiple high-pressure commitment_pressure signals) is collapsed
  // to the single most semantically distinct one.
  let attentionSuppressedCount = 0;
  let admittedSignals = allSignals;

  if (attention) {
    const quotas = attention.signalQuotas;
    const scored = allSignals.map((s) => ({
      signal: s,
      priority: scoreSignalPriority(s, attention.posture, decay),
    }));

    // Detect escalation stacking: multiple critical commitment_pressure signals
    const criticalCommitmentSignals = scored.filter(
      (s) => s.priority === "critical" && s.signal.relevance === "commitment_pressure",
    );
    const stackCollapsed = attention.escalationCollapsed && criticalCommitmentSignals.length > 1;

    let criticalAdmitted = 0;
    let activeAdmitted = 0;
    let ambientAdmitted = 0;
    const admitted: StrategicSignal[] = [];

    for (const { signal, priority } of scored) {
      if (priority === "suppressed") {
        // Enforcement: customer proof signals are never fully suppressed when proof
        // is absent and posture is over-claiming stability.
        if (forceCustomerProofVisibility && signal.relevance === "customer_proof") {
          admitted.push(signal);
          ambientAdmitted++;
          continue;
        }
        attentionSuppressedCount++;
        continue;
      }
      if (priority === "critical") {
        // Escalation collapse: after the first critical commitment_pressure signal,
        // suppress additional commitment_pressure signals (same concept, redundant).
        if (
          stackCollapsed &&
          signal.relevance === "commitment_pressure" &&
          criticalAdmitted >= 1
        ) {
          attentionSuppressedCount++;
          continue;
        }
        if (criticalAdmitted >= quotas.critical) {
          attentionSuppressedCount++;
          continue;
        }
        admitted.push(signal);
        criticalAdmitted++;
      } else if (priority === "active") {
        if (activeAdmitted >= quotas.active) {
          attentionSuppressedCount++;
          continue;
        }
        admitted.push(signal);
        activeAdmitted++;
      } else {
        // ambient
        if (ambientAdmitted >= quotas.ambient) {
          attentionSuppressedCount++;
          continue;
        }
        admitted.push(signal);
        ambientAdmitted++;
      }
    }

    admittedSignals = admitted;
  }

  // Operating mode hard cap — applied after attention pipeline
  if (maxSignals !== null && admittedSignals.length > maxSignals) {
    attentionSuppressedCount += admittedSignals.length - maxSignals;
    admittedSignals = admittedSignals.slice(0, maxSignals);
  }

  // Group by polarity
  const byPolarity = new Map<SignalPolarity, StrategicSignal[]>();
  for (const polarity of GROUP_ORDER) byPolarity.set(polarity, []);

  for (const signal of admittedSignals) {
    const group = byPolarity.get(signal.polarity)!;
    if (group.length < MAX_PER_GROUP) {
      group.push(signal);
    }
  }

  const groups: StrategicSignalGroup[] = GROUP_ORDER
    .filter((polarity) => (byPolarity.get(polarity)?.length ?? 0) > 0)
    .map((polarity) => ({
      polarity,
      label: GROUP_LABELS[polarity],
      signals: sortSignals(byPolarity.get(polarity)!),
    }));

  const totalCount = groups.reduce((acc, g) => acc + g.signals.length, 0);

  return {
    groups,
    totalCount,
    hasBlockingSignals: byPolarity.get("blocked")!.length > 0,
    hasConflictingSignals:
      byPolarity.get("contradictory")!.length > 0 ||
      byPolarity.get("weakening")!.length > 0,
    attentionSuppressedCount,
  };
}
