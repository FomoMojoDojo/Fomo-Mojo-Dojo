import { useCompany } from "@/hooks/useCompany";
import { useMarketPortfolio } from "@/hooks/useMarketPortfolio";
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
 */

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (MPD-3) ───────────────────
const EYEBROW = "TODO(sig): Act A · The markets we can see";
const BREADTH_LINE = (n: number) =>
  `TODO(sig): From your public presence, we can see you serving ${n} different market${n === 1 ? "" : "s"}.`;
const KIND_WHY_PREFIX = "TODO(sig): why"; // renders as "why <kind>: <basis>"
const NEW_KIND_NOTE = "TODO(sig): a relationship kind we found in your signal";
const DEFERRED_PREFIX = "TODO(sig): Also found in your public signal, held aside:";
const CLOSING_INVITE =
  "TODO(sig): This is what the outside world reveals — not yet your words. Tell us which of these you truly serve, and who we've missed.";
const DIAGNOSE_HANDOFF =
  "TODO(sig): You've also told us privately who you're for — whether your public presence matches is the Diagnose conversation.";
const EMPTY_HEADLINE = "TODO(sig): We haven't read your public markets yet.";
const EMPTY_PROMPT = "TODO(sig): Market discovery runs from the internal workshop — ask your operator to run the outside read.";
// ──────────────────────────────────────────────────────────────────────────────

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

  const active = portfolio?.active ?? [];
  const deferred = portfolio?.deferred ?? [];

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
