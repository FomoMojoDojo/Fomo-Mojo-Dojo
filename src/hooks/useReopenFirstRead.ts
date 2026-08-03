import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// FR-REOPEN-3 — the workshop-side session-status source + the reopen mutation.
//
// WHY A NEW QUERY KEY: the columns reopen mutates (first_read_sessions.status,
// reopen_generation, the cached *_count columns) are read NOWHERE through react-query —
// every existing reader (useFirstReadProposal, useFirstReadCapture, the FirstReadView /
// OpenFirstReadControl resolvers) is a useState/useEffect or an inline fetch and cannot
// be queryClient-invalidated. So the Reopen control needs its OWN invalidatable status
// source; ["fr-reopen-session", companyId] is that source and nothing else reads it.
//
// The mutation is a thin reflection of reopen_first_read_session (FR-REOPEN-2): it never
// re-implements the DB guards (status / admin / reason / unresolved-contests) — it calls
// the RPC and rethrows the RPC's message verbatim so the UI surfaces the actual refusal.

export type CurrentSession = { id: string; status: string } | null;

export function useReopenFirstRead(companyId: string | null) {
  const queryClient = useQueryClient();
  const sessionKey = ["fr-reopen-session", companyId];

  const query = useQuery({
    queryKey: sessionKey,
    enabled: !!companyId,
    queryFn: async (): Promise<CurrentSession> => {
      if (!companyId) return null;
      // The workshop's "current" session: the latest still-live one (mirrors the mint-if-
      // missing lookup in OpenFirstReadControl). Only proposal_issued renders the control.
      const { data, error } = await supabase
        .from("first_read_sessions")
        .select("id, status")
        .eq("company_id", companyId)
        .in("status", ["open", "proposal_issued"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CurrentSession) ?? null;
    },
  });

  // The sole client path to reopen. reopen_first_read_session is a server-newer RPC not in
  // the generated types (the established `as any` pattern, mirroring useClaimContests.resolve).
  async function reopen(sessionId: string, reason: string) {
    const { error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("reopen_first_read_session", {
      p_session_id: sessionId,
      p_reason: reason,
    });
    if (error) throw new Error(error.message); // surface the RPC's refusal verbatim
    // Only this key goes stale: status flips proposal_issued→open (the control then
    // unmounts). The cached counts have NO react-query reader; claim_contests is never
    // written by reopen (R9) so the contested surface is unchanged — neither is invalidated.
    await queryClient.invalidateQueries({ queryKey: sessionKey });
  }

  return {
    session: query.data ?? null,
    isLoading: query.isLoading,
    reopen,
  };
}
