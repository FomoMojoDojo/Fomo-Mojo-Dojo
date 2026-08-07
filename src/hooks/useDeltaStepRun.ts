// FULL REFRESH · Gate 1 — the client affordance for the SERVER-SIDE delta stepper.
//
// Retires the client-side plan→chunks→finalize loop (useClaimDeltaRecompute): the loop now
// lives in the refresh-deltas-step edge function, which self-chains and owns a child
// long_runner_runs row (run_kind='claim_deltas'). This hook only (1) FIRES the stepper and
// (2) WATCHES that ledger row — so progress is read FROM the ledger and ANY tab shows the true
// state on load, even one that never clicked. No loop, no chunk math, no finalize poll here.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isFrozenCompany } from "@/lib/frozenCompanies";

export type DeltaStepState = {
  status: "idle" | "running" | "completed" | "failed" | "frozen";
  target: number | null; // total chunks (set on the stepper's first plan)
  done: number; // chunks banked so far
  error: string | null;
};

const IDLE: DeltaStepState = { status: "idle", target: null, done: 0, error: null };
// The chain-identity window mirrors the stepper's (a running claim_deltas row started recently).
const WINDOW_MS = 25 * 60_000;

export function useDeltaStepRun(companyId: string) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<DeltaStepState>(IDLE);
  const pollRef = useRef<number | null>(null);

  const readLedger = useCallback(async (): Promise<DeltaStepState | null> => {
    if (!companyId) return null;
    const sinceIso = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data } = await supabase
      .from("long_runner_runs")
      .select("status, target_count, done_count, error_text, started_at")
      .eq("company_id", companyId).eq("run_kind", "claim_deltas")
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    const row = data as { status?: string; target_count?: number | null; done_count?: number | null; error_text?: string | null };
    const status = row.status === "completed" ? "completed" : row.status === "failed" ? "failed" : "running";
    return { status, target: row.target_count ?? null, done: row.done_count ?? 0, error: row.error_text ?? null };
  }, [companyId]);

  const stopPoll = useCallback(() => {
    if (pollRef.current !== null) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // On mount / company switch: reflect any live chain from the ledger (headless-visible).
  useEffect(() => {
    stopPoll();
    setState(IDLE);
    let cancelled = false;
    void (async () => {
      const s = await readLedger();
      if (!cancelled && s) {
        setState(s);
        if (s.status === "running") startPolling();
      }
    })();
    return () => { cancelled = true; stopPoll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const startPolling = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      const s = await readLedger();
      if (!s) return;
      setState(s);
      if (s.status !== "running") {
        stopPoll();
        queryClient.invalidateQueries({ queryKey: ["strategic-delta", companyId] });
      }
    }, 4000) as unknown as number;
  }, [readLedger, stopPoll, queryClient, companyId]);

  const start = useCallback(async () => {
    if (!companyId) return;
    if (isFrozenCompany(companyId)) {
      setState({ status: "frozen", target: null, done: 0, error: "This is a frozen reference company — deltas aren't recomputed for it." });
      return;
    }
    if (state.status === "running") return;
    setState({ status: "running", target: null, done: 0, error: null });
    // Fire the stepper (it self-chains server-side). We do not await the whole loop.
    void supabase.functions.invoke("refresh-deltas-step", { body: { company_id: companyId } });
    startPolling();
  }, [companyId, state.status, startPolling]);

  return { state, start };
}
