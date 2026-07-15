import { D } from "@/components/design-system/tokens";
import { useSignalRecurrenceRecompute } from "@/hooks/useSignalRecurrenceRecompute";

// CV-2d-2c — operator control for the chunked signal-recurrence recompute
// (plan → cap-5 judge chunks → one finalize w/ R1 finding-join). Mounted on
// the Extracts surface beside the claim-delta recompute control; admin-gated
// by the surface's route (AdminModeRoute on /preview/client-refine/extracts).
//
// EVERY string below is a TODO(sig) placeholder — client-facing copy is not
// invented here; the operator signs final wording (CV-2d-2c brief).

export function SignalRecurrenceControl({ companyId }: { companyId: string }) {
  const { running, progress, start } = useSignalRecurrenceRecompute(companyId);

  const failedChunks = progress?.results.filter((r) => !r.ok).length ?? 0;
  const priorIncomplete = !running && progress?.stage === "done" &&
    (failedChunks > 0 || (progress.finalize !== null && !progress.finalize.ok));
  const buttonLabel = running
    ? "TODO(sig): Recomputing recurrence…"
    : priorIncomplete
      ? "TODO(sig): Resume recurrence recompute"
      : "TODO(sig): Recompute recurrence";

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
          {progress.error && (
            <p style={{ ...line, color: "#8a3b1f" }}>TODO(sig): Could not recompute: {progress.error}</p>
          )}

          {!progress.error && progress.stage === "plan" && <p style={line}>TODO(sig): Sizing the work…</p>}

          {!progress.error && progress.stage !== "plan" && progress.frozenTotal > 0 && (
            <p style={line}>TODO(sig): {progress.frozenTotal} already judged — skipped.</p>
          )}

          {!progress.error && progress.stage !== "plan" && progress.totalChunks === 0 && (
            <p style={line}>TODO(sig): Nothing new to judge — running the wrap-up only.</p>
          )}

          {progress.results.map((r, i) => (
            <p key={i} style={{ ...line, color: r.ok ? D.inkFaint : "#8a3b1f" }}>
              {r.ok
                ? `TODO(sig): ✓ Batch ${i + 1} — ${r.pairs} pair${r.pairs === 1 ? "" : "s"} (${r.seconds}s)`
                : `TODO(sig): ✗ Batch ${i + 1} — ${r.reason} (verdicts reached so far are kept)`}
            </p>
          ))}

          {!progress.error && progress.stage === "chunks" && progress.currentChunk > progress.results.length && (
            <p style={line}>TODO(sig): Judging batch {progress.currentChunk} of {progress.totalChunks}…</p>
          )}

          {!progress.error && progress.stage === "finalize" && (
            <p style={line}>TODO(sig): Wrap-up: pruning, clustering, joining findings…</p>
          )}

          {progress.finalize && (
            <p style={{ ...line, color: progress.finalize.ok ? D.inkFaint : "#8a3b1f" }}>
              {progress.finalize.ok
                ? `TODO(sig): ✓ Wrap-up complete (${progress.finalize.seconds}s)` +
                  (progress.finalize.polled
                    ? " — landed after the response was cut"
                    : ` — ${progress.finalize.clusters ?? 0} cluster(s); finding joins ${progress.finalize.joinsOrigin ?? 0} via origin / ${progress.finalize.joinsJudge ?? 0} via judge`)
                : `TODO(sig): ✗ Wrap-up — ${progress.finalize.reason} — click again to re-run (banked verdicts are kept).`}
            </p>
          )}

          {!progress.error && progress.stage === "done" && (
            <p style={{ ...line, color: D.inkSoft }}>
              {failedChunks === 0 && progress.finalize?.ok
                ? "TODO(sig): Recurrence recompute complete."
                : `TODO(sig): ${progress.results.filter((r) => r.ok).length} of ${progress.totalChunks} batches completed — click again to resume (banked verdicts are kept).`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
