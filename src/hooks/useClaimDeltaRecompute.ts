// CH-2b-2 — the client affordance for chunked claim-delta recompute:
// plan → packed chunks → ONE unscoped finalize → refetch.
//
// Shape (design-gate rulings, binding):
// - Every click starts with plan:true (zero model calls) — the manifest is the
//   RESUME TRUTH: claims whose candidates_fresh is 0 (banked/tombstoned) are
//   skipped, so a re-click after a kill re-runs only what isn't banked. The
//   client never computes content identity and never sees a hash.
// - Chunks invoke generate-claim-deltas with declared_ids (+ write:true) and
//   write PAIR ROWS ONLY (the server's structural guard keeps silences and the
//   stale-sweep off any scoped run). Chunk completion is trusted from the HTTP
//   response, NOT row-polling — an all-rejected chunk legitimately writes zero
//   rows. A failed chunk surfaces its honest reason and the loop CONTINUES
//   (per-chunk isolation, CH-1 precedent); banked verdicts make resume cheap.
// - After the chunks: exactly ONE unscoped invoke — the finalize — computes
//   silences and sweeps stale rows with full-company knowledge. If the gateway
//   cuts the finalize response, the isolate usually finishes server-side, so
//   (finalize ONLY) we poll claim_deltas for change as a supplement; silence
//   rows / sweep deletions are its signal.
// - Progress (and its display) is company-scoped: switching the active company
//   resets the panel AND aborts the loop's further work (the CH-1 stale-leak
//   class, fixed harder here — a stale run may not repaint the new company's
//   panel or fire more invocations).
//
// All client-facing strings rendered from this hook's state are DRAFTS pending
// operator signature (they live in StrategicDirectionDelta's panel).

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isFrozenCompany } from "@/lib/frozenCompanies";
import { chunkFreshCount, packDeltaChunks, type DeltaPlanClaim } from "@/lib/claimDeltas/packChunks";

type PlanResponse = {
  ok: true;
  plan: true;
  declared_total: number;
  public_total: number;
  claims: DeltaPlanClaim[];
  fresh_total: number;
  // NEG-CACHE: banked model rejections skipped by this plan (counts-only).
  rejected_total: number;
};

export type DeltaChunkOutcome = {
  claims: number;
  fresh: number;
  ok: boolean;
  reason?: string;
  seconds?: number;
};

export type DeltaRecomputeProgress = {
  stage: "plan" | "chunks" | "finalize" | "done";
  totalChunks: number;
  currentChunk: number; // 1-based ordinal of the chunk in flight (or last completed)
  freshTotal: number;
  rejectedTotal: number; // NEG-CACHE: frozen rejections the plan skipped
  results: DeltaChunkOutcome[];
  finalize: { ok: boolean; reason?: string; seconds?: number; polled?: boolean } | null;
  error: string | null; // run-level error (plan failed, frozen company, …)
};

// Unwrap a functions.invoke result into { ok, data | reason }. The wrapper
// returns honest non-2xx statuses (403 frozen / 404 no claims / 422 empty
// declared_ids / 500), which supabase-js surfaces as a FunctionsHttpError —
// dig the function's own error string out of the response body when present.
async function invokeDeltas(body: Record<string, unknown>): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; reason: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("generate-claim-deltas", { body });
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

export function useClaimDeltaRecompute(companyId: string) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<DeltaRecomputeProgress | null>(null);

  // Run token: bumped by a company switch (and each new start) — a loop whose
  // token went stale stops firing invocations and stops painting progress.
  const runSeq = useRef(0);

  useEffect(() => {
    runSeq.current += 1;
    setProgress(null);
    setRunning(false);
  }, [companyId]);

  // Finalize-only poll supplement: the finalize's signal is CHANGE in the
  // company's claim_deltas (new silence rows raise count / fresh computed_at;
  // sweep deletions lower count). Chunks never use this — HTTP only.
  const waitForFinalize = useCallback(async (preCount: number, preMaxComputedAt: string): Promise<boolean> => {
    const capMs = 420_000;
    const t0 = Date.now();
    while (Date.now() - t0 < capMs) {
      await new Promise((r) => setTimeout(r, 5000));
      const { data, count } = await supabase
        .from("claim_deltas")
        .select("computed_at", { count: "exact" })
        .eq("company_id", companyId);
      const rows = (data ?? []) as Array<{ computed_at?: string }>;
      const maxAt = rows.reduce((m, r) => (String(r.computed_at ?? "") > m ? String(r.computed_at ?? "") : m), "");
      if ((count ?? rows.length) !== preCount || maxAt > preMaxComputedAt) return true;
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
        stage: "done", totalChunks: 0, currentChunk: 0, freshTotal: 0, rejectedTotal: 0, results: [], finalize: null,
        error: "This is a frozen reference company — deltas aren't recomputed for it.",
      });
      return;
    }

    setRunning(true);
    setProgress({ stage: "plan", totalChunks: 0, currentChunk: 0, freshTotal: 0, rejectedTotal: 0, results: [], finalize: null, error: null });
    try {
      // 1) PLAN — server truth for what's fresh (zero model calls, zero writes).
      const planRes = await invokeDeltas({ company_id: companyId, plan: true });
      if (!live()) return;
      if (!planRes.ok) {
        setProgress((p) => (p ? { ...p, stage: "done", error: planRes.reason } : p));
        return;
      }
      const plan = planRes.data as unknown as PlanResponse;
      const chunks = packDeltaChunks(Array.isArray(plan.claims) ? plan.claims : []);
      const freshTotal = Number(plan.fresh_total ?? 0);
      const rejectedTotal = Number(plan.rejected_total ?? 0);

      // 2) CHUNKS — pair rows only; per-chunk failure isolation.
      const results: DeltaChunkOutcome[] = [];
      setProgress({ stage: chunks.length > 0 ? "chunks" : "finalize", totalChunks: chunks.length, currentChunk: 0, freshTotal, rejectedTotal, results: [], finalize: null, error: null });
      for (let i = 0; i < chunks.length; i++) {
        if (!live()) return;
        const chunk = chunks[i];
        setProgress({ stage: "chunks", totalChunks: chunks.length, currentChunk: i + 1, freshTotal, rejectedTotal, results: [...results], finalize: null, error: null });
        const t0 = Date.now();
        const res = await invokeDeltas({
          company_id: companyId,
          write: true,
          declared_ids: chunk.map((c) => c.declared_claim_id),
        });
        if (!live()) return;
        results.push({
          claims: chunk.length,
          fresh: chunkFreshCount(chunk),
          ok: res.ok,
          reason: res.ok ? undefined : res.reason,
          seconds: Math.round((Date.now() - t0) / 1000),
        });
        setProgress({ stage: "chunks", totalChunks: chunks.length, currentChunk: i + 1, freshTotal, rejectedTotal, results: [...results], finalize: null, error: null });
      }

      // 3) FINALIZE — exactly one unscoped run: silences + stale-sweep.
      setProgress({ stage: "finalize", totalChunks: chunks.length, currentChunk: chunks.length, freshTotal, rejectedTotal, results: [...results], finalize: null, error: null });
      const { data: preRows, count: preCount } = await supabase
        .from("claim_deltas")
        .select("computed_at", { count: "exact" })
        .eq("company_id", companyId);
      const preMax = ((preRows ?? []) as Array<{ computed_at?: string }>)
        .reduce((m, r) => (String(r.computed_at ?? "") > m ? String(r.computed_at ?? "") : m), "");
      const finT0 = Date.now();
      const finRes = await invokeDeltas({ company_id: companyId, write: true });
      if (!live()) return;
      let finalize: DeltaRecomputeProgress["finalize"];
      if (finRes.ok) {
        finalize = { ok: true, seconds: Math.round((Date.now() - finT0) / 1000) };
      } else {
        // The gateway may cut a long finalize response while the isolate keeps
        // running — watch for its rows to land (the sanctioned supplement).
        const landed = await waitForFinalize(preCount ?? 0, preMax);
        if (!live()) return;
        finalize = landed
          ? { ok: true, seconds: Math.round((Date.now() - finT0) / 1000), polled: true }
          : { ok: false, reason: finRes.reason };
      }
      setProgress({ stage: "done", totalChunks: chunks.length, currentChunk: chunks.length, freshTotal, rejectedTotal, results: [...results], finalize, error: null });
    } finally {
      if (live()) setRunning(false);
      // Banked pair rows should render even after a partial run.
      queryClient.invalidateQueries({ queryKey: ["strategic-delta", companyId] });
    }
  }, [companyId, running, queryClient, waitForFinalize]);

  return { running, progress, start };
}
