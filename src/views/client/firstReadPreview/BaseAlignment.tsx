// Base-alignment circles for the gate beat — ported from mojomap-redesign
// src/pages/first-read/BaseAlignment.tsx @ 1f54a56, made DATA-DRIVEN:
// pair states arrive as props. Phase A passes all-six UNTESTED (the honest
// unknown — no element-pair verdict compute exists yet; Phase C, behind the
// proof-category verdict gate). The caption states the uncomputed condition
// honestly — it never claims states were read from the record when none were.

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

const TODAY_R = 58;
const GOAL_CENTER = { x: 320, y: 218 };

const ELEMENTS: {
  key: BaseElementKey;
  label: string;
  sub: string;
  today: { x: number; y: number };
  goalR: number;
}[] = [
  { key: "strategy", label: "Strategy", sub: "what you're doing", today: { x: 300, y: 95 }, goalR: 70 },
  { key: "market", label: "Market", sub: "who it's for", today: { x: 90, y: 272 }, goalR: 48 },
  // Positioning carries anchor weight — heavier indigo stroke, outermost ring.
  { key: "positioning", label: "Positioning", sub: "why you win", today: { x: 385, y: 140 }, goalR: 92 },
  { key: "promise", label: "Promise", sub: "what you promise", today: { x: 245, y: 352 }, goalR: 26 },
];

const STATE_LABEL: Record<PairState, string> = {
  confirmed: "Confirmed",
  contradicted: "Contradicted",
  untested: "Untested",
};

const STATE_COLOR: Record<PairState, string> = {
  confirmed: "hsl(160 84% 33%)",
  contradicted: "hsl(347 77% 50%)",
  untested: "hsl(215 20% 65%)",
};

const STATE_DASH: Record<PairState, string | undefined> = {
  confirmed: undefined,
  contradicted: "7 7",
  untested: "2 7",
};

/** Per-pair tag placement (aesthetic only — states come from data). */
const PAIR_LAYOUT: Record<
  string,
  { tag: { x: number; y: number }; leader?: { from: number; to: number } }
> = {
  "market-strategy": { tag: { x: 195, y: 184 } },
  "strategy-positioning": { tag: { x: 358, y: 44 }, leader: { from: 52, to: 82 } },
  "promise-strategy": { tag: { x: 269, y: 238 } },
  "market-positioning": { tag: { x: 208, y: 219 } },
  "market-promise": { tag: { x: 154, y: 328 } },
  "positioning-promise": { tag: { x: 306, y: 260 } },
};

function elementFor(key: BaseElementKey) {
  const el = ELEMENTS.find((entry) => entry.key === key);
  if (!el) throw new Error(`Unknown base element: ${key}`);
  return el;
}

function edgePoint(
  from: { x: number; y: number },
  toward: { x: number; y: number },
  r: number,
) {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * r, y: from.y + (dy / len) * r };
}

export default function BaseAlignment({
  pairs,
  caption,
  goalCaption,
}: {
  pairs: BasePairInput[];
  /** Today-state caption — must be true of the pair states actually shown. */
  caption: string;
  goalCaption: string;
}) {
  // Default is always TODAY — the goal state is a preview, never the landing view.
  const [aligned, setAligned] = useState(false);

  return (
    <div className="mt-16 flex w-full max-w-[640px] flex-col items-center">
      <svg
        viewBox="0 0 640 420"
        className="w-full"
        role="img"
        aria-label={
          aligned
            ? "Goal state: the four base elements stacked concentrically as one aligned base"
            : "Today: the four base elements with their pair states"
        }
      >
        {/* Connectors + pair-state tags — today only. */}
        <g
          className="fr-align-overlay"
          style={{ opacity: aligned ? 0 : 1 }}
          aria-hidden={aligned}
        >
          {pairs.map((pair) => {
            const a = elementFor(pair.a);
            const b = elementFor(pair.b);
            const layout = PAIR_LAYOUT[`${pair.a}-${pair.b}`];
            if (!layout) return null;
            const color = STATE_COLOR[pair.state];
            const start = edgePoint(a.today, b.today, TODAY_R);
            const end = edgePoint(b.today, a.today, TODAY_R);
            const overlapping = pair.state === "confirmed" && !!layout.leader;
            return (
              <g key={`${pair.a}-${pair.b}`}>
                <title>{pair.readFrom}</title>
                {!overlapping ? (
                  <path
                    d={`M ${start.x} ${start.y} L ${end.x} ${end.y}`}
                    fill="none"
                    stroke={color}
                    strokeWidth={pair.state === "contradicted" ? 1.5 : 1}
                    strokeDasharray={STATE_DASH[pair.state]}
                    opacity={pair.state === "untested" ? 0.7 : 1}
                  />
                ) : (
                  <line
                    x1={layout.tag.x}
                    y1={layout.leader!.from}
                    x2={layout.tag.x}
                    y2={layout.leader!.to}
                    stroke={color}
                    strokeWidth={1}
                  />
                )}
                <text
                  className="fr-align-tag"
                  x={layout.tag.x}
                  y={layout.tag.y}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  letterSpacing="0.18em"
                  fill={color}
                >
                  {STATE_LABEL[pair.state].toUpperCase()}
                </text>
              </g>
            );
          })}
        </g>

        {/* The four base elements. */}
        {ELEMENTS.map((el) => {
          const center = aligned ? GOAL_CENTER : el.today;
          const r = aligned ? el.goalR : TODAY_R;
          const labelOffset = aligned ? { x: 0, y: -(r + 10) } : { x: 0, y: -2 };
          const anchor = el.key === "positioning";
          return (
            <g
              key={el.key}
              className="fr-align-el"
              style={{ transform: `translate(${center.x}px, ${center.y}px)` }}
            >
              <circle
                className="fr-align-circle"
                data-anchor={anchor ? "true" : undefined}
                style={{ "--fr-align-r": `${r}px` } as CSSProperties}
              />
              <g
                className="fr-align-label"
                style={{ transform: `translate(${labelOffset.x}px, ${labelOffset.y}px)` }}
              >
                <text
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  letterSpacing="0.2em"
                  fill={anchor ? "hsl(239 84% 57%)" : "hsl(222 47% 11%)"}
                >
                  {el.label.toUpperCase()}
                </text>
                {/* Plain-words line from the base definition; fades in goal state. */}
                <text
                  className="fr-align-sublabel"
                  style={{ opacity: aligned ? 0 : 1 }}
                  y={14}
                  textAnchor="middle"
                  fontSize={8}
                  fontWeight={500}
                  letterSpacing="0.04em"
                  fill="hsl(215 16% 47%)"
                >
                  {el.sub}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      <div className="mt-8 flex flex-col items-center gap-2 text-center">
        {aligned ? (
          <>
            <Eyebrow>Goal state</Eyebrow>
            <p className="text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
              {goalCaption}
            </p>
          </>
        ) : (
          <Eyebrow>{caption}</Eyebrow>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAligned((current) => !current)}
        className="fr-link-ink group mt-6 text-xs font-bold uppercase tracking-[0.2em] transition-colors"
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
