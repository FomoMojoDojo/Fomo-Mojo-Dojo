// First Read · Act 4 (The Check) — the verdict control.
//
// Confirm / Reject / "True, but not a focus now". These items are the OUTSIDE
// record, not the client's findings — the client confirms, rejects, or sets one
// aside, but does not correct the outside record. (V2-11: the correct/refine path
// is REMOVED FROM RENDER; the stored machinery — correction_text, the corrections
// feed, the heard "What you refined" group — stays intact and dormant for verdicts
// captured before this change. No canned text: every label is UI chrome, the
// verdict is real.)

import type { Verdict } from "@/hooks/useFirstReadCapture";

// ── Client-visible copy — OPERATOR-AUTHORED-AND-SIGNED (V2-11 brief, 2026-07-24) ──
// The fourth verdict: the client concedes the finding is true but says it is not a
// focus for them now. Its verdict value is 'not_important'; feeds contest_kind=
// 'immaterial'. Single-sourced here — both CheckItemRow and DeltaItemRow render this
// one control, so the label can never fork between the findings list and the
// say-vs-see delta list.
export const NOT_IMPORTANT_LABEL = "True, but not a focus now";
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckControl({
  verdict,
  onSet,
  disabled,
}: {
  verdict: Verdict | null;
  // correctionText stays in the contract (callers still pass it) but is DORMANT — the
  // corrected render path was retired in V2-11. Kept so legacy corrected verdicts
  // round-trip through the capture hook with no schema/API change.
  correctionText?: string | null;
  onSet: (v: Verdict, correction?: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cvs-check-ctrl">
      <div className="cvs-check-btn-row">
        <button
          type="button"
          className={`cvs-check-btn cvs-check-confirm${verdict === "confirmed" ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => onSet("confirmed")}
        >
          Confirm
        </button>
        <button
          type="button"
          className={`cvs-check-btn cvs-check-reject${verdict === "rejected" ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => onSet("rejected")}
        >
          Reject
        </button>
        <button
          type="button"
          className={`cvs-check-btn cvs-check-notimportant${verdict === "not_important" ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => onSet("not_important")}
        >
          {NOT_IMPORTANT_LABEL}
        </button>
      </div>
    </div>
  );
}
