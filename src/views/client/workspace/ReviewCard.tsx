// ── THE SHARED REVIEW CARD SHELL (SP-443, laid out to the signed mock by SP-452) ─────────────────
//
// One card shell for everything the operator reviews and decides, and the same shell the Brief reads
// with no decisions on it.
//
// SP-443 forbade the alternative: `ProposalReviewPanel` is FILE-PROPOSAL shaped — its props are a
// `FileProposalRow` and it branches on `processing_state` (inputsShared.tsx) — and a
// `surface_proposals` candidate card has neither, so reusing it would have meant inventing one.
//
// THE LAYOUT IS THE SIGNED MOCK's (mock-inputs-review-group.png): the kind and voice chips, then the
// mark as a green tag, the need statement, the site names on their own line, then the count control
// with "At the bar" beside it. Accept (filled) and Reject (outline) sit at the card's top right
// while it is closed and under the quotes once it is open, exactly as the mock shows both states.
import type { ReactNode } from "react";
import { WORKSPACE_STRINGS } from "./workspaceNav";

function Actions({ canAccept, busy, onAccept, onReject }: {
  canAccept: boolean; busy?: boolean; onAccept?: () => void; onReject?: () => void;
}) {
  if (!(canAccept && onAccept) && !onReject) return null;
  return (
    <div className="fr-ws-review-actions">
      {canAccept && onAccept ? (
        <button type="button" className="fr-ws-btn" disabled={busy} onClick={onAccept} data-testid="review-card-accept">
          {WORKSPACE_STRINGS.accept}
        </button>
      ) : null}
      {onReject ? (
        <button type="button" className="fr-ws-btn fr-ws-btn--outline" disabled={busy} onClick={onReject} data-testid="review-card-reject">
          {WORKSPACE_STRINGS.reject}
        </button>
      ) : null}
    </div>
  );
}

export function ReviewCard({
  testId, chips, mark, proposedMark, barMark, headline, sites, openLabel, open, onToggle,
  canAccept, busy, onAccept, onReject, children, facts,
}: {
  testId?: string;
  /** The mono kind / voice chips, rendered " · "-joined at the 10px floor. */
  chips: ReadonlyArray<string>;
  /** The green tag, e.g. "Only the outside shows it". */
  mark?: string | null;
  /** SP-458: a SECOND tag beside `mark`, in its own colour — "Proposed — not yet accepted". A
   *  proposed need is outside-voice sourced too, so both tags are true of the same card and one
   *  must not displace the other. */
  proposedMark?: string | null;
  /** The one-colour bar mark (SP-445) — "At the bar", the SAME class and token on both surfaces. */
  barMark?: string | null;
  headline: string;
  /** The site names the counted quotes came from, in the mock's own line under the statement. */
  sites?: ReadonlyArray<string>;
  /** The count control's label; null when this card has nothing to open. */
  openLabel?: string | null;
  open?: boolean;
  onToggle?: () => void;
  canAccept: boolean;
  busy?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  /** What the opener reveals. Rendered only while `open`. */
  children?: ReactNode;
  /** Extra lines under the headline — the Brief's counts and reasons. */
  facts?: ReactNode;
}) {
  const actions = <Actions canAccept={canAccept} busy={busy} onAccept={onAccept} onReject={onReject} />;
  return (
    <li className="fr-ws-review-card" data-testid={testId} data-fr-open={open ? "true" : undefined}>
      <div className="fr-ws-review-top">
        <div className="fr-ws-review-main">
          {chips.length || mark || proposedMark ? (
            <p className="fr-ws-review-meta fr-mono">
              {chips.join(" · ")}
              {/* the mark is a TAG, so no "·" in front of it — the mock sets it off by the tag itself */}
              {mark ? <span className="fr-ws-review-tag" data-testid="review-card-mark">{mark}</span> : null}
              {proposedMark ? <span className="fr-ws-review-tag fr-ws-review-tag--proposed" data-testid="review-card-proposed">{proposedMark}</span> : null}
            </p>
          ) : null}
          <p className="fr-ws-review-headline">{headline}</p>
          {sites && sites.length ? (
            <p className="fr-ws-review-sites fr-mono" data-testid="review-card-sites">{sites.join(" · ")}</p>
          ) : null}
          {facts ?? null}
          {(openLabel && onToggle) || barMark ? (
            <p className="fr-ws-review-openrow">
              {openLabel && onToggle ? (
                <button type="button" className="fr-ws-review-open fr-mono" aria-expanded={Boolean(open)} onClick={onToggle} data-testid="review-card-open">
                  {openLabel} {open ? "↑" : "↓"}
                </button>
              ) : null}
              {barMark ? <span className="fr-ws-bar-mark fr-mono" data-testid="review-card-bar">{barMark}</span> : null}
            </p>
          ) : null}
        </div>
        {open ? null : actions}
      </div>
      {open ? (
        <>
          <div className="fr-ws-review-body">{children}</div>
          {actions}
        </>
      ) : null}
    </li>
  );
}
