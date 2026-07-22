/*
 * First Read · Act 4 — The Gap (content).
 *
 * Renders the FULL open_questions[] list from the preferred public-baseline run
 * (the generator-emitted order is the only ranking — none is invented). Distinct
 * from the story surface's OutsideQuestionAct, which shows a single lead
 * question; here the presenter walks the whole set. Act framing (eyebrow +
 * sentence) is supplied by the rail; this renders only the list, honest-empty
 * when the run carries no questions.
 */

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (Gate 3) ─────────────────
const EMPTY = "The outside read left no open questions for this company.";
// ─────────────────────────────────────────────────────────────────────────────

function openQuestions(run: unknown): string[] {
  if (!run || typeof run !== "object") return [];
  const result = (run as { result_json?: unknown }).result_json;
  if (!result || typeof result !== "object") return [];
  const list = (result as { open_questions?: unknown }).open_questions;
  if (!Array.isArray(list)) return [];
  return list.filter((q): q is string => typeof q === "string" && q.trim().length > 0).map((q) => q.trim());
}

export default function GapAct({ preferredRun }: { preferredRun?: unknown }) {
  const questions = openQuestions(preferredRun);

  if (questions.length === 0) {
    return <p className="cvs-support cvs-gap-empty">{EMPTY}</p>;
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
