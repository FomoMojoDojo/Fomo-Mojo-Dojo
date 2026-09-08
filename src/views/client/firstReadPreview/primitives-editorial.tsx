// First Read — EDITORIAL LAYOUT PRIMITIVES (visual port, stage 2).
//
// Layout only. These carry NO strings of their own: every visible word is passed in by the beat
// that uses them, so applying a primitive to a beat can never add, remove or change a rendered
// string. Styling lives in ./firstRead.css under the `.fr-screen`, `.fr-spread`, `.fr-sidenote`,
// `.fr-hanging`, `.fr-divider` and `.fr-flow` families, on the signed --fr-* tokens.
//
// ./primitives.tsx (Eyebrow / LedgerRow / SourceTag / …) is NOT replaced — beats 3–17 keep it.
// Later gates apply these beat by beat; stage 2 applies them to beats 1–2 only.

import type { CSSProperties, ReactNode } from "react";
import { Eyebrow } from "./primitives";

export type ScreenTone = "paper" | "dark";

/** Full-page beat frame. `note` is the right-hand aside column (statement / tags); `source` is the
 *  quiet mono line under the whole screen. Dark tone bleeds to the viewport edges under the header. */
export function Screen({
  tone = "paper",
  eyebrow,
  note,
  foot,
  source,
  children,
  className,
}: {
  tone?: ScreenTone;
  eyebrow?: ReactNode;
  note?: ReactNode;
  /** Below the main column, AFTER the note in DOM order (a forward-link). */
  foot?: ReactNode;
  source?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`fr-screen fr-screen--${tone}${note ? " fr-screen--has-note" : ""}${className ? ` ${className}` : ""}`}
      data-fr-tone={tone}
    >
      <div className="fr-screen-main">
        {eyebrow ? <div className="fr-screen-eyebrow"><Eyebrow>{eyebrow}</Eyebrow></div> : null}
        {children}
      </div>
      {note ? <aside className="fr-screen-note">{note}</aside> : null}
      {foot ? <div className="fr-screen-foot">{foot}</div> : null}
      {source ? <p className="fr-screen-source fr-mono">{source}</p> : null}
    </section>
  );
}

export type SpreadSidebar = "slate" | "lime";

/** Sidebar + main. The sidebar (slate or lime) fills the row and its text sticks on desktop;
 *  columns are minmax(0, 25rem) / minmax(0, 1fr). Everything in the sidebar is optional and
 *  renders in this DOM order: eyebrow → lead → title → lede → statement → aside (below the hairline). */
export function Spread({
  sidebar = "slate",
  eyebrow,
  lead,
  title,
  lede,
  aside,
  statement,
  children,
}: {
  sidebar?: SpreadSidebar;
  eyebrow?: ReactNode;
  /** Between the eyebrow and the title (a score numeral). */
  lead?: ReactNode;
  title?: ReactNode;
  lede?: ReactNode;
  /** The block below the hairline (rationale, count, banner). */
  aside?: ReactNode;
  /** A second paragraph under the lede (an anchor line, a framing line). */
  statement?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fr-spread" data-fr-sidebar={sidebar}>
      <aside className="fr-spread-side">
        <div className="fr-spread-side-inner">
          {eyebrow ? <div className="fr-spread-eyebrow"><Eyebrow>{eyebrow}</Eyebrow></div> : null}
          {lead ? <div className="fr-spread-lead">{lead}</div> : null}
          {title ? <h1 className="fr-display fr-spread-title">{title}</h1> : null}
          {lede ? <p className="fr-spread-lede">{lede}</p> : null}
          {statement ? <p className="fr-spread-statement">{statement}</p> : null}
          {aside ? <div className="fr-spread-aside">{aside}</div> : null}
        </div>
      </aside>
      <div className="fr-spread-main">{children}</div>
    </section>
  );
}

/** Label column + body: the editorial "label on the left, rows on the right" layout. Pass `label`
 *  for a label that is real DOM text (an existing eyebrow), or `groupWord` for a group header drawn
 *  by CSS from the attribute (`content: attr(data-fr-group)`) — display-only, never DOM text, so a
 *  group header can reuse a word that already renders on every row (a verdict, a strength) without
 *  adding a string to the page. `tier` is a styling hook (`data-fr-tier`). */
export function Labeled({
  label,
  groupWord,
  tier,
  children,
  className,
}: {
  label?: ReactNode;
  groupWord?: string;
  tier?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`fr-labeled${className ? ` ${className}` : ""}`} data-fr-tier={tier}>
      <div className="fr-labeled-label fr-mono" data-fr-group={groupWord} aria-hidden={groupWord ? true : undefined}>
        {label ?? null}
      </div>
      <div className="fr-labeled-body">{children}</div>
    </div>
  );
}

/** Label + content, hairline-topped, accent label. */
export function SideNote({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`fr-sidenote${className ? ` ${className}` : ""}`}>
      {label ? <div className="fr-sidenote-label"><Eyebrow>{label}</Eyebrow></div> : null}
      <div className="fr-sidenote-body">{children}</div>
    </div>
  );
}

/** Numbered hanging-indent item: the numeral is its own column so wrapped lines align under the
 *  text. Omit `num` and the numeral is a CSS counter (display-only, never DOM text); pass `num` only
 *  when the numeral already renders as text. `lead` sits above the title (a chip); `meta` is the
 *  quiet line under the body. Render inside a <ol className="fr-hanging-list">. */
export function HangingItem({
  num,
  lead,
  title,
  meta,
  children,
  muted = false,
}: {
  num?: ReactNode;
  lead?: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  muted?: boolean;
}) {
  return (
    <li className="fr-hanging" data-muted={muted ? "true" : undefined}>
      <span className="fr-hanging-num fr-mono" aria-hidden data-fr-counter={num == null ? "true" : undefined}>{num ?? null}</span>
      <div className="fr-hanging-body">
        {lead ? <div className="fr-hanging-lead">{lead}</div> : null}
        {title ? <p className="fr-hanging-title">{title}</p> : null}
        {children}
        {meta ? <p className="fr-hanging-meta fr-mono">{meta}</p> : null}
      </div>
    </li>
  );
}

export type ScaleBand = { min: number; max: number; name: string; description: string };

/** The score scale as a vertical axis: bands stacked top (highest) to bottom (lowest) beside one
 *  axis line with tick marks at the band boundaries (tick numerals are CSS `attr()` content, never
 *  DOM text). The active band reads ink/bold, the others faint. The marker dot sits on the axis at
 *  the score; `markerLabel` (the existing "{company} · {score}" text) renders inside the active band. */
export function VerticalScale({
  bands,
  score,
  activeName,
  markerLabel,
}: {
  bands: ReadonlyArray<ScaleBand>;
  score: number | null;
  activeName: string | null;
  markerLabel?: ReactNode;
}) {
  const ladder = [...bands].sort((a, b) => b.min - a.min);
  const top = Math.max(...bands.map((b) => b.max));
  const bottom = Math.min(...bands.map((b) => b.min));
  const span = Math.max(top - bottom, 1);
  const pct = (v: number) => `${((top - v) / span) * 100}%`;
  return (
    <div className="fr-vscale" data-fr-scored={score !== null ? "true" : "false"}>
      <div className="fr-vscale-axis" aria-hidden>
        {ladder.map((b) => (
          <span key={b.max} className="fr-vscale-tick" data-tick={b.max} style={{ top: pct(b.max) }} />
        ))}
        <span className="fr-vscale-tick" data-tick={bottom} style={{ top: pct(bottom) }} />
        {score !== null ? (
          <span className="fr-vscale-marker" style={{ top: pct(Math.min(Math.max(score, bottom), top)) }}>
            <span className="fr-vscale-marker-dot" />
          </span>
        ) : null}
      </div>
      <ol className="fr-vscale-bands">
        {ladder.map((b) => {
          const active = activeName !== null && b.name === activeName;
          return (
            <li key={b.name} className="fr-vscale-band" data-active={active ? "true" : undefined}>
              <span className="fr-eyebrow">{b.min}–{b.max}</span>
              <p className="fr-vscale-band-name">{b.name}</p>
              <p className="fr-vscale-band-desc">{b.description}</p>
              {active && score !== null && markerLabel ? (
                <span className="fr-vscale-band-marker fr-eyebrow">{markerLabel}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type DividerTone = "lime" | "dark";

/** Interlude page: a big numeral (CSS `attr()` content — display only, never DOM text), a vertical
 *  hairline, then the headline and one line. Lime or dark ground (the view sets the page ground). */
export function Divider({ numeral, title, body, tone = "lime" }: { numeral?: string; title: ReactNode; body?: ReactNode; tone?: DividerTone }) {
  return (
    <div className="fr-divider" data-fr-tone={tone}>
      {numeral ? <span className="fr-divider-num fr-display" data-fr-numeral={numeral} aria-hidden /> : null}
      <div className="fr-divider-text">
        <h1 className="fr-display fr-divider-title">{title}</h1>
        {body ? <p className="fr-divider-body">{body}</p> : null}
      </div>
    </div>
  );
}

/** A2 + R1 — the terminal dot on every headline and statement. A text that ends in "." gets that
 *  full stop wrapped in a lime span (same characters); a text that doesn't gets a DECORATION span
 *  whose dot is CSS content (never DOM text). Either way the text itself is untouched. */
export function withStop(text: string | null | undefined): ReactNode {
  const t = text ?? "";
  if (!t) return t;
  if (!t.endsWith(".")) {
    return (
      <>
        {t}
        <span className="fr-stop fr-stop--deco" aria-hidden />
      </>
    );
  }
  return (
    <>
      {t.slice(0, -1)}
      <span className="fr-stop">.</span>
    </>
  );
}

export type FlowStationState = "done" | "here" | "ahead";
export type FlowStation = { key: string; state: FlowStationState };

/** The path line: SVG dots on one hairline, evenly spaced. A done dot is filled ink; the current dot
 *  is lime with a halo; ahead dots are hollow. The SVG carries NO text (a glyph here would be DOM text);
 *  the caller renders the milestone pattern's ✓ in the done station's column, where it always was.
 *  Column content (titles, chips, blurbs) is laid out by the caller in a matching `.fr-flow-cols` grid. */
export function FlowLine({ stations }: { stations: FlowStation[] }) {
  const n = Math.max(stations.length, 1);
  const cx = (i: number) => `${((i + 0.5) / n) * 100}%`;
  return (
    <svg className="fr-flow" width="100%" height="28" role="presentation" aria-hidden="true" focusable="false">
      <line className="fr-flow-line" x1={cx(0)} x2={cx(n - 1)} y1="14" y2="14" />
      {stations.map((s, i) => (
        <g key={s.key} className="fr-flow-station" data-state={s.state}>
          {s.state === "here" ? <circle className="fr-flow-halo" cx={cx(i)} cy="14" r="12" /> : null}
          <circle className="fr-flow-dot" cx={cx(i)} cy="14" r={s.state === "here" ? 8 : 6} />
        </g>
      ))}
    </svg>
  );
}

/** Inline-style helper for callers laying out n equal columns under a FlowLine. */
export function flowColumns(n: number): CSSProperties {
  return { ["--fr-flow-n" as string]: String(Math.max(n, 1)) };
}
