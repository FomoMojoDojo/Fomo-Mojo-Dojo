import { formatDistanceToNow, parseISO } from "date-fns";
import { useDriftAssessment } from "@/hooks/useDriftAssessment";

type Variant = "panel" | "link";

type Props = {
  surfaceType: string;
  surfaceId: string | null | undefined;
  onGenerate: () => void;
  generateLoading?: boolean;
  hasPendingProposal?: boolean;
  generateMessage?: string | null;
  variant?: Variant;
  stopPropagation?: boolean;
  refreshKey?: number;
};

export default function ProposeChangesButton({
  surfaceType,
  surfaceId,
  onGenerate,
  generateLoading = false,
  hasPendingProposal = false,
  generateMessage,
  variant = "panel",
  stopPropagation = false,
  refreshKey = 0,
}: Props) {
  const { assessment } = useDriftAssessment(
    surfaceId ? surfaceType : null,
    surfaceId ?? null,
    refreshKey,
  );

  const driftState =
    !assessment || assessment.accepted_as_aligned_at
      ? ("none" as const)
      : assessment.drift_state === "material_drift"
        ? ("material" as const)
        : assessment.drift_state === "slight_drift"
          ? ("slight" as const)
          : ("none" as const);

  const hasDrift = driftState !== "none";
  const isDisabled = generateLoading || !hasDrift;

  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
    onGenerate();
  };

  // Sub-text for panel variant only, shown when no drift is detected
  let statusText: string | null = null;
  if (!generateLoading && !hasDrift) {
    if (!assessment) {
      statusText = "Not yet assessed";
    } else if (assessment.drift_state === "aligned" || assessment.accepted_as_aligned_at) {
      const ago = assessment.last_assessed_at
        ? `· assessed ${formatDistanceToNow(parseISO(assessment.last_assessed_at))} ago`
        : "";
      statusText = `No drift detected ${ago}`.trim();
    }
  }

  if (variant === "link") {
    const label = generateLoading
      ? "Generating…"
      : hasPendingProposal
        ? "↻ Regenerate proposed changes"
        : "⊕ Propose changes";

    const color =
      driftState === "material" || driftState === "slight"
        ? "#ff5b29"
        : hasPendingProposal
          ? "#ff5b29"
          : "#999";

    const opacity = generateLoading ? 0.5 : hasDrift ? 1 : 0.35;

    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleClick}
        style={{
          fontSize: 10,
          color,
          background: "none",
          border: "none",
          cursor: isDisabled ? (generateLoading ? "wait" : "default") : "pointer",
          padding: 0,
          textDecoration: "underline",
          opacity,
        }}
      >
        {label}
      </button>
    );
  }

  // Panel variant — bordered button
  const label = generateLoading
    ? "Generating proposed changes…"
    : "Propose changes from current evidence";

  let btnColor: string;
  let btnBg: string;
  let btnBorder: string;
  let btnCursor: string;

  if (generateLoading) {
    btnColor = "rgba(17,17,17,0.25)";
    btnBg = "none";
    btnBorder = "1px solid rgba(17,17,17,0.12)";
    btnCursor = "wait";
  } else if (driftState === "material") {
    btnColor = "#fff";
    btnBg = "#ff5b29";
    btnBorder = "1px solid #ff5b29";
    btnCursor = "pointer";
  } else if (driftState === "slight") {
    btnColor = "#ff5b29";
    btnBg = "none";
    btnBorder = "1px solid #ff5b29";
    btnCursor = "pointer";
  } else {
    btnColor = "rgba(17,17,17,0.25)";
    btnBg = "none";
    btnBorder = "1px solid rgba(17,17,17,0.12)";
    btnCursor = "default";
  }

  return (
    <>
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleClick}
        style={{
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontSize: 10,
          letterSpacing: "0.06em",
          padding: "4px 10px",
          borderRadius: 2,
          color: btnColor,
          background: btnBg,
          border: btnBorder,
          cursor: btnCursor,
        }}
      >
        {label}
      </button>
      {statusText && (
        <p style={{
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontSize: 9,
          color: "rgba(17,17,17,0.35)",
          margin: "5px 0 0",
          letterSpacing: "0.04em",
        }}>
          {statusText}
        </p>
      )}
      {generateMessage && (
        <p style={{
          fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
          fontSize: 10,
          color: "rgba(17,17,17,0.4)",
          margin: "6px 0 0",
        }}>
          {generateMessage}
        </p>
      )}
    </>
  );
}
