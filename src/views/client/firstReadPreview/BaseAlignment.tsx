// Base-alignment circles for the gate beat — ported from mojomap-redesign
// src/pages/first-read/BaseAlignment.tsx @ 1f54a56, made DATA-DRIVEN:
// pair states arrive as props. Phase A passes all-six UNTESTED (the honest
// unknown — no element-pair verdict compute exists yet; Phase C, behind the
// proof-category verdict gate). The caption states the uncomputed condition
// honestly — it never claims states were read from the record when none were.
//
// Stage 3b/3c (visual port, SIGNED 4): the "today" view — four HTML nodes (outer ink ring, inner lime
// ring), numbered 01–04 by CSS counter (display only, never DOM text), node name mono uppercase,
// the existing sub-line beneath; dashed connectors on all six pairs on an SVG underlay with the
// pair-state tag on each. An UNTESTED link is two overlaid dashed strokes whose dashes travel slowly
// in opposite directions (grey one way, periwinkle the other), eased; prefers-reduced-motion stops
// them. The "See it aligned" toggle and the aligned view are kept.

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

// Layout space (the SVG underlay's viewBox); node positions are converted to percentages.
const W = 640;
const H = 420;
const TODAY_R = 66;
const GOAL_CENTER = { x: 320, y: 218 };

/** Reading order = numbering order (01 Strategy, 02 Positioning, 03 Who you serve, 04 Promise). */
const ELEMENTS: {
  key: BaseElementKey;
  label: string;
  sub: string;
  today: { x: number; y: number };
  goalR: number;
}[] = [
  { key: "strategy", label: "Strategy", sub: "what you're doing", today: { x: 300, y: 95 }, goalR: 70 },
  // Positioning carries anchor weight — heavier ring, outermost in the aligned view.
  { key: "positioning", label: "Positioning", sub: "why you win", today: { x: 470, y: 150 }, goalR: 92 },
  { key: "market", label: "Who you serve", sub: "who's critical to your success", today: { x: 140, y: 275 }, goalR: 48 },
  { key: "promise", label: "Promise", sub: "what you promise", today: { x: 370, y: 330 }, goalR: 26 },
];

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

  return (
    <div className="fr-base mt-6 flex w-full max-w-[720px] flex-col items-center">
      <div className="fr-base-stage" data-aligned={aligned ? "true" : "false"}>
        {/* Connectors + pair-state tags — today only (SVG underlay). */}
        <svg
          className="fr-base-links"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden={aligned}
          style={{ opacity: aligned ? 0 : 1 }}
        >
          {pairs.map((pair) => {
            const a = elementFor(pair.a);
            const b = elementFor(pair.b);
            const color = STATE_COLOR[pair.state];
            const start = edgePoint(a.today, b.today, TODAY_R + 4);
            const end = edgePoint(b.today, a.today, TODAY_R + 4);
            const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
            const d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
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
                <text
                  className="fr-align-tag"
                  x={mid.x}
                  y={mid.y - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={500}
                  letterSpacing="0.18em"
                  fill={color}
                >
                  {STATE_LABEL[pair.state].toUpperCase()}
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

      <div className="mt-8 flex flex-col items-center gap-2 text-center">
        {aligned ? (
          <>
            <Eyebrow>Goal state</Eyebrow>
            <p className="fr-base-caption">{goalCaption}</p>
          </>
        ) : (
          <Eyebrow>{caption}</Eyebrow>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAligned((current) => !current)}
        className="fr-link-ink group mt-6 text-xs font-bold uppercase tracking-[0.2em] transition-colors fr-mono"
      >
        {aligned ? (
          <>
            <span className="inline-block transition-transform group-hover:-translate-x-1">&larr;</span>{" "}
            Back to today
          </>
        ) : (
          <>
            See it aligned{" "}
            <span className="inline-block transition-transform group-hover:translate-x-1">&rarr;</span>
          </>
        )}
      </button>
    </div>
  );
}
