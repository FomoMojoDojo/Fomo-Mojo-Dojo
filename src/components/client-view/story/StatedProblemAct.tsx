// V2-2 / V2-3b — Act 1 "What You Say": the problem the client stated, in their words.
//
// V2-3b VERBATIM-FIRST: when the client stated a problem on the company page
// (strategic_problem_brief), the hook returns it with verbatim=true and Act 1 renders
// it EXACTLY — no distillation, no model, no headline/points. Paragraph breaks are
// preserved (pre-wrap), with breathing room and no vertical bar. The signed "The problem
// you brought to us" label stays. Only the FALLBACK path (blank brief → site-inferred,
// verbatim=false) is model-generated and stays render-guarded (admitStatedProblem) with
// its own provenance label + verbatim SignalQuote.

import type { CSSProperties } from "react";
import { useFirstReadStatedProblem } from "@/hooks/useFirstReadStatedProblem";
import { admitStatedProblem, statedProblemLabel } from "@/lib/firstRead/statedProblem";
import SignalQuote from "@/components/evidence/SignalQuote";

// ── Client-facing copy — PENDING OPERATOR SIGNATURE ──────────────────────────
const HONEST_EMPTY = "We couldn't find a problem stated on this company's own public site yet.";
// The verbatim brief is the client's own words — never a canned/generic class to guard.
// ─────────────────────────────────────────────────────────────────────────────

// Preserve the client's paragraph breaks exactly (verbatim), no vertical bar.
const verbatimStyle: CSSProperties = { whiteSpace: "pre-wrap" };

export default function StatedProblemAct({ companyId }: { companyId?: string }) {
  const { data, loading } = useFirstReadStatedProblem(companyId);

  if (loading) return <p className="cvs-support cvs-fr-statedproblem">Loading…</p>;
  if (!data) return <p className="cvs-support cvs-fr-statedproblem">{HONEST_EMPTY}</p>;

  const label = statedProblemLabel(data.register, data.descriptive_fallback);

  // ── DECLARED (verbatim): the client's own words, rendered exactly ──────────────
  if (data.verbatim) {
    return (
      <div className="cvs-fr-statedproblem">
        <p className="cvs-fr-statedproblem-text cvs-fr-statedproblem-verbatim" style={verbatimStyle}>{data.statement}</p>
        <p className="cvs-fr-statedproblem-source">{label}</p>
      </div>
    );
  }

  // ── FALLBACK (site-inferred): the model distillation, render-guarded ───────────
  if (!admitStatedProblem(data.statement)) {
    return <p className="cvs-support cvs-fr-statedproblem">{HONEST_EMPTY}</p>;
  }
  return (
    <div className="cvs-fr-statedproblem">
      <p className="cvs-fr-statedproblem-text">{data.statement}</p>
      {/* provenance label — which source/register fired */}
      <p className="cvs-fr-statedproblem-source">{label}</p>
      {/* verbatim own-domain anchor when one exists; SignalQuote renders nothing if null.
          Spacing between the statement and the quote (no vertical bar). */}
      <SignalQuote quote={data.quote} />
    </div>
  );
}
