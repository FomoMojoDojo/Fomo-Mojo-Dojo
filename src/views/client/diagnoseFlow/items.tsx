// DIAGNOSE · item primitives. NO STRING LITERALS LIVE HERE — every word arrives as a prop from a
// screen, which got it from strings.ts, which the census checks against the signed spec.
// diagnoseNoLiterals.census.test.ts proves that claim about this file.
import type { ReactNode } from "react";

/** The sub-line marks, named exactly as the spec's "Sub-line marks" paragraph names them. */
export type Mark =
  | "out-both"      // Both say it — dot green
  | "out-you"       // Only the documents say it — amber dot
  | "out-out"       // Only the outside shows it — #d0cdc8 dot
  | "today"         // Today — ink dot
  | "today-missing" // Today (missing) — amber ring
  | "fixed"         // Fixed — ink square outline
  | "job"           // Trying to — ring
  | "wrong"         // Wrong if — amber ring
  | "bet";          // This bets that — ink dot

function MarkGlyph({ mark }: { mark: Mark }) {
  switch (mark) {
    case "out-both": return <span className="dg-dot dg-subline-mark" />;
    case "out-you": return <span className="dg-dot dg-dot--amber dg-subline-mark" />;
    case "out-out": return <span className="dg-dot dg-dot--outside dg-subline-mark" />;
    case "today": return <span className="dg-dot dg-dot--ink dg-subline-mark" />;
    case "today-missing": return <span className="dg-ring dg-ring--amber dg-subline-mark" />;
    case "fixed": return <span className="dg-square dg-subline-mark" />;
    case "job": return <span className="dg-ring dg-subline-mark" />;
    case "wrong": return <span className="dg-ring dg-ring--amber dg-subline-mark" />;
    case "bet": return <span className="dg-dot dg-dot--ink dg-subline-mark" />;
  }
}

/** "● Trying to: fund outcomes their board can defend" — mark, bold label, muted text. */
export function SubLine({ mark, label, text }: { mark: Mark; label: string; text: string }) {
  return (
    <p className="dg-subline">
      <MarkGlyph mark={mark} />
      <span>
        <span className="dg-subline-label">{label}</span>{" "}
        <span className="dg-subline-text">{text}</span>
      </span>
    </p>
  );
}

export type ChipKind = "need" | "recipients" | "referrers" | "funders" | "partners" | "users" | "plain";

export function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
  return <span className="dg-chip" data-kind={kind}>{children}</span>;
}

/** One hairline row: index · source line (with chips) · statement · sub-lines · the two buttons. */
export function ItemRow({
  index,
  source,
  chips,
  statement,
  children,
  keepLabel,
  fixLabel,
  decision,
  onKeep,
  onFix,
}: {
  index: number;
  source: ReactNode;
  chips?: ReactNode;
  statement: ReactNode;
  children?: ReactNode;
  keepLabel: string;
  fixLabel: string;
  decision: "keep" | "fix" | null;
  onKeep: () => void;
  onFix: () => void;
}) {
  return (
    <div className="dg-row" style={{ ["--dg-i" as string]: String(index) }} data-dg-item={index}>
      <span className="dg-row-index">{String(index).padStart(2, "0")}</span>
      <div className="dg-row-main">
        <span className="dg-row-source">
          {source}
          {chips}
        </span>
        <p className="dg-statement">{statement}</p>
        {children}
      </div>
      <div className="dg-row-actions">
        <button type="button" className="dg-row-btn" aria-pressed={decision === "keep"} onClick={onKeep}>
          {keepLabel}
        </button>
        <button type="button" className="dg-row-btn" aria-pressed={decision === "fix"} onClick={onFix}>
          {fixLabel}
        </button>
      </div>
    </div>
  );
}
