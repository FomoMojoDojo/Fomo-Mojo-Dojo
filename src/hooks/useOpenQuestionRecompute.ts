// V2-4 — the client driver for generate-open-questions. Plan → chunks → finalize, the
// house long-runner pattern: PLAN is zero-write (resume truth), each chunk writes a
// cap-3 slice of anchors, and ONE unscoped finalize marks the ledger complete and
// supersedes orphans. runSeq aborts a stale run on company switch (no cross-company
// writes, no stale progress paint). Resume is automatic: a re-click re-plans and the
// generator reconciles by content identity (banked questions upsert idempotently).
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { packAnchorChunks } from "@/lib/firstRead/packAnchors";

export interface OpenQuestionRunTotals {
  born: number;
  linked: number;
  linkless: number;
  silent_derived: number;
  rejected: number;
}

interface Progress {
  phase: "idle" | "planning" | "generating" | "finalizing" | "done" | "error";
  chunksDone: number;
  chunksTotal: number;
  totals: OpenQuestionRunTotals;
  error?: string;
}

const ZERO: OpenQuestionRunTotals = { born: 0, linked: 0, linkless: 0, silent_derived: 0, rejected: 0 };
const IDLE: Progress = { phase: "idle", chunksDone: 0, chunksTotal: 0, totals: { ...ZERO } };

export function useOpenQuestionRecompute(companyId?: string) {
  const [progress, setProgress] = useState<Progress>(IDLE);
  const [running, setRunning] = useState(false);
  const runSeq = useRef(0);

  // Company switch → abort any in-flight run and reset progress.
  useEffect(() => {
    runSeq.current += 1;
    setRunning(false);
    setProgress(IDLE);
  }, [companyId]);

  const start = useCallback(async () => {
    if (!companyId || running) return;
    const myRun = ++runSeq.current;
    const live = () => runSeq.current === myRun;
    setRunning(true);
    setProgress({ ...IDLE, phase: "planning" });

    try {
      // PLAN — zero write, the anchor manifest.
      const { data: plan, error: planErr } = await supabase.functions.invoke("generate-open-questions", {
        body: { company_id: companyId, plan: true },
      });
      if (!live()) return;
      if (planErr || !plan?.ok) throw new Error(planErr?.message || plan?.error || "plan failed");
      const runId = plan.run_id as string;
      const anchorIds = (plan.anchors as Array<{ identity: string }>).map((a) => a.identity);
      const chunks = packAnchorChunks(anchorIds);
      const totals: OpenQuestionRunTotals = { ...ZERO };
      setProgress({ phase: "generating", chunksDone: 0, chunksTotal: chunks.length, totals: { ...totals } });

      for (let i = 0; i < chunks.length; i++) {
        if (!live()) return;
        try {
          const { data: res } = await supabase.functions.invoke("generate-open-questions", {
            body: { company_id: companyId, run_id: runId, write: true, anchor_identities: chunks[i] },
          });
          const t = res?.totals as Partial<OpenQuestionRunTotals> | undefined;
          if (t) for (const k of Object.keys(totals) as (keyof OpenQuestionRunTotals)[]) totals[k] += t[k] ?? 0;
        } catch {
          // per-chunk isolation: the writes land server-side; keep going (poll-free — the
          // finalize + a re-click reconcile any chunk cut by the gateway).
        }
        if (!live()) return;
        setProgress({ phase: "generating", chunksDone: i + 1, chunksTotal: chunks.length, totals: { ...totals } });
      }

      // FINALIZE — one unscoped call: ledger complete + supersede orphaned anchors.
      if (!live()) return;
      setProgress((p) => ({ ...p, phase: "finalizing" }));
      await supabase.functions.invoke("generate-open-questions", {
        body: { company_id: companyId, run_id: runId, write: true },
      });
      if (!live()) return;
      setProgress((p) => ({ ...p, phase: "done" }));
    } catch (e) {
      if (live()) setProgress((p) => ({ ...p, phase: "error", error: (e as Error).message }));
    } finally {
      if (live()) setRunning(false);
    }
  }, [companyId, running]);

  return { start, running, progress };
}
