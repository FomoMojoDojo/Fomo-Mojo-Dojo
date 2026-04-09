import type {
  ClientConfidenceLevel,
  ClientConfidenceSummary,
  ClientConstraintSummary,
  ClientEvidenceSummary,
  ClientOwnershipSummary,
} from "@/lib/clientViewModel";
import type { ConstraintBeliefResponse } from "@/hooks/useClientMapInteractionState";

type ClientConstraintDiagnosisProps = {
  constraint: ClientConstraintSummary;
  ownership: ClientOwnershipSummary;
  confidence: ClientConfidenceSummary;
  evidence: ClientEvidenceSummary;
  currentUserBelief: ConstraintBeliefResponse | null;
  currentUserId: string;
  currentUserLabel: string;
  teamBeliefs: Array<{ userId: string; userLabel: string; response: ConstraintBeliefResponse }>;
  alignmentSummary: "Aligned" | "Misaligned" | "Single input";
  onBeliefChange: (userId: string, userLabel: string, response: ConstraintBeliefResponse) => void;
  onConfidenceChange: (level: ClientConfidenceLevel | null) => void;
};

function shortHeadline(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Decision clarity is blocked.";
  return cleaned.length > 90 ? `${cleaned.slice(0, 87).trimEnd()}...` : cleaned;
}

export default function ClientConstraintDiagnosis({
  constraint,
  ownership,
  confidence,
  evidence,
  currentUserBelief,
  currentUserId,
  currentUserLabel,
  teamBeliefs,
  alignmentSummary,
  onBeliefChange,
  onConfidenceChange,
}: ClientConstraintDiagnosisProps) {
  const bullets = [
    constraint.detail,
    ownership.unownedCriticalActions > 0
      ? `${ownership.unownedCriticalActions} critical action${ownership.unownedCriticalActions === 1 ? " has" : "s have"} no owner.`
      : "Critical actions have clear owners.",
    confidence.explanation,
  ];

  return (
    <section className="rounded-2xl border border-rust/25 bg-rust/5 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-rust">Constraint</p>
        <span className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] ${
          constraint.type === "Validated"
            ? "border-forest/35 bg-forest/10 text-forest"
            : "border-rust/35 bg-rust/10 text-rust"
        }`}>
          {constraint.type}
        </span>
      </div>
      <h2 className="mt-2 max-w-[680px] font-sans text-[24px] font-semibold leading-[1.2] text-t-primary">
        {shortHeadline(constraint.title)}
      </h2>
      <ul className="mt-3 space-y-1.5">
        {bullets.map((bullet, index) => (
          <li key={`constraint-bullet-${index}`} className="max-w-[700px] font-sans text-[14px] leading-[1.45] text-t-secondary">
            {bullet}
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl border border-[#d8e1de] bg-white px-3 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Do you agree this is the core problem?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {([
            { key: "yes", label: "Yes — feels right" },
            { key: "not_quite", label: "Not quite — needs adjustment" },
            { key: "no", label: "No — this is wrong" },
          ] as const).map((option) => (
            <button
              key={`belief-${option.key}`}
              type="button"
              onClick={() => onBeliefChange(currentUserId, currentUserLabel, option.key)}
              className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
                currentUserBelief === option.key
                  ? "border-[#233c4b] bg-[#233c4b] text-white"
                  : "border-[#d8e1de] bg-white text-t-secondary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-xl border border-[#d8e1de] bg-white px-3 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Evidence vs assumption</p>
          <div className="mt-2 space-y-1.5">
            {evidence.sources.map((source) => (
              <p key={`evidence-${source.label}`} className="font-sans text-[13px] text-t-primary">
                <span className={`font-mono text-[10px] uppercase tracking-[0.08em] ${source.present ? "text-forest" : "text-rust"}`}>
                  {source.present ? "Present" : "Missing"}
                </span>{" "}
                {source.label}
              </p>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#d8e1de] bg-white px-3 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Confidence</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["Low", "Medium", "High"] as const).map((level) => (
              <button
                key={`constraint-confidence-${level}`}
                type="button"
                onClick={() => onConfidenceChange(level)}
                className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] ${
                  confidence.level === level
                    ? "border-[#233c4b] bg-[#233c4b] text-white"
                    : "border-[#d8e1de] bg-white text-t-secondary"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="mt-2 font-sans text-[12px] text-t-secondary">{confidence.explanation}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-[#d8e1de] bg-white px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-t-muted">Team alignment</p>
          <span className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
            alignmentSummary === "Misaligned" ? "text-rust" : "text-forest"
          }`}>
            {alignmentSummary}
          </span>
        </div>
        <div className="mt-2 space-y-1">
          {teamBeliefs.length === 0 ? (
            <p className="font-sans text-[13px] text-t-secondary">No responses yet.</p>
          ) : (
            teamBeliefs.map((belief) => (
              <p key={`belief-row-${belief.userId}`} className="font-sans text-[13px] text-t-primary">
                <span className="font-semibold">{belief.userLabel}:</span>{" "}
                {belief.response === "yes"
                  ? "Yes — feels right"
                  : belief.response === "not_quite"
                    ? "Not quite — needs adjustment"
                    : "No — this is wrong"}
              </p>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
