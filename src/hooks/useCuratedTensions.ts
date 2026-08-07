// SELF-CONSISTENCY — read the ONE curated tension for a company (single-instance).
//
// Reads the live curated_tensions row (removed_at IS NULL), resolves both claim statements
// and the difficulty side's backing outside signal (source_url + event_date + created_at) so
// the render carries source-host attribution through the SAME single-home formatter the rest
// of First Read uses. Returns null when there is no live row OR either claim is missing/struck
// — the section then renders nothing (rendered-tree absence, the curation's honest empty).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CuratedTensionRender } from "@/lib/firstRead/curatedTension";

export function useCuratedTensions(companyId?: string) {
  const [render, setRender] = useState<CuratedTensionRender | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!companyId) {
        if (!cancelled) { setRender(null); setLoading(false); }
        return;
      }

      // The single live curation for this company (soft-removed rows excluded).
      const { data: row } = await supabase
        .from("curated_tensions")
        .select("promise_claim_id, difficulty_claim_id")
        .eq("company_id", companyId)
        .is("removed_at", null)
        .limit(1)
        .maybeSingle();

      if (!row) { if (!cancelled) { setRender(null); setLoading(false); } return; }

      // Both sides' verbatim statements. A missing/struck claim → honest absence (no render).
      const { data: claimRows } = await supabase
        .from("claims")
        .select("id, statement, status")
        .in("id", [row.promise_claim_id, row.difficulty_claim_id]);
      const byId = new Map(
        ((claimRows ?? []) as Array<{ id: string; statement: string | null; status: string | null }>)
          .filter((c) => (c.statement ?? "").trim() && c.status !== "struck")
          .map((c) => [c.id, (c.statement ?? "").trim()]),
      );
      const promiseText = byId.get(row.promise_claim_id);
      const difficultyText = byId.get(row.difficulty_claim_id);
      if (!promiseText || !difficultyText) { if (!cancelled) { setRender(null); setLoading(false); } return; }

      // Difficulty side's backing OUTSIDE signal — host + date from ONE signal (same-signal
      // rule). Quote-less by nature (no byte-exact quote on this pair), so no quote fields.
      const { data: refs } = await supabase
        .from("claim_signal_refs").select("signal_id").eq("claim_id", row.difficulty_claim_id);
      const sigIds = ((refs ?? []) as Array<{ signal_id: string }>).map((r) => r.signal_id);
      let difficultySourceUrl: string | null = null;
      let difficultyEventDate: string | null = null;
      let difficultyCapturedAt: string | null = null;
      if (sigIds.length) {
        const { data: sigs } = await supabase
          .from("signals").select("source_url, event_date, created_at")
          .in("id", sigIds).eq("signal_band", "outside").limit(1);
        const s = ((sigs ?? []) as Array<{ source_url: string | null; event_date: string | null; created_at: string | null }>)[0];
        if (s) {
          difficultySourceUrl = s.source_url ?? null;
          difficultyEventDate = s.event_date ?? null;
          difficultyCapturedAt = s.created_at ?? null;
        }
      }

      if (!cancelled) {
        setRender({ promiseText, difficultyText, difficultySourceUrl, difficultyEventDate, difficultyCapturedAt });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  return { render, loading };
}
