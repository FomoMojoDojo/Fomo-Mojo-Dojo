/*
 * First Read · Act 4 — The Gap (content).
 *
 * V2-4: renders the open questions from the first_read_open_questions TABLE (the
 * post-findings generator's output, keyed to the findings + publicly_silent deltas
 * they depend on) — NOT the old result_json.open_questions[] json path. The
 * generator-emitted (birth) order is the only ranking; none is invented. Distinct
 * from the story surface's OutsideQuestionAct, which shows a single lead question;
 * here the presenter walks the whole set. Act framing (eyebrow + sentence) is
 * supplied by the rail; this renders only the list, honest-empty when no live
 * questions exist for the company.
 */

import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";

// ── Client-facing copy — OPERATOR-SIGNED 2026-07-23 (Gate 3) ─────────────────
// Exported: Gate 5 export leave-behind reuses the same signed honest-empty line
// for The Gap section (single source — no parallel literal in exportHtml).
export const GAP_EMPTY = "The outside read left no open questions for this company.";
// ─────────────────────────────────────────────────────────────────────────────

export default function GapAct({ companyId }: { companyId?: string }) {
  const { questions, loading } = useFirstReadOpenQuestions(companyId);

  if (loading) return null;
  if (questions.length === 0) {
    return <p className="cvs-support cvs-gap-empty">{GAP_EMPTY}</p>;
  }

  return (
    <ol className="cvs-gap-list">
      {questions.map((q, i) => (
        <li className="cvs-gap-item" key={i}>
          <span className="cvs-gap-num">{i + 1}</span>
          <span className="cvs-gap-text">{q}</span>
        </li>
      ))}
    </ol>
  );
}
