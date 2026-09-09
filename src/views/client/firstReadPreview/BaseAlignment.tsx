// Base-alignment circles for the gate beat — ported from mojomap-redesign
// src/pages/first-read/BaseAlignment.tsx @ 1f54a56, made DATA-DRIVEN:
// pair states arrive as props. Phase A passes all-six UNTESTED (the honest
// unknown — no element-pair verdict compute exists yet; Phase C, behind the
// proof-category verdict gate). The caption states the uncomputed condition
// honestly — it never claims states were read from the record when none were.
//
// Stage 3b/3c/3d (visual port, SIGNED 4 + L3): the "today" view — four HTML nodes (outer ink ring,
// inner lime ring) laid out 01 top-left / 02 right / 03 lower-left / 04 lower-right, numbered by CSS
// counter (display only, never DOM text), node name mono uppercase, the existing sub-line beneath;
// dashed connectors on all six pairs on an SVG underlay, each with its pair-state tag on a paper
// backing at the connector midpoint (tags that would sit within 40px of each other are offset along
// the connector normal). An UNTESTED link is two overlaid dashed strokes whose dashes travel slowly in
// opposite directions (grey / periwinkle), eased; prefers-reduced-motion stops them. The toggle
// (existing strings) is a segmented control above the stage; the aligned view is kept.

import { useState } from "react";
import type { CSSProperties } from "react";
import { Eyebrow } from "./primitives";

export type BaseElementKey = "strategy" | "market" | "positioning" | "promise";
export type PairState = "confirmed" | "contradicted" | "untested";
export type BasePairInput = {
  a: BaseElementKey;
  b: BaseElementKey;
  state: PairState;
  readFrom: string;
};

export const PAIR_KEYS: ReadonlyArray<readonly [BaseElementKey, BaseElementKey]> = [
  ["market", "strategy"],
  ["strategy", "positioning"],
  ["promise", "strategy"],
  ["market", "positioning"],
  ["market", "promise"],
  ["positioning", "promise"],
];

/** Phase A: no element-pair verdict compute exists — every pair is unknown. */
export function allUntestedPairs(readFrom: string): BasePairInput[] {
  return PAIR_KEYS.map(([a, b]) => ({ a, b, state: "untested", readFrom }));
}

// Layout space (the SVG underlay's viewBox); node positions are converted to percentages. The stage
// is capped at 640px wide, so one viewBox unit is one CSS pixel at the 1440 layout: a 270-unit ring
// renders at 270px... capped by .fr-base-stage's max-width (see firstRead.css) to keep ~240px rings.
const W = 640;
const H = 690;
export const TODAY_R = 135;
const GOAL_CENTER = { x: 320, y: 355 };
// Tag collision threshold / offset, in viewBox units (~40px / ~28px at the 1440 layout).
export const TAG_NEAR = 45;
const TAG_OFFSET = 32;

/** Reading order = numbering order (01 Strategy, 02 Positioning, 03 Who you serve, 04 Promise). */
export const ELEMENTS: {
  key: BaseElementKey;
  label: string;
  sub: string;
  today: { x: number; y: number };
  goalR: number;
}[] = [
  { key: "strategy", label: "Strategy", sub: "what you're doing", today: { x: 170, y: 165 }, goalR: 115 },
  // Positioning carries anchor weight — heavier ring, outermost in the aligned view.
  { key: "positioning", label: "Positioning", sub: "why you win", today: { x: 470, y: 245 }, goalR: 150 },
  { key: "market", label: "Who you serve", sub: "who's critical to your success", today: { x: 170, y: 470 }, goalR: 80 },
  { key: "promise", label: "Promise", sub: "what you promise", today: { x: 470, y: 545 }, goalR: 45 },
];

// Segment labels (stage 3e): "Today — untested" is OPERATOR-SIGNED; "See it aligned" is the existing string.
const SEGMENT_TODAY = "Today — untested"; // signed
const SEGMENT_ALIGNED = "See it aligned";

const STATE_LABEL: Record<PairState, string> = {
  confirmed: "Confirmed",
  contradicted: "Contradicted",
  untested: "Untested",
};

// Tokenized (stage 2): the verdict tokens + the faint token the values duplicated.
const STATE_COLOR: Record<PairState, string> = {
  confirmed: "hsl(var(--fr-good))",
  contradicted: "hsl(var(--fr-bad))",
  untested: "hsl(var(--fr-faint))",
};

const STATE_DASH: Record<PairState, string | undefined> = {
  confirmed: undefined,
  contradicted: "7 7",
  untested: "5 9",
};

function elementFor(key: BaseElementKey) {
  const el = ELEMENTS.find((entry) => entry.key === key);
  if (!el) throw new Error(`Unknown base element: ${key}`);
  return el;
}

function edgePoint(from: { x: number; y: number }, toward: { x: number; y: number }, r: number) {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r };
}

type Pt = { x: number; y: number };

// A connector shorter than this (ring edge to ring edge) cannot carry its tag on the line without
// touching a ring, so the tag moves off the line along the normal, outward from the stage centre.
const SHORT_LINK = 100;
const SHORT_OFFSET = 42;
const STAGE_CENTER = { x: W / 2, y: H / 2 };

/** The paper backing box behind a tag, in viewBox units (the test asserts on this box). */
export function tagBox(label: string, tag: Pt) {
  const width = label.length * 6.6 + 16;
  const height = 16;
  return { x: tag.x - width / 2, y: tag.y - height / 2, width, height };
}

const RING_STROKE_HALF = 3;

/** True when the tag box is wholly outside every ring's stroke band (never straddling a stroke). */
function boxClearsRings(box: { x: number; y: number; width: number; height: number }): boolean {
  return ELEMENTS.every((el) => {
    const c = el.today;
    const nx = Math.max(box.x, Math.min(c.x, box.x + box.width));
    const ny = Math.max(box.y, Math.min(c.y, box.y + box.height));
    const near = Math.hypot(nx - c.x, ny - c.y);
    const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]];
    const far = Math.max(...corners.map(([x, y]) => Math.hypot(x - c.x, y - c.y)));
    return !(near <= TODAY_R + RING_STROKE_HALF && far >= TODAY_R - RING_STROKE_HALF);
  });
}

/** Connector geometry + a tag position that never sits within TAG_NEAR of an earlier tag and whose
 *  backing box never touches a ring stroke: the midpoint is tried first (long links only), then
 *  offsets along the connector normal — outward from the stage centre first — growing until a
 *  candidate clears every ring and every placed tag. Exported for the geometry test. */
export function layoutPairs(pairs: BasePairInput[]) {
  const placed: Pt[] = [];
  const label = STATE_LABEL.untested.toUpperCase(); // the widest tag drives the clearance box
  return pairs.map((pair) => {
    const a = elementFor(pair.a);
    const b = elementFor(pair.b);
    const start = edgePoint(a.today, b.today, TODAY_R + 6);
    const end = edgePoint(b.today, a.today, TODAY_R + 6);
    const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const normal = { x: -(end.y - start.y) / len, y: (end.x - start.x) / len };
    const near = (p: Pt) => placed.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < TAG_NEAR);
    const along = (d: number): Pt => ({ x: mid.x + normal.x * d, y: mid.y + normal.y * d });
    const dist = (p: Pt) => Math.hypot(p.x - STAGE_CENTER.x, p.y - STAGE_CENTER.y);
    const ok = (p: Pt) => !near(p) && boxClearsRings(tagBox(label, p));
    // Candidate order: midpoint (long links), then ± offsets, outward side first, growing.
    const candidates: Pt[] = [];
    if (len >= SHORT_LINK) candidates.push(mid);
    for (const d of [SHORT_OFFSET, SHORT_OFFSET + 14, SHORT_OFFSET + 28, SHORT_OFFSET + 42, TAG_OFFSET]) {
      const plus = along(d), minus = along(-d);
      const [first, second] = dist(plus) >= dist(minus) ? [plus, minus] : [minus, plus];
      candidates.push(first, second);
    }
    const tag = candidates.find(ok) ?? candidates[0];
    placed.push(tag);
    return { pair, start, end, tag };
  });
}

export default function BaseAlignment({
  pairs,
  caption,
  goalCaption,
  marketNote,
}: {
  pairs: BasePairInput[];
  /** Today-state caption — must be true of the pair states actually shown. */
  caption: string;
  goalCaption: string;
  /** Optional pointer under the Market circle (today state only). */
  marketNote?: string;
}) {
  // Default is always TODAY — the goal state is a preview, never the landing view.
  const [aligned, setAligned] = useState(false);
  const laid = layoutPairs(pairs);

  return (
    <div className="fr-base w-full">
      {/* L3 + SIGNED (stage 3e): a two-segment control, top-left of the body column — "Today — untested"
          (signed) and "See it aligned" (existing). The active segment is ink-filled. */}
      <div className="fr-base-toolbar" role="group">
        <button type="button" className="fr-seg fr-mono" data-active={aligned ? "false" : "true"} aria-pressed={!aligned} onClick={() => setAligned(false)}>
          {SEGMENT_TODAY}
        </button>
        <button type="button" className="fr-seg fr-mono" data-active={aligned ? "true" : "false"} aria-pressed={aligned} onClick={() => setAligned(true)}>
          {SEGMENT_ALIGNED}
        </button>
      </div>

      <div className="fr-base-stage" data-aligned={aligned ? "true" : "false"}>
        {/* Connectors + pair-state tags — today only (SVG underlay). */}
        <svg
          className="fr-base-links"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden={aligned}
          style={{ opacity: aligned ? 0 : 1 }}
        >
          {laid.map(({ pair, start, end, tag }) => {
            const color = STATE_COLOR[pair.state];
            const d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            const label = STATE_LABEL[pair.state].toUpperCase();
            const box = tagBox(label, tag);
            return (
              <g key={`${pair.a}-${pair.b}`}>
                <title>{pair.readFrom}</title>
                {pair.state === "untested" ? (
                  // Two dashed strokes, dashes travelling in opposite directions (grey / periwinkle).
                  <>
                    <path className="fr-base-link fr-base-link--fwd" d={d} fill="none" strokeDasharray={STATE_DASH.untested} vectorEffect="non-scaling-stroke" />
                    <path className="fr-base-link fr-base-link--back" d={d} fill="none" strokeDasharray={STATE_DASH.untested} vectorEffect="non-scaling-stroke" />
                  </>
                ) : (
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={pair.state === "contradicted" ? 1.5 : 1}
                    strokeDasharray={STATE_DASH[pair.state]}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {/* Paper backing so the tag never collides with a stroke, a ring or another tag. */}
                <rect className="fr-base-tag-back" x={box.x} y={box.y} width={box.width} height={box.height} rx={2} />
                <text
                  className="fr-align-tag"
                  x={tag.x}
                  y={tag.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9}
                  letterSpacing="0.18em"
                  fill={color}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* The four base elements — HTML nodes; numerals are CSS counters. */}
        <ol className="fr-base-nodes">
          {ELEMENTS.map((el) => {
            const center = aligned ? GOAL_CENTER : el.today;
            const r = aligned ? el.goalR : TODAY_R;
            const anchor = el.key === "positioning";
            const style = {
              left: `${(center.x / W) * 100}%`,
              top: `${(center.y / H) * 100}%`,
              width: `${((r * 2) / W) * 100}%`,
            } as CSSProperties;
            return (
              <li key={el.key} className="fr-base-node" data-anchor={anchor ? "true" : undefined} data-key={el.key} style={style}>
                <div className="fr-base-node-inner">
                  <span className="fr-base-node-num fr-mono" aria-hidden />
                  <span className="fr-base-node-label fr-mono">{el.label.toUpperCase()}</span>
                  {/* Plain-words line from the base definition; fades in goal state. */}
                  <span className="fr-base-node-sub" style={{ opacity: aligned ? 0 : 1 }}>{el.sub}</span>
                  {/* Market pointer (today only) — links the circle back to the "Who you
                      serve" beat. DRAFT, operator signs. */}
                  {el.key === "market" && marketNote && !aligned ? (
                    <span className="fr-base-node-note fr-mono">{marketNote}</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Caption below the stage, left-aligned, mono faint. */}
      <div className="fr-base-caption-row">
        {aligned ? (
          <>
            <Eyebrow>Goal state</Eyebrow>
            <p className="fr-base-caption">{goalCaption}</p>
          </>
        ) : (
          <Eyebrow>{caption}</Eyebrow>
        )}
      </div>
    </div>
  );
}
