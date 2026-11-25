// ── THE EVIDENCE PANEL (SP-674, board BR1b, 2026-11-25) ───────────────────────────────────────────
//
// One pattern, opened from its claim: where it sits among its need's patterns, how strong it is and
// what it says about the outcome, the two numbers it rests on, the quote the judge picked with the
// matched words marked, and every supporting quote behind one opener.
//
// IT IS A REGION BESIDE THE PAGE, NOT A DIALOG. From 1024px it takes its width out of the page's own
// row, so the page narrows and nothing is covered; below that it sits in the flow under the row it
// belongs to. Focus is therefore not trapped. Opening it moves focus to its heading; Escape and the
// close button hand focus back to the row (BriefPage owns both).
//
// What moved here from the pattern row (SP-674 ruling 1): the draft mark, and the parts line of a
// pattern with two or three parts (SP-502 — a one-part pattern's part restates its claim, SP-665).
// The supporting quotes go through QuoteList, the one place a quote list is rendered (SP-443).
import { useEffect, useRef, useState } from "react";
import type { QuoteRow } from "@/lib/reviewQuote";
import type { NeedPattern } from "@/hooks/useNeedPatterns";
import { RepresentativeQuote, StrengthBars } from "./PatternBand";
import { QuoteList } from "./QuoteList";
import { WORKSPACE_STRINGS, allQuotesLine, claimForDisplay, panelPositionLine, strengthLabel } from "./workspaceNav";

export function BriefPanel({ pattern, index, total, quotes, brands, inflow, onClose }: {
  pattern: NeedPattern;
  /** 1-based position among its need's shown patterns, and how many there are. */
  index: number;
  total: number;
  /** The pattern's supporting quotes, brand filled by the page. */
  quotes: readonly QuoteRow[];
  brands: readonly string[];
  /** Below 1024px: rendered in the flow under the row, not beside the page. */
  inflow?: boolean;
  onClose: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [quotesOpen, setQuotesOpen] = useState(false);
  // A newly opened pattern takes focus at its heading and starts with its quote list closed.
  useEffect(() => { setQuotesOpen(false); titleRef.current?.focus({ preventScroll: true }); }, [pattern.id]);
  const parts = pattern.parts ?? [];
  return (
    <aside className="fr-ws-brief-panel" aria-label={WORKSPACE_STRINGS.panelAria} data-testid="brief-panel"
      data-fr-inflow={inflow ? "true" : undefined} data-fr-pattern={pattern.id}>
      <div className="fr-ws-brief-panel-head">
        <p className="fr-ws-brief-panel-pos fr-mono" data-testid="brief-panel-position">{panelPositionLine(index, total)}</p>
        <button type="button" className="fr-ws-brief-panel-close" aria-label={WORKSPACE_STRINGS.close} onClick={onClose} data-testid="brief-panel-close">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
            <path d="M2 2 L12 12 M12 2 L2 12" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <p className="fr-ws-brief-panel-meta">
        <StrengthBars strength={pattern.strength} polarity={pattern.polarity} />
        <span className="fr-ws-pattern-strength fr-mono" data-testid="brief-panel-strength">{strengthLabel(pattern.strength, pattern.polarity)}</span>
        {pattern.polarity ? (
          <span className="fr-ws-brief-panel-polarity" data-testid="brief-panel-polarity">
            <i className="fr-ws-dot fr-ws-pattern-polarity" data-fr-polarity={pattern.polarity} aria-hidden="true" />
            {pattern.polarity}
          </span>
        ) : null}
      </p>
      <h2 ref={titleRef} tabIndex={-1} className="fr-ws-brief-panel-title" data-testid="brief-panel-title">{claimForDisplay(pattern.name)}</h2>
      {parts.length > 1 ? (
        <ul className="fr-ws-pattern-parts" data-testid="pattern-parts">
          {parts.map((part, i) => (
            <li key={`${pattern.id}-${i}`} className="fr-ws-pattern-part" data-testid="pattern-part">{part}</li>
          ))}
        </ul>
      ) : null}
      <dl className="fr-ws-brief-panel-facts">
        <div className="fr-ws-brief-panel-fact">
          <dt className="fr-mono">{WORKSPACE_STRINGS.panelSupportingQuotes}</dt>
          <dd data-testid="brief-panel-supporting">{pattern.supporting}</dd>
        </div>
        <div className="fr-ws-brief-panel-fact">
          <dt className="fr-mono">{WORKSPACE_STRINGS.panelSites}</dt>
          <dd data-testid="brief-panel-sites">{pattern.sites}</dd>
        </div>
      </dl>
      {pattern.representative ? (
        <>
          <p className="fr-ws-brief-panel-label fr-mono">{WORKSPACE_STRINGS.panelQuoteLabel}</p>
          <RepresentativeQuote quote={pattern.representative} span={pattern.representativeSpan ?? null} brands={brands} />
          {pattern.representativeSpan ? <p className="fr-ws-brief-panel-note" data-testid="brief-panel-note">{WORKSPACE_STRINGS.panelNote}</p> : null}
        </>
      ) : null}
      <div className="fr-ws-brief-panel-foot">
        {/* SP-459: an unsigned pattern carries the draft mark. */}
        {pattern.draft ? <span className="fr-ws-brief-draft fr-mono" data-testid="pattern-draft">{WORKSPACE_STRINGS.briefDraftMark}</span> : <span />}
        {quotes.length > 0 ? (
          <button type="button" className="fr-ws-review-open fr-mono" aria-expanded={quotesOpen} onClick={() => setQuotesOpen((v) => !v)} data-testid="brief-panel-all-quotes">
            {allQuotesLine(quotes.length)} {quotesOpen ? "↑" : "↓"}
          </button>
        ) : null}
      </div>
      {quotesOpen ? <QuoteList quotes={quotes} brands={brands} testId="brief-panel-quotes" /> : null}
    </aside>
  );
}
