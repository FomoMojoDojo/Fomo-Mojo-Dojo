// V2-2 — Act 1 "What You Say": the client's publicly stated problem, in their words.
//
// Renders the client_voice own-domain distillation, guarded at the render boundary
// (admitStatedProblem refuses a canned/generic/empty class → honest-empty). Where a
// verbatim own-domain line was lifted, it renders via the CV-2e SignalQuote ("As
// captured", signed) beside the distillation; quote-less is honest.

import { useFirstReadStatedProblem } from "@/hooks/useFirstReadStatedProblem";
import { admitStatedProblem, statedProblemLabel } from "@/lib/firstRead/statedProblem";
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

  const label = statedProblemLabel(data!.register, data!.descriptive_fallback);
  // V2-3 — a long brief parses into a headline (statement) + up to 4 supporting points,
  // rendered as spaced lines. A short brief has no points and reads as the single line.
  const points = (data!.supporting_points ?? []).filter((p) => typeof p === "string" && p.trim().length > 0);
  return (
    <div className="cvs-fr-statedproblem">
      <p className="cvs-fr-statedproblem-text">{statement}</p>
      {points.length > 0 && (
        <ul className="cvs-fr-statedproblem-points">
          {points.map((p, i) => (
            <li key={i} className="cvs-fr-statedproblem-point">{p}</li>
          ))}
        </ul>
      )}
      {/* provenance label — which source/register fired */}
      <p className="cvs-fr-statedproblem-source">{label}</p>
      {/* verbatim own-domain anchor when one exists; SignalQuote renders nothing if null.
          V2-2b: spacing between the statement and the quote (no vertical bar). */}
      <SignalQuote quote={data!.quote} />
    </div>
  );
}
