// First Read presentation primitives — ported from mojomap-redesign
// src/pages/first-read/primitives.tsx @ 1f54a56, with rightBody made optional
// (real declared statements may carry no detail column) and an Absent
// primitive for persisted-integrity empty states.

import type { FRListing } from "./types";
import { LISTING_STRINGS, listingBody } from "./listingStrings";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FRGapVerdict } from "./types";

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="fr-eyebrow">{children}</span>;
}

/** Persisted-integrity empty state — never fixture fallback. */
export function Absent({ children }: { children: ReactNode }) {
  return (
    <div className="fr-absent text-sm font-light leading-relaxed">{children}</div>
  );
}

/** Counts up to `value` once on mount — subtle, tabular, reduced-motion aware. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value);
  const frame = useRef<number>();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(value * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [value]);

  return <span className={`fr-numeral ${className ?? ""}`}>{display}</span>;
}

/** The one number. Optional band name renders beside it ("31 · Running on instinct").
 *  `display` (stage 3): the sidebar treatment — the numeral at display size in lime, "/ 100" beside
 *  it, the band name as a subline. Same strings, same DOM order. */
export function ScoreNow({
  now,
  band,
  compact = false,
  display = false,
  explainer,
}: {
  now: number;
  band?: string;
  compact?: boolean;
  display?: boolean;
  explainer?: string;
}) {
  if (display) {
    return (
      <div className="fr-score-display">
        <Eyebrow>Mojo now</Eyebrow>
        <div className="mt-2 flex items-baseline gap-3">
          <CountUp value={now} className="fr-display fr-score-num" />
          <span className="fr-score-per fr-mono">/ 100</span>
        </div>
        {/* Stage 3g: the band name stands alone under the numeral — the "· " text separator is gone. */}
        {band ? <span className="fr-score-band">{band}</span> : null}
        {explainer ? <p className="fr-why-text mt-4">{explainer}</p> : null}
      </div>
    );
  }
  const size = compact ? "text-3xl" : "text-4xl";
  return (
    <div className="flex flex-col">
      <div className="fr-stagger flex items-start gap-10">
        <div className="flex flex-col">
          <Eyebrow>Mojo now</Eyebrow>
          <div className="mt-2 flex items-baseline gap-2">
            <CountUp value={now} className={`${size} font-bold tracking-tighter`} />
            <span className="text-sm font-medium" style={{ color: "hsl(var(--fr-faint))" }}>/ 100</span>
            {band ? (
              <span className="fr-eyebrow ml-2" style={{ color: "hsl(var(--fr-accent))" }}>· {band}</span>
            ) : null}
          </div>
        </div>
      </div>
      {explainer ? (
        <p className="mt-4 max-w-xs text-xs font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
          {explainer}
        </p>
      ) : null}
    </div>
  );
}

/** The on-screen verdict words — the SAME map the chip renders; group headers reuse them (never a
 *  second vocabulary). */
export const VERDICT_LABEL: Record<FRGapVerdict, string> = {
  confirmed: "Echoed",
  contradicted: "Disputed",
  unechoed: "Not echoed",
  unspoken: "Unspoken",
};

/** Stage 3b — ONE chip primitive: square, mono 10px uppercase, filled colour with ink text. `tone`
 *  picks the fill (see .fr-chip[data-tone] in firstRead.css). Chips render ABOVE a row's title. */
export type ChipTone =
  | "good" | "bad" | "warn" | "neutral"
  | "strong" | "moderate" | "thin"
  | "accent-0" | "accent-1" | "accent-2" | "accent-3" | "accent-4";
export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className="fr-chip fr-mono" data-tone={tone}>
      {children}
    </span>
  );
}

const VERDICT_TONE: Record<FRGapVerdict, ChipTone> = { confirmed: "good", contradicted: "bad", unechoed: "warn", unspoken: "neutral" };

export function VerdictChip({ verdict }: { verdict: FRGapVerdict }) {
  return <Chip tone={VERDICT_TONE[verdict]}>{VERDICT_LABEL[verdict]}</Chip>;
}

/** Signed "Why this" rationale note — same muted treatment as the record page's "Why outside first".
 *  Rendered in the header's right column (stacks under the headline on mobile).
 *  STANDING RULE (2026-08-24): the rationale rail must NEVER render on the cold-open page
 *  ("Before we start", key `cold`) — it introduced an unwanted vertical rule line on the opener.
 *  Cold is STRUCTURALLY exempt: BeatWhy no-ops for the cold key here (and the cold open passes no
 *  rationale at all). Both together make the rail impossible to render on the opener. */
export function BeatWhy({ children, pageKey, plain = false }: { children: ReactNode; pageKey?: string; plain?: boolean }) {
  if (pageKey === "cold") return null;
  // `plain` (stage 3): the sidebar treatment under the Spread hairline — no rail, mono small, faint.
  if (plain) {
    return (
      <div className="fr-why">
        <Eyebrow>Why this</Eyebrow>
        <p className="fr-why-text">{children}</p>
      </div>
    );
  }
  return (
    <div className="max-w-xs border-l pl-6" style={{ borderColor: "hsl(var(--fr-hair))" }}>
      <Eyebrow>Why this</Eyebrow>
      <p className="mt-3 text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
        {children}
      </p>
    </div>
  );
}

export function ActHeader({
  headline,
  standfirst,
  subline,
  right,
  rationale,
}: {
  headline: string;
  standfirst?: string;
  /** Optional second signed paragraph, rendered directly under the standfirst. */
  subline?: string;
  right?: ReactNode;
  /** Signed "why this beat" line — rendered as a BeatWhy in the right column when no `right` is given. */
  rationale?: string;
}) {
  const words = headline.split(" ");
  const lead = words.slice(0, Math.max(words.length - 2, 1)).join(" ");
  const tail = words.slice(Math.max(words.length - 2, 1)).join(" ");
  return (
    <header className="mb-16">
      <div
        className="flex flex-col justify-between gap-10 border-b pb-12 md:flex-row md:items-end"
        style={{ borderColor: "hsl(var(--fr-hair))" }}
      >
        <div className="max-w-xl">
          <h1 className="text-5xl font-extralight tracking-tight md:text-6xl">
            {lead} <span className="font-semibold">{tail}</span>
          </h1>
          {standfirst ? (
            <p className="mt-4 text-lg leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
              {standfirst}
            </p>
          ) : null}
          {subline ? (
            <p className="mt-4 text-sm font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
              {subline}
            </p>
          ) : null}
        </div>
        {right || rationale ? (
          <div className="flex flex-col gap-8">
            {right ?? null}
            {rationale ? <BeatWhy>{rationale}</BeatWhy> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}

/** Editorial two-column row: left claim (5 cols), right reading (7 cols). */
export function LedgerRow({
  leftLabel,
  leftBody,
  leftExtra,
  meta,
  rightBody,
  rightContent,
  quoted = true,
  muted = false,
  variant = "ledger",
  dataVerdict,
  lead,
}: {
  /** Stage 3b: chips, rendered ABOVE the title (hanging variant). Tags stay in `meta` below. */
  lead?: ReactNode;
  /** Eyebrow above the quote. Omit to render no eyebrow (e.g. findings carry no earned label). */
  leftLabel?: string;
  leftBody: ReactNode;
  leftExtra?: ReactNode;
  meta: ReactNode;
  rightBody?: string | null;
  /** Rich right column (e.g. a statement's list of evidence pairs). Rendered under `meta`,
   *  in place of the single `rightBody` paragraph when provided. */
  rightContent?: ReactNode;
  quoted?: boolean;
  /** De-weighted treatment for moderate/thin signals. */
  muted?: boolean;
  /** `hanging` (stage 3): one column, a CSS-counter numeral in the gutter, meta + evidence under the
   *  body. SAME children in the SAME order as the ledger — only the layout differs. */
  variant?: "ledger" | "hanging";
  /** Styling hook (`data-verdict`) for the hanging variant. */
  dataVerdict?: string;
}) {
  if (variant === "hanging") {
    return (
      <div className={`fr-row fr-hanging-row${muted ? " fr-hanging-row--muted" : ""}`} data-verdict={dataVerdict}>
        <span className="fr-hanging-num fr-mono" aria-hidden data-fr-counter="true" />
        <div className="fr-hanging-row-body">
          {leftLabel ? (
            <div className="mb-3">
              <Eyebrow>{leftLabel}</Eyebrow>
            </div>
          ) : null}
          {lead ? <div className="fr-hanging-row-lead">{lead}</div> : null}
          <div className="relative">
            {quoted ? <span className="fr-quote-mark">&ldquo;</span> : null}
            <h3 className="fr-hanging-row-title">{leftBody}</h3>
          </div>
          {leftExtra}
          <div className="fr-hanging-row-meta">{meta}</div>
          {rightContent ? (
            <div className="fr-hanging-row-right">{rightContent}</div>
          ) : rightBody ? (
            <p className="fr-hanging-row-right text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
              {rightBody}
            </p>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div
      className="fr-row group flex flex-col border-b py-14 md:grid md:grid-cols-12 md:gap-16"
      style={{ borderColor: "hsl(var(--fr-hair))" }}
    >
      <div className="fr-row-body md:col-span-5">
        {leftLabel ? (
          <div className="mb-6">
            <Eyebrow>{leftLabel}</Eyebrow>
          </div>
        ) : null}
        <div className="relative">
          {quoted ? <span className="fr-quote-mark">&ldquo;</span> : null}
          <h3
            className={
              muted
                ? "fr-quote-muted text-lg font-medium leading-snug"
                : "text-2xl font-semibold leading-snug"
            }
          >
            {leftBody}
          </h3>
        </div>
        {leftExtra}
      </div>
      <div className="fr-row-body flex flex-col justify-center pt-8 md:col-span-7 md:pt-0">
        <div className="mb-4 flex flex-wrap items-center gap-4">{meta}</div>
        {rightContent ? (
          rightContent
        ) : rightBody ? (
          <p className="text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>
            {rightBody}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function SourceTag({ children }: { children: ReactNode }) {
  return (
    <span className="fr-tag fr-mono">
      Source: {children}
    </span>
  );
}

/** OUR-READ attribution — for an analysis-register finding with NO corroborating hosts yet: it is our
 *  reading of the record, not something a source said, so it must NOT wear the "Source:" label.
 *  (STEP 2b — SIGNED A′: "Our read · <date>", the read date alone; no "read " prefix, no "undated".) */
export function OurReadTag({ children }: { children: ReactNode }) {
  return (
    <span className="fr-tag fr-mono">
      Our read · {children}
    </span>
  );
}

/** Recency attribution — rendered beside an outside signal's source line. */
export function RecencyTag({ children }: { children: ReactNode }) {
  return (
    <span className="fr-recency fr-tag fr-mono">
      Most recent: {children}
    </span>
  );
}

/** LISTING EVIDENCE CLASS (operator ruling 2026-09-04, shape (d)): "Listed by {host}" over "{product}, {price}".
 *  NEVER a quote mark, never `fr-quote-mark`: a listing is not speech. Source tag as today. `extra` is the
 *  slot for an operator-only node (the kind label), rendered beside the tag. */
export function ListingRow({ listing, sourceTag, extra }: { listing: FRListing; sourceTag: { label: string } | null; extra?: ReactNode }) {
  return (
    <div className="fr-listing flex flex-col gap-3" data-fr-listing={listing.host}>
      <Eyebrow>{LISTING_STRINGS.eyebrow(listing.host)}</Eyebrow>
      <p className="text-lg font-light leading-relaxed" style={{ color: "hsl(var(--fr-muted))" }}>{listingBody(listing)}</p>
      {(sourceTag || extra) ? (
        <div className="flex flex-wrap items-center gap-4">
          {sourceTag ? <SourceTag>{sourceTag.label}</SourceTag> : null}
          {extra}
        </div>
      ) : null}
    </div>
  );
}
