// Interview upload records for the workspace Inputs page (Gate B commit 1, 2026-09-19): the transcript
// records (interview_records with input_file_id), the company's live markets with their lens titles for
// "Change market", and the one write this page makes — Change market: journey_key + market_state +
// the APPENDED basis entry (R4: history, never overwritten; the DB trigger refuses anything else).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readLiveDefinitionKeys } from "@/lib/liveDefinitionKeys";

export type InterviewUploadRecord = {
  id: string;
  input_file_id: string;
  speaker_role: "client_stakeholder" | "market_participant" | string;
  market_state: "placed" | "unplaced" | "per_item" | string;
  journey_key: string | null;
  market_basis: unknown[];
  review_state: string;
  retracted_at: string | null;
};
export type MarketOption = { key: string; title: string };

// deno-lint-ignore no-explicit-any
const loose = () => supabase as unknown as { from: (t: string) => any; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };

export function useInterviewUploads(companyId?: string | null, refreshKey = 0) {
  const [records, setRecords] = useState<InterviewUploadRecord[]>([]);
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [loading, setLoading] = useState(Boolean(companyId));
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!companyId) { setRecords([]); setMarkets([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: recs }, keys, { data: lens }] = await Promise.all([
        loose().from("interview_records").select("id, input_file_id, speaker_role, market_state, journey_key, market_basis, review_state, retracted_at").eq("company_id", companyId).not("input_file_id", "is", null),
        readLiveDefinitionKeys(supabase, companyId),
        loose().from("market_lens").select("journey_key, title").eq("company_id", companyId),
      ]);
      if (cancelled) return;
      const titles = new Map<string, string>();
      for (const r of ((lens ?? []) as Array<{ journey_key: string | null; title: string | null }>)) { const k = String(r.journey_key ?? ""); const t = String(r.title ?? "").trim(); if (k && t && !titles.has(k)) titles.set(k, t); }
      setMarkets(keys.map((key) => ({ key, title: titles.get(key) ?? key })));
      setRecords(((recs ?? []) as InterviewUploadRecord[]).map((r) => ({ ...r, market_basis: Array.isArray(r.market_basis) ? r.market_basis : [] })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId, refreshKey, tick]);
  const refetch = useCallback(() => setTick((k) => k + 1), []);

  /** Change market — appends {kind:"operator_override", journey_key, by, at} and places the record. */
  const changeMarket = useCallback(async (record: InterviewUploadRecord, journeyKey: string): Promise<{ ok: boolean; error?: string }> => {
    const { data: auth } = await loose().auth.getUser();
    const by = auth.user?.id ?? null;
    const at = new Date().toISOString();
    const nextBasis = [...record.market_basis, { kind: "operator_override", journey_key: journeyKey, by, at }];
    const { error } = await loose().from("interview_records")
      .update({ journey_key: journeyKey, market_state: "placed", market_basis: nextBasis })
      .eq("id", record.id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    refetch();
    return { ok: true };
  }, [refetch]);

  return { records, markets, loading, refetch, changeMarket };
}
