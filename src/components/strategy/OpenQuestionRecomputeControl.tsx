// V2-4 — the deliberate open-question recompute (plan → cap-3 anchor chunks → finalize),
// the real generate-open-questions path. Sits by the publicly_silent rail because those
// silent deltas are unified INTO this one open-question list (a declared thing the public
// doesn't echo is itself an open question). Every click re-plans (server truth) and the
// generator reconciles by content identity — re-click IS resume.
//
// Admin-facing strings below are DRAFTS pending operator signature.

import { useOpenQuestionRecompute } from "@/hooks/useOpenQuestionRecompute";

const mono = "ui-monospace, Menlo, monospace";
const line: React.CSSProperties = { fontFamily: mono, fontSize: 9.5, letterSpacing: "0.04em", color: "#8a8272", margin: "4px 0 0", lineHeight: 1.6 };

export default function OpenQuestionRecomputeControl({ companyId }: { companyId: string }) {
  const { running, progress, start } = useOpenQuestionRecompute(companyId);
  const label = running ? "Generating…" : progress.phase === "done" || progress.phase === "error" ? "Regenerate open questions" : "Generate open questions";

  return (
    <div style={{ margin: "0 0 16px" }}>
      <button
        type="button"
        onClick={() => void start()}
        disabled={running || !companyId}
        style={{
          fontFamily: mono, fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase",
          padding: "3px 10px", border: "1px solid rgba(20,15,8,0.14)", borderRadius: 2,
          background: "transparent", color: running ? "#a39b8b" : "#403c33",
          cursor: running ? "default" : "pointer",
        }}
      >
        {label}
      </button>

      {progress.phase !== "idle" && (
        <div style={{ marginTop: 8 }}>
          {progress.phase === "planning" && <p style={line}>Sizing the work…</p>}
          {(progress.phase === "generating" || progress.phase === "finalizing" || progress.phase === "done") && progress.chunksTotal > 0 && (
            <p style={line}>
              Batch {Math.min(progress.chunksDone, progress.chunksTotal)} of {progress.chunksTotal} · {progress.totals.born} question{progress.totals.born === 1 ? "" : "s"} ({progress.totals.silent_derived} from silent declarations, {progress.totals.rejected} rejected)
            </p>
          )}
          {progress.phase === "generating" && progress.chunksTotal === 0 && <p style={line}>No findings or silent declarations to question yet.</p>}
          {progress.phase === "finalizing" && <p style={line}>Wrap-up: settling the list…</p>}
          {progress.phase === "done" && <p style={{ ...line, color: "#403c33" }}>Open questions regenerated — {progress.totals.linked} linked to a finding.</p>}
          {progress.phase === "error" && <p style={{ ...line, color: "#8a3b1f" }}>Could not generate: {progress.error}</p>}
        </div>
      )}
    </div>
  );
}
