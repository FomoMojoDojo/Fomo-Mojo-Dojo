// useRecordInterviewFinding (gate 4, 2026-09-16) — the invoke wrapper: propose = dry_run:true, save =
// dry_run:false with the statement; a FunctionsHttpError is opened for its status/error/message; an
// ok:false 200 body is a refusal too. No table access anywhere in the module (source guard).
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { apiFromInvoke, invokeRecordInterviewFinding, type RecordFindingRequest } from "./useRecordInterviewFinding";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: invokeMock } } }));

describe("apiFromInvoke", () => {
  it("propose sends dry_run:true and shapes the proposal; save sends dry_run:false with the statement", async () => {
    const seen: RecordFindingRequest[] = [];
    const api = apiFromInvoke(async (b) => { seen.push(b); return b.dry_run ? { ok: true, proposed_statement: "Reduce x", model: "m", definition_id: "d1", step_label: "L", would_reuse_record: true } : { ok: true, record_id: "r", need_id: "n", reused_record: true, statement_source: "operator" }; });
    const base = { company_id: "c", journey_key: "k", step_number: 3, interview_record_id: "rec", record: null };
    expect(await api.propose(base)).toEqual({ ok: true, proposed_statement: "Reduce x", model: "m", definition_id: "d1", step_label: "L", would_reuse_record: true });
    expect(await api.save({ ...base, statement: "Reduce y", expected_definition_id: "d1" })).toEqual({ ok: true, record_id: "r", need_id: "n", reused_record: true, statement_source: "operator" });
    expect(seen).toEqual([{ ...base, dry_run: true }, { ...base, statement: "Reduce y", expected_definition_id: "d1", dry_run: false }]);
  });
  it("a refusal passes through untouched", async () => {
    const api = apiFromInvoke(async () => ({ ok: false, status: 422, error: "no_step", message: "m" }));
    expect(await api.propose({ company_id: "c", journey_key: "k", step_number: 1, record: null, interview_record_id: "r" })).toEqual({ ok: false, status: 422, error: "no_step", message: "m" });
  });
});

describe("invokeRecordInterviewFinding", () => {
  it("calls the function by name with the body; a FunctionsHttpError becomes {status, error, message} from its JSON", async () => {
    invokeMock.mockResolvedValueOnce({ data: null, error: { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: { status: 502, json: async () => ({ ok: false, error: "model_unavailable", message: "local model failed — nothing was written (no template fallback)." }) } } });
    const r = await invokeRecordInterviewFinding({ company_id: "c", journey_key: "k", step_number: 1, dry_run: true, record: null, interview_record_id: "r" });
    expect(invokeMock).toHaveBeenCalledWith("record-interview-finding", { body: { company_id: "c", journey_key: "k", step_number: 1, dry_run: true, record: null, interview_record_id: "r" } });
    expect(r).toEqual({ ok: false, status: 502, error: "model_unavailable", message: "local model failed — nothing was written (no template fallback)." });
  });
  it("an ok:false 200 body is a refusal; an ok body passes through", async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: false, error: "x", message: "y" }, error: null });
    expect(await invokeRecordInterviewFinding({ company_id: "c", journey_key: "k", step_number: 1 })).toEqual({ ok: false, status: 200, error: "x", message: "y" });
    invokeMock.mockResolvedValueOnce({ data: { ok: true, record_id: "r" }, error: null });
    expect(await invokeRecordInterviewFinding({ company_id: "c", journey_key: "k", step_number: 1 })).toEqual({ ok: true, record_id: "r" });
  });
  it("source guard: the hook and the form never touch a table (no .from( / .rpc( ) — the function is the only writer", () => {
    for (const p of ["src/hooks/useRecordInterviewFinding.ts", "src/views/client/workspace/InterviewCaptureForm.tsx"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/\.from\(|\.rpc\(/);
    }
    expect(readFileSync("src/hooks/useInterviewRecords.ts", "utf8")).not.toMatch(/\.(insert|upsert|update|delete)\(/); // reads only
  });
});
