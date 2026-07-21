import { useCompany } from "@/hooks/useCompany";
import { useMarketPortfolio } from "@/hooks/useMarketPortfolio";
import { useMarketOptions } from "@/hooks/useMarketOptions";
import ActDefinition from "@/components/client-view/story/ActDefinition";
import type { ResolvedMarket } from "@/lib/marketPortfolio/resolveMarketPortfolio";

/*
 * MPD-3 — Act A: the market portfolio (public register ONLY, via the
 * resolver's surface:'outside' filter — internal markets are Diagnose
 * material and structurally cannot reach this act).
 *
 * Signed render rulings (do not re-litigate):
 * - NO tier chips (one register on this surface); honesty lives in framing.
 * - READ-ONLY: no choose affordance; nothing implies a selection exists.
 * - Executor and job render as SEPARATE lines (never display_statement).
 * - null relationship_kind = no chip, silently.
 * - Deferred markets: one quiet named line, not cards.
 * - Empty state = "not discovered yet" + operator-directed prompt — NEVER
 *   "the public is quiet" (unprovable without a completed-run marker).
 * - Diagnose hand-off line ONLY when internal-declared defs exist.
 *
 * MO-1 RENDER SWAP (operator-confirmed 2026-07-20): when ODI-form market
 * OPTIONS exist for the company, the options render and the blended-def cards
 * STAND DOWN entirely. With no options, this act's behaviour is exactly as
 * before. The two paths never mix: a blended def and an ODI option make
 * incompatible claims about what a market statement IS, and showing both would
 * teach the form and contradict it on the same screen.
 *
 * The option card is EMBODIED — the definition is the card's structure. Its two
 * halves render ONLY from the separate executor_statement / job_statement
 * columns. Nothing is ever split, parsed, or inferred out of one blended
 * string; that is the whole reason market_options exists.
 *
 * Options carry NO kind chip (they have no relationship_kind), no score, no
 * rank, no per-card mark. Truth-status is carried once, by the "Early readings"
 * group header — FRAMING-NOT-CHIPS.
 */

// ── Client-facing copy — SIGNED AS-IS 2026-07-16 (MPD-3 copy) ─────────────────
const EYEBROW = "Act A · The markets we can see";
const BREADTH_LINE = (n: number) =>
  `From your public presence, we can see you serving ${n} different market${n === 1 ? "" : "s"}.`;
const KIND_WHY_PREFIX = "why"; // renders as "why <kind>: <basis>"
const NEW_KIND_NOTE = "a relationship kind we found in your signal";
const DEFERRED_PREFIX = "Also found in your public signal, held aside:";
const CLOSING_INVITE =
  "This is what the outside world reveals — not yet your words. Tell us which of these you truly serve, and who we've missed.";
const DIAGNOSE_HANDOFF =
  "You've also told us privately who you're for — whether your public presence matches is the Diagnose conversation.";
const EMPTY_HEADLINE = "We haven't read your public markets yet.";
const EMPTY_PROMPT = "Market discovery runs from the internal workshop — ask your operator to run the outside read.";
// ──────────────────────────────────────────────────────────────────────────────

// ── MO-1 options copy — OPERATOR-SIGNED VERBATIM 2026-07-20 ──────────────────
// "Early readings" replaces inferred_hypothesis in ALL client-facing copy.
const OPTIONS_DEFINITION =
  "A market is a group of people plus the job they're trying to get done — not an industry, not a product category.";
const OPTIONS_GROUP_HEAD = "Early readings";
const WHO_LABEL = "WHO";
const JOB_LABEL = "THE JOB";
const OPTIONS_INVITE = "These are early readings, not conclusions and are meant for us to discuss.";
// ─────────────────────────────────────────────────────────────────────────────
//
// COPY BOUNDARIES on the options path (do not re-litigate):
//   * BREADTH_LINE is NOT rendered — "we can see you serving N different
//     markets" asserts established fact and does not fit early readings.
//   * CLOSING_INVITE is NOT rendered — it is signed for the blended-def path
//     only. OPTIONS_INVITE above is its options-path counterpart, signed
//     2026-07-20, and carries the invitation to push back.

// The emergent-kind meta-note rule (signed as optional; built as the simple
// set rule): kinds outside this small known set get a subtle note. The chip
// itself renders ANY emergent value.
const KNOWN_KINDS = new Set(["recipient", "buyer", "user", "referrer", "funder", "partner"]);

function KindChip({ market }: { market: ResolvedMarket }) {
  if (!market.relationship_kind) return null; // null kind = no chip, silently
  const isNew = !KNOWN_KINDS.has(market.relationship_kind);
  return (
    <span className="cvs-mv-kindrow">
      <span className="cvs-mv-kindchip">{market.relationship_kind}</span>
      {isNew ? <span className="cvs-mv-kindnew">{NEW_KIND_NOTE}</span> : null}
    </span>
  );
}

export default function MarketAct() {
  const { activeCompany } = useCompany();
  const { loading, portfolio, hasInternalDeclared } = useMarketPortfolio(activeCompany?.id);
  const { loading: optionsLoading, options } = useMarketOptions(activeCompany?.id);

  const active = portfolio?.active ?? [];
  const deferred = portfolio?.deferred ?? [];

  // RENDER SWAP: options present ⇒ options render, blended-def cards stand down.
  const showOptions = !optionsLoading && options.length > 0;

  if (optionsLoading && !loading) {
    return (
      <section className="cvs-act" aria-label="Act A — market options">
        <p className="cvs-act-eyebrow">{EYEBROW}</p>
        <p className="cvs-hero-empty">Reading the public markets…</p>
      </section>
    );
  }

  if (showOptions) {
    return (
      <section className="cvs-act" aria-label="Act A — market options (early readings)">
        <p className="cvs-act-eyebrow">{EYEBROW}</p>
        {/* Content-gated by the shared device: options exist, so it renders. */}
        <ActDefinition definition={OPTIONS_DEFINITION} hasContent={options.length > 0} />

        {/* Truth-status lives HERE, once, for the whole group — not per card. */}
        <div className="cvs-mv-optgroup">
          <p className="cvs-mv-optgroup-head">{OPTIONS_GROUP_HEAD}</p>
          <div className="cvs-mv-optgrid">
            {options.map((o) => (
              /* Embodied card: the halves come ONLY from the separate columns. */
              <article className="cvs-mv-opt" key={o.id}>
                <div className="cvs-mv-opt-half">
                  <p className="cvs-mv-opt-label">{WHO_LABEL}</p>
                  <p className="cvs-mv-opt-who">{o.executor_statement}</p>
                </div>
                <div className="cvs-mv-opt-half">
                  <p className="cvs-mv-opt-label">{JOB_LABEL}</p>
                  <p className="cvs-mv-opt-job">{o.job_statement}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <p className="cvs-mv-invite">{OPTIONS_INVITE}</p>
      </section>
    );
  }

  return (
    <section className="cvs-act" aria-label="Act A — market portfolio (public register)">
      <p className="cvs-act-eyebrow">{EYEBROW}</p>

      {loading ? (
        <p className="cvs-hero-empty">Reading the public markets…</p>
      ) : active.length === 0 && deferred.length === 0 ? (
        <div className="cvs-mv-empty">
          <p className="cvs-mv-empty-headline">{EMPTY_HEADLINE}</p>
          {/* Operator-directed prompt, NOT a client-clickable run affordance. */}
          <p className="cvs-mv-empty-prompt">{EMPTY_PROMPT}</p>
        </div>
      ) : (
        <>
          <p className="cvs-support" style={{ marginTop: 0 }}>{BREADTH_LINE(active.length)}</p>

          <div className="cvs-mv-grid">
            {active.map((m) => (
              <article className="cvs-mv-market" key={m.journey_key}>
                <KindChip market={m} />
                <h3 className="cvs-mv-executor">{m.job_executor}</h3>
                {m.jtbd ? <p className="cvs-mv-jtbd">{m.jtbd}</p> : null}
                {m.relationship_kind && m.relationship_basis ? (
                  <p className="cvs-mv-basis">
                    {KIND_WHY_PREFIX} {m.relationship_kind}: {m.relationship_basis}
                  </p>
                ) : null}
              </article>
            ))}
          </div>

          {deferred.length > 0 ? (
            <p className="cvs-mv-deferred">
              {DEFERRED_PREFIX}{" "}
              {deferred.map((m) => m.job_executor).join(" · ")}
            </p>
          ) : null}

          <p className="cvs-mv-invite">{CLOSING_INVITE}</p>
          {hasInternalDeclared ? <p className="cvs-mv-handoff">{DIAGNOSE_HANDOFF}</p> : null}
        </>
      )}
    </section>
  );
}
