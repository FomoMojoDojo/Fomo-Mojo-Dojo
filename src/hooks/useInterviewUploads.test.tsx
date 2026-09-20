// Gate B guard (j), client side — ruling R4 (2026-09-19): Change market APPENDS an operator_override entry to
// market_basis (history: original "none" first) and writes journey_key + market_state = placed — nothing else.
// Two changes → three entries. Plant: overwrite (basis replaced) → the first entry is no longer "none".
import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const DB = vi.hoisted(() => ({ records: [] as Array<Record<string, unknown>>, updates: [] as Array<{ id: string; patch: Record<string, unknown> }> }));
vi.mock("@/integrations/supabase/client", () => {
  const q = (rows: () => Array<Record<string, unknown>>) => {
    const b: Record<string, unknown> = {}; let patch: Record<string, unknown> | null = null; const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    b.select = () => b; b.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; }; b.is = () => b; b.not = () => b;
    b.update = (p: Record<string, unknown>) => { patch = p; return b; };
    b.then = (res: (v: unknown) => void) => {
      const matching = rows().filter((r) => filters.every((f) => f(r)));
      if (patch) { for (const r of matching) { DB.updates.push({ id: String(r.id), patch }); Object.assign(r, patch); } patch = null; return res({ data: null, error: null }); }
      return res({ data: matching, error: null });
    };
    return b;
  };
  return { supabase: { auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-op" } } }) }, from: (t: string) => q(() => (t === "interview_records" ? DB.records : t === "odi_market_definitions" ? [{ journey_key: "customer", retracted_at: null }, { journey_key: "pmk-funders", retracted_at: null }] : t === "market_lens" ? [{ company_id: "co", journey_key: "pmk-funders", title: "Funders lens title" }] : [])) } };
});
vi.mock("@/lib/liveDefinitionKeys", () => ({ readLiveDefinitionKeys: async () => ["customer", "pmk-funders"] }));
import { useInterviewUploads } from "./useInterviewUploads";

describe("useInterviewUploads — Change market appends (R4)", () => {
  it("(j) two changes → three entries, first = original none; only journey_key / market_state / market_basis are written", async () => {
    DB.records = [{ id: "r1", company_id: "co", input_file_id: "f1", speaker_role: "market_participant", market_state: "unplaced", journey_key: null, market_basis: [{ kind: "original", result: "none", at: "t0" }], review_state: "unreviewed", retracted_at: null }];
    DB.updates.length = 0;
    const { result } = renderHook(() => useInterviewUploads("co"));
    await waitFor(() => expect(result.current.records.length).toBe(1));
    expect(result.current.markets).toEqual([{ key: "customer", title: "customer" }, { key: "pmk-funders", title: "Funders lens title" }]);
    await act(async () => { await result.current.changeMarket(result.current.records[0], "pmk-funders"); });
    await waitFor(() => expect(result.current.records[0].journey_key).toBe("pmk-funders"));
    await act(async () => { await result.current.changeMarket(result.current.records[0], "customer"); });
    await waitFor(() => expect(result.current.records[0].journey_key).toBe("customer"));
    const basis = DB.records[0].market_basis as Array<Record<string, unknown>>;
    expect(basis.length).toBe(3);
    expect(basis[0]).toEqual({ kind: "original", result: "none", at: "t0" });
    expect(basis[1]).toMatchObject({ kind: "operator_override", journey_key: "pmk-funders", by: "user-op" });
    expect(basis[2]).toMatchObject({ kind: "operator_override", journey_key: "customer", by: "user-op" });
    expect(DB.records[0].market_state).toBe("placed");
    for (const u of DB.updates) expect(Object.keys(u.patch).sort()).toEqual(["journey_key", "market_basis", "market_state"]);
  });
});
