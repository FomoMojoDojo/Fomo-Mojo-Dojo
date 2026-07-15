import { D } from "@/components/design-system/tokens";
import { useSignalRecurrenceRecompute } from "@/hooks/useSignalRecurrenceRecompute";

// CV-2d-2 copy — operator-signed strings (2026-07-15). Extracts is an
// operator-only surface; these are internal labels, not client voice.
// Unsigned transient lines from the draft were REMOVED rather than reworded
// (removal is not invention); two signed strings (empty state, last-run
// summary) need a data fetch this copy-only commit may not add — deferred,
// flagged in the gate report.

export function SignalRecurrenceControl({ companyId }: { companyId: string }) {
  const { running, progress, atRest, start } = useSignalRecurrenceRecompute(companyId);

  const buttonLabel = running
    ? `Recomputing… ${progress?.currentChunk ?? 0}/${progress?.totalChunks ?? 0}`
    : "Recompute recurrence";

  const line: React.CSSProperties = { fontFamily: D.mono, fontSize: 9.5, letterSpacing: "0.04em", color: D.inkFaint, margin: "4px 0 0", lineHeight: 1.6 };

  return (
    <div style={{ margin: "0 0 16px" }}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={running}
        style={{
          fontFamily: D.mono, fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase",
          padding: "3px 10px", border: `1px solid ${D.hairline}`, borderRadius: 2,
          background: "transparent", color: running ? D.inkFaint : D.inkSoft,
          cursor: running ? "default" : "pointer",
        }}
      >
        {buttonLabel}
      </button>

      {progress && (
        <div style={{ marginTop: 8 }}>
          {/* Run-level failure: the hook supplies the full operator-signed
              sentence (plan failure framing / frozen-company refusal). */}
          {progress.error && (
            <p style={{ ...line, color: "#8a3b1f" }}>{progress.error}</p>
          )}

          {progress.results.map((r, i) => (
            <p key={i} style={{ ...line, color: r.ok ? D.inkFaint : "#8a3b1f" }}>
              {r.ok
                ? `Batch ${i + 1}/${progress.totalChunks} · ${r.judged ?? 0} judged · ${r.skipped ?? 0} already judged`
                : `Recurrence recompute failed on batch ${i + 1} — ${r.reason}. Re-click to resume; judged pairs are skipped.`}
            </p>
          ))}

          {progress.finalize?.ok && !progress.finalize.polled && (
            <p style={line}>
              {`${progress.finalize.clusters ?? 0} corroboration cluster(s) · findings joined: ${progress.finalize.joinsOrigin ?? 0} direct / ${progress.finalize.joinsJudge ?? 0} matched`}
            </p>
          )}

          {/* Operator-signed 2026-07-15: finalize failure. */}
          {progress.finalize && !progress.finalize.ok && (
            <p style={{ ...line, color: "#8a3b1f" }}>
              {`Judging finished but the wrap-up step failed — ${progress.finalize.reason}. Verdicts are saved; re-click to finish joining findings.`}
            </p>
          )}
        </div>
      )}

      {/* Three-way at-rest state (operator-signed 2026-07-15): nothing extra
          while a run is in progress; last-run summary when verdicts exist;
          empty state when none. atRest is null for frozen companies (neither
          line renders) and while the mount read is in flight. */}
      {!running && atRest && (
        <p style={{ ...line, marginTop: progress ? 8 : 6 }}>
          {atRest.verdicts > 0
            ? `Last run: ${atRest.clusters} cluster(s) backing findings, ${atRest.verdicts} verdicts. Recompute after new public signals.`
            : "Not yet computed. Recompute to judge signal corroboration."}
        </p>
      )}
    </div>
  );
}
