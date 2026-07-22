import { useMemo } from "react";
import { useCompany } from "@/hooks/useCompany";
import { admitForSurface } from "@/lib/registerGuard";
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

// MO-2c: the options-path chip. Same markup, same classes and the same signed
// note as the pre-MO-1 KindChip — the only difference is that its kind arrives on
// the option (deterministically traced) rather than on the blended definition.
function OptionKindChip({ kind }: { kind: string }) {
  const isNew = !KNOWN_KINDS.has(kind);
  return (
    <span className="cvs-mv-kindrow">
      <span className="cvs-mv-kindchip">{kind}</span>
      {isNew ? <span className="cvs-mv-kindnew">{NEW_KIND_NOTE}</span> : null}
    </span>
  );
}

export default function MarketAct() {
  const { activeCompany } = useCompany();
  const { loading, portfolio, hasInternalDeclared } = useMarketPortfolio(activeCompany?.id);
  const { loading: optionsLoading, options: rawOptions } = useMarketOptions(activeCompany?.id);

  // RG-1 + RG-2b: the MO-1 options path is routed through the register guard —
  // every option is admit-checked on the 'outside' surface before it renders,
  // exactly like the blended-def path. As of RG-2b the input is EARNED: the
  // generator derives market_register from the finding corpus (fail-toward-
  // internal) and the column default is dropped, so this is real protection, not
  // the vacuous pass RG-1 documented. An internal-register option is now blocked
  // here → honest empty, never substituted.
  const options = useMemo(
    () => rawOptions.filter((o) => admitForSurface(o, "outside")),
    [rawOptions],
  );

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
    // MO-2c GROUP-BY-WHO. At 17 cards the flat grid repeats the same WHO up to six
    // times and the surface reads as noise — MO-1's own noisy-at-scale trigger.
    // Grouping is presentation only: no option is merged, dropped or reordered
    // relative to the others in its group.
    //
    // ORDER (both the existing display law, "the order they were decided in"):
    //   groups  — by their earliest member's position in the created_at ASC list
    //   within  — created_at ASC, i.e. the order the hook already returns
    //
    // CHIP PLACEMENT is per GROUP, and that is structural rather than a choice:
    // the grouping key and the relationship_kind trace are both pure functions of
    // executor_statement, so cards that group together necessarily carry the same
    // kind. The mixed-kind fallback below can therefore never fire on real data —
    // it exists so the invariant cannot break silently if either rule changes.
    const groups: Array<{ key: string; who: string; kind: string | null; mixed: boolean; jobs: typeof options }> = [];
    const byKey = new Map<string, number>();
    for (const o of options) {
      const key = o.executor_statement.trim().toLowerCase().replace(/\s+/g, " ");
      const at = byKey.get(key);
      if (at === undefined) {
        byKey.set(key, groups.length);
        groups.push({ key, who: o.executor_statement, kind: o.relationship_kind ?? null, mixed: false, jobs: [o] });
      } else {
        const g = groups[at];
        g.jobs.push(o);
        if ((o.relationship_kind ?? null) !== g.kind) g.mixed = true;
      }
    }

    return (
      <section className="cvs-act" aria-label="Act A — market options (early readings)">
        <p className="cvs-act-eyebrow">{EYEBROW}</p>
        {/* Content-gated by the shared device: options exist, so it renders. */}
        <ActDefinition definition={OPTIONS_DEFINITION} hasContent={options.length > 0} />

        {/* Truth-status lives HERE, once, for the whole group — not per card. */}
        <div className="cvs-mv-optgroup">
          <p className="cvs-mv-optgroup-head">{OPTIONS_GROUP_HEAD}</p>
          <div className="cvs-mv-optgrid">
            {groups.map((g) => (
              /* A single-job WHO renders as a group of one — uniform, no special case. */
              <article className="cvs-mv-opt" key={g.key}>
                <div className="cvs-mv-opt-half">
                  <p className="cvs-mv-opt-label">{WHO_LABEL}</p>
                  <p className="cvs-mv-opt-who">{g.who}</p>
                  {/* Chip only where the trace earned one. NULL ⇒ no chip, silently. */}
                  {!g.mixed && g.kind ? <OptionKindChip kind={g.kind} /> : null}
                </div>
                <div className="cvs-mv-opt-half">
                  <p className="cvs-mv-opt-label">{JOB_LABEL}</p>
                  {g.jobs.map((o) => (
                    <p className="cvs-mv-opt-job" key={o.id}>
                      {o.job_statement}
                      {/* Fallback only: a group whose members disagree on kind labels
                          each job, so a mixed group can never hide behind one chip. */}
                      {g.mixed && o.relationship_kind ? <OptionKindChip kind={o.relationship_kind} /> : null}
                    </p>
                  ))}
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
