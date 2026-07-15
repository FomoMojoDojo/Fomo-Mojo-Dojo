// CV-2d-2c — the client affordance for chunked signal-recurrence recompute:
// plan → cap-5 pair chunks → ONE unscoped finalize. Modeled on
// useClaimDeltaRecompute (CH-2b-2), simpler: judge-only, fixed-size packing.
//
// - Every click starts with plan:true (zero model calls, zero writes) — the
//   manifest is the RESUME TRUTH: frozen pairs are never packed, so a re-click
//   after a kill re-runs only what isn't banked (zero re-judge).
// - Chunks invoke generate-signal-recurrence with {pairs, write:true,
//   run_target} — run_target seeds the START-of-run long_runner_runs ledger
//   row on the run's first writing chunk. Chunk completion is trusted from the
//   HTTP response; a failed chunk surfaces its reason and the loop CONTINUES
//   (per-chunk isolation; banked verdicts make resume cheap).
// - FINALIZE: exactly one unscoped invoke — verdict prune, union-find
//   clusters, the R1 finding↔cluster judge join, finding_recurrence reconcile,
//   ledger terminal update. The finalize can itself make judge calls (R1), so
//   the gateway may cut its response — the ledger row is the sanctioned poll
//   supplement (status leaves 'running' when the isolate lands its write).
// - Progress is company-scoped: runSeq aborts a stale loop on company switch.
//
// All client-facing strings rendered from this hook's state are TODO
// placeholders pending operator signature (they live in the control).

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isFrozenCompany } from "@/lib/frozenCompanies";
import { packPairChunks, type RecurrencePlanPair } from "@/lib/signalRecurrence/packPairChunks";

type PlanResponse = {
  ok: true;
  plan: true;
  candidates_total: number;
  candidates_frozen: number;
  candidates_fresh: number;
  eligible_signals: number;
  pairs: RecurrencePlanPair[];
};

export type RecurrenceChunkOutcome = {
  pairs: number;
  ok: boolean;
  reason?: string;
  seconds?: number;
  // From the chunk response totals — the signed progress line renders
  // "{judged} judged · {skipped} already judged" (skipped = server 'cached').
  judged?: number;
  skipped?: number;
};

export type RecurrenceRecomputeProgress = {
  stage: "plan" | "chunks" | "finalize" | "done";
  totalChunks: number;
  currentChunk: number;
  freshTotal: number;
  frozenTotal: number;
  results: RecurrenceChunkOutcome[];
  finalize:
    | { ok: boolean; reason?: string; seconds?: number; polled?: boolean; joinsOrigin?: number; joinsJudge?: number; clusters?: number }
    | null;
  error: string | null;
};

async function invokeRecurrence(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; reason: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-signal-recurrence", { body });
    if (error) {
      let reason = error.message ? String(error.message) : "request failed";
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const b = (await ctx.json()) as { error?: unknown };
          if (b?.error) reason = String(b.error);
        } catch { /* keep transport message */ }
      }
      return { ok: false, reason };
    }
    if (data && (data as { ok?: unknown }).ok === false) {
      return { ok: false, reason: String((data as { error?: unknown }).error ?? "recompute failed") };
    }
    return { ok: true, data: (data ?? {}) as Record<string, unknown> };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

export function useSignalRecurrenceRecompute(companyId: string) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RecurrenceRecomputeProgress | null>(null);
  const runSeq = useRef(0);

  useEffect(() => {
    runSeq.current += 1;
    setProgress(null);
    setRunning(false);
  }, [companyId]);

  // Finalize poll supplement: the run's long_runner_runs row leaves 'running'
  // when the finalize isolate lands its terminal update behind a gateway cut.
  const waitForFinalize = useCallback(async (): Promise<boolean> => {
    const capMs = 420_000;
    const t0 = Date.now();
    while (Date.now() - t0 < capMs) {
      await new Promise((r) => setTimeout(r, 5000));
      const { data } = await supabase
        .from("long_runner_runs")
        .select("status")
        .eq("run_kind", "signal_recurrence")
        .eq("company_id", companyId)
        .order("started_at", { ascending: false })
        .limit(1);
      const status = (data as Array<{ status?: string }> | null)?.[0]?.status;
      if (status && status !== "running") return status === "completed";
    }
    return false;
  }, [companyId]);

  const start = useCallback(async () => {
    if (!companyId || running) return;
    runSeq.current += 1;
    const myRun = runSeq.current;
    const live = () => runSeq.current === myRun;

    if (isFrozenCompany(companyId)) {
      setProgress({
        stage: "done", totalChunks: 0, currentChunk: 0, freshTotal: 0, frozenTotal: 0, results: [], finalize: null,
        // Operator-signed 2026-07-15.
        error: "Frozen reference company — recurrence isn't recomputed for it.",
      });
      return;
    }

    setRunning(true);
    setProgress({ stage: "plan", totalChunks: 0, currentChunk: 0, freshTotal: 0, frozenTotal: 0, results: [], finalize: null, error: null });
    try {
      // 1) PLAN — zero model calls, zero writes; resume truth.
      const planRes = await invokeRecurrence({ company_id: companyId, plan: true });
      if (!live()) return;
      if (!planRes.ok) {
        // Operator-signed 2026-07-15: run-level / plan failure.
        setProgress((p) => (p
          ? { ...p, stage: "done", error: `Couldn't start the recurrence run — ${planRes.reason}. Nothing was written; re-click to try again.` }
          : p));
        return;
      }
      const plan = planRes.data as unknown as PlanResponse;
      const chunks = packPairChunks(Array.isArray(plan.pairs) ? plan.pairs : []);
      const freshTotal = Number(plan.candidates_fresh ?? 0);
      const frozenTotal = Number(plan.candidates_frozen ?? 0);

      // 2) CHUNKS — cap-5 pairs, per-chunk failure isolation, inline banking.
      const results: RecurrenceChunkOutcome[] = [];
      setProgress({ stage: chunks.length > 0 ? "chunks" : "finalize", totalChunks: chunks.length, currentChunk: 0, freshTotal, frozenTotal, results: [], finalize: null, error: null });
      for (let i = 0; i < chunks.length; i++) {
        if (!live()) return;
        const chunk = chunks[i];
        setProgress({ stage: "chunks", totalChunks: chunks.length, currentChunk: i + 1, freshTotal, frozenTotal, results: [...results], finalize: null, error: null });
        const t0 = Date.now();
        const res = await invokeRecurrence({
          company_id: companyId,
          write: true,
          pairs: chunk,
          run_target: freshTotal,
        });
        if (!live()) return;
        const chunkTotals = res.ok ? ((res.data.totals ?? {}) as Record<string, number>) : null;
        results.push({
          pairs: chunk.length,
          ok: res.ok,
          reason: res.ok ? undefined : res.reason,
          seconds: Math.round((Date.now() - t0) / 1000),
          judged: chunkTotals ? Number(chunkTotals.judged ?? 0) : undefined,
          skipped: chunkTotals ? Number(chunkTotals.cached ?? 0) : undefined,
        });
        setProgress({ stage: "chunks", totalChunks: chunks.length, currentChunk: i + 1, freshTotal, frozenTotal, results: [...results], finalize: null, error: null });
      }

      // 3) FINALIZE — one unscoped run (prune + clusters + R1 join + ledger).
      setProgress({ stage: "finalize", totalChunks: chunks.length, currentChunk: chunks.length, freshTotal, frozenTotal, results: [...results], finalize: null, error: null });
      const finT0 = Date.now();
      const finRes = await invokeRecurrence({ company_id: companyId, write: true });
      if (!live()) return;
      let finalize: RecurrenceRecomputeProgress["finalize"];
      if (finRes.ok) {
        const totals = (finRes.data.totals ?? {}) as Record<string, number>;
        finalize = {
          ok: true,
          seconds: Math.round((Date.now() - finT0) / 1000),
          joinsOrigin: Number(totals.finding_joins_via_origin ?? 0),
          joinsJudge: Number(totals.finding_joins_via_judge ?? 0),
          clusters: Number(totals.clusters ?? 0),
        };
      } else {
        const landed = await waitForFinalize();
        if (!live()) return;
        finalize = landed
          ? { ok: true, seconds: Math.round((Date.now() - finT0) / 1000), polled: true }
          : { ok: false, reason: finRes.reason };
      }
      setProgress({ stage: "done", totalChunks: chunks.length, currentChunk: chunks.length, freshTotal, frozenTotal, results: [...results], finalize, error: null });
    } finally {
      if (live()) setRunning(false);
    }
  }, [companyId, running, waitForFinalize]);

  return { running, progress, start };
}
