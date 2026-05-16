import { describe, it, expect } from "vitest";
import { computeDirectionEvidence } from "../useDirectionEvidence";
import type { RouteRow } from "@/views/Routes/useRoutes";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeRoute = (overrides: Partial<RouteRow> & { id: string; title: string }): RouteRow => ({
  company_id: "co-test",
  category: "fix",
  ...overrides,
});

const routeA = makeRoute({ id: "r-a", title: "Route Alpha", level: "route", claim_id: "cl-a" });
const routeB = makeRoute({ id: "r-b", title: "Route Beta",  level: "route", claim_id: "cl-b" });
const routeC = makeRoute({ id: "r-c", title: "Route Gamma", level: "route", claim_id: null });

const legA1 = makeRoute({ id: "leg-a1", title: "Leg 1", level: "leg", parent_id: "r-a", claim_id: "cl-a1" });
const legA2 = makeRoute({ id: "leg-a2", title: "Leg 2", level: "leg", parent_id: "r-a", claim_id: "cl-a2" });
const legB1 = makeRoute({ id: "leg-b1", title: "Leg 3", level: "leg", parent_id: "r-b", claim_id: "cl-b1" });

// ── Empty case ────────────────────────────────────────────────────────────────

describe("computeDirectionEvidence — empty", () => {
  const result = computeDirectionEvidence([], new Map(), new Map(), new Map());

  it("returns empty directions", () => expect(result.directions).toHaveLength(0));
  it("leaning is null", () => expect(result.leaning).toBeNull());
  it("narrative mentions no directions", () => expect(result.narrative).toContain("No directions"));
});

// ── Single route, no signals ──────────────────────────────────────────────────

describe("computeDirectionEvidence — single route, no signals", () => {
  const result = computeDirectionEvidence(
    [routeA],
    new Map([["r-a", [legA1, legA2]]]),
    new Map(),
    new Map(),
  );

  it("returns one direction", () => expect(result.directions).toHaveLength(1));
  it("direction has correct title", () => expect(result.directions[0].title).toBe("Route Alpha"));
  it("legCount is 2", () => expect(result.directions[0].legCount).toBe(2));
  it("signals all zero", () => {
    const s = result.directions[0].signals;
    expect(s.outside).toBe(0);
    expect(s.organization).toBe(0);
    expect(s.customer).toBe(0);
    expect(s.total).toBe(0);
  });
  it("signalStrength is 0", () => expect(result.directions[0].signalStrength).toBe(0));
  it("leaning is null (no signals)", () => expect(result.leaning).toBeNull());
});

// ── Normal case: two routes, one clearly leading ──────────────────────────────

describe("computeDirectionEvidence — two routes, one leading", () => {
  // Route A: 3 outside + 4 org + 2 customer = weight (3 + 8 + 8 = 19)
  // Route B: 1 outside + 0 org + 0 customer = weight (1)
  const signalBandById = new Map([
    ["s-out-1", "outside"],
    ["s-out-2", "outside"],
    ["s-out-3", "outside"],
    ["s-org-1", "organization"],
    ["s-org-2", "organization"],
    ["s-org-3", "organization"],
    ["s-org-4", "organization"],
    ["s-cust-1", "customer"],
    ["s-cust-2", "customer"],
    ["s-b-out-1", "outside"],
  ]);

  const signalsByClaimId = new Map([
    ["cl-a",  ["s-out-1", "s-out-2"]],
    ["cl-a1", ["s-out-3", "s-org-1", "s-org-2"]],
    ["cl-a2", ["s-org-3", "s-org-4", "s-cust-1", "s-cust-2"]],
    ["cl-b",  ["s-b-out-1"]],
  ]);

  const result = computeDirectionEvidence(
    [routeA, routeB],
    new Map([
      ["r-a", [legA1, legA2]],
      ["r-b", []],
    ]),
    signalBandById,
    signalsByClaimId,
  );

  const dirA = result.directions.find((d) => d.id === "r-a")!;
  const dirB = result.directions.find((d) => d.id === "r-b")!;

  it("Route A outside count is 3", () => expect(dirA.signals.outside).toBe(3));
  it("Route A organization count is 4", () => expect(dirA.signals.organization).toBe(4));
  it("Route A customer count is 2", () => expect(dirA.signals.customer).toBe(2));
  it("Route A total is 9", () => expect(dirA.signals.total).toBe(9));
  it("Route B total is 1", () => expect(dirB.signals.total).toBe(1));
  it("Route A is leaning", () => expect(dirA.isLeaning).toBe(true));
  it("Route B is not leaning", () => expect(dirB.isLeaning).toBe(false));
  it("leaning id is r-a", () => expect(result.leaning).toBe("r-a"));
  it("narrative mentions Route Alpha", () => expect(result.narrative).toContain("Route Alpha"));
  it("narrative mentions signal counts", () => expect(result.narrative).toContain("9 signals"));
});

// ── All even — no leaning ─────────────────────────────────────────────────────

describe("computeDirectionEvidence — no clear leaning", () => {
  const signalBandById = new Map([
    ["s1", "outside"],
    ["s2", "outside"],
    ["s3", "outside"],
    ["s4", "outside"],
  ]);
  const signalsByClaimId = new Map([
    ["cl-a", ["s1", "s2"]],
    ["cl-b", ["s3", "s4"]],
  ]);

  const result = computeDirectionEvidence(
    [routeA, routeB],
    new Map([["r-a", []], ["r-b", []]]),
    signalBandById,
    signalsByClaimId,
  );

  it("no direction is leaning", () => expect(result.directions.every((d) => !d.isLeaning)).toBe(true));
  it("leaning is null", () => expect(result.leaning).toBeNull());
  it("narrative mentions evenly spread", () => expect(result.narrative).toContain("evenly"));
});

// ── Customer exclusivity ──────────────────────────────────────────────────────

describe("computeDirectionEvidence — only one route has customer signals", () => {
  // Route A: 1 customer = weight 4. Route B: 3 outside = weight 3.
  // Gap is 1 — below the "clearly leaning" threshold of 4, so customer-exclusivity narrative fires.
  const signalBandById = new Map([
    ["s-cust-1", "customer"],
    ["s-out-b1", "outside"],
    ["s-out-b2", "outside"],
    ["s-out-b3", "outside"],
  ]);
  const signalsByClaimId = new Map([
    ["cl-a",  ["s-cust-1"]],
    ["cl-b",  ["s-out-b1", "s-out-b2", "s-out-b3"]],
  ]);

  const result = computeDirectionEvidence(
    [routeA, routeB],
    new Map([["r-a", []], ["r-b", []]]),
    signalBandById,
    signalsByClaimId,
  );

  it("narrative mentions only direction with customer evidence", () =>
    expect(result.narrative).toContain("only direction with direct customer evidence"));
});

// ── Route with null claim_id ──────────────────────────────────────────────────

describe("computeDirectionEvidence — route with null claim_id", () => {
  const result = computeDirectionEvidence(
    [routeC],
    new Map(),
    new Map([["s1", "outside"]]),
    new Map([["cl-x", ["s1"]]]),
  );

  it("direction exists with zero signals (no claim)", () => {
    expect(result.directions).toHaveLength(1);
    expect(result.directions[0].signals.total).toBe(0);
  });
});
