// ── THE BRIEF (SP-442 / SP-424 / SP-445 / SP-446 / SP-449, 2026-11-19) ────────────────────────────
//
// The conversation brief, built by MojoMap out of its own stored rows instead of by hand. Operators
// only (SP-424): the route is already closed to a non-admin by AdminModeRoute + InternalViewOnlyRoute
// (App.tsx), the Tools tile is hidden by the operatorOnly flag, and the page's own default render —
// no operator context — is the absent state, which is what tests/workspace/f-no-operator-nodes
// asserts for every workspace route.
//
// FOUR BANDS, each from need_evidence under SP-406 counting (useBriefNeeds), on the Read frame:
//   Hotspots    the needs that clear the bar, most-evidenced first, with the per-brand polarity
//               triple and its visible key (SP-445)
//   What works  the needs whose counted quotes say the outcome IS met (SP-449). A need can sit in
//               both bands: the same outcome can be met for some customers and missed for others.
//   Thin spots  the needs that do not clear the bar, with WHICH floor they missed and what the
//               merger rule withheld — so a thin spot says what would have changed it
//   Questions   the live open questions from the outside read, newest first
//
// EVERY COUNT IS AN OPENER. Pressing it shows the quotes it rests on, each with brand · site · date
// and the reviewer's name masked (QuoteList → displayQuote). No number on this page is read from a
// stored count (SP-447) and no counting rule is restated here.
//
// "DRAFT, NOT SIGNED" stands until the sign step is built (SP-424).
import { useEffect, useState } from "react";
import { useCompany } from "@/hooks/useCompany";
import { useBriefNeeds, type BriefNeed } from "@/hooks/useBriefNeeds";
import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";
import { useSupersededQuestionCount } from "@/hooks/useSupersededQuestionCount";
import { hotspots, isAtTheBar, thinSpots, whatWorks } from "@/lib/briefSections";
import { tallyNeed, type EvidenceRow } from "@/lib/needEvidenceCounting";
import { OUTSIDE_VOICE_MARK, isOutsideVoiceSourced } from "@/lib/outsideVoiceMark";
import { brandWords, type QuoteRow } from "@/lib/reviewQuote";
import { useOperatorControls } from "@/views/client/firstReadPreview/operatorControls";
import { OPERATOR_MARK } from "@/views/client/firstReadPreview/operatorStrings";
import { WorkspaceAbsent } from "./absent";
import { QuoteList } from "./QuoteList";
import { ReviewCard } from "./ReviewCard";
import { WorkspaceReadPage, ReadBand } from "./WorkspaceReadPage";
import { brandPolarityLines, thinReasonLine, thinWithheldLine } from "./briefStrings";
import {
  WORKSPACE_STRINGS, countedQuotesSitesLine, pageLabel, questionsFootLine, showAllLine, workspaceDocumentTitle,
} from "./workspaceNav";

/** The questions band shows this many until the reveal control opens the rest (SP-456). */
const QUESTIONS_SHOWN = 5;

/** SP-456: every live question can be read. The First Read's own pair, the same control the quote
 *  lists use, and B-9's footer count stays underneath it either way. */
function QuestionsBand({ questions, superseded }: {
  questions: ReadonlyArray<{ question_text: string; question_identity?: string | null }>;
  superseded: number;
}) {
  const [showAll, setShowAll] = useState(false);
  // Newest first: the one list reads oldest-first with a deterministic tie-break, so reversing it is
  // newest-first and just as deterministic.
  const ordered = [...questions].reverse();
  const shown = showAll ? ordered : ordered.slice(0, QUESTIONS_SHOWN);
  return (
    <ReadBand label={WORKSPACE_STRINGS.bandQuestions} region="questions">
      <ul className="fr-ws-brief-rows" data-fr-showing={shown.length}>
        {shown.map((q, i) => (
          <li key={`${q.question_identity ?? i}`} className="fr-ws-brief-row" data-testid="brief-question">
            <p className="fr-ws-brief-question">{q.question_text.trim()}</p>
          </li>
        ))}
      </ul>
      {ordered.length > QUESTIONS_SHOWN ? (
        <button
          type="button"
          className="fr-ws-quote-more fr-mono"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
          data-testid="brief-questions-show-all"
        >
          <span aria-hidden className="fr-ws-quote-more-caret" data-open={showAll ? "true" : undefined}>&rsaquo;</span>
          {showAll ? WORKSPACE_STRINGS.showFewer : showAllLine(ordered.length)}
        </button>
      ) : null}
      <p className="fr-ws-brief-foot fr-mono" data-testid="brief-questions-foot">
        {questionsFootLine(questions.length, superseded)}
      </p>
    </ReadBand>
  );
}

/** A tally over a SUBSET of a need's counted quotes — used by What works, so its opener counts the
 *  working quotes and their sites and nothing else. Every quote in the subset bears and counts. */
function tallyOf(quotes: readonly QuoteRow[], polarity: string | null) {
  const rows: EvidenceRow[] = quotes.map((q) => ({ bears: true, polarity, brand: q.brand, eventDate: q.eventDate, sourceUrl: q.sourceUrl }));
  return tallyNeed(rows);
}

function NeedRow({ need, quotes, brands, counted, sites, barMark, facts, openKey, openId, setOpenId }: {
  need: BriefNeed;
  quotes: readonly QuoteRow[];
  brands: readonly string[];
  counted: number;
  sites: number;
  barMark: string | null;
  facts?: React.ReactNode;
  openKey: string;
  openId: string | null;
  setOpenId: (v: string | null) => void;
}) {
  return (
    <ReviewCard
      testId="brief-need"
      chips={[]}
      mark={isOutsideVoiceSourced(need.sourcePath) ? OUTSIDE_VOICE_MARK : null}
      barMark={barMark}
      headline={need.statement}
      facts={facts}
      openLabel={quotes.length > 0 ? countedQuotesSitesLine(counted, sites) : null}
      open={openId === openKey}
      onToggle={quotes.length > 0 ? () => setOpenId(openId === openKey ? null : openKey) : undefined}
      canAccept={false}
    >
      <QuoteList quotes={quotes} brands={brands} />
    </ReviewCard>
  );
}

export default function BriefPage() {
  const { activeCompany } = useCompany();
  const operator = useOperatorControls();
  const companyId = operator ? activeCompany?.id : undefined;
  const { needs, storedBrands, loading } = useBriefNeeds(companyId ?? null);
  const { rows: questions, loading: questionsLoading } = useFirstReadOpenQuestions(companyId);
  const superseded = useSupersededQuestionCount(companyId ?? null);
  const [openId, setOpenId] = useState<string | null>(null);

  // SP-440: "<Page> — <company name>". The previous title is restored on unmount, so leaving the
  // Brief does not leave its name on another page.
  useEffect(() => {
    if (!operator) return;
    const previous = document.title;
    document.title = workspaceDocumentTitle(WORKSPACE_STRINGS.briefLabel, activeCompany?.name);
    return () => { document.title = previous; };
  }, [operator, activeCompany?.name]);

  if (!operator) {
    return (
      <WorkspaceReadPage eyebrow={pageLabel("brief")} statement={null}>
        <WorkspaceAbsent what="brief" />
      </WorkspaceReadPage>
    );
  }

  // SP-455c: the words the mask must not take for a reviewer, from stored values only.
  const brands = brandWords(activeCompany?.name, storedBrands);
  const rows = needs.map((need) => ({ need, tally: need.tally }));
  const hot = hotspots(rows);
  const works = whatWorks(rows);
  const thin = thinSpots(rows);

  return (
    <div {...{ [OPERATOR_MARK.attr]: "brief" }} data-testid="brief-page">
      <WorkspaceReadPage eyebrow={pageLabel("brief")} statement={WORKSPACE_STRINGS.briefKicker}>
        <p className="fr-ws-brief-draft fr-mono" data-testid="brief-draft">{WORKSPACE_STRINGS.briefDraftMark}</p>
        <p className="fr-ws-brief-note" data-testid="brief-note">{WORKSPACE_STRINGS.briefNote}</p>

        {loading ? null : (
          <>
            {hot.length > 0 ? (
              <ReadBand label={WORKSPACE_STRINGS.bandHotspots} region="hotspots">
                <p className="fr-ws-brief-key fr-mono" data-testid="brief-polarity-key">{WORKSPACE_STRINGS.polarityKey}</p>
                <ul className="fr-ws-brief-rows">
                  {hot.map(({ need }) => (
                    <NeedRow
                      key={need.id}
                      need={need}
                      quotes={need.quotes}
                      brands={brands}
                      counted={need.tally.counted}
                      sites={need.tally.sites.length}
                      barMark={isAtTheBar(need.tally) ? WORKSPACE_STRINGS.atTheBar : null}
                      facts={<p className="fr-ws-brief-facts fr-mono" data-testid="brief-brand-counts">{brandPolarityLines(need.tally).join(" · ")}</p>}
                      openKey={`hot:${need.id}`}
                      openId={openId}
                      setOpenId={setOpenId}
                    />
                  ))}
                </ul>
              </ReadBand>
            ) : null}

            {works.length > 0 ? (
              <ReadBand label={WORKSPACE_STRINGS.bandWhatWorks} region="what-works">
                <ul className="fr-ws-brief-rows">
                  {works.map(({ need }) => {
                    const t = tallyOf(need.workingQuotes, "working");
                    return (
                      <NeedRow
                        key={need.id}
                        need={need}
                        quotes={need.workingQuotes}
                        brands={brands}
                        counted={t.counted}
                        sites={t.sites.length}
                        barMark={null}
                        openKey={`works:${need.id}`}
                        openId={openId}
                        setOpenId={setOpenId}
                      />
                    );
                  })}
                </ul>
              </ReadBand>
            ) : null}

            {thin.length > 0 ? (
              <ReadBand label={WORKSPACE_STRINGS.bandThinSpots} region="thin-spots">
                <ul className="fr-ws-brief-rows">
                  {thin.map(({ need }) => (
                    <NeedRow
                      key={need.id}
                      need={need}
                      quotes={need.quotes}
                      brands={brands}
                      counted={need.tally.counted}
                      sites={need.tally.sites.length}
                      barMark={WORKSPACE_STRINGS.belowTheBar}
                      facts={
                        <p className="fr-ws-brief-reason fr-mono" data-testid="brief-thin-reason">
                          {thinReasonLine(need.tally)} · {thinWithheldLine(need.tally)}
                        </p>
                      }
                      openKey={`thin:${need.id}`}
                      openId={openId}
                      setOpenId={setOpenId}
                    />
                  ))}
                </ul>
              </ReadBand>
            ) : null}

            {!questionsLoading && questions.length > 0 ? (
              <QuestionsBand questions={questions} superseded={superseded} />
            ) : null}
          </>
        )}
      </WorkspaceReadPage>
    </div>
  );
}
