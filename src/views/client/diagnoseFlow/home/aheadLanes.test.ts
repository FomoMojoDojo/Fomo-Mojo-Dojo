// N2 / O2 — WHERE A ROUTE SITS ON THE CONE, PROVEN ON THE FUNCTION THAT DECIDES IT.
//
// The brief asks for a test that NO ROUTE'S VERTICAL POSITION IS SET BY INDEX ALONE. A browser
// measurement cannot show that: it sees the ys, not what produced them, and a layout that happened
// to agree with the data on one fixture would pass. So it is pinned here, on lanesFor itself — and
// the decisive case is the LAST one: shuffle the input and every route keeps its own y.
import { describe, expect, it } from "vitest";
import { RINGS, endXFor, halfAt, lanesFor, zoneOf } from "./Ahead";
import type { DiagnoseInitiative } from "../useDiagnoseData";

const route = (id: string, title: string, conditions: number, evidenced: number): DiagnoseInitiative =>
  ({ id, title, bets: [], conditions, evidenced });

/** Every live route, in both companies, as Stage A measured them: conditions, no evidence link. */
const NONE_EVIDENCED = [
  route("r3", "Clarify eligibility", 5, 0),
  route("r1", "Build a portal", 4, 0),
  route("r2", "Ad hoc reports", 4, 0),
];

describe("O1 / N1 — a route's zone is its evidence count, read strictly", () => {
  it("no evidence link ⇒ Possible", () => {
    expect(zoneOf(route("a", "a", 5, 0))).toBe("possible");
  });

  it("one evidence link ⇒ Plausible", () => {
    expect(zoneOf(route("a", "a", 5, 1))).toBe("plausible");
  });

  it("nothing is ever placed in Probable — P7 has no today-value and no trend", () => {
    for (const n of [0, 1, 2, 5, 40]) {
      expect(zoneOf(route("a", "a", 5, n))).not.toBe("probable");
    }
  });
});

describe("O2 — a zone whose routes do not differ is ONE band", () => {
  it("equal counts ⇒ one band, no individual line", () => {
    const lanes = lanesFor(NONE_EVIDENCED);
    expect(lanes).toHaveLength(1);
    expect(lanes[0].kind).toBe("band");
    expect(lanes[0].kind === "band" && lanes[0].routes).toHaveLength(3);
  });

  it("the band lists its routes sorted by title, not by array order", () => {
    const lanes = lanesFor(NONE_EVIDENCED);
    const titles = lanes[0].kind === "band" ? lanes[0].routes.map((r) => r.title) : [];
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    expect(titles[0]).toBe("Ad hoc reports");
  });

  it("the band's mouth is inside its own ring — N4, not merely inside the cone", () => {
    const lane = lanesFor(NONE_EVIDENCED)[0];
    if (lane.kind !== "band") throw new Error("expected a band");
    const x = endXFor(RINGS.possible);
    const half = halfAt(RINGS.possible, x);
    expect(lane.x).toBe(x);
    expect(lane.y1).toBeGreaterThan(RINGS.possible.cy - half);
    expect(lane.y2).toBeLessThan(RINGS.possible.cy + half);
    // and it is a band with room in it, not a degenerate line
    expect(lane.y2 - lane.y1).toBeGreaterThan(40);
  });

  it("an empty zone draws nothing", () => {
    expect(lanesFor([])).toEqual([]);
  });
});

describe("N2 — once the counts differ, the routes separate and the ORDER IS THE COUNT", () => {
  const MIXED = [
    route("low", "Zeta", 4, 1),
    route("high", "Alpha", 4, 3),
    route("mid", "Mu", 4, 2),
  ];

  it("differing counts ⇒ one line each, no band", () => {
    const lanes = lanesFor(MIXED);
    expect(lanes).toHaveLength(3);
    expect(lanes.every((l) => l.kind === "line")).toBe(true);
  });

  it("the most-evidenced route is highest on the cone", () => {
    const lanes = lanesFor(MIXED);
    const y = (id: string) => lanes.find((l) => l.kind === "line" && l.route.id === id)!;
    const high = y("high"), mid = y("mid"), low = y("low");
    if (high.kind !== "line" || mid.kind !== "line" || low.kind !== "line") throw new Error("expected lines");
    expect(high.y).toBeLessThan(mid.y);
    expect(mid.y).toBeLessThan(low.y);
  });

  it("NO POSITION COMES FROM THE INDEX: shuffling the input moves nothing", () => {
    const forward = lanesFor(MIXED);
    const reversed = lanesFor([...MIXED].reverse());
    const yById = (lanes: ReturnType<typeof lanesFor>) =>
      Object.fromEntries(lanes.map((l) => [l.kind === "line" ? l.route.id : l.zone, l.kind === "line" ? l.y : 0]));
    expect(yById(reversed)).toEqual(yById(forward));
  });

  it("a mixed set splits across its zones, and each zone's strokes end in its own ring", () => {
    const lanes = lanesFor([route("a", "A", 4, 0), route("b", "B", 4, 1), route("c", "C", 4, 2)]);
    const zones = new Set(lanes.map((l) => l.zone));
    expect(zones).toEqual(new Set(["possible", "plausible"]));
    for (const lane of lanes) expect(lane.x).toBe(endXFor(RINGS[lane.zone]));
  });
});

describe("N1 — the rings nest, Possible ⊃ Plausible ⊃ Probable", () => {
  it("every radius strictly decreases", () => {
    expect(RINGS.possible.ry).toBeGreaterThan(RINGS.plausible.ry);
    expect(RINGS.plausible.ry).toBeGreaterThan(RINGS.probable.ry);
    expect(RINGS.possible.rx).toBeGreaterThan(RINGS.plausible.rx);
    expect(RINGS.plausible.rx).toBeGreaterThan(RINGS.probable.rx);
  });

  it("halfAt is the ellipse's own equation, and zero outside it", () => {
    expect(halfAt(RINGS.possible, 1760)).toBeCloseTo(250, 6);
    expect(halfAt(RINGS.possible, 1760 - 64)).toBeCloseTo(0, 6);
    expect(halfAt(RINGS.plausible, 1700)).toBe(0); // x is outside the plausible ring entirely
  });
});
