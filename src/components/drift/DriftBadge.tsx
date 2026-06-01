import type { EngagementPhase } from "@/lib/engagementPhase";
import { useDriftAssessment, type DriftAssessment } from "@/hooks/useDriftAssessment";

// Phase matrix — per Operator Workflow Brief:
//   diagnose / validate_diagnose / outside_signals / validate_outside → render nothing
//   focus / validate_focus                                             → material_drift only
//   flow / validate_flow                                               → both drift states
function phasePermits(phase: EngagementPhase | null | undefined, driftState: string): boolean {
  if (!phase) return false;
  if (phase === "flow" || phase === "validate_flow") {
    return driftState === "material_drift" || driftState === "slight_drift";
  }
  if (phase === "focus" || phase === "validate_focus") {
    return driftState === "material_drift";
  }
  return false;
}

type Props = {
  surfaceType: string;
  surfaceId: string | null;
  phase: EngagementPhase | null | undefined;
  refreshKey?: number;
  onClick?: (assessment: DriftAssessment) => void;
};

export default function DriftBadge({ surfaceType, surfaceId, phase, refreshKey = 0, onClick }: Props) {
  const { assessment } = useDriftAssessment(surfaceType, surfaceId, refreshKey);

  if (!assessment) return null;
  if (assessment.drift_state === "aligned") return null;
  if (assessment.accepted_as_aligned_at) return null;
  if (!phasePermits(phase, assessment.drift_state)) return null;

  const isMaterial = assessment.drift_state === "material_drift";

  return (
    <button
      type="button"
      title={isMaterial ? "Material drift detected — click to review" : "Slight drift detected — click to review"}
      onClick={() => onClick?.(assessment)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: isMaterial ? "2px 7px 2px 5px" : "0",
        background: isMaterial ? "#ff5b29" : "none",
        border: "none",
        borderRadius: 10,
        cursor: "pointer",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    >
      <span style={{
        display: "inline-block",
        width: isMaterial ? 6 : 7,
        height: isMaterial ? 6 : 7,
        borderRadius: "50%",
        background: isMaterial ? "#fff" : "#c47d39",
        flexShrink: 0,
      }} />
      {isMaterial && (
        <span style={{
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#fff",
          fontWeight: 600,
          lineHeight: 1,
        }}>
          Drift
        </span>
      )}
    </button>
  );
}
