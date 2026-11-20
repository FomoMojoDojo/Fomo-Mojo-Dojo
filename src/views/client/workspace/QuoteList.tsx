// ── THE QUOTES BEHIND A COUNT (SP-443 / SP-452; strings SP-446 B-13, B-14) ───────────────────────
//
// Every quote on the review group and on the Brief comes through here, and this is the only place
// either surface renders one. `displayQuote` (src/lib/reviewQuote.ts) reads the VERIFIED quote
// (`signals.quote`), masks any reviewer name as a second layer, and clips with a visible ellipsis —
// so a surface cannot render a page fragment, an unmasked name or a silent cut.
//
// The list shows the first QUOTE_PREVIEW_COUNT quotes and then states the remainder (B-14): the
// count control above says how many quotes there are, this footer says how many are not on screen.
import { displayQuotes, type QuoteRow } from "@/lib/reviewQuote";
import { WORKSPACE_STRINGS, moreMaskedLine } from "./workspaceNav";

export const QUOTE_PREVIEW_COUNT = 4;

export function QuoteList({ quotes, testId }: { quotes: readonly QuoteRow[]; testId?: string }) {
  const shown = displayQuotes(quotes.slice(0, QUOTE_PREVIEW_COUNT));
  const remaining = quotes.length - shown.length;
  return (
    <div className="fr-ws-quotes" data-testid={testId ?? "quote-list"}>
      {shown.map((q) => (
        <div key={q.signalId} className="fr-ws-quote" data-testid="quote" data-fr-clipped={q.clipped ? "true" : undefined}>
          {/* The quote marks are the surface's, not the stored text's — the stored quote carries none. */}
          {q.text ? <p className="fr-ws-quote-text">{`“${q.text}”`}</p> : null}
          <p className="fr-ws-quote-meta fr-mono">
            {[q.brand, q.site, q.date ?? WORKSPACE_STRINGS.dateNotShown].join(" · ")}
          </p>
        </div>
      ))}
      {remaining > 0 ? (
        <p className="fr-ws-quote-foot fr-mono" data-testid="quote-foot">{moreMaskedLine(remaining)}</p>
      ) : null}
    </div>
  );
}
