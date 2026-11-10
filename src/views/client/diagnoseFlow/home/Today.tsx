// MH1 · TODAY — PORTED FROM routes/index.tsx (the inset panel) + CardStack.tsx (the stack).
//
// THE STACK IS THE HANDOFF'S, geometry for geometry (K2): 520x470, the pager INSIDE the card's top
// right, the dark CTA bottom left, the ‹ › buttons bottom right inside the card, back cards offset
// 14px / rotated 1.6° / scaled 0.97 per step and tinted per tone, a 500ms slide on its easing. The
// cards cycle, as the handoff's do, so a back card is always visible behind the front one.
//
// CARD 2 IS OMITTED. "A shift" exists only when a mark exists, and the mark is P4 (DATA MAPPING:
// "card 2 only when a mark exists → omit card 2 until then"). CARD 1 is omitted when nobody is
// unnamed (G4). The pager counts whatever is left, so "n of 3" is computed, never typed.
//
// EVERY COUNT ON THIS PANEL comes from useDiagnoseData's rows. Nothing is typed in, a zero segment
// is dropped rather than printed (G3), and the one bar on the panel — the base row's track — is
// filled from the sides of that part present on the map, over two. No percentage is written down.
import { useState, type ReactNode } from "react";
import { HOME, W2, sentence } from "../strings";
import { Headline } from "../walk";
import {
  BASE_PART_COUNT, basePartsAgreed, countSegments, unnamedPeople, unnamedRoles,
  type DiagnoseBasePart, type DiagnoseData,
} from "../useDiagnoseData";

type Card = {
  key: string;
  tone: "base" | "goal" | "market";
  title: string;
  /** Omitted where the signed headline no longer describes what the card shows — see "stands". */
  headline: string | null;
  body: ReactNode;
  cta: string;
};

/** The four signed part names, in the order useDiagnoseData returns them. */
const PART_LABEL: Record<DiagnoseBasePart["key"], (c: string) => string> = {
  promise: () => W2.partPromise,
  positioning: () => W2.partPositioning,
  strategy: () => W2.partStrategy,
  serves: (c) => W2.partServes(c),
};

/** K3 — one row per base part: the signed name, a track, and the state.
 *
 *  THE TRACK IS COMPUTED, NOT CLAIMED. Each part has two sides on the map — what the company
 *  declares and what the outside read shows — so the fill is the sides present over two. That is a
 *  fraction of rows, which is the one thing a bar here is allowed to be.
 *
 *  THE STATE IS THE NONE-YET STATE for every row, because the per-part MARK is P4: nothing on this
 *  surface has been marked, so nothing can read as settled. */
function BaseRow({ part, company }: { part: DiagnoseBasePart; company: string }) {
  const sides = (part.declared === null ? 0 : 1) + (part.outside === null ? 0 : 1);
  return (
    <div className="dg-base-row" data-dg-base={part.key}>
      <span className="dg-base-name">{PART_LABEL[part.key](company)}</span>
      <span className="dg-base-track">
        <span className="dg-base-fill" style={{ width: `${(sides / 2) * 100}%` }} />
      </span>
      <span className="dg-base-state">{HOME.rowNotYet}</span>
    </div>
  );
}

export function Today({ data }: { data: DiagnoseData }) {
  const company = data.company ?? "";
  const [index, setIndex] = useState(0);

  const unnamed = unnamedPeople(data.people);
  const roles = unnamedRoles(data.people);
  const agreed = basePartsAgreed(data.baseParts);

  const cards: Card[] = [];
  if (unnamed.length > 0) {
    cards.push({
      key: "next-step",
      tone: "base",
      title: HOME.card1Title,
      headline: HOME.card1H,
      body: (
        <>
          <p className="dg-card-body">{HOME.card1Body(unnamed.length, company)}</p>
          {/* G4: the roles are listed only when EVERY unnamed record has one. */}
          {roles.length > 0 ? (
            <div className="dg-role-rows">
              {roles.map((role, i) => (
                <span className="dg-role-row" key={i}>
                  <span className="dg-dot" />
                  {role}
                </span>
              ))}
            </div>
          ) : null}
        </>
      ),
      cta: HOME.card1Cta,
    });
  }
  cards.push({
    key: "stands",
    tone: "goal",
    title: HOME.card3Title(company),
    // THE HEADLINE IS OMITTED, NOT REPLACED. The spec signs "Three things end Diagnose." for this
    // card because the spec's version of it carried three outcome rows; K3 replaces those with the
    // FOUR base parts, and a card that says three above four rows is a contradiction a reader can
    // see. The slice's standing rule is to omit rather than mislead — card 2, the "Today:" sub-line,
    // the What-changed badge and the "Rather email?" line all go the same way — so the card is
    // carried by its signed title, body and rows until a base-specific headline is signed.
    headline: null,
    body: (
      <>
        <p className="dg-card-body">{HOME.card3Body}</p>
        <div className="dg-base-rows">
          {data.baseParts.map((part) => <BaseRow part={part} company={company} key={part.key} />)}
        </div>
      </>
    ),
    cta: HOME.card3Cta,
  });
  cards.push({
    key: "ends-with",
    tone: "market",
    title: HOME.card4Title,
    headline: HOME.card4H,
    body: HOME.card4Body(company),
    cta: HOME.card4Cta,
  });

  const front = Math.min(index, cards.length - 1);
  const go = (d: number) => setIndex((v) => (Math.min(v, cards.length - 1) + d + cards.length) % cards.length);

  const docsSent = data.documents.length;
  const docsAdded = data.documents.filter((d) => d.added).length;
  const heard = data.people.filter((p) => p.interviewedAt !== null).length;

  // N7 — EACH ROW IS ONE SENTENCE, state then next, assembled from signed segments by sentence().
  //
  // WHERE G3 APPLIES, AND WHERE G2 DOES. Every row's FIRST segment is its STATE and always renders:
  // "0 in", "0 heard", "0 of 4 parts have both sides" are the state, and G2's other half covers
  // them ("a zero count reads as the signed none-yet string where one exists, else 0"). G3 drops
  // the SECOND segment — the "next" — at zero, because there a zero would claim something that is
  // not happening. Dropping the first segment instead would delete the row's subject: a company
  // with no documents would have no Documents row and no way to learn there could be one.
  type FocusRow = { key: string; label: string; note: string; state: "underway" | "needs" | "notyet" };
  const focusRows: FocusRow[] = [
    {
      key: "documents",
      label: HOME.focusDocuments,
      note: sentence([
        HOME.focusDocsIn(docsSent),
        ...countSegments([{ n: docsAdded, text: HOME.focusDocsAdded(docsAdded) }]),
      ]),
      state: "underway",
    },
    {
      key: "interviews",
      label: HOME.focusInterviews,
      note: sentence([
        HOME.focusHeard(heard),
        ...countSegments([{ n: unnamed.length, text: HOME.focusInterviewsUnnamed(unnamed.length) }]),
      ]),
      state: unnamed.length > 0 ? "needs" : "underway",
    },
    {
      key: "base",
      label: HOME.focusBase,
      note: sentence([HOME.focusBaseNote(agreed, BASE_PART_COUNT)]),
      state: "underway",
    },
    {
      key: "goals",
      label: HOME.focusGoals,
      note: sentence([
        ...countSegments([{ n: data.goals.length, text: HOME.rowGoalNote(data.goals.length) }]),
        HOME.focusGoalsNote(company),
      ]),
      state: "notyet",
    },
    {
      key: "market",
      label: HOME.focusMarket,
      note: sentence([
        ...countSegments([{ n: data.market.length, text: HOME.focusMarketNote(data.market.length) }]),
        HOME.focusMarketChooses(company),
      ]),
      state: "notyet",
    },
  ];
  // A backstop, not a behaviour: every row above keeps a first segment, so none should be empty.
  const focus = focusRows.filter((row) => row.note.length > 0);

  return (
    <section className="dg-sec dg-sec--today" data-dg-section="today" id="dg-today">
      <span className="dg-score-row">
        <span className="dg-dot" />
        <span className="dg-mono">{HOME.todayHere(company)}</span>
      </span>

      <div className="dg-band">
        <span className="dg-today-axis" data-dg-timeline />
        <div className="dg-inset">
          <div className="dg-panel">
            <span className="dg-panel-label">{HOME.todayColumn}</span>
            <div className="dg-cardstack">
              {cards.map((card, k) => {
                // the handoff's stack: position in the cycle drives offset, rotation and depth
                const pos = (k - front + cards.length) % cards.length;
                return (
                  <article
                    className="dg-card"
                    key={card.key}
                    data-tone={card.tone}
                    data-dg-card={card.key}
                    data-dg-pos={pos}
                    aria-hidden={pos !== 0}
                    style={{
                      transform: `translate(${pos * 14}px, ${pos * 14}px) rotate(${pos * 1.6}deg) scale(${1 - pos * 0.03})`,
                      zIndex: cards.length - pos,
                      opacity: pos > 2 ? 0 : 1,
                    }}
                  >
                    <div className="dg-card-top">
                      <span className="dg-card-kicker">
                        <span className="dg-dot" />
                        {card.title}
                      </span>
                      <span className="dg-card-pager">{HOME.pager(k + 1, cards.length)}</span>
                    </div>
                    {card.headline === null
                      ? null
                      : <h2 className="dg-card-h"><Headline text={card.headline} /></h2>}
                    {typeof card.body === "string" ? <p className="dg-card-body">{card.body}</p> : card.body}
                    <div className="dg-card-foot">
                      <button type="button" className="dg-card-cta" tabIndex={pos === 0 ? 0 : -1} disabled>
                        {card.cta}
                      </button>
                      <div className="dg-pager">
                        <button type="button" className="dg-pager-btn" onClick={() => go(-1)} tabIndex={pos === 0 ? 0 : -1}>‹</button>
                        <button type="button" className="dg-pager-btn" onClick={() => go(1)} tabIndex={pos === 0 ? 0 : -1}>›</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="dg-panel">
            <span className="dg-panel-label">{HOME.inFocus}</span>
            <div className="dg-focus-list">
              {focus.map((row) => (
                <div className="dg-focus-row" key={row.key} data-state={row.state} data-dg-focus={row.key}>
                  <div className="dg-focus-head">
                    <span className="dg-focus-label">{row.label}</span>
                    {row.state === "needs" ? <span className="dg-chip" data-kind="dark">{HOME.needsClient(company)}</span> : null}
                  </div>
                  <div className="dg-focus-notes">
                    <span className="dg-focus-note">{row.note}</span>
                  </div>
                </div>
              ))}
            </div>
            {/* N8 — the legend is three swatches, not a sentence about them */}
            <div className="dg-focus-legend" data-dg-focus-legend>
              {([["underway", HOME.legendUnderway], ["needs", HOME.needsClient(company)], ["notyet", HOME.rowNotYet]] as const).map(
                ([kind, label]) => (
                  <span className="dg-leg" key={kind}>
                    <span className="dg-swatch" data-kind={kind} />
                    <span className="dg-small">{label}</span>
                  </span>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
