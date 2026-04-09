type TeamAgreementControlProps = {
  value: "yes" | "not_quite" | "no";
  alignedCount: number;
  totalCount: number;
  onChange: (value: "yes" | "not_quite" | "no") => void;
  compact?: boolean;
  showLabel?: boolean;
  showMeta?: boolean;
};

export default function TeamAgreementControl({
  value,
  alignedCount,
  totalCount,
  onChange,
  compact = false,
  showLabel = true,
  showMeta = true,
}: TeamAgreementControlProps) {
  const label = compact ? "Agree?" : "Do you agree with this assessment?";

  return (
    <div className={`dp-agree ${compact ? "is-compact" : ""}`}>
      {showLabel ? <p className="dp-agree-label">{label}</p> : null}
      <div className="dp-agree-controls" role="group" aria-label="Team agreement">
        <button
          type="button"
          className={`dp-agree-btn ${value === "yes" ? "is-active" : ""}`}
          onClick={() => onChange("yes")}
        >
          Agree
        </button>
        <button
          type="button"
          className={`dp-agree-btn ${value === "not_quite" ? "is-active" : ""}`}
          onClick={() => onChange("not_quite")}
        >
          Not quite
        </button>
        <button
          type="button"
          className={`dp-agree-btn ${value === "no" ? "is-active" : ""}`}
          onClick={() => onChange("no")}
        >
          Disagree
        </button>
      </div>
      {showMeta ? (
        <p className="dp-agree-meta">Team alignment: {alignedCount} / {totalCount || 1} aligned</p>
      ) : null}
    </div>
  );
}
