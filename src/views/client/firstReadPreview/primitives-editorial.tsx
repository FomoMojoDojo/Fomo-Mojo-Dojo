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

/** Sidebar + main. The sidebar (slate or lime) is sticky on desktop; columns are
 *  minmax(0, 25rem) / minmax(0, 1fr). Everything in the sidebar is optional. */
export function Spread({
  sidebar = "slate",
  eyebrow,
  title,
  lede,
  aside,
  statement,
  children,
}: {
  sidebar?: SpreadSidebar;
  eyebrow?: ReactNode;
  title?: ReactNode;
  lede?: ReactNode;
  /** Small mono block at the foot of the sidebar (a rationale, a note). */
  aside?: ReactNode;
  /** A one-line statement under the lede (a count, a tally). */
  statement?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="fr-spread" data-fr-sidebar={sidebar}>
      <aside className="fr-spread-side">
        {eyebrow ? <div className="fr-spread-eyebrow"><Eyebrow>{eyebrow}</Eyebrow></div> : null}
        {title ? <h1 className="fr-display fr-spread-title">{title}</h1> : null}
        {lede ? <p className="fr-spread-lede">{lede}</p> : null}
        {statement ? <p className="fr-spread-statement">{statement}</p> : null}
        {aside ? <div className="fr-spread-aside fr-mono">{aside}</div> : null}
      </aside>
      <div className="fr-spread-main">{children}</div>
    </section>
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
 *  text. `meta` is the quiet mono line under the body. Render inside a <ol className="fr-hanging-list">. */
export function HangingItem({
  num,
  title,
  meta,
  children,
  muted = false,
}: {
  num: ReactNode;
  title?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  muted?: boolean;
}) {
  return (
    <li className="fr-hanging" data-muted={muted ? "true" : undefined}>
      <span className="fr-hanging-num fr-mono" aria-hidden>{num}</span>
      <div className="fr-hanging-body">
        {title ? <p className="fr-hanging-title">{title}</p> : null}
        {children}
        {meta ? <p className="fr-hanging-meta fr-mono">{meta}</p> : null}
      </div>
    </li>
  );
}

export type DividerTone = "lime" | "dark";

/** Interlude page: numeral, title, one line. Lime or dark ground. */
export function Divider({ numeral, title, body, tone = "lime" }: { numeral?: ReactNode; title: ReactNode; body?: ReactNode; tone?: DividerTone }) {
  return (
    <div className="fr-divider" data-fr-tone={tone}>
      {numeral ? <span className="fr-divider-num fr-mono">{numeral}</span> : null}
      <h1 className="fr-display fr-divider-title">{title}</h1>
      {body ? <p className="fr-divider-body">{body}</p> : null}
    </div>
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
