// ── THE PROPOSED-NEEDS REVIEW GROUPS (SP-441 / SP-443 / SP-444 / SP-452 / SP-453, 2026-11-19) ─────
//
// The one operator function that had no workspace counterpart: deciding a proposed need. It sits on
// /preview/client-refine/workspace/inputs, above the evidence files, and it is the only surface
// besides the admin queue that can accept one.
//
// TWO GROUPS (SP-453), each with its own label and its own pending count, so a count is true of the
// cards under it:
//   "Proposed needs — review"                 the outside-voice cards, each with the green tag
//                                             "Only the outside shows it" and a count that opens its
//                                             verified quotes;
//   "Proposed needs — from file analyses"     the older cards read out of an uploaded document.
// Need cards only: an outcome, positioning or route candidate is not a proposed NEED, so neither
// label covers it and both stay reviewable on the admin queue, which is unchanged (SP-440).
//
// THE COUNT IS THE OPENER (B-10), and only an outside-voice card has one: its cited quotes are
// counted review quotes, so "3 counted quotes · 2 sites" is true of them. A file-analysis card's
// cited signals are a document's own sentences — calling those "counted quotes" would be false.
//
// ACCEPT is gated by governance.proposal.apply, read by the page and passed in; it calls
// public.accept_candidate_proposal(), which is admin-only in the database as well.
// REJECT (SP-444) marks the proposal rejected and KEEPS the row — nothing is deleted. The card
// leaves its group because both groups read status='pending'.
import { useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useCandidateQueue, type CandidateCard } from "@/hooks/useCandidateQueue";
import { isAtTheBar } from "@/lib/briefSections";
import { brandWords } from "@/lib/reviewQuote";
import { OUTSIDE_VOICE_MARK } from "@/lib/outsideVoiceMark";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { QuoteList } from "./QuoteList";
import { ReviewCard } from "./ReviewCard";
import {
  WORKSPACE_STRINGS, countedQuotesSitesLine, pendingFromFilesLine, pendingOutsideVoiceLine, voiceLabel,
} from "./workspaceNav";

/** Need cards only, in the card's own order, split by where the need was read. */
export function splitCards(cards: readonly CandidateCard[]): { outside: CandidateCard[]; files: CandidateCard[] } {
  const needs = cards.filter((c) => c.surfaceType === "candidate_need");
  return { outside: needs.filter((c) => c.outsideVoice), files: needs.filter((c) => !c.outsideVoice) };
}

export function ProposedNeedsReview({ companyId, canApply }: { companyId: string; canApply: boolean }) {
  const { activeCompany } = useCompany();
  const { cards, loading, error, storedBrands, accept, reject } = useCandidateQueue(companyId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // SP-455c: the words the mask must not take for a reviewer, from stored values only.
  const brands = brandWords(activeCompany?.name, storedBrands);
  const { outside, files } = splitCards(cards);
  if (loading || (outside.length === 0 && files.length === 0)) return null;

  const run = async (id: string, fn: (id: string) => Promise<void>) => {
    setBusy(id); setActionError(null);
    try { await fn(id); } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const card = (c: CandidateCard) => (
    <ReviewCard
      key={c.id}
      testId="review-card"
      chips={[WORKSPACE_STRINGS.cardKindNeed, voiceLabel(c.voice)]}
      mark={c.outsideVoice ? OUTSIDE_VOICE_MARK : null}
      barMark={c.outsideVoice && isAtTheBar(c.tally) ? WORKSPACE_STRINGS.atTheBar : null}
      headline={c.headline}
      sites={c.outsideVoice ? c.tally.sites : undefined}
      openLabel={c.outsideVoice ? countedQuotesSitesLine(c.tally.counted, c.tally.sites.length) : null}
      open={openId === c.id}
      onToggle={c.outsideVoice ? () => setOpenId(openId === c.id ? null : c.id) : undefined}
      canAccept={canApply && c.canAccept}
      busy={busy === c.id}
      onAccept={() => { void run(c.id, accept); }}
      onReject={() => { void run(c.id, reject); }}
    >
      <QuoteList quotes={c.quotes} brands={brands} />
    </ReviewCard>
  );

  return (
    <div
      className="fr-ws-tablewrap"
      data-fr-region="proposed-needs"
      data-testid="inputs-review-group"
      {...{ [OPERATOR_MARK.attr]: "review-group" }}
    >
      {error || actionError ? <p className="fr-ws-analysis-refused fr-mono" data-testid="review-group-error">{actionError ?? error}</p> : null}
      {outside.length > 0 ? (
        <section data-testid="review-group-outside" data-fr-group="outside_voice_read">
          <p className="fr-ws-review-grouphead fr-mono">
            <span className="fr-ws-band-eyebrow" data-testid="review-group-title">{WORKSPACE_STRINGS.proposedNeedsReview}</span>
            <span className="fr-ws-review-count" data-testid="review-group-count">{pendingOutsideVoiceLine(outside.length)}</span>
          </p>
          <ul className="fr-ws-review-list">{outside.map(card)}</ul>
        </section>
      ) : null}
      {files.length > 0 ? (
        <section data-testid="review-group-files" data-fr-group="file_analysis">
          <p className="fr-ws-review-grouphead fr-mono">
            <span className="fr-ws-band-eyebrow" data-testid="review-group-files-title">{WORKSPACE_STRINGS.proposedNeedsFromFiles}</span>
            <span className="fr-ws-review-count" data-testid="review-group-files-count">{pendingFromFilesLine(files.length)}</span>
          </p>
          <ul className="fr-ws-review-list">{files.map(card)}</ul>
        </section>
      ) : null}
    </div>
  );
}
