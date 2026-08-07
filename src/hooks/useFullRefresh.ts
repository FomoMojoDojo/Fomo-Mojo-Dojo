// FULL REFRESH G2 — the one-click server-driven chain (baseline → deltas), watched via the
// ledger so ANY tab shows the true stage on load, and the chain finishes even if the tab closes.
//
// start(): write the parent full_refresh row → invoke public-baseline {chain:true, parent_run_id}
// (fire-and-forget; the baseline tail fires the delta stepper on success, halts the parent on
// failure) → watch the parent + child rows. Progress is READ from long_runner_runs, never held
// in client loop state.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FullRefreshStage = "idle" | "baseline" | "deltas" | "done" | "baseline_failed" | "deltas_failed";

// OPERATOR-SIGNED strings (2026-08-08). The chain-error is the stale-sweep's ledger text (G3).
export const FR_BUTTON_IDLE = "Full refresh";
export const FR_STEP_BASELINE = "Refreshing outside signals (step 1 of 2)…";
export const FR_STEP_DELTAS = "Computing what's changed (step 2 of 2)…";
export const FR_DONE = "Full refresh complete.";
export const FR_HALT = "Outside-signal refresh failed — deltas were not run.";
export const FR_DELTAS_FAILED = "Outside signals updated; delta compute failed.";
export const FR_RESUME = "Outside signals are fresh; deltas pending — run it again to finish.";

export type FullRefreshState = { stage: FullRefreshStage; message: string; running: boolean };

const IDLE: FullRefreshState = { stage: "idle", message: "", running: false };
const WINDOW_MS = 35 * 60_000; // covers a full baseline (~4-5min) + delta loop with headroom.

export function useFullRefresh(companyId?: string, companyName?: string, website?: string | null) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FullRefreshState>(IDLE);
  const pollRef = useRef<number | null>(null);
  const parentRef = useRef<string | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Derive the chain stage from the ledger: parent full_refresh + its baseline/deltas children.
  const readChain = useCallback(async (parentId: string | null): Promise<FullRefreshState | null> => {
    if (!companyId) return null;
    const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
    let pid = parentId;
    if (!pid) {
      const { data: parent } = await supabase
        .from("long_runner_runs")
        .select("id")
        .eq("company_id", companyId).eq("run_kind", "full_refresh")
        .gte("started_at", sinceIso)
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      pid = parent ? String((parent as { id: string }).id) : null;
    }
    if (!pid) return null;
    parentRef.current = pid;
    const { data: rows } = await supabase
      .from("long_runner_runs")
      .select("id, run_kind, status")
      .or(`id.eq.${pid},parent_run_id.eq.${pid}`);
    const list = (rows ?? []) as Array<{ id: string; run_kind: string; status: string }>;
    const parent = list.find((r) => r.id === pid);
    const baseline = list.find((r) => r.run_kind === "public_baseline");
    const deltas = list.find((r) => r.run_kind === "claim_deltas");

    if (parent?.status === "completed" || deltas?.status === "completed") {
      return { stage: "done", message: FR_DONE, running: false };
    }
    if (deltas?.status === "failed") return { stage: "deltas_failed", message: FR_DELTAS_FAILED, running: false };
    if (baseline?.status === "failed") return { stage: "baseline_failed", message: FR_HALT, running: false };
    if (baseline?.status === "completed") {
      // baseline done; deltas running or not yet started (pending is still a live chain).
      return { stage: "deltas", message: deltas ? FR_STEP_DELTAS : FR_RESUME, running: true };
    }
    return { stage: "baseline", message: FR_STEP_BASELINE, running: true };
  }, [companyId]);

  const startPolling = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      const s = await readChain(parentRef.current);
      if (!s) return;
      setState(s);
      if (!s.running) {
        stopPoll();
        queryClient.invalidateQueries({ queryKey: ["strategic-delta", companyId] });
      }
    }, 5000) as unknown as number;
  }, [readChain, stopPoll, queryClient, companyId]);

  // On mount / company switch: reflect any live chain from the ledger (headless-visible).
  useEffect(() => {
    stopPoll();
    parentRef.current = null;
    setState(IDLE);
    let cancelled = false;
    void (async () => {
      const s = await readChain(null);
      if (!cancelled && s) { setState(s); if (s.running) startPolling(); }
    })();
    return () => { cancelled = true; stopPoll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const start = useCallback(async () => {
    if (!companyId || !companyName || !website?.trim() || state.running) return;
    setState({ stage: "baseline", message: FR_STEP_BASELINE, running: true });
    const { data: parent, error } = await supabase
      .from("long_runner_runs")
      .insert({ run_kind: "full_refresh", company_id: companyId, status: "running" })
      .select("id").single();
    if (error || !parent) { setState({ stage: "baseline_failed", message: FR_HALT, running: false }); return; }
    const parentId = String((parent as { id: string }).id);
    parentRef.current = parentId;
    // Fire stage 1 with the chain flag; the baseline tail fires stage 2 on success. Not awaited.
    void supabase.functions.invoke("public-baseline", {
      body: { company_id: companyId, company_name: companyName, website, chain: true, parent_run_id: parentId },
    });
    startPolling();
  }, [companyId, companyName, website, state.running, startPolling]);

  return { state, start };
}
