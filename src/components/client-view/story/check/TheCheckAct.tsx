/*
 * First Read · The Check (content) — v2 slot 4 ("Where the customer agrees").
 *
 * FR-V2-1: LAZY-MINT. The Check renders with NO session (the findings, no verdicts).
 * The FIRST verdict tap mints the open session (single-flight, via the rail's
 * ensureSession) and records the verdict — no prep, no honest-empty message. A
 * proposal_issued session renders FROZEN (Gate 2). No lifecycle transitions here —
 * issuance (open → proposal_issued) is the Proposal.
 */

import { useMemo, useState } from "react";
import { useFirstReadCapture, type CheckItem, type Verdict } from "@/hooks/useFirstReadCapture";
import CheckItemRow from "./CheckItemRow";
import CheckTally from "./CheckTally";
import SayVsSeeExhibit from "./SayVsSeeExhibit";
import { ActData } from "../ActData";
import ActRecap from "../ActRecap";
import { CHECK_RECAP } from "../recapCopy";

// ── Client-facing copy ───────────────────────────────────────────────────────
// V2-9 SWEEP: freeze/lock/session machinery removed from room copy (the freeze still
// happens silently at issuance). PENDING OPERATOR SIGNATURE.
const FROZEN_MSG = "This read has been shared with the client.";
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

  const { items, tally, loading, frozen, setVerdict, deltaState } = useFirstReadCapture(
    companyId,
    sessionId || undefined,
    ensureSession,
  );

  const onSet = async (item: CheckItem, v: Verdict, correction?: string) => {
    setError(await setVerdict(item, v, correction));
  };

  // V2-7 — the say-vs-see delta items render in the exhibit ABOVE; the non-delta findings/
  // markets/differentiators render in the Check list below. Same session/verdict/tally.
  const deltaItems = useMemo(() => items.filter((i) => i.kind === "delta"), [items]);
  const checkItems = useMemo(() => items.filter((i) => i.kind !== "delta"), [items]);

  return (
    <div className="cvs-fr-check">
      {/* V2-9 SWEEP: the raw session-id/status bar (machinery) is removed from room copy. */}
      <CheckTally tally={tally} />

      {frozen && <p className="cvs-check-frozen">{FROZEN_MSG}</p>}
      {error && !frozen && <p className="cvs-check-refusal">{error}</p>}

      {loading ? (
        <p className="cvs-support">Loading items…</p>
      ) : (
        <>
          {/* V2-7 say-vs-see exhibit — always renders its three groups (honest-absence
              per empty group), so the contrast frame is present even before deltas exist.
              GATE B: gated on the delta read's honest state. A FAILED or never-returning
              delta read renders the signed error via <ActData> — NOT the three signed
              group-empty lines / heading, which are only reachable in the ready branch
              (a genuine zero-delta read). deltaItems carry the verdict join from `items`. */}
          <ActData state={deltaState} loading={null}>
            {() => <SayVsSeeExhibit items={deltaItems} onSet={onSet} disabled={frozen} />}
          </ActData>

          {checkItems.length === 0 ? (
            <p className="cvs-support">No other checkable items surfaced for this company yet.</p>
          ) : (
            <div className="cvs-check-list">
              {checkItems.map((item) => (
                <CheckItemRow key={item.identity} item={item} onSet={onSet} disabled={frozen} />
              ))}
            </div>
          )}
        </>
      )}
      {/* Name-the-moves recap — suppressed when there is nothing to check (items === 0). */}
      <ActRecap recap={CHECK_RECAP} hasContent={items.length > 0} />
    </div>
  );
}
