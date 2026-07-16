import { useCompany } from "@/hooks/useCompany";
import { useMarketPortfolio } from "@/hooks/useMarketPortfolio";
import { deriveDiagnoseModel, type DiagnosePair, type FanOutFinding } from "@/lib/marketPortfolio/diagnosePairs";
import type { ResolvedMarket } from "@/lib/marketPortfolio/resolveMarketPortfolio";

/*
 * MPD-D — the Diagnose say/see act (markets). surface:'diagnose' (all
 * registers + pairwise say/see links). READ-ONLY.
 *
 * Signed render rulings (do not re-litigate):
 * - REGISTER-DRIVEN FRAMING is load-bearing: an internal_declared say-side
 *   renders under "You've told us"; an internal_inferred say-side renders under
 *   "Our internal read". NOTHING inferred may read as "you say / told us".
 * - Judge reasons NEVER render (we read ResolvedMarket fields, never
 *   cross_register_pairs[].reason). No tier chips. No choose/resolve affordance.
 * - Declared sides render their verbatim (display_statement); inferred/public
 *   sides render executor + job as SEPARATE lines (never display_statement).
 * - Order: declared "Where they meet" → inferred compact list → granularity
 *   finding (fan-out) → gap cards (said-not-shown, shown-not-said) → question.
 * - Sections render only when populated. One register absent ⇒ honest
 *   not-ready state, never a false "aligned/quiet" claim.
 */

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (MPD-D) ───────────────────
const ACT_EYEBROW = "TODO(sig): Diagnose · Your markets, said next to seen";

const DECLARED_HEADING = "TODO(sig): You've told us";
const DECLARED_SUB = "TODO(sig): drawn from what you've told us — your strategy material";
const SAY_LABEL = "TODO(sig): What you've told us";
const SEE_LABEL = "TODO(sig): What the outside shows";
const INDEPENDENCE_LINE = "TODO(sig): The outside read never saw your documents — it reached the same market on its own.";

const INFERRED_HEADING = "TODO(sig): Our internal read, next to the outside";
const INFERRED_DISCLAIMER =
  "TODO(sig): These pairs come from our reading of your material — not statements you've made. Each is worth confirming with you.";

const GRANULARITY_HEADING = "TODO(sig): One market, cut two ways";
const GRANULARITY_PUBLIC = (n: number) =>
  `TODO(sig): The outside read sees one market where your internal read sees ${n}.`;
const GRANULARITY_INTERNAL = (n: number) =>
  `TODO(sig): Your internal read holds one market the outside read splits into ${n}.`;
const GRANULARITY_CLOSE = "TODO(sig): Neither cut is wrong — which one should your strategy run on?";

const SAID_NOT_SHOWN_HEADING = "TODO(sig): Said, not shown";
const SAID_NOT_SHOWN_DECLARED = "TODO(sig): You've told us about this market — the outside read didn't surface it.";
const SAID_NOT_SHOWN_INFERRED = "TODO(sig): Our internal read surfaces this market — the outside read didn't.";
const SHOWN_NOT_SAID_HEADING = "TODO(sig): Shown, not said";
const SHOWN_NOT_SAID_BODY = "TODO(sig): The outside read surfaces this market — you haven't spoken to it.";

const CLOSING_QUESTION =
  "TODO(sig): Which of these gaps is a choice you've made, and which is drift?";

const NOT_READY_HEADLINE = "TODO(sig): There's nothing to compare yet.";
const NOT_READY_PROMPT =
  "TODO(sig): This view sets what you've told us beside what the outside read shows. One side hasn't been read yet — ask your operator to run market discovery.";
// ──────────────────────────────────────────────────────────────────────────────

// Executor headline + job support line — never the concatenated display_statement.
function MarketLines({ m }: { m: ResolvedMarket }) {
  return (
    <>
      <p className="cvs-dg-exec">{m.job_executor}</p>
      {m.jtbd ? <p className="cvs-dg-job">{m.jtbd}</p> : null}
    </>
  );
}

// The declared "Where they meet" block: two columns, say (verbatim) | see.
function DeclaredPairBlock({ pair }: { pair: DiagnosePair }) {
  return (
    <article className="cvs-dg-meet">
      <div className="cvs-dg-meet-cols">
        <div className="cvs-dg-col">
          <p className="cvs-dg-col-label">{SAY_LABEL}</p>
          {/* Declared side: the client's own strategy material, verbatim —
              framed as "told us", NEVER quoted speech. */}
          <p className="cvs-dg-verbatim">{pair.internal.display_statement}</p>
        </div>
        <div className="cvs-dg-col">
          <p className="cvs-dg-col-label">{SEE_LABEL}</p>
          <MarketLines m={pair.publicSide} />
        </div>
      </div>
      <p className="cvs-dg-independence">{INDEPENDENCE_LINE}</p>
    </article>
  );
}

// One inferred pair — compact, executor-level, say ↔ see on one row.
function InferredPairRow({ pair }: { pair: DiagnosePair }) {
  return (
    <li className="cvs-dg-pairrow">
      <span className="cvs-dg-pairrow-int">{pair.internal.job_executor}</span>
      <span className="cvs-dg-glyph" aria-hidden="true">↔</span>
      <span className="cvs-dg-pairrow-pub">{pair.publicSide.job_executor}</span>
    </li>
  );
}

function GranularityFinding({ finding }: { finding: FanOutFinding }) {
  const n = finding.counterparts.length;
  const lead = finding.anchorClass === "public" ? GRANULARITY_PUBLIC(n) : GRANULARITY_INTERNAL(n);
  return (
    <div className="cvs-dg-gran">
      <p className="cvs-dg-gran-anchor">{finding.anchor.job_executor}</p>
      <p className="cvs-dg-gran-lead">{lead}</p>
      <ul className="cvs-dg-gran-list">
        {finding.counterparts.map((c) => (
          <li key={c.journey_key} className="cvs-dg-gran-cp">{c.job_executor}</li>
        ))}
      </ul>
    </div>
  );
}

function GapCard({ m, kind }: { m: ResolvedMarket; kind: "said" | "shown" }) {
  const body =
    kind === "shown"
      ? SHOWN_NOT_SAID_BODY
      : m.register === "internal_declared"
        ? SAID_NOT_SHOWN_DECLARED
        : SAID_NOT_SHOWN_INFERRED;
  return (
    <article className="cvs-dg-gapcard">
      <MarketLines m={m} />
      <p className="cvs-dg-gap-note">{body}</p>
    </article>
  );
}

export default function DiagnoseMarketAct() {
  const { activeCompany } = useCompany();
  const { loading, portfolio } = useMarketPortfolio(activeCompany?.id, "diagnose");

  if (loading) {
    return (
      <section className="cvs-act cvs-dg" aria-label="Diagnose — markets said next to seen">
        <p className="cvs-act-eyebrow">{ACT_EYEBROW}</p>
        <p className="cvs-hero-empty">Reading your markets…</p>
      </section>
    );
  }

  const model = deriveDiagnoseModel(portfolio?.active ?? [], portfolio?.deferred ?? []);

  return (
    <section className="cvs-act cvs-dg" aria-label="Diagnose — markets said next to seen">
      <p className="cvs-act-eyebrow">{ACT_EYEBROW}</p>

      {!model.ready ? (
        <div className="cvs-dg-notready">
          <p className="cvs-dg-notready-headline">{NOT_READY_HEADLINE}</p>
          <p className="cvs-dg-notready-prompt">{NOT_READY_PROMPT}</p>
        </div>
      ) : (
        <>
          {model.declaredPairs.length > 0 ? (
            <div className="cvs-dg-block">
              <p className="cvs-dg-heading">{DECLARED_HEADING}</p>
              <p className="cvs-dg-subhead">{DECLARED_SUB}</p>
              {model.declaredPairs.map((p) => (
                <DeclaredPairBlock key={`${p.internal.journey_key}|${p.publicSide.journey_key}`} pair={p} />
              ))}
            </div>
          ) : null}

          {model.inferredPairs.length > 0 ? (
            <div className="cvs-dg-block">
              <p className="cvs-dg-heading">{INFERRED_HEADING}</p>
              <p className="cvs-dg-disclaimer">{INFERRED_DISCLAIMER}</p>
              <ul className="cvs-dg-pairlist">
                {model.inferredPairs.map((p) => (
                  <InferredPairRow key={`${p.internal.journey_key}|${p.publicSide.journey_key}`} pair={p} />
                ))}
              </ul>
            </div>
          ) : null}

          {model.fanOut.length > 0 ? (
            <div className="cvs-dg-block">
              <p className="cvs-dg-heading">{GRANULARITY_HEADING}</p>
              <div className="cvs-dg-gran-grid">
                {model.fanOut.map((f) => (
                  <GranularityFinding key={`${f.anchorClass}|${f.anchor.journey_key}`} finding={f} />
                ))}
              </div>
              <p className="cvs-dg-gran-close">{GRANULARITY_CLOSE}</p>
            </div>
          ) : null}

          {model.internalOnly.length > 0 || model.publicOnly.length > 0 ? (
            <div className="cvs-dg-gaps">
              {model.internalOnly.length > 0 ? (
                <div className="cvs-dg-gapcol">
                  <p className="cvs-dg-heading">{SAID_NOT_SHOWN_HEADING}</p>
                  {model.internalOnly.map((m) => (
                    <GapCard key={m.journey_key} m={m} kind="said" />
                  ))}
                </div>
              ) : null}
              {model.publicOnly.length > 0 ? (
                <div className="cvs-dg-gapcol">
                  <p className="cvs-dg-heading">{SHOWN_NOT_SAID_HEADING}</p>
                  {model.publicOnly.map((m) => (
                    <GapCard key={m.journey_key} m={m} kind="shown" />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="cvs-dg-question">{CLOSING_QUESTION}</p>
        </>
      )}
    </section>
  );
}
