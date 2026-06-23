import { describe, it, expect } from "vitest";
import { computeFoundationStatus } from "../useFoundationStatus";
import type { PositioningCanvas, StrategyCascade } from "@/lib/types";
import type { RouteRow } from "@/hooks/useRoutes";
import type { DirectionEvidence } from "../useDirectionEvidence";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const fullPositioning: Partial<PositioningCanvas> = {
  market_category: "Specialty Coffee",
  best_fit_customers: "Independent coffee shop owners",
  value_for_customer: "Consistent quality at scale",
} as PositioningCanvas;

const fullCascade: Partial<StrategyCascade> = {
  winning_aspiration: "Be the default choice for independent cafes",
  where_to_play: "Specialty coffee, independent shops, Pacific Northwest",
  how_to_win: "Quality consistency + supply chain transparency",
} as StrategyCascade;

const makeRoute = (overrides: Partial<RouteRow> & { id: string }): RouteRow => ({
  company_id: "co-test",
  category: "fix",
  title: "Route " + overrides.id,
  level: "route",
  ...overrides,
} as RouteRow);

const routeA = makeRoute({ id: "r-a", level: "route" });
const routeB = makeRoute({ id: "r-b", level: "route" });
const routeC = makeRoute({ id: "r-c", level: "route", rejected_alternatives: ["Alt C"] as unknown as RouteRow["rejected_alternatives"], what_would_have_to_be_true: ["Condition 1"] as unknown as RouteRow["what_would_have_to_be_true"] });

const makeDirectionEvidence = (overrides: Partial<DirectionEvidence> = {}): DirectionEvidence => ({
  directions: [],
  leaning: null,
  narrative: "No directions identified.",
  ...overrides,
});

// ── Null inputs ───────────────────────────────────────────────────────────────

describe("computeFoundationStatus — null positioning and cascade", () => {
  const result = computeFoundationStatus(null, null, [], null);

  it("positioningSet is false", () => expect(result.positioningSet).toBe(false));
  it("strategyMapped is false", () => expect(result.strategyMapped).toBe(false));
  it("directionCount is 0", () => expect(result.directionCount).toBe(0));
  it("wrapPresent is false", () => expect(result.wrapPresent).toBe(false));
  it("leaningTitle is null", () => expect(result.leaningTitle).toBeNull());
  it("narrative mentions nothing mapped yet", () => expect(result.narrative).toContain("hasn't been mapped"));
  it("tagline reflects early stage", () => expect(result.tagline).toContain("Early-stage"));
});

// ── Partial positioning ───────────────────────────────────────────────────────

describe("computeFoundationStatus — partial positioning", () => {
  const positioning = { market_category: "Coffee", best_fit_customers: "", value_for_customer: "Good value" } as unknown as PositioningCanvas;
  const result = computeFoundationStatus(positioning, null, [], null);

  it("positioningSet is false", () => expect(result.positioningSet).toBe(false));
  it("categoryDefined is true", () => expect(result.categoryDefined).toBe(true));
  it("buyerDefined is false", () => expect(result.buyerDefined).toBe(false));
  it("valueDefined is true", () => expect(result.valueDefined).toBe(true));
  it("narrative mentions partial mapping", () => expect(result.narrative).toContain("partially mapped"));
  it("narrative mentions missing field", () => expect(result.narrative).toContain("buyer"));
});

// ── Full positioning, no strategy ─────────────────────────────────────────────

describe("computeFoundationStatus — positioning set, no cascade", () => {
  const result = computeFoundationStatus(fullPositioning as PositioningCanvas, null, [], null);

  it("positioningSet is true", () => expect(result.positioningSet).toBe(true));
  it("cascadeElementCount is 0", () => expect(result.cascadeElementCount).toBe(0));
  it("narrative says positioning is set", () => expect(result.narrative).toContain("Positioning is set"));
});

// ── Full positioning + partial cascade ───────────────────────────────────────

describe("computeFoundationStatus — positioning set, partial cascade", () => {
  const partialCascade = {
    winning_aspiration: "Be the best",
    where_to_play: "",
    how_to_win: "Consistency",
  } as unknown as StrategyCascade;

  const result = computeFoundationStatus(fullPositioning as PositioningCanvas, partialCascade, [], null);

  it("strategyMapped is false", () => expect(result.strategyMapped).toBe(false));
  it("cascadeElementCount is 2", () => expect(result.cascadeElementCount).toBe(2));
  it("narrative mentions in progress", () => expect(result.narrative).toContain("in progress"));
  it("narrative mentions 2 of 3", () => expect(result.narrative).toContain("2 of 3"));
});

// ── Fully grounded — all three pillars + directions + wrap ───────────────────

describe("computeFoundationStatus — fully grounded", () => {
  const routeWithWrap = makeRoute({
    id: "r-wrap",
    level: "route",
    rejected_alternatives: ["Alt A", "Alt B"] as unknown as RouteRow["rejected_alternatives"],
    what_would_have_to_be_true: ["Condition A", "Condition B"] as unknown as RouteRow["what_would_have_to_be_true"],
  });

  const evidence = makeDirectionEvidence({
    directions: [{ id: "r-wrap", title: "Cafe Barra Core", legCount: 2, signals: { outside: 3, organization: 4, customer: 2, total: 9 }, signalStrength: 19, isLeaning: true }],
    leaning: "r-wrap",
    narrative: "Route Alpha is pulling ahead.",
  });

  const result = computeFoundationStatus(
    fullPositioning as PositioningCanvas,
    fullCascade as StrategyCascade,
    [routeWithWrap],
    evidence,
  );

  it("positioningSet is true", () => expect(result.positioningSet).toBe(true));
  it("strategyMapped is true", () => expect(result.strategyMapped).toBe(true));
  it("directionCount is 1", () => expect(result.directionCount).toBe(1));
  it("wrapPresent is true", () => expect(result.wrapPresent).toBe(true));
  it("leaningTitle is the route title", () => expect(result.leaningTitle).toBe("Cafe Barra Core"));
  it("narrative mentions alternatives considered", () => expect(result.narrative).toContain("alternatives considered"));
  it("narrative mentions leaning route", () => expect(result.narrative).toContain("Cafe Barra Core"));
  it("tagline is strong encouragement", () => expect(result.tagline).toContain("You've done real work"));
});

// ── Two directions, no leaning ────────────────────────────────────────────────

describe("computeFoundationStatus — two directions, no leaning", () => {
  const evidence = makeDirectionEvidence({
    directions: [
      { id: "r-a", title: "Route Alpha", legCount: 1, signals: { outside: 2, organization: 0, customer: 0, total: 2 }, signalStrength: 2, isLeaning: false },
      { id: "r-b", title: "Route Beta", legCount: 1, signals: { outside: 2, organization: 0, customer: 0, total: 2 }, signalStrength: 2, isLeaning: false },
    ],
    leaning: null,
    narrative: "Evenly spread.",
  });

  const result = computeFoundationStatus(
    fullPositioning as PositioningCanvas,
    fullCascade as StrategyCascade,
    [routeA, routeB],
    evidence,
  );

  it("directionCount is 2", () => expect(result.directionCount).toBe(2));
  it("leaningTitle is null when no leaning", () => expect(result.leaningTitle).toBeNull());
  it("narrative mentions two directions", () => expect(result.narrative).toContain("Two directions"));
  it("tagline is solid groundwork (2 grounded pillars: positioning + strategy + directions)", () => {
    // positioningSet + strategyMapped + directionCount > 0 = 3 → strong tagline
    expect(result.tagline).toContain("You've done real work");
  });
});

// ── Leg routes excluded from directionCount ───────────────────────────────────

describe("computeFoundationStatus — only legs (no top-level routes)", () => {
  const leg = makeRoute({ id: "leg-1", level: "leg" });
  const result = computeFoundationStatus(null, null, [leg], null);

  it("directionCount is 0 (legs don't count)", () => expect(result.directionCount).toBe(0));
  it("wrapPresent is false (legs not checked)", () => expect(result.wrapPresent).toBe(false));
});

// ── wrapPresent requires both fields populated ─────────────────────────────────

describe("computeFoundationStatus — wrapPresent when both WRAP fields populated", () => {
  const result = computeFoundationStatus(null, null, [routeC], null);

  it("directionCount is 1", () => expect(result.directionCount).toBe(1));
  it("wrapPresent is true", () => expect(result.wrapPresent).toBe(true));
});
