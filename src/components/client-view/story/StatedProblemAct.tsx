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
import { useReadState } from "@/hooks/useAsyncRead";
import { ActData } from "@/components/client-view/story/ActData";
import { admitStatedProblem, statedProblemLabel } from "@/lib/firstRead/statedProblem";
import SignalQuote from "@/components/evidence/SignalQuote";

// ── Client-facing copy — PENDING OPERATOR SIGNATURE ──────────────────────────
const HONEST_EMPTY = "We couldn't find a problem stated on this company's own public site yet.";
// The verbatim brief is the client's own words — never a canned/generic class to guard.
// ─────────────────────────────────────────────────────────────────────────────

// Preserve the client's paragraph breaks exactly (verbatim), no vertical bar.
const verbatimStyle: CSSProperties = { whiteSpace: "pre-wrap" };

export default function StatedProblemAct({ companyId }: { companyId?: string }) {
  // GATE C-2 — useFirstReadStatedProblem now exposes `error`; useReadState adds the 10s
  // deadline. A failed / never-returning read renders the signed error via <ActData> instead
  // of "We couldn't find a problem stated on this company's own public site yet." (reachable
  // ONLY on a successful read with no declared brief and no signed fallback — byte-identical).
  const { data, loading, error } = useFirstReadStatedProblem(companyId);
  const state = useReadState<typeof data>(loading, error, data, companyId);

  return (
    <ActData state={state} loading={<p className="cvs-support cvs-fr-statedproblem">Loading…</p>}>
      {(data) => {
        if (!data) return <p className="cvs-support cvs-fr-statedproblem">{HONEST_EMPTY}</p>;

        const label = statedProblemLabel(data.register, data.descriptive_fallback);

        // ── DECLARED (verbatim): the client's own words, rendered exactly ──────────
        if (data.verbatim) {
          return (
            <div className="cvs-fr-statedproblem">
              <p className="cvs-fr-statedproblem-text cvs-fr-statedproblem-verbatim" style={verbatimStyle}>{data.statement}</p>
              <p className="cvs-fr-statedproblem-source">{label}</p>
            </div>
          );
        }

        // ── FALLBACK (site-inferred): the model distillation, render-guarded ───────
        if (!admitStatedProblem(data.statement)) {
          return <p className="cvs-support cvs-fr-statedproblem">{HONEST_EMPTY}</p>;
        }
        return (
          <div className="cvs-fr-statedproblem">
            <p className="cvs-fr-statedproblem-text">{data.statement}</p>
            {/* provenance label — which source/register fired */}
            <p className="cvs-fr-statedproblem-source">{label}</p>
            {/* verbatim own-domain anchor when one exists; SignalQuote renders nothing if null. */}
            <SignalQuote quote={data.quote} />
          </div>
        );
      }}
    </ActData>
  );
}
