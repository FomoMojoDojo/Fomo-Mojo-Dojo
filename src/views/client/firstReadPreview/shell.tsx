// First Read — SHELL CHROME (visual port, stage 2): sticky Header (title / identity / progress
// segments / counter) and bottom Nav (Back / forward-link / Reference / Keys hint).
//
// Strings: the Header renders the two strings the old in-body nav rendered ("First read" and the
// company · host identity line) plus the caller's optional way out ("All companies", signed 2026-09-09); the "NN / N" counter and the whole Nav are gated by the caller
// (FIRST_READ_SHOW_NAV_CHROME) — with the flag off, the default render carries no new text.
// The Nav's strings are the old footer's strings, moved verbatim. No data, no operator nodes.

import type { ReactNode } from "react";

export type ShellBeat = { readonly key: string; readonly label: string; readonly act?: number };

export function Header({
  backLink,
  title,
  identity,
  beats,
  index = 0,
  onGo,
  showCounter = false,
  right,
}: {
  /** The way out (2026-09-09): "All companies", left of the title and the identity line. A plain
   *  navigation, never an operator affordance — it carries no data-fr-operator marker. */
  backLink?: ReactNode;
  /** The surface name — the caller passes the existing signed string. */
  title: ReactNode;
  /** "{company} · {host}" from the caller (companies.name / website). */
  identity?: ReactNode;
  /** Progress ticks. Optional since the home reskin (2026-09-11): a page with no beats renders `right`
   *  in the progress slot instead. The First Read passes all three exactly as before. */
  beats?: ReadonlyArray<ShellBeat>;
  index?: number;
  onGo?: (index: number) => void;
  /** "NN / N" — flag-gated by the caller (new text; off by default). */
  showCounter?: boolean;
  /** Home reskin: the right-hand slot when there are no beats (operator-gated chrome, usually null). */
  right?: ReactNode;
}) {
  return (
    <header className="fr-shell-header">
      <div className="fr-shell-header-inner">
        <div className="fr-shell-id fr-mono">
          {backLink ?? null}
          <span className="fr-shell-title">{title}</span>
          {identity ? <span className="fr-shell-identity">{identity}</span> : null}
        </div>
        {beats ? (
        <div className="fr-shell-progress">
          <div className="fr-shell-segments" role="list">
            {beats.map((b, i) => (
              <button
                key={b.key}
                type="button"
                role="listitem"
                aria-label={b.label}
                aria-current={i === index ? "step" : undefined}
                onClick={() => onGo?.(i)}
                className="fr-progress-tick"
                data-kind={b.act !== undefined ? "act" : "gate"}
                data-state={i === index ? "current" : i < index ? "done" : "todo"}
              />
            ))}
          </div>
          {showCounter ? (
            <span className="fr-shell-counter fr-mono" aria-live="polite">
              {String(index + 1).padStart(2, "0")} / {beats.length}
            </span>
          ) : null}
        </div>
        ) : (
          <div className="fr-shell-progress">{right ?? null}</div>
        )}
      </div>
    </header>
  );
}

export function Nav({
  beats,
  index,
  onGo,
  referenceName,
}: {
  beats: ReadonlyArray<ShellBeat>;
  index: number;
  onGo: (index: number) => void;
  /** The old footer's "FIRST_READ · {NAME}" reference line, passed in by the caller. */
  referenceName: string;
}) {
  const hasNext = index < beats.length - 1;
  return (
    <>
      <footer className="fr-shell-nav">
        <div className="fr-shell-nav-inner">
          <button
            type="button"
            onClick={() => onGo(index - 1)}
            className="fr-link-muted group flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors fr-mono"
          >
            <span className="text-lg leading-none transition-transform group-hover:-translate-x-1">&larr;</span> Back
          </button>
          <div className="flex items-center gap-12">
            <div className="hidden flex-col items-end md:flex">
              <span className="fr-eyebrow mb-1">Reference</span>
              <span className="text-[10px] font-bold fr-mono">{referenceName}</span>
            </div>
            {hasNext ? (
              <button
                type="button"
                onClick={() => onGo(index + 1)}
                className="fr-link-ink group flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] transition-colors fr-mono"
              >
                {beats[index + 1].label}{" "}
                <span className="text-lg leading-none transition-transform group-hover:translate-x-1">&rarr;</span>
              </button>
            ) : null}
          </div>
        </div>
        <p className="fr-shell-keys fr-mono">Keys: &larr; &rarr; move · Home / End ends</p>
      </footer>
    </>
  );
}
