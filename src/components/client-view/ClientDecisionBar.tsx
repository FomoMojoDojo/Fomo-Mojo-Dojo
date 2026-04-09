import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type {
  ClientConfidenceSummary,
  ClientConstraintSummary,
  ClientNextMove,
  ClientOwnershipSummary,
} from "@/lib/clientViewModel";
import { CLIENT_DECISION_TARGETS } from "@/components/client-view/clientDecisionTargets";

type ClientDecisionBarProps = {
  primaryConstraint: ClientConstraintSummary;
  whatThisMeans: string[];
  nextMove: ClientNextMove;
  ownership: ClientOwnershipSummary;
  confidence: ClientConfidenceSummary;
  disabled?: boolean;
};

function ownershipSignal(ownership: ClientOwnershipSummary) {
  if (ownership.unownedCriticalActions > 0) {
    return `${ownership.unownedCriticalActions} critical actions unowned`;
  }
  if (ownership.totalCriticalActions === 0) {
    return "No critical actions yet";
  }
  return "All critical actions owned";
}

function confidenceShortLine(confidence: ClientConfidenceSummary) {
  if (confidence.level === "High") return "Backed by real customer evidence";
  if (confidence.level === "Medium") return "Partially validated";
  return "Based on internal data only";
}

function sentence(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const first = clean.split(/(?<=[.?!])\s+/)[0]?.trim();
  return first && first.length > 0 ? first : clean;
}

function summarizeConstraint(value: string) {
  const text = value.toLowerCase();
  if (/\bproof\b|\bevidence\b|\bimpact\b/.test(text)) return "No quantified proof of impact";
  if (/\bowner|ownership|unowned|assignee\b/.test(text)) return "No clear ownership on critical work";
  if (/\balign|misalign|conflict|priorit/i.test(text)) return "Priorities are not aligned";
  return sentence(value);
}

function summarizeMeaning(value: string) {
  const clean = sentence(value);
  if (!clean) return "This is slowing momentum.";
  return clean.length > 84 ? `${clean.slice(0, 81).trimEnd()}...` : clean;
}

function summarizeNextMove(value: string) {
  const clean = sentence(value);
  return clean.length > 92 ? `${clean.slice(0, 89).trimEnd()}...` : clean;
}

function pickMeaningLine(whatThisMeans: string[]) {
  const compact = whatThisMeans
    .map((line) => line.trim())
    .filter(Boolean);

  if (compact.length === 0) return "This is reducing momentum.";
  const preferred = compact.find((line) => /\blimiting|slowing|reducing|blocked|stuck|clear\b/i.test(line));
  return preferred ?? compact[0];
}

export default function ClientDecisionBar({
  primaryConstraint,
  whatThisMeans,
  nextMove,
  ownership,
  confidence,
  disabled = false,
}: ClientDecisionBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const meaningLine = pickMeaningLine(whatThisMeans);
  const shortConstraint = summarizeConstraint(primaryConstraint.title);
  const shortMeaning = summarizeMeaning(meaningLine);
  const shortNextMove = summarizeNextMove(nextMove.title);
  const constraintTypeTone = primaryConstraint.type === "Validated" ? "text-forest" : "text-rust";

  const goTo = useCallback(
    (path: string, id: string) => {
      if (disabled) return;
      if (location.pathname === path) {
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }
      navigate(`${path}#${id}`);
    },
    [disabled, location.pathname, navigate],
  );

  const commitToNextMove = useCallback(() => {
    if (disabled) return;
    const targetPath = nextMove.linkTo || CLIENT_DECISION_TARGETS.nextMove.path;
    const targetId = CLIENT_DECISION_TARGETS.nextMove.id;
    if (location.pathname === targetPath) {
      const target = document.getElementById(targetId);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    navigate(`${targetPath}#${targetId}`);
  }, [disabled, location.pathname, navigate, nextMove.linkTo]);

  return (
    <section className="sticky top-3 z-30 rounded-2xl border border-[#d8e1de] bg-white/95 p-3 shadow-sm backdrop-blur">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.45fr_1fr]">
        <button
          type="button"
          onClick={() => goTo(CLIENT_DECISION_TARGETS.constraint.path, CLIENT_DECISION_TARGETS.constraint.id)}
          className="flex min-h-[108px] flex-col items-start justify-start rounded-xl px-4 py-3 text-left transition-colors hover:bg-rust/5 disabled:cursor-default disabled:hover:bg-white"
          disabled={disabled}
        >
          <div className="flex items-center gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-rust">Constraint</p>
            <span className={`font-mono text-[9px] uppercase tracking-[0.08em] ${constraintTypeTone}`}>
              {primaryConstraint.type}
            </span>
          </div>
          <p
            className="mt-2 w-full max-w-[640px] font-sans text-[19px] font-semibold leading-[1.3] text-t-primary"
            title={disabled ? "Select a company to load constraints" : `${primaryConstraint.title}\n${primaryConstraint.detail}`}
          >
            {disabled ? "Select a company to load constraints" : shortConstraint}
          </p>
          <p
            className="mt-2 w-full max-w-[640px] font-sans text-[12px] leading-[1.4] text-rust"
            title={disabled ? "Confidence appears after company selection." : confidenceShortLine(confidence)}
          >
            {disabled ? "Confidence appears after company selection." : confidenceShortLine(confidence)}
          </p>
        </button>

        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={() => goTo(CLIENT_DECISION_TARGETS.nextMove.path, CLIENT_DECISION_TARGETS.nextMove.id)}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              goTo(CLIENT_DECISION_TARGETS.nextMove.path, CLIENT_DECISION_TARGETS.nextMove.id);
            }
          }}
          className={`flex min-h-[108px] flex-col items-start justify-start rounded-xl border border-forest/25 bg-forest/5 px-4 py-3 text-left transition-colors hover:bg-forest/10 ${disabled ? "cursor-default opacity-80" : "cursor-pointer"}`}
          aria-disabled={disabled}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-forest">Next move</p>
          <p
            className="mt-2 w-full max-w-[520px] font-sans text-[19px] font-semibold leading-[1.3] text-t-primary"
            title={disabled ? "Select a company to identify next move" : nextMove.title}
          >
            {disabled ? "Select a company to identify next move" : shortNextMove}
          </p>
          <p
            className="mt-2 w-full max-w-[520px] font-sans text-[12px] leading-[1.4] text-t-secondary"
            title={confidence.nextMoveSupport}
          >
            {confidence.nextMoveSupport}
          </p>
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              commitToNextMove();
            }}
            className="mt-3 inline-flex rounded-full border border-forest/35 bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-forest transition-opacity hover:opacity-80 disabled:opacity-50"
            disabled={disabled}
          >
            Commit to this
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 border-t border-[#e7eeeb] pt-2 md:grid-cols-2">
        <button
          type="button"
          onClick={() => goTo(CLIENT_DECISION_TARGETS.meaning.path, CLIENT_DECISION_TARGETS.meaning.id)}
          className="flex min-h-[52px] flex-col items-start justify-start rounded-lg px-3 py-2 text-left transition-colors hover:bg-[#eef5f3] disabled:cursor-default disabled:hover:bg-transparent"
          disabled={disabled}
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-t-muted">Why this matters</p>
          <p className="mt-1 w-full max-w-[640px] font-sans text-[12px] leading-[1.35] text-t-secondary" title={disabled ? "Choose a company to see what this means." : meaningLine}>
            {disabled ? "Choose a company to see what this means." : shortMeaning}
          </p>
        </button>
        <button
          type="button"
          onClick={() => goTo(CLIENT_DECISION_TARGETS.ownership.path, CLIENT_DECISION_TARGETS.ownership.id)}
          className="flex min-h-[52px] flex-col items-start justify-start rounded-lg px-3 py-2 text-left transition-colors hover:bg-amber/10 disabled:cursor-default disabled:hover:bg-transparent"
          disabled={disabled}
        >
          <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-amber">Ownership</p>
          <p
            className="mt-1 w-full font-sans text-[12px] leading-[1.35] text-t-primary"
            title={disabled ? "No company selected" : ownershipSignal(ownership)}
          >
            {disabled ? "No company selected" : ownershipSignal(ownership)}
          </p>
        </button>
      </div>
    </section>
  );
}
