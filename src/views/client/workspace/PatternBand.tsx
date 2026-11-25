// ── THE PATTERN BAND UNDER A HOTSPOT (SP-465 / SP-463 / SP-459, 2026-11-20) ──────────────────────
//
// Under a need that meets the bar, what keeps happening. Each row is one pattern the generator
// proposed and the judge kept, with the strength the SURVIVING quotes earned (SP-428, assigned by
// `patternStrength`, never by the model) and the one representative quote read through `displayQuote`
// — the same masked, verified path every other quote on these pages takes (SP-452 / SP-455c).
//
// SP-459: every pattern here has passed the judge and carries the DRAFT mark until a person signs.
// Signing is optional and removes the mark; nothing on this page waits on it, which is why the band
// renders with no signature anywhere in the system.
//
// NO COUNT IS READ FROM A STORED COLUMN (SP-463). `useNeedPatterns` derives the supporting count and
// the site count from need_pattern_quotes every render.
//
// SP-502: a pattern is a CLAIM plus its PARTS, and the parts are what the judge ruled on. They are
// shown, because a reader asked to trust "every part states" has to be able to see what the parts
// were. SP-488: a pattern resting on ONE quote is a mention, not a rule, so those are grouped at the
// foot of the band instead of sitting in the list looking like the rest.
//
// SP-665 (2026-11-24): the band shows the EVIDENCE. The quote is the sentence of the representative
// quote that holds the judge's stored span, with the span's words marked — the First Read's own
// treatment for a matched phrase sitting inside a text (`JobWithProduct`, `.fr-unstated-product`).
// Shown patterns are in strength order; a one-part pattern shows no part line, because its one part
// restates its claim; the "Mentioned once" group has one header with its count and each item carries
// its polarity in the tag the shown patterns use.
import { QUOTE_ELLIPSIS, displayQuote, type QuoteRow } from "@/lib/reviewQuote";
import { spanExcerpt } from "@/lib/quoteSpan";
import type { NeedPattern } from "@/hooks/useNeedPatterns";
import {
  WORKSPACE_STRINGS, claimForDisplay, mentionedOnceHeader, orderMentionedOnce, orderShownPatterns,
  patternCoverageLine, patternSupportLine, strengthLabel,
} from "./workspaceNav";

function RepresentativeQuote({ quote, span, brands }: { quote: QuoteRow; span: string | null; brands: readonly string[] }) {
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
      <blockquote className="fr-ws-pattern-quote" data-testid="pattern-quote" data-fr-clipped={d.clipped ? "true" : undefined}>
        {d.text}
      </blockquote>
    );
  }
  return (
    <blockquote className="fr-ws-pattern-quote" data-testid="pattern-quote" data-fr-span="marked"
      data-fr-clipped={ex.cutStart || ex.cutEnd ? "true" : undefined}>
      {ex.cutStart ? `${QUOTE_ELLIPSIS} ` : null}
      {ex.before}
      <span className="fr-unstated-product" data-testid="pattern-quote-span">{ex.marked}</span>
      {ex.after}
      {/* where the quote's own words already end in an ellipsis, a second one is not added */}
      {ex.cutEnd && !/(\.\.\.|\u2026)$/.test(`${ex.marked}${ex.after}`) ? ` ${QUOTE_ELLIPSIS}` : null}
    </blockquote>
  );
}

export function PatternBand({ patterns, brands, counted, assigned }: {
  patterns: readonly NeedPattern[];
  brands: readonly string[];
  /** SP-476: the need's own counted-quote total, and how many of them a surviving pattern covers.
   *  Both derived (SP-463). The line exists because the band reads PART of the evidence and v1 gave
   *  no sign of it — N13's first run put 16 of 44 under a pattern and said so nowhere. */
  counted?: number;
  assigned?: number;
}) {
  if (patterns.length === 0) return null;
  // SP-488: 'too thin' is exactly one supporting quote — patternStrength returns it for n < 2 and a
  // kept pattern always has at least one. The split is on the STORED strength, not on the derived
  // count, so the group and the label can never disagree about which patterns are in it.
  // SP-665: shown patterns in strength order; the mentions by polarity.
  const rows = orderShownPatterns(patterns.filter((p) => p.strength !== "too thin"));
  const once = orderMentionedOnce(patterns.filter((p) => p.strength === "too thin"));
  return (
    <div className="fr-ws-patterns" data-testid="pattern-band">
      <p className="fr-ws-patterns-label fr-mono">{WORKSPACE_STRINGS.patternsLabel}</p>
      <ul className="fr-ws-pattern-rows">
        {rows.map((p) => (
          <li key={p.id} className="fr-ws-pattern-row" data-testid="pattern-row" data-fr-strength={p.strength}>
            <p className="fr-ws-pattern-meta fr-mono">
              {/* SP-508: the strength reads with the pattern's polarity — a positive pattern on two
                  quotes is a "Possible strength", never a "Possible failure". */}
              <span className="fr-ws-pattern-strength" data-testid="pattern-strength">{strengthLabel(p.strength, p.polarity)}</span>
              {/* SP-470: the one polarity this pattern carries. The stored values ARE the three signed
                  words of the polarity key, so they are shown as stored — there is no enum to map. */}
              {p.polarity ? (
                <span className="fr-ws-pattern-polarity" data-testid="pattern-polarity" data-fr-polarity={p.polarity}>{p.polarity}</span>
              ) : null}
              <span className="fr-ws-pattern-support" data-testid="pattern-support">{patternSupportLine(p.supporting, p.sites)}</span>
              {p.draft ? (
                <span className="fr-ws-pattern-draft" data-testid="pattern-draft">{WORKSPACE_STRINGS.briefDraftMark}</span>
              ) : null}
            </p>
            <p className="fr-ws-pattern-name" data-testid="pattern-name">{claimForDisplay(p.name)}</p>
            {/* SP-502: the parts the judge ruled on, one by one. A pre-v3 row has none and shows the
                claim alone — an empty list is not rendered as an empty list. SP-665: a pattern with
                exactly ONE part shows no part line either: its one part restates its claim. */}
            {(p.parts ?? []).length > 1 ? (
              <ul className="fr-ws-pattern-parts" data-testid="pattern-parts">
                {(p.parts ?? []).map((part, i) => (
                  <li key={`${p.id}-${i}`} className="fr-ws-pattern-part" data-testid="pattern-part">{part}</li>
                ))}
              </ul>
            ) : null}
            {p.representative ? <RepresentativeQuote quote={p.representative} span={p.representativeSpan ?? null} brands={brands} /> : null}
          </li>
        ))}
      </ul>
      {/* SP-488 — the one-quote patterns, named but not dressed as rules: no strength row, no
          representative quote. Nothing is hidden; a single mention is simply shown as one. */}
      {once.length > 0 ? (
        <div className="fr-ws-pattern-once" data-testid="pattern-mentioned-once">
          <p className="fr-ws-pattern-once-label fr-mono">
            <span data-testid="pattern-once-label" data-fr-count={once.length}>{mentionedOnceHeader(once.length)}</span>
          </p>
          <ul className="fr-ws-pattern-once-rows">
            {once.map((p) => (
              <li key={p.id} className="fr-ws-pattern-once-row" data-testid="pattern-once-row">
                {p.polarity ? (
                  <span className="fr-ws-pattern-polarity fr-mono" data-testid="pattern-once-polarity" data-fr-polarity={p.polarity}>{p.polarity}</span>
                ) : null}
                <span data-testid="pattern-once-name">{claimForDisplay(p.name)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {typeof counted === "number" && typeof assigned === "number" && counted > 0 ? (
        <p className="fr-ws-pattern-coverage fr-mono" data-testid="pattern-coverage">
          {patternCoverageLine(assigned, counted)}
        </p>
      ) : null}
    </div>
  );
}
