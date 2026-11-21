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
import { displayQuote, type QuoteRow } from "@/lib/reviewQuote";
import type { NeedPattern } from "@/hooks/useNeedPatterns";
import { WORKSPACE_STRINGS, patternCoverageLine, patternSupportLine, strengthLabel } from "./workspaceNav";

function RepresentativeQuote({ quote, brands }: { quote: QuoteRow; brands: readonly string[] }) {
  // displayQuote CLIPS and appends the visible ellipsis itself (SP-452: a quote shows in full or
   // with a visible ellipsis), so the view must not add a second one.
  const d = displayQuote(quote, brands);
  if (!d.text) return null;
  return (
    <blockquote className="fr-ws-pattern-quote" data-testid="pattern-quote" data-fr-clipped={d.clipped ? "true" : undefined}>
      {d.text}
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
  return (
    <div className="fr-ws-patterns" data-testid="pattern-band">
      <p className="fr-ws-patterns-label fr-mono">{WORKSPACE_STRINGS.patternsLabel}</p>
      <ul className="fr-ws-pattern-rows">
        {patterns.map((p) => (
          <li key={p.id} className="fr-ws-pattern-row" data-testid="pattern-row" data-fr-strength={p.strength}>
            <p className="fr-ws-pattern-meta fr-mono">
              <span className="fr-ws-pattern-strength" data-testid="pattern-strength">{strengthLabel(p.strength)}</span>
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
            <p className="fr-ws-pattern-name" data-testid="pattern-name">{p.name}</p>
            {p.representative ? <RepresentativeQuote quote={p.representative} brands={brands} /> : null}
          </li>
        ))}
      </ul>
      {typeof counted === "number" && typeof assigned === "number" && counted > 0 ? (
        <p className="fr-ws-pattern-coverage fr-mono" data-testid="pattern-coverage">
          {patternCoverageLine(assigned, counted)}
        </p>
      ) : null}
    </div>
  );
}
