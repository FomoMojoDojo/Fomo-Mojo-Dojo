/*
 * First Read · The Check (content) — v2 slot 4 ("Where the customer agrees").
 *
 * FR-V2-1: LAZY-MINT. The Check renders with NO session (the findings, no verdicts).
 * The FIRST verdict tap mints the open session (single-flight, via the rail's
 * ensureSession) and records the verdict — no prep, no honest-empty message. A
 * proposal_issued session renders FROZEN (Gate 2). No lifecycle transitions here —
 * issuance (open → proposal_issued) is the Proposal.
 */

import { useState } from "react";
import { useFirstReadCapture, type CheckItem, type Verdict } from "@/hooks/useFirstReadCapture";
import CheckItemRow from "./CheckItemRow";
import CheckTally from "./CheckTally";

// ── Client-facing copy — SIGNED (Gate 3) / carried forward ───────────────────
const FROZEN_MSG = "This session is locked — the proposal has been issued. Verdicts can no longer change.";
// ─────────────────────────────────────────────────────────────────────────────

export default function TheCheckAct({
  companyId,
  sessionId,
  ensureSession,
}: {
  companyId: string;
  sessionId: string;
  /** FR-V2-1 lazy-mint — mints the session on the first verdict tap. */
  ensureSession?: () => Promise<string>;
}) {
  const [error, setError] = useState<string | null>(null);

  const { items, tally, loading, frozen, sessionStatus, setVerdict } = useFirstReadCapture(
    companyId,
    sessionId || undefined,
    ensureSession,
  );

  const onSet = async (item: CheckItem, v: Verdict, correction?: string) => {
    setError(await setVerdict(item, v, correction));
  };

  return (
    <div className="cvs-fr-check">
      {/* session bar only once a session exists (lazy-mint mints on first verdict) */}
      {sessionId && (
        <div className="cvs-check-session-bar">
          <span className="cvs-check-session-meta">
            session {sessionId.slice(0, 8)}… · status {sessionStatus ?? "…"}
          </span>
        </div>
      )}

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
