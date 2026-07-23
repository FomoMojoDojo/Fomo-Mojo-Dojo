// V2-2 — Act 1 "What You Say": the client's publicly stated problem, in their words.
//
// Renders the client_voice own-domain distillation, guarded at the render boundary
// (admitStatedProblem refuses a canned/generic/empty class → honest-empty). Where a
// verbatim own-domain line was lifted, it renders via the CV-2e SignalQuote ("As
// captured", signed) beside the distillation; quote-less is honest.

import { useFirstReadStatedProblem } from "@/hooks/useFirstReadStatedProblem";
import { admitStatedProblem } from "@/lib/firstRead/statedProblem";
import SignalQuote from "@/components/evidence/SignalQuote";

// ── Client-facing copy — PENDING OPERATOR SIGNATURE ──────────────────────────
const HONEST_EMPTY = "We couldn't find a problem stated on this company's own public site yet.";
// The distillation itself is generated substance the operator signs per company.
// ─────────────────────────────────────────────────────────────────────────────

export default function StatedProblemAct({ companyId }: { companyId?: string }) {
  const { data, loading } = useFirstReadStatedProblem(companyId);

  if (loading) return <p className="cvs-support cvs-fr-statedproblem">Loading…</p>;

  const statement = data?.statement ?? null;
  if (!admitStatedProblem(statement)) {
    // render guard: no real stated problem → honest-empty, NEVER a generic statement
    return <p className="cvs-support cvs-fr-statedproblem">{HONEST_EMPTY}</p>;
  }

  return (
    <div className="cvs-fr-statedproblem">
      <p className="cvs-fr-statedproblem-text">{statement}</p>
      {/* verbatim own-domain anchor when one exists; SignalQuote renders nothing if null */}
      <SignalQuote quote={data!.quote} />
    </div>
  );
}
