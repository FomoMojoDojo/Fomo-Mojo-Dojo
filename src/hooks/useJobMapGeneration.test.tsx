// Item 2 (signed 2026-09-15) — the market door's run. R3: a run may outlive the Kong 150 s gateway; on
// timeout / transport error keep Working… and poll job_steps for the key every 6 s; steps appear → done;
// nothing by the bound → failure note; any 4xx/422 → failure note immediately. Silent inertness is
// prohibited. The request body is EXACTLY one key with both scoped-run flags.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const invoke = vi.hoisted(() => vi.fn());
const stepsRead = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke },
    from: (t: string) => {
      if (t !== "job_steps") throw new Error(`unexpected table ${t}`);
      const b: Record<string, unknown> = {};
      b.select = () => b; b.eq = () => b; b.order = () => b; b.limit = () => b;
      b.then = (res: (v: unknown) => void) => res({ data: stepsRead.rows, error: null });
      return b;
    },
  },
}));
vi.mock("@/lib/frozenCompanies", () => ({ isFrozenCompany: (id?: string | null) => id === "frozen-co" }));

import { useJobMapGeneration, JOBMAP_GENERATION_POLL_MS, jobMapGenerationBoundMs } from "./useJobMapGeneration";

class FakeHttpError extends Error {
  name = "FunctionsHttpError";
  constructor(public context: { status: number; json: () => Promise<unknown> }) { super("Edge Function returned a non-2xx status code"); }
}
class FakeFetchError extends Error { name = "FunctionsFetchError"; }

beforeEach(() => { invoke.mockReset(); stepsRead.rows = []; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

const args = (over: Partial<Parameters<typeof useJobMapGeneration>[0]> = {}) => ({ companyId: "c1", journeyKey: "pmk-new-clinicians", journeyTitle: "New clinicians", refetch: vi.fn(async () => {}), ...over });

describe("useJobMapGeneration — request shape", () => {
  it("sends exactly one key, both flags, the switcher label, an empty subtitle, the workspace trigger", async () => {
    invoke.mockResolvedValue({ data: { status: "ok" }, error: null });
    const a = args();
    const { result } = renderHook(() => useJobMapGeneration(a));
    await act(async () => { await result.current.run(); });
    expect(invoke).toHaveBeenCalledTimes(1);
    const [name, opts] = invoke.mock.calls[0];
    expect(name).toBe("local-jobmap-synthesis");
    const body = (opts as { body: Record<string, unknown> }).body;
    expect(Object.keys(body).sort()).toEqual(["company_id", "require_model", "selected_job_maps", "selected_maps_only", "trigger"]);
    expect(body.selected_maps_only).toBe(true);
    expect(body.require_model).toBe(true);
    expect(body.selected_job_maps).toEqual([{ journey_key: "pmk-new-clinicians", journey_title: "New clinicians", journey_subtitle: "" }]);
    expect(body.trigger).toBe("workspace_jobmap_generate:pmk-new-clinicians");
    expect(a.refetch).toHaveBeenCalledTimes(1);
    expect(result.current.failed).toBe(false);
  });
  it("never sends customer (or any second key) as support", async () => {
    invoke.mockResolvedValue({ data: { status: "ok" }, error: null });
    const { result } = renderHook(() => useJobMapGeneration(args({ journeyKey: "mkt-funders", journeyTitle: null })));
    await act(async () => { await result.current.run(); });
    const body = (invoke.mock.calls[0][1] as { body: { selected_job_maps: Array<{ journey_key: string; journey_title: string }> } }).body;
    expect(body.selected_job_maps.map((m) => m.journey_key)).toEqual(["mkt-funders"]);
    expect(body.selected_job_maps[0].journey_title).toBe("mkt-funders"); // no label → the key
  });
});

describe("useJobMapGeneration — run state (R3)", () => {
  it("a 422 refusal fails immediately, with the server's code/message kept for the operator line", async () => {
    invoke.mockResolvedValue({ data: null, error: new FakeHttpError({ status: 422, json: async () => ({ ok: false, error: "no_market_definition", message: "No live market definition for journey 'x'." }) }) });
    const a = args();
    const { result } = renderHook(() => useJobMapGeneration(a));
    await act(async () => { await result.current.run(); });
    expect(result.current.running).toBe(false);
    expect(result.current.failed).toBe(true);
    expect(result.current.failureDetail).toBe("422 no_market_definition — No live market definition for journey 'x'.");
    expect(a.refetch).not.toHaveBeenCalled();
  });
  it("a 400 fails immediately; a 200 with ok:false body fails immediately", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new FakeHttpError({ status: 400, json: async () => ({ error: "scoped_run_flags_required" }) }) });
    const { result } = renderHook(() => useJobMapGeneration(args()));
    await act(async () => { await result.current.run(); });
    expect(result.current.failed).toBe(true);
    expect(result.current.failureDetail).toMatch(/^400 scoped_run_flags_required/);
    invoke.mockResolvedValueOnce({ data: { error: "Local synthesis model failed" }, error: null });
    await act(async () => { await result.current.run(); });
    expect(result.current.failed).toBe(true);
  });
  it("a gateway timeout (504) keeps Working…, polls every 6 s, and completes when steps appear", async () => {
    invoke.mockResolvedValue({ data: null, error: new FakeHttpError({ status: 504, json: async () => ({}) }) });
    const a = args();
    const { result } = renderHook(() => useJobMapGeneration(a));
    let done: Promise<void>;
    act(() => { done = result.current.run(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.running).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(JOBMAP_GENERATION_POLL_MS); });
    expect(result.current.running).toBe(true);
    stepsRead.rows = [{ id: "s1" }];
    await act(async () => { await vi.advanceTimersByTimeAsync(JOBMAP_GENERATION_POLL_MS); });
    await act(async () => { await done!; });
    expect(result.current.running).toBe(false);
    expect(result.current.failed).toBe(false);
    expect(a.refetch).toHaveBeenCalledTimes(1);
  });
  it("a transport error with nothing landing by the bound fails with the note", async () => {
    invoke.mockResolvedValue({ data: null, error: new FakeFetchError("Failed to fetch") });
    const a = args();
    const { result } = renderHook(() => useJobMapGeneration(a));
    let done: Promise<void>;
    act(() => { done = result.current.run(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.running).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(jobMapGenerationBoundMs() + JOBMAP_GENERATION_POLL_MS); });
    await act(async () => { await done!; });
    expect(result.current.running).toBe(false);
    expect(result.current.failed).toBe(true);
    expect(a.refetch).not.toHaveBeenCalled();
  });
  it("the bound is 330 s by default and overridable for tests through window.__FR_JOBMAP_GEN_BOUND_MS", () => {
    expect(jobMapGenerationBoundMs()).toBe(330_000);
    (window as unknown as { __FR_JOBMAP_GEN_BOUND_MS?: number }).__FR_JOBMAP_GEN_BOUND_MS = 15_000;
    expect(jobMapGenerationBoundMs()).toBe(15_000);
    delete (window as unknown as { __FR_JOBMAP_GEN_BOUND_MS?: number }).__FR_JOBMAP_GEN_BOUND_MS;
  });
  it("one run per company at a time; a frozen company is refused before any invoke", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    const { result: r1 } = renderHook(() => useJobMapGeneration(args()));
    const { result: r2 } = renderHook(() => useJobMapGeneration(args({ journeyKey: "mkt-funders" })));
    act(() => { void r1.current.run(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(r1.current.running).toBe(true);
    await act(async () => { await r2.current.run(); });
    expect(invoke).toHaveBeenCalledTimes(1);
    const { result: rf } = renderHook(() => useJobMapGeneration(args({ companyId: "frozen-co" })));
    await act(async () => { await rf.current.run(); });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(rf.current.failed).toBe(true);
  });
});
