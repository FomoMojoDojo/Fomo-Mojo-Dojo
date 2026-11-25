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
import { displayQuote, type QuoteRow } from "@/lib/reviewQuote";
import type { NeedPattern } from "@/hooks/useNeedPatterns";
import { WORKSPACE_STRINGS, mentionedOnceLine, patternCoverageLine, patternSupportLine, strengthLabel } from "./workspaceNav";

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
  // SP-488: 'too thin' is exactly one supporting quote — patternStrength returns it for n < 2 and a
  // kept pattern always has at least one. The split is on the STORED strength, not on the derived
  // count, so the group and the label can never disagree about which patterns are in it.
  const rows = patterns.filter((p) => p.strength !== "too thin");
  const once = patterns.filter((p) => p.strength === "too thin");
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
            <p className="fr-ws-pattern-name" data-testid="pattern-name">{p.name}</p>
            {/* SP-502: the parts the judge ruled on, one by one. A pre-v3 row has none and shows the
                claim alone — an empty list is not rendered as an empty list. */}
            {(p.parts ?? []).length > 0 ? (
              <ul className="fr-ws-pattern-parts" data-testid="pattern-parts">
                {(p.parts ?? []).map((part, i) => (
                  <li key={`${p.id}-${i}`} className="fr-ws-pattern-part" data-testid="pattern-part">{part}</li>
                ))}
              </ul>
            ) : null}
            {p.representative ? <RepresentativeQuote quote={p.representative} brands={brands} /> : null}
          </li>
        ))}
      </ul>
      {/* SP-488 — the one-quote patterns, named but not dressed as rules: no strength row, no
          representative quote. Nothing is hidden; a single mention is simply shown as one. */}
      {once.length > 0 ? (
        <div className="fr-ws-pattern-once" data-testid="pattern-mentioned-once">
          <p className="fr-ws-pattern-once-label fr-mono">
            <span data-testid="pattern-once-label">{WORKSPACE_STRINGS.strengthMentionedOnce}</span>
            <span data-testid="pattern-once-count">{mentionedOnceLine(once.length)}</span>
          </p>
          <ul className="fr-ws-pattern-once-rows">
            {once.map((p) => (
              <li key={p.id} className="fr-ws-pattern-once-row" data-testid="pattern-once-row">{p.name}</li>
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
