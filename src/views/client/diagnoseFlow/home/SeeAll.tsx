// MH1 · SEE ALL — the A-SeeAll overlay, strings signed O3, layout signed R1/R2 (Nov 9).
//
// WHAT IT IS FOR. The bottom bar's ☰ See all was a disabled button with nowhere to go; the canvas
// it belongs to was signed on Nov 9 and this is it. Thirteen cards in four columns, each saying
// WHERE IT STANDS TODAY — which is the whole point of the screen, and why a card with no page yet
// still appears: "Not built yet." is information, and hiding the card would not be.
//
// R1 — A SCRIM, NOT A PANEL. The page stays visible underneath, dimmed. The reader is looking at an
// index of their own map, not at a different screen, and an opaque panel broke that.
//
// R1 — IT MUST FIT 1440x900 WITH NO SCROLL. Four columns at equal width, cards at their natural
// height (never stretched to match a neighbour, which wastes the one axis that is tight), and the
// layout test measures the fit rather than trusting it.
//
// ONLY TWO CARDS LINK (O3): Today and The long map, both to this same page — one to the Today zone,
// one to Before. Everything else is disabled, which here means a disabled <button>: not focusable,
// not a link, and its state still read out. No card pretends to a destination it does not have.
//
// EVERY COMPUTED STATE comes from useDiagnoseData's rows through the SAME signed functions the
// Today panel uses — HOME.focusBaseNote, rowGoalNote, focusMarketNote, focusDocsIn, focusHeard,
// focusInterviewsUnnamed. The overlay restates no string and recomputes no count.
import { useEffect, useRef } from "react";
import { HOME, SEEALL } from "../strings";
import { Headline } from "../walk";
import {
  BASE_PART_COUNT, basePartsAgreed, countSegments, unnamedPeople, type DiagnoseData,
} from "../useDiagnoseData";

type Card = {
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly state: string;
  /** Present only on a card that HAS a destination (O3: Today and The long map). */
  readonly go?: "today" | "before";
  /** Today is where the reader already is. */
  readonly current?: boolean;
};

type Column = { readonly key: string; readonly label: string; readonly cards: readonly Card[] };

export function SeeAll({
  data,
  onClose,
  onGoTo,
}: {
  data: DiagnoseData;
  onClose: () => void;
  onGoTo: (section: "today" | "before") => void;
}) {
  const company = data.company ?? "";
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Escape closes, as O3 signs. The listener is on the document because the overlay's own focus may
  // sit on any card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => { closeRef.current?.focus(); }, []);

  const agreed = basePartsAgreed(data.baseParts);
  const unnamed = unnamedPeople(data.people).length;
  const heard = data.people.filter((p) => p.interviewedAt !== null).length;

  // R2 — the four columns, in their signed order.
  const columns: readonly Column[] = [
    {
      key: "now",
      label: HOME.now,
      cards: [
        {
          key: "today",
          title: HOME.todayColumn,
          body: SEEALL.todayBody,
          state: SEEALL.stateOpen,
          go: "today",
          current: true,
        },
        { key: "what-changed", title: HOME.whatChanged, body: SEEALL.whatChangedBody, state: SEEALL.stateNotBuilt },
      ],
    },
    {
      key: "base",
      label: SEEALL.groupBase(company),
      cards: [
        {
          key: "base",
          title: HOME.focusBase,
          body: SEEALL.baseBody(company),
          state: HOME.focusBaseNote(agreed, BASE_PART_COUNT),
        },
        { key: "voices", title: SEEALL.voices, body: SEEALL.voicesBody, state: SEEALL.stateAfterInterviews },
        { key: "reframed", title: SEEALL.reframed, body: SEEALL.reframedBody, state: SEEALL.stateAfterInterviews },
      ],
    },
    {
      key: "choices",
      label: SEEALL.groupChoices,
      cards: [
        {
          key: "goals",
          title: HOME.focusGoals,
          body: SEEALL.goalsBody,
          state: HOME.rowGoalNote(data.goals.length),
        },
        {
          key: "market",
          title: HOME.focusMarket,
          body: SEEALL.marketBody,
          state: HOME.focusMarketNote(data.market.length),
        },
        { key: "needs", title: SEEALL.needs, body: SEEALL.needsBody, state: SEEALL.stateNotBuilt },
        {
          key: "long-map",
          title: SEEALL.longMap,
          body: SEEALL.longMapBody,
          state: SEEALL.stateOpen,
          go: "before",
        },
      ],
    },
    {
      key: "add-learn",
      label: SEEALL.groupAddLearn,
      cards: [
        {
          key: "documents",
          title: HOME.focusDocuments,
          body: SEEALL.documentsBody,
          state: HOME.focusDocsIn(data.documents.length),
        },
        {
          key: "interviews",
          title: HOME.focusInterviews,
          body: SEEALL.interviewsBody,
          // G3 — a zero segment is dropped, so a company with nobody heard reads only what is
          // true. WITH BOTH AT ZERO G3 WOULD LEAVE NOTHING, and O3 requires every card to show
          // where it stands, so the count falls back to G2's other half: a zero count reads as 0.
          state: countSegments([
            { n: heard, text: HOME.focusHeard(heard) },
            { n: unnamed, text: HOME.focusInterviewsUnnamed(unnamed) },
          ]).join(" · ") || HOME.focusHeard(heard),
        },
        { key: "the-dojo", title: SEEALL.theDojo, body: SEEALL.theDojoBody, state: SEEALL.stateNotDesigned },
        { key: "how-it-works", title: SEEALL.howItWorks, body: SEEALL.howItWorksBody, state: SEEALL.stateNotBuilt },
      ],
    },
  ];

  return (
    <div className="dg-seeall" data-dg-seeall role="dialog" aria-modal="true" aria-label={SEEALL.title}>
      <div className="dg-seeall-inner">
        <div className="dg-seeall-head">
          <div>
            <h2 className="dg-seeall-title"><Headline text={SEEALL.title} /></h2>
            <p className="dg-seeall-lede">{SEEALL.lede}</p>
          </div>
          <button type="button" className="dg-seeall-close" data-dg-seeall-close ref={closeRef} onClick={onClose}>
            {SEEALL.close}
          </button>
        </div>

        <div className="dg-seeall-cols">
          {columns.map((column) => (
            <section className="dg-seeall-col" key={column.key} data-dg-seeall-group={column.key}>
              <span className="dg-mono dg-seeall-group-label">{column.label}</span>
              {column.cards.map((card) => (
                <button
                  type="button"
                  className="dg-seeall-card"
                  key={card.key}
                  data-dg-seeall-card={card.key}
                  data-current={card.current === true}
                  data-open={card.go !== undefined}
                  disabled={card.go === undefined}
                  onClick={card.go === undefined ? undefined : () => { onGoTo(card.go!); onClose(); }}
                >
                  <span className="dg-seeall-card-t">{card.title}</span>
                  <span className="dg-seeall-card-d">{card.body}</span>
                  <span className="dg-mono dg-seeall-card-s">{card.state}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
