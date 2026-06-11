// Reviewer-integrity logging — the three-state empty render.
// Law: "all clear" that never asked isn't all clear. A nothing-to-report surface
// renders one of THREE visibly distinct states, never a bare reassurance:
//   1. looked:        record exists, completed → "Checked {date} — {emptyText}"
//   2. never looked:  no record → "Not yet checked"
//   3. couldn't:      record failed / query errored → "This check didn't complete — it will run again on the next scan."
// Copy strings operator-signed 2026-06-11.
import { formatDistanceToNow, parseISO } from "date-fns";
import type { IntegrityRunRecord } from "@/hooks/useIntegrityRecord";

const MONO = "monospace" as const;
const INK_QUIET = "rgba(17,17,17,0.55)";
const INK_FAINT = "rgba(17,17,17,0.35)";
const ATTENTION = "#c45c00";

export function IntegrityEmptyState({
  record,
  hookError,
  emptyText,
}: {
  record: IntegrityRunRecord | null;
  hookError: string | null;
  emptyText: string; // e.g. "nothing to report", "no unresolved tensions"
}) {
  if (hookError || record?.status === "failed") {
    return (
      <p style={{ fontFamily: MONO, fontSize: 10, color: ATTENTION, margin: 0, lineHeight: 1.5 }}>
        This check didn't complete — it will run again on the next scan.
      </p>
    );
  }
  if (!record) {
    return (
      <p style={{ fontFamily: MONO, fontSize: 10, color: INK_FAINT, margin: 0, lineHeight: 1.5 }}>
        Not yet checked
      </p>
    );
  }
  let ago = record.ran_at;
  try { ago = `${formatDistanceToNow(parseISO(record.ran_at))} ago`; } catch { /* raw timestamp fallback */ }
  return (
    <p style={{ fontFamily: MONO, fontSize: 10, color: INK_QUIET, margin: 0, lineHeight: 1.5 }}>
      Checked {ago} — {emptyText}
    </p>
  );
}
