import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// OC-2d — the current First Read session id for the Extracts feed control. Returns the
// company's most-recent open|proposal_issued session ONLY when it carries verdicts;
// otherwise null (honest absence — the corrections-feed control does not mount). This is
// the same "which session" resolution FirstReadView uses, scoped to the feed button's need.

export function useFirstReadFeedSession(companyId: string | undefined): string | null {
  const { data } = useQuery({
    queryKey: ["fr-feed-session", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<string | null> => {
      if (!companyId) return null;
      const { data: sess } = await supabase
        .from("first_read_sessions")
        .select("id")
        .eq("company_id", companyId)
        .in("status", ["open", "proposal_issued"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sessionId = (sess as { id: string } | null)?.id ?? null;
      if (!sessionId) return null;
      // Render only when the session has verdicts (there is something to feed).
      const { count } = await supabase
        .from("first_read_responses")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);
      return (count ?? 0) > 0 ? sessionId : null;
    },
  });
  return data ?? null;
}
