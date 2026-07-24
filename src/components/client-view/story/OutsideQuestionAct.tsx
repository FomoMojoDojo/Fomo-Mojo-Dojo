/*
 * Outside · Act 3 — the one open question (CV-2). Read-only.
 *
 * V2-4: renders EXACTLY ONE lead open question from the first_read_open_questions
 * TABLE (the post-findings generator's output) — the SAME source of truth as the
 * First Read's Gap list, so the two surfaces can never show unrelated questions.
 * Takes the first live question in birth order; that order is the only ranking, none
 * is invented.
 *
 * The reference's interpretive "caps everything downstream" headline has no
 * generator — deliberately NOT shipped. When no open question exists the act
 * COLLAPSES (renders nothing): an absent question is not information the
 * client needs surfaced, unlike an absent score.
 */

import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (CV-2) ────────────────────
const EYEBROW = "So what";
const LEAD_IN = "This read leaves one question only you can answer."; // static, company-agnostic
const OQ_LABEL = "Open question";
// ──────────────────────────────────────────────────────────────────────────────

export default function OutsideQuestionAct({ companyId }: { companyId?: string }) {
  const { questions, loading } = useFirstReadOpenQuestions(companyId);
  const question = questions[0] ?? null;

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
