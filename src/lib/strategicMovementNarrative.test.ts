import { describe, expect, it } from "vitest";
import {
  buildStrategicMovementEvents,
  deriveTopMovementItems,
  groupByTemporalBand,
  temporalGroup,
  REVERSIBILITY_LABELS,
  REVERSIBILITY_GLYPHS,
  POSTURE_IMPACT_COLORS,
  TEMPORAL_GROUP_LABELS,
  type StrategicMovementEvent,
} from "./strategicMovementNarrative";
import type { DecisionWithRoutes } from "@/hooks/useStrategicDecisions";
import type { StrategicTension } from "@/lib/tensionTypes";
import type { HypothesisProvenanceCard } from "@/hooks/useStrategicHypotheses";
import type { StrategicHypothesis } from "@/lib/strategicHypothesisDomain";

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = "2026-05-13T12:00:00Z";
const TODAY_TS = "2026-05-13T08:00:00Z";
const THIS_WEEK_TS = "2026-05-10T08:00:00Z";
const EARLIER_TS = "2026-04-01T08:00:00Z";
const WITHIN_WINDOW_TS = "2026-03-01T08:00:00Z";
const OUTSIDE_WINDOW_TS = "2025-12-01T08:00:00Z";

function makeDecision(overrides: Partial<DecisionWithRoutes> = {}): DecisionWithRoutes {
  return {
    id:                     "d1",
    company_id:             "c1",
    title:                  "Operational reliability as lead differentiator",
    decision_question:      "Should we commit to operational reliability?",
    decision_state:         "under_validation",
    confidence_state:       "directional",
    current_posture:        null,
    supporting_evidence:    [],
    contradicting_evidence: [],
    validation_requirements: [],
    blocked_by:             [],
    affected_positioning:   false,
    affected_capabilities:  [],
    affected_job_steps:     [],
    supporting_hypothesis_ids: [],
    active_tension_ids:     [],
    confidence_movement:    [],
    decision_memory:        [],
    stale_dependencies:     [],
    last_meaningful_change_at: null,
    source:                 "user_defined",
    created_at:             NOW,
    updated_at:             NOW,
    routes:                 [],
    ...overrides,
  };
}

function makeTension(overrides: Partial<StrategicTension> = {}): StrategicTension {
  return {
    id:                    "t1",
    statement:             "Speed vs. quality tradeoff creating ongoing pressure",
    detail:                "Each sprint velocity gain undermines reliability commitments",
    status:                "unresolved",
    confidence:            0.8,
    source:                "derived",
    pressure:              "medium",
    affected_routes:       [],
    affected_needs:        [],
    affected_positioning:  false,
    affected_strategy:     false,
    blocked_commitments:   [],
    resolution_signals:    [],
    validation_requirements: [],
    is_commitment_blocker: false,
    created_from:          "derived",
    ...overrides,
  };
}

function makeHypothesisCard(
  overrides: Partial<StrategicHypothesis> = {},
): HypothesisProvenanceCard {
  const hypothesis: StrategicHypothesis = {
    id:            "h1",
    company_id:    "c1",
    hypothesis_key: "h1",
    statement:     "Customers prioritize on-time delivery over feature richness",
    hypothesis_kind: "customer_insight",
    hypothesis_state: "active",
    topic:         null,
    confidence:    "medium",
    validation_state: "open",
    what_must_be_true: [],
    source_run_id: null,
    reframed_from_hypothesis_id: null,
    superseded_by_id: null,
    reframed_reason: null,
    originating_context: null,
    is_active:     true,
    raw_payload:   null,
    created_at:    NOW,
    updated_at:    NOW,
    ...overrides,
  };
  return {
    hypothesis,
    supportingClaims: [],
    weakeningClaims:  [],
    latestEventAt:    null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FORBIDDEN_PHRASES = [
  "triggered",
  "propagation",
  "state changed",
  "processed",
  "fired",
  "dispatched",
  "event emitted",
  "flag set",
  "null",
  "undefined",
];

function assertEditorialVocabulary(event: StrategicMovementEvent) {
  const text = `${event.headline} ${event.meaning}`.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    expect(text, `Forbidden phrase "${phrase}" found in event ${event.type}`).not.toContain(phrase);
  }
  expect(event.headline.length).toBeGreaterThan(0);
  expect(event.meaning.length).toBeGreaterThan(0);
}

// ─── Shape ────────────────────────────────────────────────────────────────────

describe("StrategicMovementEvent shape", () => {
  it("returns all required fields", () => {
    const d = makeDecision({
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "Customer interviews confirmed direction" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    expect(events.length).toBeGreaterThan(0);
    const e = events[0];
    expect(typeof e.id).toBe("string");
    expect(typeof e.type).toBe("string");
    expect(typeof e.timestamp).toBe("string");
    expect(typeof e.headline).toBe("string");
    expect(typeof e.meaning).toBe("string");
    expect(Array.isArray(e.affectedDecisionIds)).toBe(true);
    expect(Array.isArray(e.affectedRouteIds)).toBe(true);
    expect(typeof e.postureImpact).toBe("string");
    expect(typeof e.readinessImpact).toBe("string");
    expect(typeof e.reversibility).toBe("string");
    expect(Array.isArray(e.unresolvedConditions)).toBe(true);
    expect(typeof e.triggeredBy).toBe("string");
  });

  it("returns empty array for retired decisions", () => {
    const d = makeDecision({ decision_state: "retired" });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    expect(events.filter((e) => e.affectedDecisionIds.includes("d1"))).toHaveLength(0);
  });

  it("returns empty array for decision with no signals", () => {
    const d = makeDecision();
    const events = buildStrategicMovementEvents([d], { now: NOW });
    expect(events).toHaveLength(0);
  });
});

// ─── Confidence movement events ────────────────────────────────────────────────

describe("confidence_strengthened event", () => {
  it("is generated for a strengthening movement", () => {
    const d = makeDecision({
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "New customer evidence supports direction" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "confidence_strengthened");
    expect(e).toBeDefined();
  });

  it("has positive posture impact", () => {
    const d = makeDecision({
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "confidence_strengthened")!;
    expect(e.postureImpact).toBe("positive");
    expect(e.readinessImpact).toBe("improving");
    expect(e.reversibility).toBe("stabilizing");
  });

  it("uses the movement reason in the meaning", () => {
    const d = makeDecision({
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "Three customer calls confirmed the hypothesis" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "confidence_strengthened")!;
    expect(e.meaning).toContain("Three customer calls confirmed the hypothesis");
  });

  it("uses only the most recent movement", () => {
    const d = makeDecision({
      confidence_movement: [
        { at: THIS_WEEK_TS, direction: "weakening",    reason: "Old pressure" },
        { at: TODAY_TS,     direction: "strengthening", reason: "New evidence in" },
      ],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    expect(events.find((ev) => ev.type === "confidence_strengthened")).toBeDefined();
    expect(events.find((ev) => ev.type === "confidence_weakened")).toBeUndefined();
  });

  it("ignores movements outside the 90-day window", () => {
    const d = makeDecision({
      confidence_movement: [{ at: OUTSIDE_WINDOW_TS, direction: "strengthening", reason: "Old news" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    expect(events.find((ev) => ev.type === "confidence_strengthened")).toBeUndefined();
  });
});

describe("confidence_weakened event", () => {
  it("is generated for a weakening movement", () => {
    const d = makeDecision({
      confidence_movement: [{ at: TODAY_TS, direction: "weakening", reason: "Field data contradicts hypothesis" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "confidence_weakened");
    expect(e).toBeDefined();
    expect(e!.postureImpact).toBe("negative");
    expect(e!.readinessImpact).toBe("declining");
    expect(e!.reversibility).toBe("reversible");
  });

  it("surfaces unresolved conditions", () => {
    const d = makeDecision({
      confidence_movement: [{ at: TODAY_TS, direction: "weakening", reason: "" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "confidence_weakened")!;
    expect(e.unresolvedConditions.length).toBeGreaterThan(0);
  });
});

// ─── Commitment destabilized ──────────────────────────────────────────────────

describe("commitment_destabilized event", () => {
  it("is generated when decision_state is destabilizing", () => {
    const d = makeDecision({ decision_state: "destabilizing" });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "commitment_destabilized");
    expect(e).toBeDefined();
    expect(e!.postureImpact).toBe("negative");
  });

  it("is not generated for non-destabilizing states", () => {
    const d = makeDecision({
      decision_state: "committed",
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    expect(events.find((ev) => ev.type === "commitment_destabilized")).toBeUndefined();
  });
});

// ─── Contradiction detected ───────────────────────────────────────────────────

describe("contradiction_detected event", () => {
  it("is generated when contradicting_evidence is non-empty", () => {
    const d = makeDecision({
      contradicting_evidence: [{ statement: "Customer churn data contradicts retention hypothesis", source: "field_research" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "contradiction_detected");
    expect(e).toBeDefined();
    expect(e!.reversibility).toBe("fragile");
    expect(e!.postureImpact).toBe("negative");
  });

  it("includes the contradiction statement in meaning", () => {
    const d = makeDecision({
      contradicting_evidence: [{ statement: "Pricing model rejected in three enterprise pilots", source: "field_research" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "contradiction_detected")!;
    expect(e.meaning).toContain("Pricing model rejected in three enterprise pilots");
  });
});

// ─── Validation completed ─────────────────────────────────────────────────────

describe("validation_completed event", () => {
  it("is generated when at least one validation requirement is met", () => {
    const d = makeDecision({
      validation_requirements: [
        { requirement: "Enterprise pilot confirms pricing model", status: "met" },
      ],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "validation_completed");
    expect(e).toBeDefined();
    expect(e!.postureImpact).toBe("positive");
    expect(e!.reversibility).toBe("stabilizing");
  });

  it("includes the requirement text in meaning", () => {
    const d = makeDecision({
      validation_requirements: [
        { requirement: "Customer interviews complete", status: "met" },
      ],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "validation_completed")!;
    expect(e.meaning).toContain("Customer interviews complete");
  });

  it("is not generated when all requirements are open", () => {
    const d = makeDecision({
      validation_requirements: [{ requirement: "Still open", status: "open" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    expect(events.find((ev) => ev.type === "validation_completed")).toBeUndefined();
  });
});

// ─── Stale dependencies ───────────────────────────────────────────────────────

describe("validation_stale event", () => {
  it("is generated when stale_dependencies are present", () => {
    const d = makeDecision({ stale_dependencies: ["Customer proof from 2025 Q1"] });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "validation_stale");
    expect(e).toBeDefined();
    expect(e!.reversibility).toBe("fragile");
    expect(e!.readinessImpact).toBe("stable");
  });
});

// ─── Route blocked ────────────────────────────────────────────────────────────

describe("route_blocked event", () => {
  it("is generated when blocked_by is non-empty", () => {
    const d = makeDecision({ blocked_by: ["Integration partner contract not signed"] });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "route_blocked");
    expect(e).toBeDefined();
    expect(e!.reversibility).toBe("reversible");
  });

  it("surfaces the blocking condition", () => {
    const d = makeDecision({ blocked_by: ["Legal review pending"] });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "route_blocked")!;
    expect(e.unresolvedConditions).toContain("Legal review pending");
  });
});

// ─── Decision reopened ────────────────────────────────────────────────────────

describe("decision_reopened event", () => {
  it("is generated for under_validation decisions with prior memory", () => {
    const d = makeDecision({
      decision_state: "under_validation",
      decision_memory: [
        { entry: "Originally committed", at: EARLIER_TS },
        { entry: "Reopened after contradictions", at: TODAY_TS },
      ],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const e = events.find((ev) => ev.type === "decision_reopened");
    expect(e).toBeDefined();
    expect(e!.reversibility).toBe("unresolved");
  });

  it("is not generated for under_validation with no prior memory", () => {
    const d = makeDecision({ decision_state: "under_validation", decision_memory: [] });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    expect(events.find((ev) => ev.type === "decision_reopened")).toBeUndefined();
  });
});

// ─── Tension events ───────────────────────────────────────────────────────────

describe("tension events", () => {
  it("generates tension_emerged for unresolved tensions", () => {
    const t = makeTension({ status: "unresolved" });
    const events = buildStrategicMovementEvents([], { tensions: [t], now: NOW });
    const e = events.find((ev) => ev.type === "tension_emerged");
    expect(e).toBeDefined();
    expect(e!.reversibility).toBe("unresolved");
  });

  it("generates tension_resolved for resolved tensions", () => {
    const t = makeTension({ status: "resolved" });
    const events = buildStrategicMovementEvents([], { tensions: [t], now: NOW });
    const e = events.find((ev) => ev.type === "tension_resolved");
    expect(e).toBeDefined();
    expect(e!.postureImpact).toBe("positive");
  });

  it("sets negative impact when tension is commitment blocker", () => {
    const t = makeTension({ status: "unresolved", is_commitment_blocker: true });
    const events = buildStrategicMovementEvents([], { tensions: [t], now: NOW });
    const e = events.find((ev) => ev.type === "tension_emerged")!;
    expect(e.postureImpact).toBe("negative");
    expect(e.readinessImpact).toBe("declining");
  });

  it("includes tension statement in meaning when long enough", () => {
    const t = makeTension({ statement: "Speed vs quality tradeoff is blocking deployment decisions" });
    const events = buildStrategicMovementEvents([], { tensions: [t], now: NOW });
    const e = events.find((ev) => ev.type === "tension_emerged")!;
    expect(e.meaning).toContain("Speed vs quality tradeoff is blocking deployment decisions");
  });
});

// ─── Hypothesis events ────────────────────────────────────────────────────────

describe("hypothesis events", () => {
  it("generates hypothesis_strengthened for active strengthened hypothesis with claims", () => {
    const card: HypothesisProvenanceCard = {
      ...makeHypothesisCard({ hypothesis_state: "strengthened" }),
      supportingClaims: [{ claimId: "c1", claimStatement: "Three pilots confirmed", support_type: "confirms", strength: "high" }],
    };
    const events = buildStrategicMovementEvents([], { hypotheses: [card], now: NOW });
    const e = events.find((ev) => ev.type === "hypothesis_strengthened");
    expect(e).toBeDefined();
    expect(e!.postureImpact).toBe("positive");
  });

  it("does not generate hypothesis_strengthened without supporting claims", () => {
    const card: HypothesisProvenanceCard = {
      ...makeHypothesisCard({ hypothesis_state: "strengthened" }),
      supportingClaims: [],
    };
    const events = buildStrategicMovementEvents([], { hypotheses: [card], now: NOW });
    expect(events.find((ev) => ev.type === "hypothesis_strengthened")).toBeUndefined();
  });

  it("generates contradiction_detected for contradicted hypothesis", () => {
    const card = makeHypothesisCard({ hypothesis_state: "contradicted" });
    const events = buildStrategicMovementEvents([], { hypotheses: [card], now: NOW });
    const e = events.find((ev) => ev.type === "contradiction_detected");
    expect(e).toBeDefined();
    expect(e!.reversibility).toBe("fragile");
  });

  it("generates hypothesis_reframed for reframed hypothesis", () => {
    const card = makeHypothesisCard({ hypothesis_state: "reframed", reframed_reason: "Market segment shifted" });
    const events = buildStrategicMovementEvents([], { hypotheses: [card], now: NOW });
    const e = events.find((ev) => ev.type === "hypothesis_reframed");
    expect(e).toBeDefined();
    expect(e!.meaning).toContain("Market segment shifted");
  });

  it("skips inactive hypotheses", () => {
    const card = makeHypothesisCard({ hypothesis_state: "contradicted", is_active: false });
    const events = buildStrategicMovementEvents([], { hypotheses: [card], now: NOW });
    expect(events).toHaveLength(0);
  });
});

// ─── Editorial vocabulary guard ───────────────────────────────────────────────

describe("editorial vocabulary — no technical language", () => {
  it("strengthened event uses editorial language", () => {
    const d = makeDecision({
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "Customer interviews confirmed direction" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    assertEditorialVocabulary(events[0]);
  });

  it("weakened event uses editorial language", () => {
    const d = makeDecision({
      confidence_movement: [{ at: TODAY_TS, direction: "weakening", reason: "Field data challenges core assumption" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    events.forEach(assertEditorialVocabulary);
  });

  it("contradiction event uses editorial language", () => {
    const d = makeDecision({
      contradicting_evidence: [{ statement: "Pricing rejected in pilots", source: "field_research" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    events.forEach(assertEditorialVocabulary);
  });

  it("all events from a complex decision use editorial language", () => {
    const d = makeDecision({
      decision_state: "destabilizing",
      contradicting_evidence: [{ statement: "Hypothesis disproven by field data", source: "field_research" }],
      blocked_by: ["Legal review pending"],
      stale_dependencies: ["Old customer proof"],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    events.forEach(assertEditorialVocabulary);
  });
});

// ─── Synthesis / collapse ─────────────────────────────────────────────────────

describe("synthesis — collapse related events", () => {
  it("collapses multiple route_blocked events into one synthesized event", () => {
    const d1 = makeDecision({ id: "d1", blocked_by: ["Legal review pending"] });
    const d2 = makeDecision({
      id:    "d2",
      title: "Market expansion strategy",
      blocked_by: ["Budget approval required"],
    });
    const events = buildStrategicMovementEvents([d1, d2], { now: NOW });
    const blocked = events.filter((e) => e.type === "route_blocked");
    expect(blocked).toHaveLength(1);
    expect(blocked[0].id).toMatch(/^synth-/);
  });

  it("synthesized route_blocked event merges affected decision IDs", () => {
    const d1 = makeDecision({ id: "d1", blocked_by: ["A"] });
    const d2 = makeDecision({ id: "d2", title: "Other", blocked_by: ["B"] });
    const events = buildStrategicMovementEvents([d1, d2], { now: NOW });
    const blocked = events.find((e) => e.type === "route_blocked")!;
    expect(blocked.affectedDecisionIds).toContain("d1");
    expect(blocked.affectedDecisionIds).toContain("d2");
  });

  it("collapses multiple validation_stale events", () => {
    const d1 = makeDecision({ id: "d1", stale_dependencies: ["Old signal A"] });
    const d2 = makeDecision({ id: "d2", title: "Other", stale_dependencies: ["Old signal B"] });
    const events = buildStrategicMovementEvents([d1, d2], { now: NOW });
    const stale = events.filter((e) => e.type === "validation_stale");
    expect(stale).toHaveLength(1);
  });

  it("does not collapse unique event types", () => {
    const d1 = makeDecision({
      id: "d1",
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "" }],
    });
    const d2 = makeDecision({
      id:    "d2",
      title: "Other direction",
      confidence_movement: [{ at: TODAY_TS, direction: "weakening", reason: "" }],
    });
    const events = buildStrategicMovementEvents([d1, d2], { now: NOW });
    expect(events.find((e) => e.type === "confidence_strengthened")).toBeDefined();
    expect(events.find((e) => e.type === "confidence_weakened")).toBeDefined();
  });

  it("synthesized event headline is editorial, not technical", () => {
    const d1 = makeDecision({ id: "d1", blocked_by: ["A"] });
    const d2 = makeDecision({ id: "d2", title: "Other", blocked_by: ["B"] });
    const events = buildStrategicMovementEvents([d1, d2], { now: NOW });
    const blocked = events.find((e) => e.type === "route_blocked")!;
    expect(blocked.headline).not.toMatch(/triggered|propagation|event/i);
    expect(blocked.headline.length).toBeGreaterThan(10);
  });
});

// ─── deriveTopMovementItems ───────────────────────────────────────────────────

describe("deriveTopMovementItems", () => {
  it("returns at most `limit` items", () => {
    const d = makeDecision({
      decision_state:         "destabilizing",
      contradicting_evidence: [{ statement: "Evidence A", source: "field_research" }],
      blocked_by:             ["Blocker B"],
      stale_dependencies:     ["Stale C"],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const top = deriveTopMovementItems(events, 2);
    expect(top.length).toBeLessThanOrEqual(2);
  });

  it("puts negative posture impact events first", () => {
    const d1 = makeDecision({
      id: "d1",
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "" }],
    });
    const d2 = makeDecision({
      id:    "d2",
      title: "Other",
      decision_state: "destabilizing",
    });
    const events = buildStrategicMovementEvents([d1, d2], { now: NOW });
    const top = deriveTopMovementItems(events, 10);
    const firstNegative = top.findIndex((e) => e.postureImpact === "negative");
    const firstPositive = top.findIndex((e) => e.postureImpact === "positive");
    if (firstNegative >= 0 && firstPositive >= 0) {
      expect(firstNegative).toBeLessThan(firstPositive);
    }
  });

  it("defaults to 3 items", () => {
    const d = makeDecision({
      decision_state:         "destabilizing",
      contradicting_evidence: [{ statement: "A", source: "field_research" }],
      blocked_by:             ["B"],
      stale_dependencies:     ["C"],
      confidence_movement:    [{ at: TODAY_TS, direction: "weakening", reason: "" }],
    });
    const events = buildStrategicMovementEvents([d], { now: NOW });
    const top = deriveTopMovementItems(events);
    expect(top.length).toBeLessThanOrEqual(3);
  });
});

// ─── Temporal grouping ────────────────────────────────────────────────────────

describe("temporalGroup", () => {
  it("classifies today as 'today'", () => {
    expect(temporalGroup(TODAY_TS, NOW)).toBe("today");
  });

  it("classifies this week as 'this_week'", () => {
    expect(temporalGroup(THIS_WEEK_TS, NOW)).toBe("this_week");
  });

  it("classifies older as 'earlier'", () => {
    expect(temporalGroup(EARLIER_TS, NOW)).toBe("earlier");
  });

  it("edge: exactly 24 hours ago → this_week", () => {
    const exactly24h = new Date(new Date(NOW).getTime() - 24 * 60 * 60 * 1000).toISOString();
    expect(temporalGroup(exactly24h, NOW)).toBe("this_week");
  });
});

describe("groupByTemporalBand", () => {
  function makeEvent(ts: string, overrides: Partial<StrategicMovementEvent> = {}): StrategicMovementEvent {
    return {
      id:                  `e-${ts}`,
      type:                "confidence_strengthened",
      timestamp:           ts,
      headline:            "Direction is gaining ground.",
      meaning:             "Recent signals are strengthening confidence.",
      affectedDecisionIds: [],
      affectedRouteIds:    [],
      postureImpact:       "positive",
      readinessImpact:     "improving",
      reversibility:       "stabilizing",
      unresolvedConditions: [],
      triggeredBy:         "test",
      ...overrides,
    };
  }

  it("returns a Map with all three keys", () => {
    const groups = groupByTemporalBand([], NOW);
    expect(groups.has("today")).toBe(true);
    expect(groups.has("this_week")).toBe(true);
    expect(groups.has("earlier")).toBe(true);
  });

  it("places events in correct buckets", () => {
    const events = [
      makeEvent(TODAY_TS),
      makeEvent(THIS_WEEK_TS),
      makeEvent(EARLIER_TS),
    ];
    const groups = groupByTemporalBand(events, NOW);
    expect(groups.get("today")!.length).toBe(1);
    expect(groups.get("this_week")!.length).toBe(1);
    expect(groups.get("earlier")!.length).toBe(1);
  });

  it("returns empty arrays for empty buckets", () => {
    const events = [makeEvent(TODAY_TS)];
    const groups = groupByTemporalBand(events, NOW);
    expect(groups.get("this_week")!).toHaveLength(0);
    expect(groups.get("earlier")!).toHaveLength(0);
  });
});

// ─── Display constants ────────────────────────────────────────────────────────

describe("display constants", () => {
  it("REVERSIBILITY_LABELS covers all values", () => {
    const keys: (keyof typeof REVERSIBILITY_LABELS)[] = [
      "stabilizing", "fragile", "reversible", "deteriorating", "unresolved",
    ];
    for (const k of keys) {
      expect(REVERSIBILITY_LABELS[k]).toBeTruthy();
    }
  });

  it("REVERSIBILITY_GLYPHS are non-empty single characters or short symbols", () => {
    for (const glyph of Object.values(REVERSIBILITY_GLYPHS)) {
      expect(glyph.length).toBeGreaterThan(0);
    }
  });

  it("POSTURE_IMPACT_COLORS are hex strings", () => {
    for (const color of Object.values(POSTURE_IMPACT_COLORS)) {
      expect(color).toMatch(/^#[0-9a-f]{6}/i);
    }
  });

  it("TEMPORAL_GROUP_LABELS are non-empty", () => {
    for (const label of Object.values(TEMPORAL_GROUP_LABELS)) {
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

// ─── Multiple decisions ───────────────────────────────────────────────────────

describe("multiple decisions", () => {
  it("generates events for all non-retired decisions", () => {
    const d1 = makeDecision({
      id: "d1",
      confidence_movement: [{ at: TODAY_TS, direction: "strengthening", reason: "" }],
    });
    const d2 = makeDecision({
      id:    "d2",
      title: "Secondary direction",
      contradicting_evidence: [{ statement: "Counter evidence", source: "field_research" }],
    });
    const retired = makeDecision({ id: "d3", decision_state: "retired" });

    const events = buildStrategicMovementEvents([d1, d2, retired], { now: NOW });
    const d1Events = events.filter((e) => e.affectedDecisionIds.includes("d1"));
    const d2Events = events.filter((e) => e.affectedDecisionIds.includes("d2"));
    const retiredEvents = events.filter((e) => e.affectedDecisionIds.includes("d3"));

    expect(d1Events.length).toBeGreaterThan(0);
    expect(d2Events.length).toBeGreaterThan(0);
    expect(retiredEvents).toHaveLength(0);
  });

  it("output is sorted newest-first after collapse", () => {
    const d1 = makeDecision({
      id: "d1",
      confidence_movement: [{ at: THIS_WEEK_TS, direction: "strengthening", reason: "" }],
    });
    const d2 = makeDecision({
      id:    "d2",
      title: "Newer direction",
      contradicting_evidence: [{ statement: "Counter", source: "field_research" }],
      last_meaningful_change_at: TODAY_TS,
    });
    const events = buildStrategicMovementEvents([d1, d2], { now: NOW });
    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i - 1].timestamp).getTime()).toBeGreaterThanOrEqual(
        new Date(events[i].timestamp).getTime(),
      );
    }
  });
});
