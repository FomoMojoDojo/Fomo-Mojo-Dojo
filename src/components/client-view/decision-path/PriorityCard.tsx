import type { ClientActionStatus, ClientConfidenceLevel } from "@/lib/clientViewModel";
import type { PrioritySignal } from "@/components/client-view/decision-path/types";

type PriorityCardProps = {
  index: number;
  signal: PrioritySignal;
  onToggle: () => void;
  onSetOwner: () => void;
  onActivate: () => void;
  onSetStatus: (status: ClientActionStatus) => void;
  onSetConfidence: (level: ClientConfidenceLevel) => void;
};

export default function PriorityCard({
  index,
  signal,
  onToggle,
  onSetOwner,
  onActivate,
  onSetStatus,
  onSetConfidence,
}: PriorityCardProps) {
  const { action, confidenceLevel, impactLift, whyLine, isSelected, isCommitted } = signal;

  return (
    <article
      className={`decision-priority-card ${action.primaryOwner ? "" : "is-unowned"} ${isCommitted ? "is-committed" : ""} ${isSelected ? "is-selected" : ""}`}
      onClick={onToggle}
    >
      <p className="decision-action-kicker">Priority {index + 1}</p>
      <h3 className="decision-priority-title">{action.title}</h3>
      <p className={`decision-priority-meta ${action.primaryOwner ? "" : "is-risk"}`}>
        Owner: {action.primaryOwner || "No owner yet"}
      </p>
      <p className="decision-priority-meta">
        Status: {action.status === "in_progress" ? "Active" : action.status === "done" ? "Complete" : "Not started"}
      </p>
      <p className="decision-priority-meta">Confidence: {confidenceLevel}</p>
      <p className="decision-priority-impact">Impact: +{impactLift}</p>

      <div className="decision-action-controls" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onSetOwner} className="decision-pill">
          Set owner
        </button>
        <button
          type="button"
          className={`decision-pill is-active ${isCommitted ? "is-success" : ""}`}
          onClick={onActivate}
        >
          {isCommitted ? "Active" : "Activate"}
        </button>
      </div>

      {isSelected ? (
        <div className="decision-priority-expand" onClick={(event) => event.stopPropagation()}>
          <div className="decision-trust-block">
            <p className="decision-action-kicker">Why it matters</p>
            <p className="decision-path-body">{whyLine}</p>
          </div>
          <div className="decision-trust-block">
            <p className="decision-action-kicker">What changes</p>
            <ul className="decision-impact-list">
              {action.ifSolved.slice(0, 2).map((item) => (
                <li key={`${action.id}-impact-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="decision-action-controls">
            <div className="decision-segmented" role="group" aria-label={`Set status for ${action.title}`}>
              {([
                ["planned", "Not started"],
                ["in_progress", "Active"],
                ["done", "Complete"],
              ] as const).map(([status, label]) => (
                <button
                  key={`${action.id}-status-${status}`}
                  type="button"
                  className={`decision-segmented-item ${action.status === status ? "is-active" : ""}`}
                  onClick={() => onSetStatus(status)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="decision-chip-row" role="group" aria-label={`Set confidence for ${action.title}`}>
              {(["Low", "Medium", "High"] as const).map((level) => (
                <button
                  key={`${action.id}-confidence-${level}`}
                  type="button"
                  className={`decision-chip ${confidenceLevel === level ? "is-active" : ""}`}
                  onClick={() => onSetConfidence(level)}
                >
                  {level}
                </button>
              ))}
            </div>
            <button type="button" className={`decision-pill is-active ${isCommitted ? "is-success" : ""}`} onClick={onActivate}>
              {isCommitted ? "Active" : "Activate"}
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
