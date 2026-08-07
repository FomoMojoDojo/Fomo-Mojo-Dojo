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
import type { AsyncState } from "@/hooks/useAsyncRead";
import CheckItemRow from "./CheckItemRow";
import CheckTally from "./CheckTally";
import SayVsSeeExhibit from "./SayVsSeeExhibit";
import OutsideRaisedSection from "./OutsideRaisedSection";
import CuratedTensionSection from "./CuratedTensionSection";
import { ThemeHeadline, ThemeMore } from "./ThemeSection";
import { THEME_1_HEADLINE, THEME_2_HEADLINE, THEME_3_HEADLINE } from "@/lib/firstRead/themeCopy";
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

  const { items, tally, loading, identityError, frozen, setVerdict, deltaState } = useFirstReadCapture(
    companyId,
    sessionId || undefined,
    ensureSession,
  );

  // The item area is gated by the identity compute (contentIdentity → crypto.subtle). On an
  // insecure origin that throws and the effect now records `identityError`; routing the area
  // through <ActData> terminates it into the signed ACT_DATA_ERROR instead of the eternal
  // "Loading items…". loading → the loading line; ready → the exhibit + check list.
  const itemArea: AsyncState<true> = identityError
    ? { status: "error", error: identityError }
    : loading
      ? { status: "loading" }
      : { status: "ready", data: true };

  const onSet = async (item: CheckItem, v: Verdict, correction?: string) => {
    setError(await setVerdict(item, v, correction));
  };

  // V2-7 — the say-vs-see delta items render in the exhibit ABOVE; the non-delta findings/
  // markets/differentiators render in the Check list below. Same session/verdict/tally.
  const deltaItems = useMemo(() => items.filter((i) => i.kind === "delta"), [items]);
  // Option B — the internally_silent items partition OUT of the say-vs-see exhibit (which is
  // say-anchored, three groups) into their own observed-anchored section below it.
  const sayVsSeeItems = useMemo(
    () => deltaItems.filter((i) => i.delta?.deltaType !== "internally_silent"),
    [deltaItems],
  );
  const outsideRaisedItems = useMemo(
    () => deltaItems.filter((i) => i.delta?.deltaType === "internally_silent"),
    [deltaItems],
  );
  const checkItems = useMemo(() => items.filter((i) => i.kind !== "delta"), [items]);

  return (
    <div className="cvs-fr-check">
      {/* V2-9 SWEEP: the raw session-id/status bar (machinery) is removed from room copy. */}
      <CheckTally tally={tally} />

      {/* ROLLUP (Gate 1): three themed overviews, not a wall of per-item batteries. THEME 1's
          featured exhibit is the curated single-instance tension — its own read
          (useCuratedTensions), independent of the verdict machinery; renders nothing when there is
          no live curated row. Kept ABOVE the item-area gate so it stays resilient (it needs no item
          identities), exactly as before. Featured pickers for themes 2/3 arrive in Gate 2; the
          batteries inside the tails come off in Gate 3. */}
      <ThemeHeadline>{THEME_1_HEADLINE}</ThemeHeadline>
      <CuratedTensionSection companyId={companyId} />

      {frozen && <p className="cvs-check-frozen">{FROZEN_MSG}</p>}
      {error && !frozen && <p className="cvs-check-refusal">{error}</p>}

      {/* GATE (honest identity-compute): the item area terminates into the signed error on an
          identity-compute failure (crypto.subtle undefined on an insecure origin), never an
          eternal loading string. loading → "Loading items…"; error → ACT_DATA_ERROR. */}
      <ActData state={itemArea} loading={<p className="cvs-support">Loading items…</p>}>
        {() => (
          <>
            {/* THEME 1 tail — say-vs-see, collapsed behind "…and N more like this". GATE B: gated
                on the delta read's honest state. A FAILED or never-returning delta read renders the
                signed error via <ActData>, NOT the three signed group-empty lines, which are only
                reachable in the ready branch. deltaItems carry the verdict join from `items`. */}
            <ThemeMore count={sayVsSeeItems.length}>
              <ActData state={deltaState} loading={null}>
                {() => <SayVsSeeExhibit items={sayVsSeeItems} onSet={onSet} disabled={frozen} />}
              </ActData>
            </ThemeMore>

            {/* THEME 2 — outside-raised (internally_silent). Inside the SAME delta ready branch, so
                its honest-empty string is unreachable on a failed or pending delta read. */}
            <ThemeHeadline>{THEME_2_HEADLINE}</ThemeHeadline>
            <ThemeMore count={outsideRaisedItems.length}>
              <ActData state={deltaState} loading={null}>
                {() => <OutsideRaisedSection items={outsideRaisedItems} onSet={onSet} disabled={frozen} showHeading={false} />}
              </ActData>
            </ThemeMore>

            {/* THEME 3 — what we found (findings; differentiators fold in as the closing list). */}
            <ThemeHeadline>{THEME_3_HEADLINE}</ThemeHeadline>
            <ThemeMore count={checkItems.length}>
              {checkItems.length === 0 ? (
                <p className="cvs-support">No other checkable items surfaced for this company yet.</p>
              ) : (
                <div className="cvs-check-list">
                  {checkItems.map((item) => (
                    <CheckItemRow key={item.identity} item={item} onSet={onSet} disabled={frozen} />
                  ))}
                </div>
              )}
            </ThemeMore>
          </>
        )}
      </ActData>
      {/* Name-the-moves recap — suppressed when there is nothing to check (items === 0). */}
      <ActRecap recap={CHECK_RECAP} hasContent={items.length > 0} />
    </div>
  );
}
