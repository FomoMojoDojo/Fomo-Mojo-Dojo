// Interview upload records for the workspace Inputs page (Gate B commit 1, 2026-09-19; commit 2a,
// 2026-09-20): the transcript records (interview_records with input_file_id), the company's live markets
// with their lens titles for "Change market", and the writes this page makes —
//   Change market   journey_key + market_state + the APPENDED basis entry (R4: history, never overwritten;
//                   the DB trigger refuses anything else);
//   Withdraw        withdraw_interview_upload(p_record_id) — the RPC is the one write path (R11/R22);
//   Change speaker  correct_interview_speaker(p_record_id, p_speaker_role) — the RPC recomputes the identity
//                   and appends the speaker history (R14/R22/R24); a live-identity collision is the named
//                   error speaker_identity_collision → P2, nothing changed.
// A retracted record is never rendered (listing rule, 2026-09-20).
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
  /** Set by the parser gate; while NULL the speaker may be corrected (R14). */
  parsed_at: string | null;
  speaker_history: unknown[];
};
export const SPEAKER_COLLISION = "speaker_identity_collision";
export type MarketOption = { key: string; title: string };

// deno-lint-ignore no-explicit-any
const loose = () => supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string; details?: string } | null }>; auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } };

/** Commit 2b hook: "Change speaker" is not offered while a market inference is in flight. Always false until 2b. */
export function interviewInferenceInFlight(_record: InterviewUploadRecord): boolean {
  return false;
}
/** R14: a speaker correction is offered while the record is live, unparsed and no inference is in flight. */
export function canChangeSpeaker(record: InterviewUploadRecord): boolean {
  return record.retracted_at === null && record.parsed_at === null && !interviewInferenceInFlight(record);
}

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
        loose().from("interview_records").select("id, input_file_id, speaker_role, market_state, journey_key, market_basis, review_state, retracted_at, parsed_at, speaker_history").eq("company_id", companyId).not("input_file_id", "is", null),
        readLiveDefinitionKeys(supabase, companyId),
        loose().from("market_lens").select("journey_key, title").eq("company_id", companyId),
      ]);
      if (cancelled) return;
      const titles = new Map<string, string>();
      for (const r of ((lens ?? []) as Array<{ journey_key: string | null; title: string | null }>)) { const k = String(r.journey_key ?? ""); const t = String(r.title ?? "").trim(); if (k && t && !titles.has(k)) titles.set(k, t); }
      setMarkets(keys.map((key) => ({ key, title: titles.get(key) ?? key })));
      setRecords(((recs ?? []) as InterviewUploadRecord[]).map((r) => ({ ...r, market_basis: Array.isArray(r.market_basis) ? r.market_basis : [], speaker_history: Array.isArray(r.speaker_history) ? r.speaker_history : [], parsed_at: r.parsed_at ?? null })));
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

  /** Withdraw (R11): the RPC retracts the record, archives the file and writes the audit row in one transaction. */
  const withdraw = useCallback(async (record: InterviewUploadRecord): Promise<{ ok: boolean; error?: string }> => {
    const { error } = await loose().rpc("withdraw_interview_upload", { p_record_id: record.id });
    if (error) return { ok: false, error: String(error.message ?? error) };
    refetch();
    return { ok: true };
  }, [refetch]);

  /** Change speaker (R14/R24): the RPC recomputes the identity and appends the history; a collision → P2. */
  const correctSpeaker = useCallback(async (record: InterviewUploadRecord, speakerRole: "client_stakeholder" | "market_participant"): Promise<{ ok: boolean; collision?: boolean; error?: string }> => {
    const { error } = await loose().rpc("correct_interview_speaker", { p_record_id: record.id, p_speaker_role: speakerRole });
    if (error) {
      const text = `${error.message ?? ""} ${error.details ?? ""}`;
      if (text.includes(SPEAKER_COLLISION) || error.code === "23505") return { ok: false, collision: true, error: String(error.message ?? error) };
      return { ok: false, error: String(error.message ?? error) };
    }
    refetch();
    return { ok: true };
  }, [refetch]);

  return { records, markets, loading, refetch, changeMarket, withdraw, correctSpeaker };
}
