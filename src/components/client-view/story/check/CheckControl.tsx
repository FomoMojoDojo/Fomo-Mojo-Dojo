// First Read · Act 3 (The Check) — the four-verdict control.
//
// Confirm / Correct / Reject / Not important. "Correct" opens a short free-text
// field; submit refuses empty/whitespace text CLIENT-SIDE (a mirror of the DB
// corrected_requires_text check — the trigger/constraint is the backstop, not
// the UX). No canned text: every label is UI chrome, the verdict is real.

import { useState } from "react";
import type { Verdict } from "@/hooks/useFirstReadCapture";

// ── Client-visible copy — SIGNED (OC-2 brief, 2026-07-23) ────────────────────
// The fourth option: the client concedes the finding is true but says it does
// not matter to them. Feeds contest_kind='immaterial'.
const NOT_IMPORTANT_LABEL = "True — but not important to us";
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckControl({
  verdict,
  correctionText,
  onSet,
  disabled,
}: {
  verdict: Verdict | null;
  correctionText: string | null;
  onSet: (v: Verdict, correction?: string) => void;
  disabled?: boolean;
}) {
  const [correcting, setCorrecting] = useState(verdict === "corrected");
  const [draft, setDraft] = useState(correctionText ?? "");
  const [emptyTouched, setEmptyTouched] = useState(false);

  const submitCorrection = () => {
    const t = draft.trim();
    if (!t) {
      setEmptyTouched(true); // client mirror of corrected_requires_text
      return;
    }
    setEmptyTouched(false);
    onSet("corrected", t);
  };

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
          className={`cvs-check-btn cvs-check-correct${verdict === "corrected" ? " is-active" : ""}`}
          disabled={disabled}
          onClick={() => setCorrecting((v) => !v)}
        >
          Correct
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

      {correcting && (
        <div className="cvs-check-correction">
          <textarea
            className={`cvs-check-correction-input${emptyTouched ? " has-error" : ""}`}
            placeholder="What's the correction?"
            value={draft}
            rows={2}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
          />
          {emptyTouched && (
            <span className="cvs-check-correction-err">A correction needs text.</span>
          )}
          <button
            type="button"
            className="cvs-check-correction-save"
            disabled={disabled}
            onClick={submitCorrection}
          >
            Save correction
          </button>
        </div>
      )}
    </div>
  );
}
