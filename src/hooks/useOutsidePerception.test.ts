// GATE B — useOutsidePerception exposes an additive `error` (incl. a 10s deadline) for
// OutsideMessageBand's signed error state, WITHOUT bounding `loading` (ExportButton must keep
// blocking a hung export — Gate D). So: a returning error sets error + loading=false; a
// never-returning read sets error at the deadline while loading STAYS TRUE (export stays
// disabled); success/zero-row are byte-identical.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const h = vi.hoisted(() => ({ result: null as null | { data: unknown; error: unknown }, never: false }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = () => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "in", "not", "maybeSingle", "abortSignal"]) b[m] = () => b;
    // thenable: awaiting the built query resolves to the scripted result (or never resolves).
    (b as { then: unknown }).then = (res: (v: unknown) => void, rej: (e: unknown) => void) =>
      (h.never ? new Promise(() => {}) : Promise.resolve(h.result)).then(res, rej);
    return b;
  };
  return { supabase: { from: () => chain() } };
});

import { useOutsidePerception } from "./useOutsidePerception";

afterEach(() => { vi.useRealTimers(); h.result = null; h.never = false; });

describe("useOutsidePerception (Gate B honest read)", () => {
  it("returning error → error set, claims [], loading false", async () => {
    h.result = { data: null, error: { message: "PostgREST 500" } };
    const { result } = renderHook(() => useOutsidePerception("co-1"));
    await waitFor(() => expect(result.current.error).toBe("PostgREST 500"));
    expect(result.current.claims).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("never-returning → error at the 10s deadline; loading STAYS TRUE (ExportButton stays blocked)", async () => {
    vi.useFakeTimers();
    h.never = true;
    const { result } = renderHook(() => useOutsidePerception("co-1"));
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.error).toMatch(/deadline exceeded/);
    expect(result.current.loading).toBe(true); // NOT bounded — the export must stay disabled
  });

  it("successful zero-row → claims [], loading false, no error (byte-identical empty)", async () => {
    h.result = { data: [], error: null };
    const { result } = renderHook(() => useOutsidePerception("co-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.claims).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("successful with rows → claims populated (statement-trimmed), no error", async () => {
    h.result = { data: [{ id: "c1", statement: "Public line.", topic: null, provenance: "public_observed" }, { id: "c2", statement: "  ", topic: null, provenance: "public_observed" }], error: null };
    const { result } = renderHook(() => useOutsidePerception("co-1"));
    await waitFor(() => expect(result.current.claims.length).toBe(1));
    expect(result.current.claims[0].id).toBe("c1");
    expect(result.current.error).toBeNull();
  });
});
