// PROPOSAL SYNC POLL — MOVED from InputsTab.tsx (completion sweep brief, 2026-09-13), body unchanged.
//
// While any proposal is queued or running, useFileProposals already refetches every 5 s; each refetch
// hands a new array to this effect, which posts the function's own reconciliation door —
// dify-analyze-file {mode:"sync", proposalId} — once per active row per 5 s, then refetches so the
// row follows the server. This is the PROMPT path while a page is watching. It is never the only
// route to completion: the pg_cron sweep (sweep_file_proposal_completion, every minute) persists a
// finished run with no browser open at all, and persistDifyResult's atomic claim means the two can
// meet on the same row without persisting twice.
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FileProposalRow } from "@/hooks/useFileProposals";

export const PROPOSAL_SYNC_THROTTLE_MS = 5000;

export function isActiveProposal(p: FileProposalRow): boolean {
  return p.status !== "rejected" && (p.processing_state === "queued" || p.processing_state === "running");
}

/** The InputsTab effect, verbatim in behaviour; `enabled` is the caller's gate (the tab passes true). */
export function useProposalSync(proposals: readonly FileProposalRow[] | undefined, enabled: boolean, refetch: () => Promise<unknown>): void {
  const lastSyncAtRef = useRef<Record<string, number>>({});
  useEffect(() => {
    if (!enabled) return;
    const active = (proposals ?? []).filter(isActiveProposal);
    if (active.length === 0) return;

    const now = Date.now();
    for (const proposal of active) {
      const lastSyncAt = lastSyncAtRef.current[proposal.id] ?? 0;
      if (now - lastSyncAt < PROPOSAL_SYNC_THROTTLE_MS) continue;
      lastSyncAtRef.current[proposal.id] = now;
      void supabase.functions.invoke("dify-analyze-file", {
        body: {
          mode: "sync",
          proposalId: proposal.id,
        },
      }).then(() => {
        void refetch();
      }).catch(() => {
        // Keep the row in running/failed state from the server; the normal
        // proposal poll loop will continue retrying.
      });
    }
  }, [proposals, enabled, refetch]);
}
