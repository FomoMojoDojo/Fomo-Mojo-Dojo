// ── THE QUOTES BEHIND A COUNT (SP-443 / SP-452 / SP-455b; strings SP-446 B-13) ───────────────────
//
// Every quote on the review group and on the Brief comes through here, and this is the only place
// either surface renders one. `displayQuote` (src/lib/reviewQuote.ts) reads the VERIFIED quote
// (`signals.quote`), masks any reviewer name as a second layer, and clips with a visible ellipsis —
// so a surface cannot render a page fragment, an unmasked name or a silent cut.
//
// SP-455b: the remainder is a CONTROL, not a note. It reveals EVERY remaining quote, using the First
// Read's own pair — "Show all {n}" / "Show fewer" (firstReadPreview/acts.tsx:854), where {n} is the
// total, as it is there. The revealed quotes go through the same `displayQuotes` call as the first
// four, so the masking and date rules apply to all of them by construction, not by a second path.
import { useState } from "react";
import { displayQuotes, type QuoteRow } from "@/lib/reviewQuote";
import { WORKSPACE_STRINGS, brandLabel, showAllLine } from "./workspaceNav";

export const QUOTE_PREVIEW_COUNT = 4;

export function QuoteList({ quotes, brands, testId }: {
  quotes: readonly QuoteRow[];
  /** The company's stored brand words, so the mask never takes a brand for a reviewer (SP-455c). */
  brands?: readonly string[];
  testId?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = displayQuotes(showAll ? quotes : quotes.slice(0, QUOTE_PREVIEW_COUNT), brands ?? []);
  const hasMore = quotes.length > QUOTE_PREVIEW_COUNT;
  return (
    <div className="fr-ws-quotes" data-testid={testId ?? "quote-list"} data-fr-showing={shown.length}>
      {shown.map((q) => (
        <div key={q.signalId} className="fr-ws-quote" data-testid="quote" data-fr-clipped={q.clipped ? "true" : undefined}>
          {/* The quote marks are the surface's, not the stored text's — the stored quote carries none. */}
          {q.text ? <p className="fr-ws-quote-text">{`“${q.text}”`}</p> : null}
          <p className="fr-ws-quote-meta fr-mono">
            {[brandLabel(q.brand), q.site, q.date ?? WORKSPACE_STRINGS.dateNotShown].join(" · ")}
          </p>
        </div>
      ))}
      {hasMore ? (
        <button
          type="button"
          className="fr-ws-quote-more fr-mono"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
          data-testid="quote-show-all"
        >
          <span aria-hidden className="fr-ws-quote-more-caret" data-open={showAll ? "true" : undefined}>&rsaquo;</span>
          {showAll ? WORKSPACE_STRINGS.showFewer : showAllLine(quotes.length)}
        </button>
      ) : null}
    </div>
  );
}
