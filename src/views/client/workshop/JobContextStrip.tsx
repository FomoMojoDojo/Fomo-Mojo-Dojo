import type { JobStepRow } from "@/hooks/useJobSteps";
import type { ActiveCheckpoint } from "./types";

export default function JobContextStrip({
  activeCheckpoint,
  selectedStep,
  isSuggested,
  hasCheckpoints,
  onOpenPicker,
  onClear,
}: {
  activeCheckpoint: ActiveCheckpoint;
  selectedStep: JobStepRow | null;
  isSuggested: boolean;
  hasCheckpoints: boolean;
  onOpenPicker: () => void;
  onClear: () => void;
}) {
  if (!hasCheckpoints) return null;

  return (
    <div className="crpv-ws-job-strip">
      <span className="crpv-ws-job-strip-label">Focus</span>

      {activeCheckpoint ? (
        <>
          {isSuggested && (
            <span className="crpv-ws-job-chip suggested">Suggested</span>
          )}
          <span className="crpv-ws-job-chip active">
            {activeCheckpoint.stepLabel}
          </span>
          {selectedStep?.has_gap && (
            <span className="crpv-ws-job-chip gap">Gap flagged</span>
          )}
        </>
      ) : (
        <span className="crpv-ws-job-chip">No focus set</span>
      )}

      <span className="crpv-ws-job-strip-spacer" />

      {activeCheckpoint && (
        <button type="button" className="crpv-ws-job-strip-btn ghost" onClick={onClear}>
          Clear
        </button>
      )}
      <button type="button" className="crpv-ws-job-strip-btn" onClick={onOpenPicker}>
        {activeCheckpoint ? "Change ↕" : "Set focus →"}
      </button>
    </div>
  );
}
