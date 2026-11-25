// ── THE PATTERN BAND UNDER A HOTSPOT (SP-465 / SP-463 / SP-459, 2026-11-20) ──────────────────────
//
// Under a need that meets the bar, what keeps happening. Each row is one pattern the generator
// proposed and the judge kept, with the strength the SURVIVING quotes earned (SP-428, assigned by
// `patternStrength`, never by the model) and the one representative quote read through `displayQuote`
// — the same masked, verified path every other quote on these pages takes (SP-452 / SP-455c).
//
// NO COUNT IS READ FROM A STORED COLUMN (SP-463). `useNeedPatterns` derives the supporting count and
// the site count from need_pattern_quotes every render.
//
// SP-488: a pattern resting on ONE quote is a mention, not a rule, so those are grouped at the foot
// of the band instead of sitting in the list looking like the rest.
//
// SP-665 (2026-11-24): the band shows the EVIDENCE. The quote is the sentence of the representative
// quote that holds the judge's stored span, with the span's words marked — the First Read's own
// treatment for a matched phrase sitting inside a text (`JobWithProduct`, `.fr-unstated-product`).
// Shown patterns are in strength order; the mentions by polarity.
//
// SP-674 (2026-11-25), board BR4: a row is read ACROSS — three strength bars and the word, a dot in
// the polarity color, the claim, one tick per supporting quote, the sites, and a toggle over the
// quote. The claim is a button that opens the evidence panel (BriefPanel), which is where the draft
// mark and a multi-part pattern's parts now live. The first pattern's quote starts open. The
// "Mentioned once" group is one summary row with its list behind "Show".
import { useId, useState, type ReactNode } from "react";
import { QUOTE_ELLIPSIS, displayQuote, type QuoteRow } from "@/lib/reviewQuote";
import { spanExcerpt } from "@/lib/quoteSpan";
import type { NeedPattern } from "@/hooks/useNeedPatterns";
import {
  WORKSPACE_STRINGS, claimForDisplay, mentionedOnceHeader, orderMentionedOnce, orderShownPatterns,
  patternCoverageLine, patternSupportLine, patternsHeader, polaritySplit, sitesLine, strengthLabel, strengthLevel,
} from "./workspaceNav";

export function RepresentativeQuote({ quote, span, brands, id }: { quote: QuoteRow; span: string | null; brands: readonly string[]; id?: string }) {
  // displayQuote CLIPS and appends the visible ellipsis itself (SP-452: a quote shows in full or
  // with a visible ellipsis), so the view must not add a second one.
  const d = displayQuote(quote, brands);
  if (!d.text) return null;
  // SP-665: the excerpt is cut from the MASKED text — the same text every other quote on the page
  // shows — so a mask can never be undone by the excerpt. Every character below is a slice of it.
  const ex = span ? spanExcerpt(d.text, span) : null;
  if (!ex) {
    // No stored span (a pre-v3 row), or a span that is not in its quote. pattern-citation-guard (c9)
    // says the second cannot happen; if it does, the quote shows as it did before and says so here.
    if (span) console.warn(`[pattern-band] the stored span is not in its quote — showing the quote unmarked (signal ${quote.signalId})`);
    return (
      <blockquote id={id} className="fr-ws-pattern-quote" data-testid="pattern-quote" data-fr-clipped={d.clipped ? "true" : undefined}>
        {d.text}
      </blockquote>
    );
  }
  return (
    <blockquote id={id} className="fr-ws-pattern-quote" data-testid="pattern-quote" data-fr-span="marked"
      data-fr-clipped={ex.cutStart || ex.cutEnd ? "true" : undefined}>
      {ex.cutStart ? `${QUOTE_ELLIPSIS} ` : null}
      {ex.before}
      <span className="fr-unstated-product" data-testid="pattern-quote-span">{ex.marked}</span>
      {ex.after}
      {/* where the quote's own words already end in an ellipsis, a second one is not added */}
      {ex.cutEnd && !/(\.\.\.|…)$/.test(`${ex.marked}${ex.after}`) ? ` ${QUOTE_ELLIPSIS}` : null}
    </blockquote>
  );
}

/** The three strength bars. The strength's own label is their accessible name, so the bars never
 *  say something the word beside them does not. */
export function StrengthBars({ strength, polarity }: { strength: string; polarity: string | null }) {
  return (
    <span className="fr-ws-pattern-bars" role="img" aria-label={strengthLabel(strength, polarity)} data-fr-level={strengthLevel(strength)}>
      <i /><i /><i />
    </span>
  );
}

/** A pattern's polarity as a dot. Where the word is not printed beside it, the word stays in the
 *  dot for a screen reader and as its title — color is never the only carrier (SP-470). */
export function PolarityDot({ polarity, testId }: { polarity: string; testId?: string }) {
  return (
    <span className="fr-ws-pattern-polarity fr-ws-pattern-dot" data-testid={testId} data-fr-polarity={polarity} title={polarity}>
      <span className="sr-only">{polarity}</span>
    </span>
  );
}

/** "7 not working · 1 mixed · 2 working" — each count beside a dot in its color. The dot is
 *  decoration here: the word is printed. */
export function PolarityCounts({ split, testId }: { split: ReadonlyArray<{ polarity: string; n: number }>; testId?: string }) {
  return (
    <>
      {split.map((s) => (
        <span key={s.polarity} className="fr-ws-pol-count" data-testid={testId} data-fr-polarity={s.polarity}>
          <i className="fr-ws-dot fr-ws-pattern-polarity" data-fr-polarity={s.polarity} aria-hidden="true" />
          {s.n} {s.polarity}
        </span>
      ))}
    </>
  );
}

export function PatternBand({ patterns, brands, counted, assigned, selectedId, onSelect, panelSlot }: {
  patterns: readonly NeedPattern[];
  brands: readonly string[];
  /** SP-476: the need's own counted-quote total, and how many of them a surviving pattern covers.
   *  Both derived (SP-463). The line exists because the band reads PART of the evidence and v1 gave
   *  no sign of it — N13's first run put 16 of 44 under a pattern and said so nowhere. */
  counted?: number;
  assigned?: number;
  /** SP-674: the pattern whose evidence panel is open, and the way to open one. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** SP-674: below 1024px the panel sits in the flow, under the selected row. */
  panelSlot?: ReactNode;
}) {
  // SP-488: 'too thin' is exactly one supporting quote — patternStrength returns it for n < 2 and a
  // kept pattern always has at least one. The split is on the STORED strength, not on the derived
  // count, so the group and the label can never disagree about which patterns are in it.
  // SP-665: shown patterns in strength order; the mentions by polarity.
  const rows = orderShownPatterns(patterns.filter((p) => p.strength !== "too thin"));
  const once = orderMentionedOnce(patterns.filter((p) => p.strength === "too thin"));
  const baseId = useId();
  // BR4: the first pattern's quote starts open; every other starts closed.
  const [openQuotes, setOpenQuotes] = useState<ReadonlySet<string>>(() => new Set(rows[0] ? [rows[0].id] : []));
  const [onceOpen, setOnceOpen] = useState(false);
  if (patterns.length === 0) return null;
  const toggleQuote = (id: string) => setOpenQuotes((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <div className="fr-ws-patterns" data-testid="pattern-band">
      <div className="fr-ws-patterns-head">
        <p className="fr-ws-patterns-label fr-mono" data-testid="pattern-band-label">{patternsHeader(rows.length)}</p>
        {typeof counted === "number" && typeof assigned === "number" && counted > 0 ? (
          <p className="fr-ws-pattern-coverage" data-testid="pattern-coverage">{patternCoverageLine(assigned, counted)}</p>
        ) : null}
      </div>
      <ul className="fr-ws-pattern-rows">
        {rows.map((p) => {
          const quoteOpen = openQuotes.has(p.id);
          const quoteId = `${baseId}-q-${p.id}`;
          const selected = selectedId === p.id;
          return (
            <li key={p.id} className="fr-ws-pattern-row" data-testid="pattern-row" data-fr-strength={p.strength}
              data-fr-pattern-id={p.id} data-fr-selected={selected ? "true" : undefined}>
              <span className="fr-ws-pattern-strengthcell">
                <StrengthBars strength={p.strength} polarity={p.polarity} />
                {/* SP-508: the strength reads with the pattern's polarity — a positive pattern on two
                    quotes is a "Possible strength", never a "Possible failure". */}
                <span className="fr-ws-pattern-strength fr-mono" data-testid="pattern-strength">{strengthLabel(p.strength, p.polarity)}</span>
              </span>
              <span className="fr-ws-pattern-claim">
                {/* SP-470: the one polarity this pattern carries. The stored values ARE the three
                    signed words, so they are shown as stored — there is no enum to map. */}
                {p.polarity ? <PolarityDot polarity={p.polarity} testId="pattern-polarity" /> : null}
                <button type="button" className="fr-ws-pattern-name" data-testid="pattern-name"
                  aria-expanded={onSelect ? selected : undefined} onClick={onSelect ? () => onSelect(p.id) : undefined}>
                  {claimForDisplay(p.name)}
                </button>
              </span>
              {/* One tick per supporting quote. The group's name is the signed support line, so the
                  ticks, the number and the sites read as one fact. */}
              <span className="fr-ws-pattern-support" role="group" aria-label={patternSupportLine(p.supporting, p.sites)} data-testid="pattern-support">
                <span className="fr-ws-pattern-ticks fr-ws-pattern-polarity" data-fr-polarity={p.polarity ?? undefined} data-testid="pattern-ticks" aria-hidden="true">
                  {Array.from({ length: p.supporting }, (_, i) => <i key={i} />)}
                </span>
                <span className="fr-ws-pattern-count" data-testid="pattern-supporting">{p.supporting}</span>
              </span>
              <span className="fr-ws-pattern-sites" data-testid="pattern-sites">{sitesLine(p.sites)}</span>
              {p.representative ? (
                <button type="button" className="fr-ws-quote-more fr-ws-pattern-toggle fr-mono" aria-expanded={quoteOpen} aria-controls={quoteId}
                  onClick={() => toggleQuote(p.id)} data-testid="pattern-quote-toggle">
                  <span aria-hidden className="fr-ws-quote-more-caret" data-open={quoteOpen ? "true" : undefined}>&rsaquo;</span>
                  {quoteOpen ? WORKSPACE_STRINGS.quoteHide : WORKSPACE_STRINGS.quoteShow}
                </button>
              ) : <span />}
              {p.representative && quoteOpen
                ? <RepresentativeQuote id={quoteId} quote={p.representative} span={p.representativeSpan ?? null} brands={brands} />
                : null}
              {selected ? panelSlot ?? null : null}
            </li>
          );
        })}
      </ul>
      {/* SP-488 — the one-quote patterns, named but not dressed as rules: no strength row, no
          representative quote. Nothing is hidden; a single mention is simply shown as one. */}
      {once.length > 0 ? (
        <div className="fr-ws-pattern-once" data-testid="pattern-mentioned-once">
          <div className="fr-ws-pattern-once-head">
            <p className="fr-ws-pattern-once-label fr-mono">
              <span data-testid="pattern-once-label" data-fr-count={once.length}>{mentionedOnceHeader(once.length)}</span>
              <span className="fr-ws-pattern-once-split"><PolarityCounts split={polaritySplit(once)} testId="pattern-once-split" /></span>
            </p>
            <button type="button" className="fr-ws-quote-more fr-mono" aria-expanded={onceOpen} aria-controls={`${baseId}-once`}
              onClick={() => setOnceOpen((v) => !v)} data-testid="pattern-once-toggle">
              <span aria-hidden className="fr-ws-quote-more-caret" data-open={onceOpen ? "true" : undefined}>&rsaquo;</span>
              {onceOpen ? WORKSPACE_STRINGS.hide : WORKSPACE_STRINGS.show}
            </button>
          </div>
          {onceOpen ? (
            <ul className="fr-ws-pattern-once-rows" id={`${baseId}-once`}>
              {once.map((p) => (
                <li key={p.id} className="fr-ws-pattern-once-row" data-testid="pattern-once-row">
                  {p.polarity ? <PolarityDot polarity={p.polarity} testId="pattern-once-polarity" /> : null}
                  <span data-testid="pattern-once-name">{claimForDisplay(p.name)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
