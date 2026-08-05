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
import { useReadState } from "@/hooks/useAsyncRead";
import { ActData } from "@/components/client-view/story/ActData";

// ── Client-facing copy — PENDING OPERATOR SIGNATURE (CV-2) ────────────────────
const EYEBROW = "So what";
const LEAD_IN = "This read leaves one question only you can answer."; // static, company-agnostic
const OQ_LABEL = "Open question";
// ──────────────────────────────────────────────────────────────────────────────

export default function OutsideQuestionAct({ companyId }: { companyId?: string }) {
  // GATE C-2 — this act renders NO false-absence string: on a genuine empty it COLLAPSES to
  // nothing (signed design ruling — an absent question is not information the client needs).
  // The migration only surfaces a FAILED / never-returning read as the signed error via
  // <ActData>, where the act previously collapsed SILENTLY (no indication anything was wrong).
  // Genuine empty and loading still collapse — byte-identical.
  const { questions, loading, error } = useFirstReadOpenQuestions(companyId);
  const state = useReadState(loading, error, questions, companyId);

  return (
    <ActData state={state} loading={null}>
      {(questions) => {
        const question = questions[0] ?? null;
        if (!question) return null; // collapse on genuine empty (byte-identical)
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
      }}
    </ActData>
  );
}
