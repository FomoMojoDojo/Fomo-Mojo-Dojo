/*
 * First Read · Act 5 — The Gap (open questions).
 *
 * V2-4: renders the open questions from the first_read_open_questions TABLE (the
 * post-findings generator's output, keyed to the findings + publicly_silent deltas
 * they depend on). Birth order is the only ranking; none is invented.
 *
 * V2-8 SHRINK: a set-aside (not_important) verdict in the room DEMOTES the questions
 * linked to that item (by anchor_identity) into a collapsed "set aside by you" group —
 * visible, reversible (toggle the verdict off and they return), never deleted. Same
 * live-in-session path as the Check tally (both read first_read_responses).
 */

import { useFirstReadOpenQuestions } from "@/hooks/useFirstReadOpenQuestions";
import { useSetAsideIdentities } from "@/hooks/useSetAsideIdentities";
import { useReadState } from "@/hooks/useAsyncRead";
import { ActData } from "@/components/client-view/story/ActData";
import { partitionByShrink, setAsideGroupHeading } from "@/lib/firstRead/gapShrink";
import ActRecap from "./ActRecap";
import { GAP_RECAP } from "./recapCopy";

// ── Client-facing copy — OPERATOR-SIGNED 2026-07-23 (Gate 3) ─────────────────
// Exported: Gate 5 export leave-behind reuses the same signed honest-empty line
// for The Gap section (single source — no parallel literal in exportHtml).
export const GAP_EMPTY = "The outside read left no open questions for this company.";
// ─────────────────────────────────────────────────────────────────────────────

export default function GapAct({ companyId, sessionId }: { companyId?: string; sessionId?: string }) {
  // GATE C-2 — gate on the open-questions read (its failure produces GAP_EMPTY). A failed /
  // never-returning read renders the signed error via <ActData> instead of "The outside read
  // left no open questions for this company." (reachable ONLY on a successful zero-question
  // read — byte-identical). useSetAsideIdentities is a SECONDARY read: on failure it degrades
  // to no set-aside demotion (never a false empty), so it gets no separate boundary.
  const { rows, loading, error } = useFirstReadOpenQuestions(companyId);
  const { identities: setAside } = useSetAsideIdentities(sessionId);
  const state = useReadState(loading, error, rows, companyId);

  return (
    <ActData state={state} loading={null}>
      {(rows) => {
        if (rows.length === 0) {
          return <p className="cvs-support cvs-gap-empty">{GAP_EMPTY}</p>;
        }
        const { active, demoted } = partitionByShrink(rows, setAside);
        return (
          <div className="cvs-gap">
            {active.length > 0 ? (
              <ol className="cvs-gap-list">
                {active.map((q, i) => (
                  <li className="cvs-gap-item" key={q.question_text + i}>
                    <span className="cvs-gap-num">{i + 1}</span>
                    <span className="cvs-gap-text">{q.question_text}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="cvs-support cvs-gap-empty">{GAP_EMPTY}</p>
            )}

            {demoted.length > 0 && (
              <details className="cvs-gap-setaside">
                <summary className="cvs-gap-setaside-head">{setAsideGroupHeading(demoted.length)}</summary>
                <ol className="cvs-gap-list cvs-gap-list-demoted">
                  {demoted.map((q, i) => (
                    <li className="cvs-gap-item is-demoted" key={q.question_text + i}>
                      <span className="cvs-gap-text">{q.question_text}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}

            {/* Name-the-moves recap — this branch only renders when rows > 0 (the empty case
                returns GAP_EMPTY earlier), so the gap move genuinely happened. */}
            <ActRecap recap={GAP_RECAP} hasContent={rows.length > 0} />
          </div>
        );
      }}
    </ActData>
  );
}
