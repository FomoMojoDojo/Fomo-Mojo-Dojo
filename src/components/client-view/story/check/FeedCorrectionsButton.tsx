/*
 * First Read FR-D2 — the corrections-feed trigger.
 *
 * Presenter control on the issued proposal (Act 5), beside the Gate 5 export.
 * Carries the meeting's client corrections into the strategic Declared-vs-Observed
 * reading via the model-free feed-first-read-corrections function. Same visibility
 * rule as the export: it lives on the issued-proposal render, so it only appears
 * once the session is proposal_issued (or later). The feed itself refuses an open
 * session, so the button can never act early.
 *
 * Honest result: it reports exactly what the feed returned — how many corrections
 * were fed, how many met an observed claim (paired) vs stand as open questions
 * (silent) — and an honest-empty line when the meeting produced no corrections.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Client-visible copy — OPERATOR-SIGNED 2026-07-23 (FR-D2) ─────────────────
const LABEL = "Feed corrections to the strategic reading";
const RUNNING = "Feeding…";
const EMPTY_RESULT = "No corrections to feed — the client confirmed or rejected every item.";
const errorLine = (msg: string) => `Couldn't feed corrections: ${msg}`;
const resultLine = (fed: number, paired: number, silent: number) =>
  `${fed} correction${fed === 1 ? "" : "s"} fed — ${paired} met the outside read, ` +
  `${silent === 1 ? "1 stands as an open question" : `${silent} stand as open questions`}.`;
const prunedLine = (n: number) =>
  `${n} prior model rejection${n === 1 ? "" : "s"} overruled by the client's attestation.`;
// OC-3b rider — OPERATOR-SIGNED 2026-08-03 (OC-3). Shown only when contests were born, so
// the operator is pointed at the Contested queue even when there were zero corrections.
const contestsLine = (n: number) =>
  `${n} client pushback${n === 1 ? "" : "s"} recorded — decide each under Contested below.`;
// ──────────────────────────────────────────────────────────────────────────────

type FeedResult = {
  ok?: boolean;
  corrections_fed?: number;
  paired?: number;
  silent?: number;
  rejections_pruned?: number;
  contests_born?: number;
  error?: string;
};

export default function FeedCorrectionsButton({ sessionId }: { sessionId: string }) {
  const [running, setRunning] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [pruned, setPruned] = useState<string | null>(null);
  const [contests, setContests] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const onFeed = async () => {
    setRunning(true);
    setLine(null);
    setPruned(null);
    setContests(null);
    setIsError(false);
    try {
      const { data, error } = await supabase.functions.invoke("feed-first-read-corrections", {
        body: { session_id: sessionId },
      });
      if (error) throw new Error(error.message);
      const r = (data ?? {}) as FeedResult;
      if (r.error) throw new Error(r.error);
      const fed = r.corrections_fed ?? 0;
      if (fed === 0) {
        setLine(EMPTY_RESULT);
      } else {
        setLine(resultLine(fed, r.paired ?? 0, r.silent ?? 0));
        if ((r.rejections_pruned ?? 0) > 0) setPruned(prunedLine(r.rejections_pruned as number));
      }
      // OC-3b: contests are a SEPARATE axis from corrections — surface them independently
      // (Edgewood had 0 corrections but 3 contests) so the operator is sent to the queue.
      if ((r.contests_born ?? 0) > 0) setContests(contestsLine(r.contests_born as number));
    } catch (e) {
      setIsError(true);
      setLine(errorLine(e instanceof Error ? e.message : String(e)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="cvs-fr-feed">
      <button
        type="button"
        className="cvs-pill-ghost cvs-fr-feed-btn"
        onClick={onFeed}
        disabled={running}
      >
        {running ? RUNNING : LABEL}
      </button>
      {line && (
        <p className={`cvs-fr-feed-result${isError ? " is-error" : ""}`} role="status">
          {line}
        </p>
      )}
      {pruned && <p className="cvs-fr-feed-pruned" role="status">{pruned}</p>}
      {contests && <p className="cvs-fr-feed-contests" role="status">{contests}</p>}
    </div>
  );
}
