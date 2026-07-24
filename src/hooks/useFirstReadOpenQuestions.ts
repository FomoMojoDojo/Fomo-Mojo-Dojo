// V2-4 — the ONE open-question list, read from first_read_open_questions.
//
// Replaces the old result_json.open_questions[] feed for the First Read's question
// surfaces (Act 5 Gap, the story-surface lead question, and the leave-behind). Reads the
// LIVE rows only (status='live'); superseded rows stay as history but never render.
// Provenance is carried per row (finding-derived vs silent-delta-derived) — ONE list.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface OpenQuestionListRow {
  question_text: string;
  source_kind: string; // 'finding' | 'silent_delta'
  finding_identity: string | null;
  anchor_identity: string | null;
}

export function useFirstReadOpenQuestions(companyId?: string) {
  const [rows, setRows] = useState<OpenQuestionListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!companyId) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("first_read_open_questions")
        .select("question_text, source_kind, finding_identity, anchor_identity")
        .eq("company_id", companyId)
        .eq("status", "live") // live set only; superseded is history, never rendered
        .order("created_at", { ascending: true })
        .order("question_identity", { ascending: true }); // deterministic tie-break
      if (!cancelled) {
        setRows(((data as OpenQuestionListRow[] | null) ?? []).filter((r) => r.question_text?.trim()));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { rows, questions: rows.map((r) => r.question_text.trim()), loading };
}
