import { differenceInDays, formatDistanceToNow, parseISO } from "date-fns";
import { useDriftAssessment } from "@/hooks/useDriftAssessment";
import { useIntegrityRecord } from "@/hooks/useIntegrityRecord";

// Integrity: an "assessed N ago" older than this is no longer reassurance — it renders
// as possibly out of date. 14 days: beyond any plausible scan cadence (baselines have
// run sub-weekly), but short enough that a quarter-old assessment can never read as
// current.
const STALENESS_DAYS = 14;

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
  const { assessment, error: assessmentError } = useDriftAssessment(
    surfaceId ? surfaceType : null,
    surfaceId ?? null,
    refreshKey,
  );
  // Latest drift_scan execution record for THIS surface (record-scope law: surface-keyed).
  const driftIntegrity = useIntegrityRecord(null, "drift_scan", surfaceId ?? null);

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

  // Sub-text for panel variant only, shown when no drift is detected.
  // Integrity states: couldn't-check (query error or failed scan record) and stale
  // (assessed beyond STALENESS_DAYS) are visibly distinct from fresh reassurance.
  let statusText: string | null = null;
  let statusTone: "quiet" | "attention" = "quiet";
  if (!generateLoading && !hasDrift) {
    if (assessmentError || driftIntegrity.record?.status === "failed") {
      statusText = "This check didn't complete — it will run again on the next scan.";
      statusTone = "attention";
    } else if (!assessment) {
      statusText = "Not yet checked";
    } else if (assessment.drift_state === "aligned" || assessment.accepted_as_aligned_at) {
      const assessedAt = assessment.last_assessed_at ? parseISO(assessment.last_assessed_at) : null;
      const daysOld = assessedAt ? differenceInDays(new Date(), assessedAt) : null;
      if (daysOld !== null && daysOld > STALENESS_DAYS) {
        statusText = `Last checked ${formatDistanceToNow(assessedAt!)} ago — may be out of date`;
        statusTone = "attention";
      } else {
        const ago = assessedAt ? `· assessed ${formatDistanceToNow(assessedAt)} ago` : "";
        statusText = `No drift detected ${ago}`.trim();
      }
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
          color: statusTone === "attention" ? "#c45c00" : "rgba(17,17,17,0.35)",
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
