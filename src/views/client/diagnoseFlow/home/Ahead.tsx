// MH1 · AHEAD — PORTED FROM components/home/FutureCone.tsx.
//
// THE HANDOFF'S COORDINATE SPACE, UNSCALED. AX 80 · AY 320 · EX 1760 · H 640, and the four rings at
// their BASE radii. The handoff stretches the cone vertically by a factor k computed from the
// measured height; with AY == H/2 that factor is exactly 1, so these ARE its positions and the
// geometry is testable in px rather than approximated.
//
// W IS 2300, NOT THE HANDOFF'S 2200. Its goal ring is labelled "Your goal · 61"; ours carries the
// signed "{company}'s goal · chosen at the end of Diagnose", so the right-hand label lane is 300px
// wide and the box grows by 100 to hold it. Nothing is clipped — test (i) is the proof.
//
// ── THE NOV 9 COUNCIL RULINGS, N1–N4 + O1/O2 + N8 + N10 ────────────────────────────────────────
//
// N1 · THREE ZONES, EACH WITH A DEFINITION ON HOVER OR FOCUS, nested Possible ⊃ Plausible ⊃
//      Probable. Probable is EMPTY and says why: P7 has no today-value and no trend.
//      THE GOAL IS A MARKER, NOT A RING — amber, square, empty until a goal is chosen.
//
// N2 / O1 · A ROUTE'S ZONE IS ITS EVIDENCE COUNT, read strictly: a condition counts only when a
//      stored link names the evidence. Stage A measured 0 such links in the whole database, so every
//      route is in Possible with n = 0 and Plausible stands empty in slice 1. NOTHING HERE IS PLACED
//      BY LAYOUT: no route's position comes from its index in the list.
//
// O2 · WHEN A ZONE'S ROUTES DO NOT DIFFER BY EVIDENCE COUNT, THEY ARE ONE BAND. Eight lines fanned
//      across a cone read as eight different futures; they are not — they are one undifferentiated
//      set, and a band is the honest shape for it. Individual lines return the moment the counts
//      differ, ordered by count, and the test holds that door shut.
//
// N3 · NO LINE CLAIMS UNDERWAY. Every route here is a generated route idea (Stage A: all 15 carry
//      provenance_type public_research, no document link, no intake row, and the fleet has zero
//      client_attested rows), so every stroke is faint and dashed and the legend says where they
//      came from. G7's "what {company} already has underway" legend is withdrawn.
//
// N4 · ROUTES END AT THE MOUTH, INSIDE THEIR ZONE'S RING, and line length carries no meaning —
//      there are no ticks on the axis for it to be measured against.
//
// R5 · NO WEDGE. K5's shaded wedge ran from Today to the goal, and with the goal now an empty
//      marker it was drawing a corridor to a destination nobody has chosen — the one thing on this
//      screen that claimed something the data does not hold. It returns when a goal is chosen.
//
// N10 · ONE CARD AT A TIME: beside the pointer while a mouse is on the band or a line, following it
//      along the stroke and flipping to stay on screen; beside the end dot on keyboard focus.
import { useLayoutEffect, useRef, useState } from "react";
import { HOME } from "../strings";
import type { DiagnoseData, DiagnoseInitiative } from "../useDiagnoseData";

const AX = 80;
const EX = 1760;
const W = 2300;
const H = 640;
const AY = H / 2;

/** The handoff's BASE rings, unscaled. Nesting is N1's: ry 250 ⊃ 190 ⊃ 44. */
export const RINGS = {
  possible: { cy: 320, ry: 250, rx: 64 },
  plausible: { cy: 330, ry: 190, rx: 50 },
  probable: { cy: 350, ry: 44, rx: 18 },
} as const;
type ZoneKey = keyof typeof RINGS;
/** N1 — the goal is a marker at the handoff's goal-ring centre, not a ring. */
const GOAL = { cy: 250, size: 16 } as const;

/** The right-hand label lane: a dashed leader from EX+70 to EX+200, text from EX+210. */
const LEAD_FROM = EX + 70;
const LEAD_TO = EX + 200;
const LANE = EX + 210;

/** The handoff's two dashed verticals sit at 620 and EX, labelled "Focus" and "Goal date · 2028".
 *  The goal date is omitted (no data, K5), so the second vertical carries the signed "Flow" and
 *  takes the midpoint between Focus and the cone's mouth. */
const FOCUS_X = 620;
const FLOW_X = Math.round((FOCUS_X + EX) / 2);

/** N4 — a zone's strokes stop INSIDE its own ring, and the vertical room they have there is the
 *  ring's own half-height at that x. Not an approximation: the ellipse's equation.
 *
 *  HALF A RADIUS IN, NOT SIX PIXELS. Stopping just past the ring's left extremity is inside it by
 *  the letter and reads as stopping AT it: the band came out a sliver in a ring ten times its
 *  height. At rx/2 the band fills the ring's near half, which is what "inside the zone" looks
 *  like — and it still stops clear of the goal marker, which the clamp guarantees for every ring
 *  however narrow. */
const RING_INSET = 0.5;
const GOAL_CLEAR = 8;
const BAND_PAD = 12;
const LINE_PAD = 10;
export const endXFor = (ring: { rx: number }) =>
  Math.min(EX - ring.rx * RING_INSET, EX - GOAL.size / 2 - GOAL_CLEAR);
export function halfAt(ring: { cy: number; ry: number; rx: number }, x: number): number {
  const t = (x - EX) / ring.rx;
  const k = 1 - t * t;
  return k <= 0 ? 0 : ring.ry * Math.sqrt(k);
}

/** The rollover card. Its height is MEASURED, not guessed, because the band's card holds one line
 *  per route and a guess would put it off the box on a company with many routes. */
const CARD_W = 420;
const ZONE_CARD_W = 300;
const CARD_OFFSET = 16;
/** The handoff's hit target for a path is an 18px transparent stroke; a dot's is 44px (M3). */
const HIT_R = 22;
const HIT_STROKE = 18;

/** The ghost lane, below the cone: what Focus will draw, not yet drawn. */
const GHOST_X = 200;
const GHOSTS = [
  { y: 578, w: 620 },
  { y: 598, w: 500 },
  { y: 618, w: 380 },
];

/** One stroke on the cone: a band standing for a whole zone, or one route's own line. */
export type Lane =
  | { kind: "band"; zone: ZoneKey; x: number; y1: number; y2: number; routes: readonly DiagnoseInitiative[] }
  | { kind: "line"; zone: ZoneKey; x: number; y: number; route: DiagnoseInitiative };

/** N2 / O1 — the zone IS the evidence count. Probable needs today's number and its trend (P7), so
 *  nothing can be placed there and no route is ever assigned to it. */
export function zoneOf(route: DiagnoseInitiative): ZoneKey {
  return route.evidenced > 0 ? "plausible" : "possible";
}

/** O2 — one band per zone whose routes do not differ by evidence count; otherwise one line each,
 *  ordered by that count. The order within a band is the title's, so it is stable and not the
 *  array's. */
export function lanesFor(routes: readonly DiagnoseInitiative[]): Lane[] {
  const lanes: Lane[] = [];
  for (const zone of Object.keys(RINGS) as ZoneKey[]) {
    const ring = RINGS[zone];
    const inZone = routes.filter((r) => zoneOf(r) === zone);
    if (inZone.length === 0) continue;
    const x = endXFor(ring);
    const half = halfAt(ring, x);
    const counts = new Set(inZone.map((r) => r.evidenced));
    if (counts.size === 1) {
      lanes.push({
        kind: "band",
        zone,
        x,
        y1: ring.cy - half + BAND_PAD,
        y2: ring.cy + half - BAND_PAD,
        routes: [...inZone].sort((a, b) => a.title.localeCompare(b.title)),
      });
      continue;
    }
    const ordered = [...inZone].sort((a, b) => b.evidenced - a.evidenced || a.title.localeCompare(b.title));
    const room = Math.max(0, half - LINE_PAD);
    for (const [i, route] of ordered.entries()) {
      const t = ordered.length === 1 ? 0.5 : i / (ordered.length - 1);
      lanes.push({ kind: "line", zone, x, y: ring.cy - room + t * 2 * room, route });
    }
  }
  return lanes;
}

/** What is being pointed at. `at` is the pointer in the cone's own coordinates; null means the
 *  keyboard put it there, and N10 then anchors the card to the stroke's end instead. */
type Active =
  | { kind: "lane"; id: string; lane: Lane; at: { x: number; y: number } | null }
  | { kind: "zone"; zone: ZoneKey };

const laneId = (lane: Lane) => (lane.kind === "band" ? `band:${lane.zone}` : `line:${lane.route.id}`);

export function Ahead({ data }: { data: DiagnoseData }) {
  const company = data.company ?? "";
  const lanes = lanesFor(data.initiatives);
  const [active, setActive] = useState<Active | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(0);

  // The card's own height, read before paint: the band's card is as tall as the zone has routes.
  useLayoutEffect(() => {
    const el = cardRef.current;
    setCardH(el ? el.offsetHeight : 0);
  }, [active]);

  /** The pointer in cone coordinates. The SVG is rendered at its natural size inside the box, so
   *  one viewBox unit is one CSS pixel and this is a subtraction, not a matrix. */
  const pointerAt = (e: { clientX: number; clientY: number }) => {
    const b = boxRef.current?.getBoundingClientRect();
    return b ? { x: e.clientX - b.left, y: e.clientY - b.top } : null;
  };

  const zones = (Object.keys(RINGS) as ZoneKey[]).map((key) => ({
    key,
    label: key === "possible" ? HOME.possible : key === "plausible" ? HOME.plausible : HOME.probable,
    ring: RINGS[key],
    // N1 — THE LABELS READ IN THE NESTING ORDER. The handoff hangs Plausible BELOW its ring, which
    // put the three names down the lane as Possible · Probable · Plausible — the opposite of
    // Possible ⊃ Plausible ⊃ Probable, and the first thing a reader takes from a lane of labels is
    // their order. Each name now sits at its own ring's top edge (the innermost at its centre,
    // which has no room above it), so top to bottom IS the nesting.
    labelY:
      key === "probable"
        ? RINGS.probable.cy
        : RINGS[key].cy - RINGS[key].ry + 20,
    definition:
      key === "possible" ? HOME.zonePossible : key === "plausible" ? HOME.zonePlausible : HOME.zoneProbable(company),
  }));

  /** N10 — beside the pointer, flipped to stay inside the cone; beside the end on focus. */
  const placeCard = (lane: Lane, at: { x: number; y: number } | null) => {
    const h = cardH || 0;
    const anchor = at ?? {
      x: lane.x,
      y: lane.kind === "band" ? (lane.y1 + lane.y2) / 2 : lane.y,
    };
    let left = anchor.x + CARD_OFFSET;
    if (left + CARD_W > W) left = anchor.x - CARD_OFFSET - CARD_W;
    let top = anchor.y + CARD_OFFSET;
    if (top + h > H) top = anchor.y - CARD_OFFSET - h;
    return { left: Math.max(0, Math.min(left, W - CARD_W)), top: Math.max(0, Math.min(top, Math.max(0, H - h))) };
  };

  const laneHandlers = (lane: Lane) => ({
    tabIndex: 0,
    role: "button",
    onMouseEnter: (e: React.MouseEvent) => setActive({ kind: "lane", id: laneId(lane), lane, at: pointerAt(e) }),
    onMouseMove: (e: React.MouseEvent) => setActive({ kind: "lane", id: laneId(lane), lane, at: pointerAt(e) }),
    onMouseLeave: () => setActive((v) => (v?.kind === "lane" && v.id === laneId(lane) ? null : v)),
    onFocus: () => setActive({ kind: "lane", id: laneId(lane), lane, at: null }),
    onBlur: () => setActive((v) => (v?.kind === "lane" && v.id === laneId(lane) ? null : v)),
  });

  const onLane = (lane: Lane) => active?.kind === "lane" && active.id === laneId(lane);

  return (
    <section className="dg-sec dg-sec--ahead" data-dg-section="ahead" id="dg-ahead">
      <span className="dg-mono">{HOME.ahead}</span>

      <div className="dg-cone">
        <div className="dg-cone-box" data-dg-cone ref={boxRef}>
          <svg className="dg-cone-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
            {/* the time axis, with its arrow. N4: no ticks — length means nothing here */}
            <line className="dg-cone-axis" x1={AX} y1={40} x2={W - 60} y2={40} />
            <path className="dg-cone-arrow" d={`M${W - 68} 34 L${W - 58} 40 L${W - 68} 46`} />

            {/* the two dashed verticals */}
            {[FOCUS_X, FLOW_X].map((x) => (
              <line className="dg-cone-vert" key={x} x1={x} y1={52} x2={x} y2={H - 20} />
            ))}

            {/* the cone's outlines: apex to each ring's extremes */}
            {zones.map((z) => (
              <path
                className="dg-cone-outline"
                key={z.key}
                data-ring={z.key}
                d={`M${AX} ${AY} L${EX} ${z.ring.cy - z.ring.ry} M${AX} ${AY} L${EX} ${z.ring.cy + z.ring.ry}`}
              />
            ))}

            {/* the rings themselves */}
            {zones.map((z) => (
              <ellipse
                className="dg-cone-ell"
                key={z.key}
                data-ring={z.key}
                data-dg-ell={z.key}
                cx={EX}
                cy={z.ring.cy}
                rx={z.ring.rx}
                ry={z.ring.ry}
              />
            ))}

            {/* N1 — the goal: an amber marker, square per the shape law, empty until chosen */}
            <rect
              className="dg-cone-goal"
              data-dg-goal
              x={EX - GOAL.size / 2}
              y={GOAL.cy - GOAL.size / 2}
              width={GOAL.size}
              height={GOAL.size}
            />

            {/* the label lane's dashed leaders */}
            {[...zones.map((z) => z.labelY), GOAL.cy].map((y) => (
              <line className="dg-cone-leader" key={y} x1={LEAD_FROM} y1={y} x2={LEAD_TO} y2={y} />
            ))}

            {/* the ghost lane */}
            {GHOSTS.map((g) => (
              <line className="dg-cone-ghost" key={g.y} x1={GHOST_X} y1={g.y} x2={GHOST_X + g.w} y2={g.y} />
            ))}

            {/* O2 / N3 — the strokes: one faint dashed band per undifferentiated zone, or one faint
              * dashed line per route once the counts differ */}
            {lanes.map((lane) =>
              lane.kind === "band" ? (
                <g
                  className="dg-cone-lane"
                  key={laneId(lane)}
                  data-dg-band={lane.zone}
                  data-on={onLane(lane)}
                  aria-label={HOME.bandLabel(lane.routes.length)}
                  {...laneHandlers(lane)}
                >
                  <path
                    className="dg-cone-band"
                    data-dg-band-path={lane.zone}
                    d={`M${AX} ${AY} L${lane.x} ${lane.y1} L${lane.x} ${lane.y2} Z`}
                  />
                  <path
                    className="dg-cone-hit"
                    data-dg-hit={`band:${lane.zone}`}
                    d={`M${AX} ${AY} L${lane.x} ${lane.y1} L${lane.x} ${lane.y2} Z`}
                  />
                </g>
              ) : (
                <g
                  className="dg-cone-lane"
                  key={laneId(lane)}
                  data-dg-route={lane.route.id}
                  data-on={onLane(lane)}
                  aria-label={lane.route.title}
                  {...laneHandlers(lane)}
                >
                  <line className="dg-cone-line" data-dg-line={lane.route.id} x1={AX} y1={AY} x2={lane.x} y2={lane.y} />
                  <line className="dg-cone-hit" x1={AX} y1={AY} x2={lane.x} y2={lane.y} strokeWidth={HIT_STROKE} />
                  <circle className="dg-cone-hit" data-dg-hit={lane.route.id} cx={lane.x} cy={lane.y} r={HIT_R} />
                  <circle className="dg-cone-end" cx={lane.x} cy={lane.y} r={onLane(lane) ? 7 : 5} />
                </g>
              ),
            )}

            {/* the time line arriving from Today, and the apex sitting on it */}
            <line className="dg-cone-leader" x1={0} y1={AY} x2={AX} y2={AY} />
            <circle className="dg-cone-apex" cx={AX} cy={AY} r={9} />
          </svg>

          {/* the labels are HTML: they wrap, and they carry the page's own type tokens */}
          <span className="dg-cone-time-label" style={{ left: FOCUS_X, top: 12 }}>{HOME.aheadFocus}</span>
          <span className="dg-cone-time-label" style={{ left: FLOW_X, top: 12 }}>{HOME.aheadFlow}</span>

          {/* N1 — each zone's name is the control its definition hangs off */}
          {zones.map((z) => (
            <button
              type="button"
              className="dg-cone-ell-label"
              key={z.key}
              data-dg-ell-label={z.key}
              style={{ left: LANE, top: z.labelY }}
              onMouseEnter={() => setActive({ kind: "zone", zone: z.key })}
              onMouseLeave={() => setActive((v) => (v?.kind === "zone" && v.zone === z.key ? null : v))}
              onFocus={() => setActive({ kind: "zone", zone: z.key })}
              onBlur={() => setActive((v) => (v?.kind === "zone" && v.zone === z.key ? null : v))}
            >
              {z.label}
            </button>
          ))}
          {/* N1 — Probable stands empty and says what it is waiting for */}
          <span
            className="dg-cone-ell-note"
            data-dg-probable-empty
            style={{ left: LANE, top: RINGS.probable.cy + 18 }}
          >
            {HOME.zoneProbableEmpty}
          </span>

          <span className="dg-cone-goal-label" data-dg-goal-label style={{ left: LANE, top: GOAL.cy }}>
            {HOME.goalZone(company)}
          </span>

          <span className="dg-cone-ghost-label" style={{ left: GHOST_X, top: 548 }}>{HOME.ghostLines}</span>

          {/* N1 — a zone's definition, while its name is pointed at or focused */}
          {active?.kind !== "zone" ? null : (
            <div
              className="dg-cone-zone-card"
              data-dg-zone-card={active.zone}
              style={{
                left: LANE,
                top: Math.min(zones.find((z) => z.key === active.zone)!.labelY + 26, H - 150),
              }}
            >
              {zones.find((z) => z.key === active.zone)!.definition}
            </div>
          )}

          {/* N10 — ONE card, beside the pointer or beside the stroke's end.
            *
            * O2 · THE BAND'S CARD IS THE ZONE'S ROUTE TITLES, one per line, sorted by title: the
            * band says how many and that none is tested, and the card says which.
            *
            * N2 · A LINE'S CARD IS ITS COUNT AND ITS CONDITIONS. The STATE LINE THE SPEC ASKS FOR
            * IS STILL OMITTED: lifecycle is MISSING (P8) and no state word is signed, so the card
            * carries only what it can source. */}
          {active?.kind !== "lane" ? null : (
            <div
              className="dg-cone-card"
              data-dg-card-lane={active.id}
              ref={cardRef}
              style={{ ...placeCard(active.lane, active.at), width: CARD_W }}
            >
              {active.lane.kind === "band" ? (
                active.lane.routes.map((r) => (
                  <span className="dg-cone-card-row" data-dg-card-route={r.id} key={r.id}>{r.title}</span>
                ))
              ) : (
                <>
                  <span className="dg-mono">
                    {HOME.condEvidence(active.lane.route.evidenced, active.lane.route.conditions)}
                  </span>
                  <span className="dg-cone-card-name">{active.lane.route.title}</span>
                  {active.lane.route.bets.length === 0 ? null : (
                    <>
                      <span className="dg-mono">{HOME.betsThatHover}</span>
                      {active.lane.route.bets.map((b, i) => (
                        <span className="dg-cone-card-row" key={i}>{b}</span>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* N8 — the legend is swatches: the dashed stroke, the amber marker, the three rings */}
      <div className="dg-cone-legend" data-dg-legend>
        <span className="dg-leg">
          <span className="dg-swatch" data-kind="dashed" />
          <span className="dg-small">{HOME.ideasFromOutside}</span>
        </span>
        <span className="dg-leg">
          <span className="dg-swatch" data-kind="amber" />
          <span className="dg-small">{HOME.goalSwatch(company)}</span>
        </span>
        {zones.map((z) => (
          <span className="dg-leg" key={z.key}>
            <span className="dg-swatch" data-kind="ring" data-ring={z.key} />
            <span className="dg-small">{z.label}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
