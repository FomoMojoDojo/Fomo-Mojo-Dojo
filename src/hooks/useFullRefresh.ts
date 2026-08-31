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
import { isFrozenCompany } from "@/lib/frozenCompanies";

export type FullRefreshStage = "idle" | "baseline" | "deltas" | "done" | "done_empty" | "baseline_failed" | "deltas_failed" | "invoke_failed" | "frozen";

// OPERATOR-SIGNED strings (2026-08-08). The chain-error is the stale-sweep's ledger text (G3).
export const FR_BUTTON_IDLE = "Full refresh";
export const FR_STEP_BASELINE = "Refreshing outside signals (step 1 of 2)…";
export const FR_STEP_DELTAS = "Computing what's changed (step 2 of 2)…";
export const FR_DONE = "Full refresh complete.";
// FIRST-RUN EARNED EMPTY (public-only, no declared side). The server closes the parent full_refresh
// completed and stamps the "no declared side" ledger text (no delta stepper is fired). The outside
// surface renders this as a CALM completion — a looked-and-found-the-outside-view state — never a
// red error and never the stale "no signals collected" line. Header + two body lines below.
export const FR_EMPTY_HEADER = "Outside read complete";
export const FR_EMPTY_BODY_1 = "We've read the public record — this is the outside world's view of the company.";
export const FR_EMPTY_BODY_2 = "The comparison — how that lines up against your own direction — appears once you add your internal view. There's nothing to hold it against yet.";
// The ledger substring the server stamps on the completed-empty parent/child (kept in sync with
// _shared/deltaChainGate.ts NO_DECLARED_SIDE_LEDGER_TEXT — matched loosely so wording tweaks on
// either side never silently drop the earned-empty read).
const EMPTY_LEDGER_MATCH = /no declared side/i;
export const FR_HALT = "Outside-signal refresh failed — deltas were not run.";
export const FR_DELTAS_FAILED = "Outside signals updated; delta compute failed.";
export const FR_RESUME = "Outside signals are fresh; deltas pending — run it again to finish.";
// The refresh never STARTED — the invoke didn't reach/run the server, so no ledger row exists.
// This is a DIFFERENT failure from a baseline that ran and failed (FR_HALT); it must not borrow
// the halt string, which would falsely claim the baseline ran.
export const FR_INVOKE_FAILED = "The refresh couldn't start — nothing was run or changed. Check the connection and try again.";
// FROZEN reference fixture (CB1). A courtesy refusal shown BEFORE any invoke, so a full refresh
// aimed at a frozen company never even fires the chain. The server enforces this authoritatively
// (public-baseline refuses before any write); this is the fast, honest client-side message.
export const FR_FROZEN = "This is a frozen reference company — outside signals aren't refreshed for it.";

export type FullRefreshState = { stage: FullRefreshStage; message: string; running: boolean };

const IDLE: FullRefreshState = { stage: "idle", message: "", running: false };
const WINDOW_MS = 35 * 60_000; // covers a full baseline (~4-5min) + delta loop with headroom.
// If no parent full_refresh row appears within this grace of firing, the invoke never reached
// the server (public-baseline opens the parent BEFORE its work) → INVOKE_FAILED, not a halt.
const INVOKE_GRACE_MS = 30_000;

export function useFullRefresh(companyId?: string, companyName?: string, website?: string | null) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FullRefreshState>(IDLE);
  const pollRef = useRef<number | null>(null);
  const parentRef = useRef<string | null>(null);
  const firedAtRef = useRef<number | null>(null); // set on start(); gates the INVOKE_FAILED grace.

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
      .select("id, run_kind, status, error_text")
      .or(`id.eq.${pid},parent_run_id.eq.${pid}`);
    const list = (rows ?? []) as Array<{ id: string; run_kind: string; status: string; error_text: string | null }>;
    const parent = list.find((r) => r.id === pid);
    const baseline = list.find((r) => r.run_kind === "public_baseline");
    const deltas = list.find((r) => r.run_kind === "claim_deltas");

    // FIRST-RUN EARNED EMPTY: a completed row carrying the "no declared side" ledger text is the
    // public-only outcome (no internal view to compare against yet) — a completion, rendered calm.
    const isEmptyTerminal = (r?: { status: string; error_text: string | null }) =>
      r?.status === "completed" && EMPTY_LEDGER_MATCH.test(r?.error_text ?? "");
    if (isEmptyTerminal(parent) || isEmptyTerminal(deltas)) {
      return { stage: "done_empty", message: FR_EMPTY_HEADER, running: false };
    }
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
      if (!s) {
        // No parent row yet. After a start(), if the grace elapses with still no row, the invoke
        // never reached the server (it opens the parent before its work) → INVOKE_FAILED, distinct
        // from a baseline that ran and failed. Before the grace, keep showing "step 1" (starting).
        if (firedAtRef.current !== null && Date.now() - firedAtRef.current > INVOKE_GRACE_MS) {
          firedAtRef.current = null;
          setState({ stage: "invoke_failed", message: FR_INVOKE_FAILED, running: false });
          stopPoll();
        }
        return;
      }
      firedAtRef.current = null; // a row exists → the refresh started; grace no longer applies.
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
    // FREEZE courtesy gate: a frozen reference fixture (CB1) is never refreshed. Refuse BEFORE any
    // invoke so the chain never fires — no ledger row, no baseline write. (The server refuses
    // authoritatively too; this just spares the round-trip and shows an honest message.)
    if (isFrozenCompany(companyId)) {
      setState({ stage: "frozen", message: FR_FROZEN, running: false });
      return;
    }
    setState({ stage: "baseline", message: FR_STEP_BASELINE, running: true });
    // NO client ledger write — long_runner_runs is SELECT-only under RLS for the browser. The
    // client passes ONLY {chain:true}; public-baseline opens the parent full_refresh row
    // (service-role) before its work. The client discovers that row by polling (readChain).
    parentRef.current = null;
    firedAtRef.current = Date.now();
    void supabase.functions.invoke("public-baseline", {
      body: { company_id: companyId, company_name: companyName, website, chain: true },
    });
    startPolling();
  }, [companyId, companyName, website, state.running, startPolling]);

  return { state, start };
}
