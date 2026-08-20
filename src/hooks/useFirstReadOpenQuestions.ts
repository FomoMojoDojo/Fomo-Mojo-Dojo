// V2-4 — the ONE open-question list, read from first_read_open_questions.
//
// Replaces the old result_json.open_questions[] feed for the First Read's question
// surfaces (Act 5 Gap, the story-surface lead question, and the leave-behind). Reads the
// LIVE rows only (status='live'); superseded rows stay as history but never render.
// Provenance is carried per row (finding-derived vs silent-delta-derived) — ONE list.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { firstReadExcludedClaimIds } from "../../supabase/functions/_shared/firstReadProvenance.ts";

export interface OpenQuestionListRow {
  question_text: string;
  source_kind: string; // 'finding' | 'silent_delta'
  finding_identity: string | null;
  anchor_identity: string | null;
}

export function useFirstReadOpenQuestions(companyId?: string) {
  const [rows, setRows] = useState<OpenQuestionListRow[]>([]);
  const [loading, setLoading] = useState(true);
  // GATE C-2 — `error` is ADDITIVE. A returning query error is exposed (instead of the old
  // swallow to []), so OutsideQuestionAct / GapAct can render the signed error via <ActData>
  // rather than their honest-empty line on a failed read. `rows` / `questions` / `loading`
  // are byte-identical for every existing consumer in every case (error still leaves rows []).
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      if (!companyId) {
        if (!cancelled) { setRows([]); setLoading(false); }
        return;
      }
      const { data, error: qErr } = await supabase
        .from("first_read_open_questions")
        .select("question_text, source_kind, finding_identity, anchor_identity")
        .eq("company_id", companyId)
        .eq("status", "live") // live set only; superseded is history, never rendered
        .order("created_at", { ascending: true })
        .order("question_identity", { ascending: true }); // deterministic tie-break
      let live = ((data as OpenQuestionListRow[] | null) ?? []).filter((r) => r.question_text?.trim());

      // PROVENANCE GATE — First Read is OUTSIDE-ONLY. A silent_delta question is BORN from a declared
      // publicly-silent claim; if that claim is uploaded-document-derived, the question is document
      // content and must not render on the rail (GapAct) or in the export. The generator no longer
      // mints such questions, but rows minted before the gate persist — so the read filters them too.
      // Display + export scope only: rows stay in the table (never deleted). Same shared predicate the
      // rail read and the auto-selectors use — one authority, no second implementation.
      if (!qErr && live.length) {
        const anchorIds = [...new Set(
          live.filter((r) => r.source_kind === "silent_delta" && r.anchor_identity).map((r) => r.anchor_identity as string),
        )];
        if (anchorIds.length) {
          const { data: dRows } = await supabase
            .from("claim_deltas").select("content_identity, declared_claim_id, public_claim_id")
            .eq("company_id", companyId)
            .eq("pairing_kind", "public_vs_public") // GATE B-1: First Read = public pairing only
            .in("content_identity", anchorIds);
          const deltas = (dRows ?? []) as Array<{ content_identity: string; declared_claim_id: string | null; public_claim_id: string | null }>;
          const claimIds = [...new Set(deltas.flatMap((d) => [d.declared_claim_id, d.public_claim_id]).filter((x): x is string => !!x))];
          if (claimIds.length) {
            const { data: refs } = await supabase.from("claim_signal_refs").select("claim_id, signal_id").in("claim_id", claimIds);
            const refRows = (refs ?? []) as Array<{ claim_id: string; signal_id: string }>;
            const sigIds = [...new Set(refRows.map((r) => r.signal_id))];
            const { data: sigs } = sigIds.length ? await supabase.from("signals").select("id, source_type").in("id", sigIds) : { data: [] };
            const srcBySig = new Map(((sigs ?? []) as Array<{ id: string; source_type: string | null }>).map((s) => [s.id, s.source_type]));
            // R1 + PUBLIC-ONLY: birth records and provenance join the test — a no-ref
            // anchor claim is resolved by payload, and any non-public anchor is excluded.
            const { data: payloadRows } = await supabase.from("claims").select("id, raw_payload, provenance").in("id", claimIds);
            const excluded = firstReadExcludedClaimIds(
              refRows,
              srcBySig,
              (payloadRows ?? []) as Array<{ id: string; raw_payload?: unknown; provenance?: string | null }>,
            );
            if (excluded.size) {
              const excludedAnchors = new Set(
                deltas
                  .filter((d) => (d.declared_claim_id && excluded.has(d.declared_claim_id)) || (d.public_claim_id && excluded.has(d.public_claim_id)))
                  .map((d) => d.content_identity),
              );
              live = live.filter((r) => !(r.source_kind === "silent_delta" && r.anchor_identity && excludedAnchors.has(r.anchor_identity)));
            }
          }
        }
      }

      if (!cancelled) {
        if (qErr) setError(qErr.message);
        setRows(live);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { rows, questions: rows.map((r) => r.question_text.trim()), loading, error };
}
