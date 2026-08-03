import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// G1 — the client's OWN verdicts from their first meeting, read straight from
// first_read_responses, SESSIONLESS (company-scoped live read, never a sessionId — the
// returning surface is not session-bound). Distinct from useFirstReadCapture, which is
// session-bound and in meeting-playback register.
//
// Reads ONLY first_read_responses. It deliberately does NOT read claim_contests /
// claims.status: the outcome the client should see is what THEIR verdict means, and that
// is a per-response fact. Per-response resolution cannot be recovered honestly — a
// response anchors a contest only indirectly (delta → public_claim), so the join
// cross-contaminates (a *confirmed* response maps to a *set_aside* contest, because many
// responses touch one claim). So the outcome line is keyed by the recorded verdict, and
// claim_contests.resolution_reason is never even fetched (it must never reach a client).

export type MeetingVerdict = {
  id: string;
  /** The statement the client verdicted, verbatim (first_read_responses.item_text). */
  statement: string;
  /** confirmed | rejected | not_important | corrected — the recorded verdict. */
  verdict: string;
  item_kind: string;
};

export function useMeetingVerdicts(companyId: string | null) {
  const query = useQuery({
    queryKey: ["meeting-verdicts", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<MeetingVerdict[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("first_read_responses")
        .select("id, item_text, verdict, item_kind, captured_at")
        .eq("company_id", companyId)
        .order("captured_at", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ id: string; item_text: string; verdict: string; item_kind: string }>).map(
        (r) => ({ id: r.id, statement: r.item_text, verdict: r.verdict, item_kind: r.item_kind }),
      );
    },
  });
  return {
    verdicts: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
