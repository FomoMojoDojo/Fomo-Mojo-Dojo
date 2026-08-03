// G1 — "Where you stand": the read-only recap of the client's OWN verdicts from their
// first meeting, for the returning client view. NOT mounted here (G2 mounts it as the
// opener). Sessionless: reads live activeCompany's first_read_responses via
// useMeetingVerdicts.
//
// Honors the four standing laws: the client's verdicted statement renders UNCHANGED
// (client-never-edits the outside record) beside ONE signed outcome line (display
// honesty); rejected/set-aside items still stand/count (contested-claims-keep-counting);
// and only items the client actually verdicted appear (absence-isn't-a-verdict).
//
// The outcome line is keyed by the recorded VERDICT (a per-response fact) — never by
// claim_contests.resolution_reason, which is operator-voice and never client-facing (the
// hook does not even fetch it).

import { useMeetingVerdicts, type MeetingVerdict } from "@/hooks/useMeetingVerdicts";

// ── Client-facing copy — OPERATOR-SIGNED 2026-08-03 (G1) ─────────────────────
export const WYS_HEADER = "Where you stand";
export const WYS_SUB = "What you told us in the first meeting, and where each finding landed.";
// One signed outcome line per verdict type. A verdict with no signed line (e.g.
// 'corrected') is NOT rendered — there is no honest line for it and inventing one is
// forbidden (Edgewood has none). Keys are first_read_responses.verdict values.
export const WYS_OUTCOME: Readonly<Record<string, string>> = {
  confirmed: "You confirmed this.",
  rejected: "You pushed back on this. After review, it stands.",
  not_important: "You set this aside. We've de-emphasized it — it still counts.",
};
// OC-3b: a query FAILURE is a distinct state from "no verdicts" — render it honestly,
// never a silent empty.
export const WYS_LOAD_ERROR = "Couldn't load what you told us — reload or check access.";
// ─────────────────────────────────────────────────────────────────────────────

// Display order mirrors the meeting playback (confirmed → wrong → set aside); a stable
// order within each so the render is deterministic.
const VERDICT_ORDER = ["confirmed", "rejected", "not_important"] as const;

const mono: React.CSSProperties = { fontFamily: '"IBM Plex Mono", ui-monospace, monospace' };

function orderVerdicts(verdicts: MeetingVerdict[]): MeetingVerdict[] {
  // Only verdicts that have a signed outcome line render (no invented copy).
  const shown = verdicts.filter((v) => v.verdict in WYS_OUTCOME);
  return [...shown].sort((a, b) => VERDICT_ORDER.indexOf(a.verdict as never) - VERDICT_ORDER.indexOf(b.verdict as never));
}

export default function WhereYouStand({ companyId }: { companyId: string | null }) {
  const { verdicts, isLoading, isError } = useMeetingVerdicts(companyId);

  // OC-3b honesty: a failed load is NOT "no verdicts".
  if (isError) {
    return (
      <p style={{ ...mono, fontSize: 11, color: "#a4442f", margin: 0 }} role="status">
        {WYS_LOAD_ERROR}
      </p>
    );
  }

  const rows = orderVerdicts(verdicts);

  // DEFN-1 structural suppression: no verdicts → render NOTHING (never a header with an
  // empty body). Loading is treated as not-yet-anything (also nothing).
  if (isLoading || rows.length === 0) return null;

  return (
    <section className="cvs-act" aria-label="Where you stand — your first-meeting verdicts">
      <p style={{ ...mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.13em", color: "#9298B5", margin: "0 0 6px" }}>
        {WYS_HEADER}
      </p>
      <p style={{ fontSize: 12, color: "#6e847f", lineHeight: 1.5, margin: "0 0 16px", maxWidth: 560 }}>
        {WYS_SUB}
      </p>

      {rows.map((v) => (
        <div key={v.id} style={{ paddingLeft: 10, borderLeft: "2px solid rgba(30,51,64,0.12)", marginBottom: 14 }}>
          {/* The client's verdicted statement, UNCHANGED. */}
          <p style={{ fontFamily: "Georgia, serif", fontSize: 14, color: "#1e3340", lineHeight: 1.5, margin: 0 }}>
            {v.statement}
          </p>
          {/* One signed outcome line, keyed by the recorded verdict. */}
          <p style={{ ...mono, fontSize: 11, color: "#6e847f", margin: "5px 0 0" }}>
            {WYS_OUTCOME[v.verdict]}
          </p>
        </div>
      ))}
    </section>
  );
}
