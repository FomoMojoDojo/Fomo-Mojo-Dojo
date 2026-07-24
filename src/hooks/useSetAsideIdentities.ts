// V2-8 — the set-aside identities for a First Read session: the item_identities the client
// marked 'not_important' (set aside). Act 5's Gap uses these to DEMOTE the open questions
// linked to a set-aside item (by anchor_identity) — a visible, reversible shrink, never a
// delete. Same live-in-session reactivity path as the Check tally: reading
// first_read_responses (which the verdict writes/deletes toggle).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSetAsideIdentities(sessionId?: string) {
  const [identities, setIdentities] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!sessionId) {
        if (!cancelled) { setIdentities(new Set()); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("first_read_responses")
        .select("item_identity")
        .eq("session_id", sessionId)
        .eq("verdict", "not_important");
      if (!cancelled) {
        setIdentities(new Set(((data as Array<{ item_identity: string }> | null) ?? []).map((r) => r.item_identity)));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  return { identities, loading };
}
