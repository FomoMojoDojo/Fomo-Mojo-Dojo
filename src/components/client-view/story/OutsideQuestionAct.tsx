/*
 * Outside · Act 3 — the one open question (CV-2). Read-only.
 *
 * Renders EXACTLY ONE open question from the preferred public-baseline run
 * (usePublicBaseline's pickPreferredRun quality selection — the system's
 * existing mechanism, fetched once in ClientStoryView and passed down),
 * taking open_questions[0]: the generator-emitted array
 * order is the only ranking that exists; no ranking is invented.
 *
 * The reference's interpretive "caps everything downstream" headline has no
 * generator — deliberately NOT shipped. When no open question exists the act
 * COLLAPSES (renders nothing): an absent question is not information the
 * client needs surfaced, unlike an absent score.
 */

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (CV-2) ────────────────────
const EYEBROW = "So what";
const LEAD_IN = "This read leaves one question only you can answer."; // static, company-agnostic
const OQ_LABEL = "Open question";
// ──────────────────────────────────────────────────────────────────────────────

function firstOpenQuestion(run: unknown): string | null {
  if (!run || typeof run !== "object") return null;
  const result = (run as { result_json?: unknown }).result_json;
  if (!result || typeof result !== "object") return null;
  const list = (result as { open_questions?: unknown }).open_questions;
  if (!Array.isArray(list)) return null;
  const first = list.find((q) => typeof q === "string" && q.trim());
  return first ? String(first).trim() : null;
}

export default function OutsideQuestionAct({
  preferredRun,
  loading,
}: {
  preferredRun?: unknown;
  loading?: boolean;
}) {
  const question = firstOpenQuestion(preferredRun);

  // Collapse: no question → no act (see header comment).
  if (loading || !question) return null;

  return (
    <section className="cvs-act" aria-label="Outside · Act 3 — Open question">
      <p className="cvs-act-eyebrow">{EYEBROW}</p>
      <p className="cvs-support" style={{ marginTop: 0 }}>{LEAD_IN}</p>
      <div className="cvs-oq">
        <p className="cvs-oq-label">{OQ_LABEL}</p>
        <p className="cvs-oq-text">{question}</p>
      </div>
    </section>
  );
}
