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
// Commit 2b (2026-09-21, R19–R35):
//   Infer market    infer-interview-market({company_id, interview_record_id}) — the edge function is the one
//                   write path; the browser sends the two ids and nothing about the actor. In flight = a
//                   planned integrity_runs row (component interview_market_inference) for the record bumped
//                   within 5 minutes; the page polls those rows while any run is in flight, so a run started
//                   elsewhere (the upload dialog's own call) shows M2 here and hides "Change speaker".
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readLiveDefinitionKeys } from "@/lib/liveDefinitionKeys";
import type { InterviewSpeakerRole } from "@/lib/interviewUploadStrings";

export type InterviewUploadRecord = {
  id: string;
  input_file_id: string;
  speaker_role: InterviewSpeakerRole | string;
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

export const INFERENCE_COMPONENT = "interview_market_inference";
export const INFERENCE_STALE_MS = 5 * 60_000;
export type InferenceOutcome = { ok: true; result: "placed" | "not_inferred" | "operator_placed_meanwhile" | "in_flight"; journey_key: string | null; market_title: string | null } | { ok: false; error: string };
export const INFERENCE_IN_FLIGHT = "inference_in_flight";

/** Commit 2b: "Change speaker" is not offered while a market inference is in flight (a fresh planned row). */
export function interviewInferenceInFlight(record: InterviewUploadRecord, inFlight?: ReadonlySet<string>): boolean {
  return Boolean(inFlight?.has(record.id));
}
/** R14: a speaker correction is offered while the record is live, unparsed and no inference is in flight. */
export function canChangeSpeaker(record: InterviewUploadRecord, inFlight?: ReadonlySet<string>): boolean {
  return record.retracted_at === null && record.parsed_at === null && !interviewInferenceInFlight(record, inFlight);
}
/** M1 is offered on a live, unplaced customer record with no run in flight (R23: whatever its history). */
export function canInferMarket(record: InterviewUploadRecord, inFlight?: ReadonlySet<string>): boolean {
  return record.retracted_at === null && record.speaker_role === "market_participant" && record.market_state === "unplaced" && !interviewInferenceInFlight(record, inFlight);
}
/** The record's current placement came from inference (its last placing basis entry) → the M3 line. */
export function placedByInference(record: InterviewUploadRecord): boolean {
  if (record.market_state !== "placed") return false;
  for (let i = record.market_basis.length - 1; i >= 0; i--) {
    const e = record.market_basis[i] as { kind?: unknown; result?: unknown } | null;
    if (!e || typeof e !== "object") continue;
    if (e.kind === "operator_override") return false;
    if (e.kind === "inference" && e.result === "placed") return true;
  }
  return false;
}
/** M5: the record's LAST basis entry is an inference that found no strict majority (a row that never ran keeps the bare S1). */
export function lastRunFoundNoMajority(record: InterviewUploadRecord): boolean {
  const last = record.market_basis[record.market_basis.length - 1] as { kind?: unknown; result?: unknown } | null | undefined;
  return Boolean(last && typeof last === "object" && last.kind === "inference" && last.result === "not_inferred");
}
/** R42: the record's LAST basis entry is an inference that failed (window error, time_budget, stale, context_overflow…) → M4 beside M1. */
export function lastRunFailed(record: InterviewUploadRecord): boolean {
  const last = record.market_basis[record.market_basis.length - 1] as { kind?: unknown; result?: unknown } | null | undefined;
  return Boolean(last && typeof last === "object" && last.kind === "inference" && last.result === "failed");
}
/** The ids with a planned inference row bumped within the last 5 minutes (the same rule as interview_inference_in_flight). */
export function inFlightIdsFrom(rows: ReadonlyArray<{ surface_id: string | null; ran_at: string | null }>, nowMs = Date.now()): Set<string> {
  const ids = new Set<string>();
  for (const r of rows) { const t = Date.parse(String(r.ran_at ?? "")); if (r.surface_id && Number.isFinite(t) && nowMs - t < INFERENCE_STALE_MS) ids.add(r.surface_id); }
  return ids;
}

export function useInterviewUploads(companyId?: string | null, refreshKey = 0) {
  const [records, setRecords] = useState<InterviewUploadRecord[]>([]);
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [loading, setLoading] = useState(Boolean(companyId));
  const [tick, setTick] = useState(0);
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  /** The company whose planned-rows read has answered at least once — M1 is never offered before it (a reload mid-run shows M2, not M1). */
  const [inFlightReadyFor, setInFlightReadyFor] = useState<string | null>(null);
  const inFlightReady = Boolean(companyId) && inFlightReadyFor === companyId;
  const [inFlightTick, setInFlightTick] = useState(0);
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
  const ownCalls = useRef<Set<string>>(new Set());
  /** The in-flight set as of the last planned-rows read — an id missing from the next read has ended (R41). */
  const lastPolled = useRef<Set<string>>(new Set());
  // In flight: the planned rows for this company's component — read ONCE on every page load (this effect runs
  // on mount, unconditionally), again on every records refetch, and every 5 s while any run is in flight.
  useEffect(() => {
    if (!companyId) { setInFlight(new Set()); return; }
    let cancelled = false;
    (async () => {
      const { data } = await loose().from("integrity_runs").select("surface_id, ran_at").eq("company_id", companyId).eq("component", INFERENCE_COMPONENT).eq("status", "planned");
      if (cancelled) return;
      const fromDb = inFlightIdsFrom((data ?? []) as Array<{ surface_id: string | null; ran_at: string | null }>);
      for (const id of ownCalls.current) fromDb.add(id); // a call this page made and is still waiting on
      let left = false;
      for (const id of lastPolled.current) if (!fromDb.has(id)) left = true;
      lastPolled.current = fromDb;
      setInFlight((prev) => (prev.size === fromDb.size && [...prev].every((id) => fromDb.has(id)) ? prev : fromDb));
      setInFlightReadyFor(companyId);
      // R41 (2026-09-21): a run that left the in-flight set has ended (completed, failed or stale) — re-read the
      // records so the row shows what it wrote (M3 / M5 / M4) instead of the snapshot from before the run.
      if (left) setTick((k) => k + 1);
    })();
    return () => { cancelled = true; };
  }, [companyId, tick, inFlightTick]);
  useEffect(() => {
    if (inFlight.size === 0) return;
    const t = setInterval(() => setInFlightTick((k) => k + 1), 5000);
    return () => clearInterval(t);
  }, [inFlight.size]);

  /** Infer market (2b): the edge function does everything; the browser sends the two ids only. */
  const inferMarket = useCallback(async (record: InterviewUploadRecord): Promise<InferenceOutcome> => {
    ownCalls.current.add(record.id);
    setInFlight((prev) => new Set([...prev, record.id]));
    let keepInFlight = false;
    try {
      const { data, error } = await (supabase as unknown as { functions: { invoke: (fn: string, args: { body: Record<string, unknown> }) => Promise<{ data: unknown; error: { message?: string; context?: Response } | null }> } }).functions.invoke("infer-interview-market", { body: { company_id: companyId, interview_record_id: record.id } });
      let payload = (data ?? null) as { ok?: boolean; result?: string; journey_key?: string | null; market_title?: string | null; error?: string } | null;
      if (error && !payload) { try { payload = await error.context?.json?.(); } catch { payload = null; } }
      if (payload?.error === INFERENCE_IN_FLIGHT) {
        // 409: a run is already in flight for this record (started elsewhere, or by this page before a reload) — the row
        // shows M2 and the poll follows the planned row; never M4.
        keepInFlight = true;
        return { ok: true, result: "in_flight", journey_key: null, market_title: null };
      }
      if (!payload?.ok) return { ok: false, error: String(payload?.error ?? error?.message ?? "inference_failed") };
      return { ok: true, result: (payload.result as "placed" | "not_inferred" | "operator_placed_meanwhile") ?? "not_inferred", journey_key: payload.journey_key ?? null, market_title: payload.market_title ?? null };
    } catch (e) {
      return { ok: false, error: String((e as Error)?.message ?? e) };
    } finally {
      ownCalls.current.delete(record.id);
      if (keepInFlight) setInFlightTick((k) => k + 1); // the poll follows the planned row from here
      else { setInFlight((prev) => { const next = new Set(prev); next.delete(record.id); return next; }); refetch(); }
    }
  }, [companyId, refetch]);

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
  const correctSpeaker = useCallback(async (record: InterviewUploadRecord, speakerRole: InterviewSpeakerRole): Promise<{ ok: boolean; collision?: boolean; error?: string }> => {
    const { error } = await loose().rpc("correct_interview_speaker", { p_record_id: record.id, p_speaker_role: speakerRole });
    if (error) {
      const text = `${error.message ?? ""} ${error.details ?? ""}`;
      if (text.includes(SPEAKER_COLLISION) || error.code === "23505") return { ok: false, collision: true, error: String(error.message ?? error) };
      return { ok: false, error: String(error.message ?? error) };
    }
    refetch();
    return { ok: true };
  }, [refetch]);

  return { records, markets, loading, refetch, changeMarket, withdraw, correctSpeaker, inFlight, inFlightReady, inferMarket };
}
