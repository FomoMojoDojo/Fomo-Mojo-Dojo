/**
 * Strategic Movement Narrative — evolving strategic interpretation from live data.
 *
 * NOT: activity logs, audit trails, or system events.
 * IS: confidence movement, changing commitment safety, visible strategic memory.
 *
 * Events are derived from the current strategic state of each decision:
 *   - confidence_movement[] history
 *   - validation_requirements status
 *   - stale_dependencies
 *   - contradicting_evidence
 *   - decision_state
 *   - blocked_by
 *   - active_tension_ids
 *
 * Plus optional tensions and hypotheses for richer interpretation.
 *
 * Design rules:
 *   - Headlines ≤ 12 words, present tense, editorial voice
 *   - Meanings 1–2 sentences, strategic interpretation
 *   - No technical jargon ("triggered", "propagation", "state changed")
 *   - Synthesis collapses multiple low-level signals into one interpretation
 *   - Reversibility surfaces uncertainty — nothing is permanently resolved
 */

import type { DecisionWithRoutes } from "@/hooks/useStrategicDecisions";
import type { StrategicTension } from "@/lib/tensionTypes";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MovementEventType =
  | "confidence_strengthened"
  | "confidence_weakened"
  | "commitment_destabilized"
  | "contradiction_detected"
  | "validation_completed"
  | "validation_stale"
  | "tension_emerged"
  | "tension_resolved"
  | "route_blocked"
  | "route_unblocked"
  | "hypothesis_strengthened"
  | "hypothesis_reframed"
  | "decision_reopened"
  | "readiness_unlocked"
  | "capability_gap_detected"
  | "council_pressure_increased";

export type MovementReversibility =
  | "stabilizing"
  | "fragile"
  | "reversible"
  | "deteriorating"
  | "unresolved";

export type PostureImpact = "positive" | "negative" | "neutral" | "uncertain";
export type ReadinessImpact = "improving" | "declining" | "stable" | "uncertain";

export type StrategicMovementEvent = {
  id: string;
  type: MovementEventType;
  timestamp: string;
  headline: string;
  meaning: string;
  affectedDecisionIds: string[];
  affectedRouteIds: string[];
  postureImpact: PostureImpact;
  readinessImpact: ReadinessImpact;
  reversibility: MovementReversibility;
  unresolvedConditions: string[];
  triggeredBy: string;
};

export type TemporalGroup = "today" | "this_week" | "earlier";

// ─── Display constants ────────────────────────────────────────────────────────

export const TEMPORAL_GROUP_LABELS: Record<TemporalGroup, string> = {
  today:     "Today",
  this_week: "Earlier this week",
  earlier:   "Earlier",
};

export const REVERSIBILITY_LABELS: Record<MovementReversibility, string> = {
  stabilizing:   "Stabilizing",
  fragile:       "Fragile",
  reversible:    "Can shift",
  deteriorating: "Deteriorating",
  unresolved:    "Unresolved",
};

export const REVERSIBILITY_GLYPHS: Record<MovementReversibility, string> = {
  stabilizing:   "◉",
  fragile:       "○",
  reversible:    "◎",
  deteriorating: "⊗",
  unresolved:    "·",
};

export const POSTURE_IMPACT_COLORS: Record<PostureImpact, string> = {
  positive:  "#5F9B8C",
  negative:  "#c44233",
  neutral:   "#6E847F",
  uncertain: "#9298B5",
};

// ─── Narrative templates ──────────────────────────────────────────────────────

type NarrativeCtx = {
  decisionTitle?: string;
  reason?: string;
  tensionStatement?: string;
  hypothesisStatement?: string;
  hypothesisReason?: string;
  count?: number;
};

function narrativeFor(
  type: MovementEventType,
  ctx: NarrativeCtx = {},
): { headline: string; meaning: string } {
  const { decisionTitle, reason, tensionStatement, hypothesisStatement, hypothesisReason, count } = ctx;

  switch (type) {
    case "confidence_strengthened":
      return {
        headline: "Direction is gaining ground.",
        meaning: reason
          ? `${reason}. This is reinforcing confidence that the current direction is correct.`
          : `Recent signals are strengthening the case for the current commitment posture${decisionTitle ? ` around ${decisionTitle.toLowerCase()}` : ""}.`,
      };

    case "confidence_weakened":
      return {
        headline: "Commitment confidence is under pressure.",
        meaning: reason
          ? `${reason}. This is introducing doubt into the current direction${decisionTitle ? ` around ${decisionTitle.toLowerCase()}` : ""}.`
          : "Recent signals are weakening confidence in the current commitment posture. Proof pressure may be increasing.",
      };

    case "commitment_destabilized":
      return {
        headline: "The current commitment posture is no longer holding.",
        meaning: decisionTitle
          ? `"${decisionTitle}" is under destabilizing pressure — the original basis for commitment may have shifted.`
          : "A key commitment is under destabilizing pressure. The assumptions that supported it may no longer hold.",
      };

    case "contradiction_detected":
      return {
        headline: "Conflicting evidence is challenging the current direction.",
        meaning: reason
          ? `${reason} — this contradicts assumptions that supported the current direction. Resolution is needed before confidence can rebuild.`
          : `Evidence is now contradicting assumptions that supported${decisionTitle ? ` "${decisionTitle}"` : " the current commitment"}. Resolution is needed before confidence can rebuild.`,
      };

    case "validation_completed":
      return {
        headline: "A key validation condition has been satisfied.",
        meaning: reason
          ? `"${reason}" is now confirmed${decisionTitle ? ` for "${decisionTitle}"` : ""}. This reduces proof pressure and strengthens the case for broader commitment.`
          : `A required validation condition is now met${decisionTitle ? ` for "${decisionTitle}"` : ""}. This brings commitment safety closer.`,
      };

    case "validation_stale":
      return {
        headline: "Earlier confidence is beginning to age without reinforcement.",
        meaning: count && count > 1
          ? `${count} validation conditions are depending on evidence that hasn't been refreshed. Commitment safety may be overstated.`
          : "A validation condition is depending on evidence that hasn't been refreshed. Revisiting this would sharpen commitment safety.",
      };

    case "tension_emerged":
      return {
        headline: "A strategic tension is holding commitment back.",
        meaning: tensionStatement && tensionStatement.length > 20
          ? tensionStatement
          : "An unresolved conflict is creating pressure between current commitments. This isn't a problem to solve immediately, but a condition to understand before moving.",
      };

    case "tension_resolved":
      return {
        headline: "A strategic tension has softened.",
        meaning: tensionStatement
          ? `The pressure around "${tensionStatement}" is beginning to ease.`
          : "Conflicting pressures are beginning to resolve. This may allow broader commitment.",
      };

    case "route_blocked":
      return {
        headline: "A commitment path is blocked by unresolved conditions.",
        meaning: reason
          ? `"${reason}" is preventing safe commitment advancement${decisionTitle ? ` in "${decisionTitle}"` : ""}.`
          : "Unresolved operational conditions are blocking a commitment path from advancing.",
      };

    case "route_unblocked":
      return {
        headline: "A previously blocked path may be reopening.",
        meaning: `Conditions that were blocking${decisionTitle ? ` "${decisionTitle}"` : " a commitment path"} appear to have shifted. Re-evaluate whether commitment is now safer.`,
      };

    case "hypothesis_strengthened":
      return {
        headline: "A directional hypothesis is gaining support.",
        meaning: hypothesisStatement
          ? `"${hypothesisStatement}" has been reinforced by recent evidence. This is strengthening the foundation under current commitments.`
          : "A key assumption underlying current commitments is gaining evidential support.",
      };

    case "hypothesis_reframed":
      return {
        headline: "A working hypothesis has shifted.",
        meaning: hypothesisReason
          ? `${hypothesisReason}. Existing commitments may need re-examination in light of this shift.`
          : `${hypothesisStatement ? `"${hypothesisStatement}"` : "A key hypothesis"} has been reframed — the assumptions that supported the current direction may need revisiting.`,
      };

    case "decision_reopened":
      return {
        headline: "A commitment question has been reopened.",
        meaning: `${decisionTitle ? `"${decisionTitle}" is` : "A commitment decision is"} back under consideration — the original answer no longer holds under current conditions.`,
      };

    case "readiness_unlocked":
      return {
        headline: "Commitment readiness has improved.",
        meaning: `Proof pressure has eased${decisionTitle ? ` around "${decisionTitle}"` : ""}. The next readiness layer is now within reach.`,
      };

    case "capability_gap_detected":
      return {
        headline: "Execution readiness has a gap.",
        meaning: `A capability condition is missing that would need to close before${decisionTitle ? ` "${decisionTitle}" could` : " this direction could"} safely advance to execution.`,
      };

    case "council_pressure_increased":
      return {
        headline: "Competing interpretations are remaining unresolved.",
        meaning: `Disagreement around${decisionTitle ? ` "${decisionTitle}"` : " a key direction"} continues without resolution. The longer this persists, the more it constrains commitment safety.`,
      };
  }
}

// ─── Synthesis rules ──────────────────────────────────────────────────────────

const COLLAPSIBLE_TYPES: MovementEventType[] = [
  "validation_stale",
  "tension_emerged",
  "route_blocked",
];

function synthesize(type: MovementEventType, events: StrategicMovementEvent[]): StrategicMovementEvent {
  const base = events[0];
  const mergedDecisionIds = [...new Set(events.flatMap((e) => e.affectedDecisionIds))];
  const mergedRouteIds    = [...new Set(events.flatMap((e) => e.affectedRouteIds))];
  const latestTimestamp   = events.reduce(
    (latest, e) => (new Date(e.timestamp) > new Date(latest) ? e.timestamp : latest),
    events[0].timestamp,
  );

  const { headline, meaning } = (() => {
    switch (type) {
      case "validation_stale":
        return narrativeFor("validation_stale", { count: events.length });
      case "tension_emerged":
        return {
          headline: "Competing interpretations are remaining unresolved.",
          meaning:  `Multiple unresolved tensions are constraining commitment safety across the portfolio. Each represents a conflict that must be understood before moving.`,
        };
      case "route_blocked":
        return {
          headline: "Multiple commitment paths are blocked by unresolved conditions.",
          meaning:  "Execution readiness is weakening faster than strategic alignment. Several commitment paths cannot advance until blocking conditions resolve.",
        };
      default:
        return narrativeFor(type);
    }
  })();

  return {
    ...base,
    id:                  `synth-${type}-${latestTimestamp}`,
    timestamp:           latestTimestamp,
    headline,
    meaning,
    affectedDecisionIds: mergedDecisionIds,
    affectedRouteIds:    mergedRouteIds,
  };
}

function collapseRelated(events: StrategicMovementEvent[]): StrategicMovementEvent[] {
  const byType = new Map<MovementEventType, StrategicMovementEvent[]>();
  for (const event of events) {
    const arr = byType.get(event.type) ?? [];
    arr.push(event);
    byType.set(event.type, arr);
  }

  const result: StrategicMovementEvent[] = [];
  for (const [type, typeEvents] of byType.entries()) {
    if (COLLAPSIBLE_TYPES.includes(type) && typeEvents.length > 1) {
      result.push(synthesize(type, typeEvents));
    } else {
      result.push(...typeEvents);
    }
  }

  return result.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

// ─── Event builders ───────────────────────────────────────────────────────────

const MOVEMENT_WINDOW_DAYS = 90;

function isWithinWindow(timestamp: string, now: string): boolean {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - MOVEMENT_WINDOW_DAYS);
  return new Date(timestamp) >= cutoff;
}

function decisionTimestamp(decision: DecisionWithRoutes): string {
  return decision.last_meaningful_change_at ?? decision.created_at;
}

function eventsFromDecision(
  decision: DecisionWithRoutes,
  now: string,
): StrategicMovementEvent[] {
  if (decision.decision_state === "retired") return [];

  const events: StrategicMovementEvent[] = [];
  const id   = decision.id;
  const title = decision.title;
  const baseTs = decisionTimestamp(decision);

  // 1. Confidence movement — use last entry within window
  const recentMovements = (decision.confidence_movement ?? [])
    .filter((m) => isWithinWindow(m.at, now))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (recentMovements.length > 0) {
    const latest = recentMovements[0];
    const dir    = String(latest.direction);
    const reason = latest.reason?.trim() || undefined;

    if (dir === "strengthening") {
      const n = narrativeFor("confidence_strengthened", { decisionTitle: title, reason });
      events.push({
        id:                  `cs-${id}`,
        type:                "confidence_strengthened",
        timestamp:           latest.at,
        headline:            n.headline,
        meaning:             n.meaning,
        affectedDecisionIds: [id],
        affectedRouteIds:    decision.routes.map((r) => r.route_id),
        postureImpact:       "positive",
        readinessImpact:     "improving",
        reversibility:       "stabilizing",
        unresolvedConditions: [],
        triggeredBy:         `Confidence movement on "${title}"`,
      });
    } else if (dir === "weakening") {
      const n = narrativeFor("confidence_weakened", { decisionTitle: title, reason });
      events.push({
        id:                  `cw-${id}`,
        type:                "confidence_weakened",
        timestamp:           latest.at,
        headline:            n.headline,
        meaning:             n.meaning,
        affectedDecisionIds: [id],
        affectedRouteIds:    decision.routes.map((r) => r.route_id),
        postureImpact:       "negative",
        readinessImpact:     "declining",
        reversibility:       "reversible",
        unresolvedConditions: ["Confidence must stabilize before commitment is safe."],
        triggeredBy:         `Confidence movement on "${title}"`,
      });
    }
  }

  // 2. Destabilizing state
  if (decision.decision_state === "destabilizing") {
    const n = narrativeFor("commitment_destabilized", { decisionTitle: title });
    events.push({
      id:                  `cd-${id}`,
      type:                "commitment_destabilized",
      timestamp:           baseTs,
      headline:            n.headline,
      meaning:             n.meaning,
      affectedDecisionIds: [id],
      affectedRouteIds:    decision.routes.map((r) => r.route_id),
      postureImpact:       "negative",
      readinessImpact:     "declining",
      reversibility:       "reversible",
      unresolvedConditions: ["Resolve contradictions and rebuild confidence before recommitting."],
      triggeredBy:         `Decision state: destabilizing`,
    });
  }

  // 3. Decision reopened (was committed/stabilizing, now under_validation)
  if (decision.decision_state === "under_validation" && (decision.decision_memory ?? []).length > 1) {
    const n = narrativeFor("decision_reopened", { decisionTitle: title });
    events.push({
      id:                  `dr-${id}`,
      type:                "decision_reopened",
      timestamp:           baseTs,
      headline:            n.headline,
      meaning:             n.meaning,
      affectedDecisionIds: [id],
      affectedRouteIds:    decision.routes.map((r) => r.route_id),
      postureImpact:       "uncertain",
      readinessImpact:     "uncertain",
      reversibility:       "unresolved",
      unresolvedConditions: ["Resolve the re-opened question before recommitting."],
      triggeredBy:         `Decision state: under_validation`,
    });
  }

  // 4. Contradicting evidence
  if ((decision.contradicting_evidence ?? []).length > 0) {
    const firstContra = decision.contradicting_evidence[0];
    const reason = firstContra?.statement?.trim() || undefined;
    const n = narrativeFor("contradiction_detected", { decisionTitle: title, reason });
    events.push({
      id:                  `contra-${id}`,
      type:                "contradiction_detected",
      timestamp:           baseTs,
      headline:            n.headline,
      meaning:             n.meaning,
      affectedDecisionIds: [id],
      affectedRouteIds:    decision.routes.map((r) => r.route_id),
      postureImpact:       "negative",
      readinessImpact:     "declining",
      reversibility:       "fragile",
      unresolvedConditions: ["Resolve or reframe the contradiction before confidence can rebuild."],
      triggeredBy:         `Contradicting evidence on "${title}"`,
    });
  }

  // 5. Validation completed (at least one met requirement)
  const metRequirements = (decision.validation_requirements ?? []).filter((r) => r.status === "met");
  if (metRequirements.length > 0) {
    const reason = metRequirements[0]?.requirement?.trim() || undefined;
    const n = narrativeFor("validation_completed", { decisionTitle: title, reason });
    events.push({
      id:                  `vc-${id}`,
      type:                "validation_completed",
      timestamp:           baseTs,
      headline:            n.headline,
      meaning:             n.meaning,
      affectedDecisionIds: [id],
      affectedRouteIds:    decision.routes.map((r) => r.route_id),
      postureImpact:       "positive",
      readinessImpact:     "improving",
      reversibility:       "stabilizing",
      unresolvedConditions: [],
      triggeredBy:         `Validation requirements for "${title}"`,
    });
  }

  // 6. Stale dependencies
  if ((decision.stale_dependencies ?? []).length > 0) {
    const n = narrativeFor("validation_stale", { count: decision.stale_dependencies.length });
    events.push({
      id:                  `vs-${id}`,
      type:                "validation_stale",
      timestamp:           baseTs,
      headline:            n.headline,
      meaning:             n.meaning,
      affectedDecisionIds: [id],
      affectedRouteIds:    decision.routes.map((r) => r.route_id),
      postureImpact:       "negative",
      readinessImpact:     "stable",
      reversibility:       "fragile",
      unresolvedConditions: ["Refresh validation evidence to maintain commitment safety."],
      triggeredBy:         `Stale dependencies on "${title}"`,
    });
  }

  // 7. Blocked by conditions
  if ((decision.blocked_by ?? []).length > 0) {
    const reason = decision.blocked_by[0]?.trim() || undefined;
    const n = narrativeFor("route_blocked", { decisionTitle: title, reason });
    events.push({
      id:                  `rb-${id}`,
      type:                "route_blocked",
      timestamp:           baseTs,
      headline:            n.headline,
      meaning:             n.meaning,
      affectedDecisionIds: [id],
      affectedRouteIds:    decision.routes.map((r) => r.route_id),
      postureImpact:       "negative",
      readinessImpact:     "stable",
      reversibility:       "reversible",
      unresolvedConditions: decision.blocked_by,
      triggeredBy:         `Blocking conditions on "${title}"`,
    });
  }

  return events;
}

function eventsFromTensions(
  tensions: StrategicTension[],
  now: string,
): StrategicMovementEvent[] {
  return tensions.flatMap((tension) => {
    if (tension.status === "resolved" || tension.status === "retired") {
      const n = narrativeFor("tension_resolved", { tensionStatement: tension.statement });
      return [{
        id:                  `tr-${tension.id}`,
        type:                "tension_resolved" as MovementEventType,
        timestamp:           now,
        headline:            n.headline,
        meaning:             n.meaning,
        affectedDecisionIds: [],
        affectedRouteIds:    tension.affected_routes,
        postureImpact:       "positive" as PostureImpact,
        readinessImpact:     "improving" as ReadinessImpact,
        reversibility:       "stabilizing" as MovementReversibility,
        unresolvedConditions: [],
        triggeredBy:         `Strategic tension resolved`,
      }];
    }

    if (
      tension.status === "emerging" ||
      tension.status === "strengthening" ||
      tension.status === "unresolved" ||
      tension.status === "splitting"
    ) {
      const n = narrativeFor("tension_emerged", { tensionStatement: tension.statement });
      return [{
        id:                  `te-${tension.id}`,
        type:                "tension_emerged" as MovementEventType,
        timestamp:           now,
        headline:            n.headline,
        meaning:             n.meaning,
        affectedDecisionIds: [],
        affectedRouteIds:    tension.affected_routes,
        postureImpact:       tension.is_commitment_blocker ? "negative" as PostureImpact : "neutral" as PostureImpact,
        readinessImpact:     tension.is_commitment_blocker ? "declining" as ReadinessImpact : "stable" as ReadinessImpact,
        reversibility:       "unresolved" as MovementReversibility,
        unresolvedConditions: tension.validation_requirements,
        triggeredBy:         `Strategic tension (${tension.source})`,
      }];
    }

    return [];
  });
}

function eventsFromHypotheses(
  cards: HypothesisProvenanceCard[],
  now: string,
): StrategicMovementEvent[] {
  const events: StrategicMovementEvent[] = [];

  for (const card of cards) {
    const h = card.hypothesis;
    if (!h.is_active) continue;

    const ts = card.latestEventAt ?? h.updated_at;

    if (h.hypothesis_state === "strengthened" && card.supportingClaims.length > 0) {
      const n = narrativeFor("hypothesis_strengthened", { hypothesisStatement: h.statement });
      events.push({
        id:                  `hs-${h.id}`,
        type:                "hypothesis_strengthened",
        timestamp:           ts,
        headline:            n.headline,
        meaning:             n.meaning,
        affectedDecisionIds: [],
        affectedRouteIds:    [],
        postureImpact:       "positive",
        readinessImpact:     "improving",
        reversibility:       "stabilizing",
        unresolvedConditions: [],
        triggeredBy:         `Hypothesis evidence`,
      });
    }

    if (h.hypothesis_state === "contradicted") {
      const n = narrativeFor("contradiction_detected", {
        reason: `"${h.statement}" has been contradicted by evidence`,
      });
      events.push({
        id:                  `hc-${h.id}`,
        type:                "contradiction_detected",
        timestamp:           ts,
        headline:            n.headline,
        meaning:             n.meaning,
        affectedDecisionIds: [],
        affectedRouteIds:    [],
        postureImpact:       "negative",
        readinessImpact:     "declining",
        reversibility:       "fragile",
        unresolvedConditions: ["Review evidence and determine if the current direction still holds."],
        triggeredBy:         `Contradicted hypothesis`,
      });
    }

    if (h.hypothesis_state === "reframed") {
      const n = narrativeFor("hypothesis_reframed", {
        hypothesisStatement: h.statement,
        hypothesisReason:    h.reframed_reason ?? undefined,
      });
      events.push({
        id:                  `hr-${h.id}`,
        type:                "hypothesis_reframed",
        timestamp:           ts,
        headline:            n.headline,
        meaning:             n.meaning,
        affectedDecisionIds: [],
        affectedRouteIds:    [],
        postureImpact:       "neutral",
        readinessImpact:     "uncertain",
        reversibility:       "reversible",
        unresolvedConditions: [],
        triggeredBy:         `Hypothesis reframe`,
      });
    }
  }

  return events;
}

// ─── Main exports ─────────────────────────────────────────────────────────────

export function buildStrategicMovementEvents(
  decisions: DecisionWithRoutes[],
  options: {
    tensions?:   StrategicTension[];
    hypotheses?: HypothesisProvenanceCard[];
    now?:        string;
  } = {},
): StrategicMovementEvent[] {
  const now = options.now ?? new Date().toISOString();

  const decisionEvents  = decisions.flatMap((d) => eventsFromDecision(d, now));
  const tensionEvents   = eventsFromTensions(options.tensions   ?? [], now);
  const hypothesisEvents = eventsFromHypotheses(options.hypotheses ?? [], now);

  const all = [...decisionEvents, ...tensionEvents, ...hypothesisEvents];
  return collapseRelated(all);
}

/**
 * Returns the top N most significant movement events.
 * Priority: negative posture impact before positive, then newest first.
 */
export function deriveTopMovementItems(
  events: StrategicMovementEvent[],
  limit = 3,
): StrategicMovementEvent[] {
  const ORDER: PostureImpact[] = ["negative", "uncertain", "neutral", "positive"];
  return [...events]
    .sort((a, b) => {
      const impactDiff = ORDER.indexOf(a.postureImpact) - ORDER.indexOf(b.postureImpact);
      if (impactDiff !== 0) return impactDiff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    })
    .slice(0, limit);
}

/**
 * Groups events by temporal band relative to now.
 */
export function groupByTemporalBand(
  events: StrategicMovementEvent[],
  now?: string,
): Map<TemporalGroup, StrategicMovementEvent[]> {
  const reference = now ? new Date(now) : new Date();
  const groups: Map<TemporalGroup, StrategicMovementEvent[]> = new Map([
    ["today",     []],
    ["this_week", []],
    ["earlier",   []],
  ]);

  for (const event of events) {
    const ageDays = (reference.getTime() - new Date(event.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    const band: TemporalGroup = ageDays < 1 ? "today" : ageDays < 7 ? "this_week" : "earlier";
    groups.get(band)!.push(event);
  }

  return groups;
}

/**
 * Returns temporal band label for a single event.
 */
export function temporalGroup(timestamp: string, now?: string): TemporalGroup {
  const reference = now ? new Date(now) : new Date();
  const ageDays = (reference.getTime() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays < 1) return "today";
  if (ageDays < 7) return "this_week";
  return "earlier";
}
