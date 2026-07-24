// V2-3 — the Act 2 journey exhibit. A hand-authored SVG (no model, no Lovable).
//
// The read as one horizontal picture, three passes over the SAME three stations:
//   • forward  — start OUTSIDE, read against how you see yourselves, land on customer needs
//   • backward — work back from validated needs, through plans, to message + positioning
//   • live     — once running, keep watching the outside; drift raises a flag
//
// Style laws in force: NO vertical accent bars; theme-aware via CSS vars ONLY (no
// hardcoded colors — the fills/strokes resolve against the .cvs-story palette and flip
// with the light theme); plain-English labels, no framework names; calm density.
// Every label comes from JOURNEY_VISUAL_LABELS (single-sourced with the export).

import { JOURNEY_VISUAL_LABELS as L } from "@/lib/firstRead/whyOutside";

// ── Geometry (viewBox units) ──────────────────────────────────────────────────
const VB_W = 780;
const VB_H = 372;
const BOX_W = 204;
const BOX_H = 82;
const BOX_Y = 96;
const BOX_XS = [18, 288, 558]; // left edges → centers 120 / 390 / 660
const cx = (i: number) => BOX_XS[i] + BOX_W / 2;
const BOX_MID_Y = BOX_Y + BOX_H / 2;
const BOX_BOTTOM = BOX_Y + BOX_H;

// Wrap a gloss into up to `maxLines` short lines (labels are signed elsewhere; layout
// stays robust to wording changes rather than hand-placed per string). NEVER drops a
// word: once on the final allowed line, all remaining words are absorbed onto it.
function wrap(text: string, max = 30, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (lines.length === maxLines - 1) {
      cur = cur ? `${cur} ${w}` : w; // last line — absorb everything left, drop nothing
    } else if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// A right-pointing arrowhead at (x,y).
function ArrowRight({ x, y, stroke }: { x: number; y: number; stroke: string }) {
  return <path d={`M${x - 8},${y - 4} L${x},${y} L${x - 8},${y + 4}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />;
}
// A left-pointing arrowhead at (x,y).
function ArrowLeft({ x, y, stroke }: { x: number; y: number; stroke: string }) {
  return <path d={`M${x + 8},${y - 4} L${x},${y} L${x + 8},${y + 4}`} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />;
}

const FWD = "var(--mm-amber, #d3a552)";
const REV = "var(--mm-green, #8fb87f)";
const MON = "var(--mm-muted, #98917f)";
const INK = "var(--mm-text, #ece5d6)";
const SUB = "var(--mm-muted, #98917f)";
const LINE = "var(--mm-line-18, rgba(255,255,255,0.18))";

function CaptionBlock({ y, color, heading, caption }: { y: number; color: string; heading: string; caption: string }) {
  return (
    <g>
      {/* color swatch — a small chip, never a vertical bar */}
      <rect x={18} y={y - 9} width={10} height={10} rx={2} fill={color} />
      <text x={36} y={y} fontFamily="ui-monospace, Menlo, monospace" fontSize={10.5} letterSpacing="1.4" fill={color} style={{ textTransform: "uppercase" }}>
        {heading.toUpperCase()}
      </text>
      <text x={36} y={y + 17} fontFamily="Inter, system-ui, sans-serif" fontSize={13} fill={SUB}>
        {caption}
      </text>
    </g>
  );
}

export default function JourneyVisual() {
  return (
    <svg
      className="cvs-fr-journey-svg"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      role="img"
      aria-label="How the read moves: start with the outside record, work back from customer needs, then watch the outside once you're live."
      style={{ display: "block", maxWidth: 780, margin: "0 auto" }}
    >
      {/* ── monitoring loop (over the top): station 3 → back to station 1 ── */}
      <path
        d={`M${cx(2)},${BOX_Y - 6} C${cx(2)},${BOX_Y - 64} ${cx(0)},${BOX_Y - 64} ${cx(0)},${BOX_Y - 6}`}
        fill="none"
        stroke={MON}
        strokeWidth={1.4}
        strokeDasharray="4 4"
      />
      <ArrowLeft x={cx(0)} y={BOX_Y - 8} stroke={MON} />
      {/* a small flag at the apex — drift is surfaced, never silent */}
      <g stroke={MON} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1={cx(0) + (cx(2) - cx(0)) / 2} y1={BOX_Y - 62} x2={cx(0) + (cx(2) - cx(0)) / 2} y2={BOX_Y - 46} />
        <path d={`M${cx(0) + (cx(2) - cx(0)) / 2},${BOX_Y - 62} l12,4 l-12,4 z`} fill={MON} stroke="none" />
      </g>

      {/* ── the three stations ── */}
      {L.nodes.map((n, i) => {
        const subLines = wrap(n.sub);
        return (
          <g key={n.title}>
            <rect
              x={BOX_XS[i]}
              y={BOX_Y}
              width={BOX_W}
              height={BOX_H}
              rx={10}
              fill="none"
              stroke={LINE}
              strokeWidth={1.25}
            />
            <text x={cx(i)} y={BOX_Y + 30} textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize={15} fontWeight={600} fill={INK}>
              {n.title}
            </text>
            {subLines.map((ln, j) => (
              <text key={j} x={cx(i)} y={BOX_Y + 50 + j * 15} textAnchor="middle" fontFamily="Inter, system-ui, sans-serif" fontSize={11.5} fill={SUB}>
                {ln}
              </text>
            ))}
          </g>
        );
      })}

      {/* ── forward pass (between the stations, left→right) ── */}
      {[0, 1].map((i) => {
        const x1 = BOX_XS[i] + BOX_W;
        const x2 = BOX_XS[i + 1];
        return (
          <g key={`fwd-${i}`}>
            <line x1={x1 + 6} y1={BOX_MID_Y} x2={x2 - 8} y2={BOX_MID_Y} stroke={FWD} strokeWidth={1.5} />
            <ArrowRight x={x2 - 6} y={BOX_MID_Y} stroke={FWD} />
          </g>
        );
      })}

      {/* ── reverse pass (under the stations): station 3 → back to station 1 ── */}
      <path
        d={`M${cx(2)},${BOX_BOTTOM + 6} C${cx(2)},${BOX_BOTTOM + 40} ${cx(0)},${BOX_BOTTOM + 40} ${cx(0)},${BOX_BOTTOM + 6}`}
        fill="none"
        stroke={REV}
        strokeWidth={1.5}
      />
      <ArrowLeft x={cx(0)} y={BOX_BOTTOM + 8} stroke={REV} />

      {/* ── the three passes, named + captioned (single-sourced labels) ── */}
      <CaptionBlock y={252} color={FWD} heading={L.beats.start} caption={L.flows.forward} />
      <CaptionBlock y={294} color={REV} heading={L.beats.backward} caption={L.flows.reverse} />
      <CaptionBlock y={336} color={MON} heading={L.beats.live} caption={L.flows.monitor} />
    </svg>
  );
}
