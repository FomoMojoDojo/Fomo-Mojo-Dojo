// SP-446 B-9: the Brief's questions band states how many questions are NOT shown. The live rows come
// from useFirstReadOpenQuestions (the one open-question list); this is the count of the rest, so the
// footer can say what is history rather than leaving the reader to assume there is none.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useSupersededQuestionCount(companyId?: string | null): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) { setN(0); return; }
      const { count } = await supabase
        .from("first_read_open_questions")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .neq("status", "live");
      if (!cancelled) setN(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [companyId]);
  return n;
}
