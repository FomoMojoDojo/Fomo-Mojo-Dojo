// useRecordInterviewFinding (gate 4, 2026-09-16) — the client's ONLY way to record an interview finding:
// an invoke wrapper over record-interview-finding, two calls — propose (dry_run: true; the function runs
// its whole refusal ladder live and returns the local model's proposal, nothing written) and save (the
// operator's statement; the function writes record + need through the RPC, its only writer). No direct
// table writes from the client, ever. Every non-2xx comes back as { ok:false, status, error, message } —
// the function's own words — for the form to render inline; nothing is swallowed.
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SpeakerRole = "client_stakeholder" | "market_participant";

export type InterviewRecordInput = {
  speaker_role: SpeakerRole;
  person_name: string;
  person_role?: string | null;
  /** Required for a market participant (their own market's key). */
  journey_key?: string | null;
  interviewed_at: string;
  interviewer: string;
  consent_basis: string;
  verbatim: string;
};

export type RecordFindingRequest = {
  company_id: string;
  journey_key: string;
  step_number: number;
  /** Exactly one of the two. */
  interview_record_id?: string | null;
  record?: InterviewRecordInput | null;
  /** The operator's edited statement — save only; the function uses it verbatim and does not call the model. */
  statement?: string;
  /** Save only: the definition the form last saw on its dry run; ≠ the live one → 409 placement_changed. */
  expected_definition_id?: string | null;
  dry_run?: boolean;
};

export type ProposeResult = { ok: true; proposed_statement: string; model: string; definition_id: string; step_label: string; would_reuse_record: boolean };
export type SaveResult = { ok: true; record_id: string; need_id: string; reused_record: boolean; statement_source: "operator" | "model" };
export type FindingRefusal = { ok: false; status: number; error: string; message: string };

export type RecordInterviewFindingApi = {
  propose: (req: Omit<RecordFindingRequest, "dry_run" | "statement" | "expected_definition_id">) => Promise<ProposeResult | FindingRefusal>;
  save: (req: Omit<RecordFindingRequest, "dry_run">) => Promise<SaveResult | FindingRefusal>;
};

type HttpErrorLike = { name?: string; message?: string; context?: { status?: number; json?: () => Promise<unknown> } };

/** The function over supabase.functions.invoke; a FunctionsHttpError is opened for its status + body. */
export async function invokeRecordInterviewFinding(body: RecordFindingRequest): Promise<Record<string, unknown> | FindingRefusal> {
  const { data, error } = await supabase.functions.invoke("record-interview-finding", { body });
  if (!error) {
    const res = (data ?? {}) as Record<string, unknown>;
    if (res.ok === false) return { ok: false, status: 200, error: String(res.error ?? "unknown"), message: String(res.message ?? res.error ?? "") };
    return res;
  }
  const e = error as HttpErrorLike;
  let status = Number(e.context?.status ?? 0);
  let parsed: Record<string, unknown> | null = null;
  try { parsed = (await e.context?.json?.()) as Record<string, unknown> | null; } catch { parsed = null; }
  if (!status) status = 0;
  return { ok: false, status, error: String(parsed?.error ?? e.name ?? "request_failed"), message: String(parsed?.message ?? parsed?.error ?? e.message ?? "request failed") };
}

export function apiFromInvoke(invoke: (body: RecordFindingRequest) => Promise<Record<string, unknown> | FindingRefusal>): RecordInterviewFindingApi {
  const refusal = (r: Record<string, unknown> | FindingRefusal): r is FindingRefusal => (r as FindingRefusal).ok === false;
  return {
    propose: async (req) => {
      const r = await invoke({ ...req, dry_run: true });
      if (refusal(r)) return r;
      return { ok: true, proposed_statement: String(r.proposed_statement ?? ""), model: String(r.model ?? ""), definition_id: String(r.definition_id ?? ""), step_label: String(r.step_label ?? ""), would_reuse_record: Boolean(r.would_reuse_record) };
    },
    save: async (req) => {
      const r = await invoke({ ...req, dry_run: false });
      if (refusal(r)) return r;
      return { ok: true, record_id: String(r.record_id ?? ""), need_id: String(r.need_id ?? ""), reused_record: Boolean(r.reused_record), statement_source: r.statement_source === "operator" ? "operator" : "model" };
    },
  };
}

export const defaultRecordInterviewFindingApi: RecordInterviewFindingApi = apiFromInvoke(invokeRecordInterviewFinding);

export function useRecordInterviewFinding(api: RecordInterviewFindingApi = defaultRecordInterviewFindingApi) {
  const [busy, setBusy] = useState<"propose" | "save" | null>(null);
  const propose = useCallback(async (req: Parameters<RecordInterviewFindingApi["propose"]>[0]) => {
    setBusy("propose");
    try { return await api.propose(req); } finally { setBusy(null); }
  }, [api]);
  const save = useCallback(async (req: Parameters<RecordInterviewFindingApi["save"]>[0]) => {
    setBusy("save");
    try { return await api.save(req); } finally { setBusy(null); }
  }, [api]);
  return { propose, save, busy };
}
