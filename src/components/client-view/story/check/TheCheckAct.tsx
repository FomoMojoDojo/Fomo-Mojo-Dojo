/*
 * First Read · Act 3 — The Check (content).
 *
 * FR-FLOW-1: intake is prep, not performance — it moved OFF this act to the workshop
 * ("Prepare First Read"), which mints the OPEN session ahead of the meeting. This act
 * NO LONGER renders an intake form. The rail resolves the prepared session and passes
 * its id here:
 *   - sessionId present → the capture surface. If the session is proposal_issued it
 *     renders FROZEN (Gate 2) — the read-only record of the meeting.
 *   - sessionId absent → an honest-empty pointer to the workshop (no session was
 *     prepared). No session is minted here; capture cannot run without preparation.
 * No lifecycle transitions here — issuance (open → proposal_issued) is Act 5.
 */

import { useState } from "react";
import { useFirstReadCapture, type CheckItem, type Verdict } from "@/hooks/useFirstReadCapture";
import CheckItemRow from "./CheckItemRow";
import CheckTally from "./CheckTally";

// ── Client-facing copy — SIGNED (Gate 3) / carried forward ───────────────────
const FROZEN_MSG = "This session is locked — the proposal has been issued. Verdicts can no longer change.";
// FR-FLOW-1 honest-empty — NEW, PENDING OPERATOR SIGNATURE.
const NO_SESSION_MSG = "This meeting hasn't been prepared yet — set it up from the workshop first.";
// ─────────────────────────────────────────────────────────────────────────────

export default function TheCheckAct({
  companyId,
  sessionId,
}: {
  companyId: string;
  sessionId: string;
}) {
  const [error, setError] = useState<string | null>(null);

  const { items, tally, loading, frozen, sessionStatus, setVerdict } = useFirstReadCapture(
    companyId,
    sessionId || undefined,
  );

  const onSet = async (item: CheckItem, v: Verdict, correction?: string) => {
    setError(await setVerdict(item, v, correction));
  };

  // ── No prepared session → honest-empty (intake now lives in the workshop) ────
  if (!sessionId) {
    return <p className="cvs-support cvs-fr-nosession">{NO_SESSION_MSG}</p>;
  }

  // ── Capture surface ─────────────────────────────────────────────────────────
  return (
    <div className="cvs-fr-check">
      <div className="cvs-check-session-bar">
        <span className="cvs-check-session-meta">
          session {sessionId.slice(0, 8)}… · status {sessionStatus ?? "…"}
        </span>
      </div>

      <CheckTally tally={tally} />

      {frozen && <p className="cvs-check-frozen">{FROZEN_MSG}</p>}
      {error && !frozen && <p className="cvs-check-refusal">{error}</p>}

      {loading ? (
        <p className="cvs-support">Loading items…</p>
      ) : items.length === 0 ? (
        <p className="cvs-support">No checkable items surfaced for this company yet.</p>
      ) : (
        <div className="cvs-check-list">
          {items.map((item) => (
            <CheckItemRow key={item.identity} item={item} onSet={onSet} disabled={frozen} />
          ))}
        </div>
      )}
    </div>
  );
}
