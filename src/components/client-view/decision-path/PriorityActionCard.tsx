import type { ClientActionStatus, ClientConfidenceLevel } from "@/lib/clientViewModel";
import type { PrioritySignal } from "@/components/client-view/decision-path/types";

type PriorityActionCardProps = {
  index: number;
  signal: PrioritySignal;
  phase: "outside" | "diagnosis" | "focus" | "execution";
  isTopPriority?: boolean;
  hasSelected: boolean;
  onToggle: () => void;
  onSetOwner: () => void;
  onActivate: () => void;
  onSetStatus: (status: ClientActionStatus) => void;
  onSetConfidence: (level: ClientConfidenceLevel) => void;
};

const STATUS_OPTIONS: Array<{ value: ClientActionStatus; label: string }> = [
  { value: "planned", label: "Not started" },
  { value: "in_progress", label: "Active" },
  { value: "done", label: "Complete" },
];

const CONFIDENCE_OPTIONS: Array<{ value: ClientConfidenceLevel; label: string }> = [
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

const USE_COMMITMENT_LABEL = false;

function progressFromStatus(status: ClientActionStatus) {
  if (status === "done") return 100;
  if (status === "in_progress") return 50;
  return 0;
}

export default function PriorityActionCard({
  index,
  signal,
  phase,
  isTopPriority = false,
  hasSelected,
  onToggle,
  onSetOwner,
  onActivate,
  onSetStatus,
  onSetConfidence,
}: PriorityActionCardProps) {
  const { action, confidenceLevel, impactLift, impactedDriver, projectedScore, summaryLine, isSelected, isCommitted } = signal;
  const statusLabel = action.status === "in_progress" ? "Active" : action.status === "done" ? "Complete" : "Not started";
  const ownerLabel = action.primaryOwner || "No owner yet";
  const progressValue = progressFromStatus(action.status);
  const isSupporting = !isTopPriority;
  const isPhaseLocked = (phase === "outside" || phase === "diagnosis") && isSupporting && action.status === "planned";
  const requiresOwnerToExecute =
    phase === "execution" && action.status !== "done" && !action.primaryOwner;

  const ctaLabel = (() => {
    if (phase === "outside") return "Validate";
    if (phase === "diagnosis") return "Test this";
    if (phase === "focus") return "Select";
    if (action.status === "done") return "Complete";
    if (action.status === "in_progress") return "Complete";
    return "Start";
  })();

  const secondaryLabel =
    phase === "outside"
      ? "Review"
      : phase === "diagnosis"
      ? "Explore"
      : phase === "focus"
        ? "Prioritize"
        : "Set owner";

  const phaseLabel =
    phase === "outside"
      ? "Signal"
      : phase === "diagnosis"
        ? "Opportunity"
        : phase === "focus"
          ? "Option"
          : "Commitment";
  const kickerLabel = `${USE_COMMITMENT_LABEL ? "Commitment" : phaseLabel} ${index + 1}`;

  return (
    <article
      className={`dp-priority-card ${isTopPriority ? "is-top-priority" : ""} ${isSupporting ? "is-supporting" : ""} ${isSelected ? "is-selected" : ""} ${hasSelected && !isSelected ? "is-quiet" : ""} ${phase === "execution" && !action.primaryOwner ? "is-unowned" : ""} ${isCommitted ? "is-committed" : ""}`}
      onClick={onToggle}
      aria-expanded={isSelected}
    >
      <div className="dp-priority-top">
        <p className="dp-priority-kicker">{USE_COMMITMENT_LABEL ? "Commitment" : kickerLabel}</p>
        <p className="dp-priority-impact">
          +{impactLift} <span>{impactedDriver}</span>
        </p>
      </div>

      <h3 className="dp-priority-title">{action.title}</h3>
      <p className="dp-priority-summary">{summaryLine}</p>
      <p className="dp-priority-projected">If completed → score moves to {projectedScore}</p>

      <p className={`dp-priority-status-row ${phase === "execution" && !action.primaryOwner ? "is-unassigned" : ""}`} aria-label="Priority status">
        {phase === "execution" ? (
          <>
            <span className="dp-priority-meta">
              <span className="dp-priority-meta-key">Owner</span>
              <span className={`dp-priority-meta-value ${!action.primaryOwner ? "is-warning" : ""}`}>{ownerLabel}</span>
            </span>
            <span className="dp-priority-meta-divider" aria-hidden>
              •
            </span>
            <span className="dp-priority-meta">
              <span className="dp-priority-meta-key">Status</span>
              <span className="dp-priority-meta-value">{statusLabel}</span>
            </span>
            <span className="dp-priority-meta-divider" aria-hidden>
              •
            </span>
            <span className="dp-priority-meta">
              <span className="dp-priority-meta-key">Progress</span>
              <span className="dp-priority-meta-value">{progressValue}%</span>
            </span>
          </>
        ) : (
          <>
            <span className="dp-priority-meta">
            <span className="dp-priority-meta-key">{phase === "outside" || phase === "diagnosis" ? "Type" : "State"}</span>
              <span className="dp-priority-meta-value">{phase === "outside" ? "Observation" : phase === "diagnosis" ? "Hypothesis" : "Candidate"}</span>
            </span>
            <span className="dp-priority-meta-divider" aria-hidden>
              •
            </span>
            <span className="dp-priority-meta">
              <span className="dp-priority-meta-key">Confidence</span>
              <span className="dp-priority-meta-value">{confidenceLevel}</span>
            </span>
          </>
        )}
      </p>

      {requiresOwnerToExecute ? (
        <p className="dp-priority-requirement">Owner required before this can start.</p>
      ) : null}

      <div className="dp-priority-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="dp-btn-secondary"
          onClick={phase === "execution" ? onSetOwner : onToggle}
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          className={`dp-btn-primary ${isCommitted ? "is-success" : ""} ${isTopPriority ? "is-dominant-action" : "is-support-action"} ${isPhaseLocked ? "is-phase-locked" : ""}`}
          onClick={onActivate}
          disabled={isPhaseLocked || requiresOwnerToExecute}
        >
          {ctaLabel}
        </button>
      </div>

      {isSelected ? (
        <div className="dp-priority-expanded" onClick={(event) => event.stopPropagation()}>
          <p className="dp-priority-expanded-copy">{signal.whyLine}</p>
          <p className="dp-priority-expanded-risk">If not done: {signal.withoutLine}</p>
          <p className="dp-priority-expanded-label">
            {phase === "diagnosis"
              ? "Adjust confidence"
              : phase === "outside"
                ? "Review signal confidence"
                : phase === "focus"
                  ? "Compare and prioritize"
                  : "Update status and confidence"}
          </p>
          <div className="dp-expanded-controls">
            <div className="dp-segmented" role="group" aria-label={`Set status for ${action.title}`}>
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={`${action.id}-status-${option.value}`}
                  type="button"
                  className={`dp-segmented-item ${action.status === option.value ? "is-active" : ""}`}
                  onClick={() => onSetStatus(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="dp-chip-row" role="group" aria-label={`Set confidence for ${action.title}`}>
              {CONFIDENCE_OPTIONS.map((option) => (
                <button
                  key={`${action.id}-confidence-${option.value}`}
                  type="button"
                  className={`dp-chip ${confidenceLevel === option.value ? "is-active" : ""}`}
                  onClick={() => onSetConfidence(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
