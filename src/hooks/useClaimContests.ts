import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// OC-3 (read + resolve). Reads the client's verdicts AGAINST findings (claim_contests)
// for the operator's Extracts surface, and exposes resolve_contest — the SOLE sanctioned
// resolution path (admin-only, reason-required, kind-appropriate; strike/set-aside
// delegate to set_claim_status, the sole status authority). Open contests await the
// operator's judgment; resolved ones are the historical trail.

export type ContestKind = "disputed" | "immaterial";
export type ContestResolution = "strike_resolved" | "dismissed" | "set_aside";

export type ContestRow = {
  id: string;
  claim_id: string;
  claim_statement: string;
  claim_status: string | null;
  contest_kind: ContestKind;
  rationale: string | null;
  resolution: ContestResolution | null;
  resolution_reason: string | null;
  resolved_at: string | null;
  session_date: string | null; // the meeting the verdict came from
  created_at: string;
};

type ContestJoinRow = {
  id: string;
  claim_id: string;
  contest_kind: ContestKind;
  rationale: string | null;
  resolution: ContestResolution | null;
  resolution_reason: string | null;
  resolved_at: string | null;
  created_at: string;
  claims: { statement: string | null; status: string | null } | null;
  // OC-3b: the session's date column is `started_at` (there is no created_at on
  // first_read_sessions). Embedding a nonexistent column 400s the whole PostgREST query.
  first_read_sessions: { started_at: string | null } | null;
};

export function useClaimContests(companyId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["claim-contests", companyId];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    queryFn: async (): Promise<{ open: ContestRow[]; resolved: ContestRow[] }> => {
      if (!companyId) return { open: [], resolved: [] };
      const { data, error } = await supabase
        .from("claim_contests")
        .select(
          "id, claim_id, contest_kind, rationale, resolution, resolution_reason, resolved_at, created_at, claims(statement, status), first_read_sessions(started_at)",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const rows: ContestRow[] = ((data ?? []) as unknown as ContestJoinRow[]).map((r) => ({
        id: r.id,
        claim_id: r.claim_id,
        claim_statement: r.claims?.statement ?? "(finding no longer present)",
        claim_status: r.claims?.status ?? null,
        contest_kind: r.contest_kind,
        rationale: r.rationale,
        resolution: r.resolution,
        resolution_reason: r.resolution_reason,
        resolved_at: r.resolved_at,
        session_date: r.first_read_sessions?.started_at ?? r.created_at,
        created_at: r.created_at,
      }));

      return {
        open: rows.filter((r) => r.resolution == null),
        resolved: rows.filter((r) => r.resolution != null),
      };
    },
  });

  // The sole sanctioned resolution path. resolve_contest is a just-created RPC not yet in
  // the generated types (the established `as any` pattern for server-newer RPCs).
  async function resolve(contestId: string, resolution: ContestResolution, reason: string) {
    const { error } = await (supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>)("resolve_contest", {
      p_contest_id: contestId,
      p_resolution: resolution,
      p_reason: reason,
    });
    if (error) throw new Error(error.message);
    await queryClient.invalidateQueries({ queryKey });
  }

  return {
    open: query.data?.open ?? [],
    resolved: query.data?.resolved ?? [],
    isLoading: query.isLoading,
    // OC-3b error honesty: a query failure (RLS deny, malformed embed, network) is a
    // DISTINCT state from "no contests". The consumer renders an honest error rather than
    // silently vanishing — the exact masquerade the created_at embed bug rode.
    isError: query.isError,
    resolve,
  };
}
