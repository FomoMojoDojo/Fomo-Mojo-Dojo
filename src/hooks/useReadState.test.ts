// GATE C — useReadState: converts a hook's {loading, error?, data} into a discriminated
// AsyncState and adds the 10s deadline at the act boundary (a still-loading read becomes an
// error). error (mode ii) comes from the hook; the deadline (mode i) is added here.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useReadState, ASYNC_READ_DEADLINE_MS } from "./useAsyncRead";

afterEach(() => vi.useRealTimers());

describe("useReadState", () => {
  it("hook error → error state (mode ii), regardless of loading/data", () => {
    const { result } = renderHook(() => useReadState(false, "PostgREST 500", ["x"], "k"));
    expect(result.current).toEqual({ status: "error", error: "PostgREST 500" });
  });

  it("loading with no error → loading", () => {
    const { result } = renderHook(() => useReadState(true, null, [], "k"));
    expect(result.current.status).toBe("loading");
  });

  it("ready → carries the data", () => {
    const { result } = renderHook(() => useReadState(false, null, ["a"], "k"));
    expect(result.current).toEqual({ status: "ready", data: ["a"] });
  });

  it("still loading after the 10s deadline → error (mode i), never stuck loading/empty", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useReadState(true, null, [], "k"));
    expect(result.current.status).toBe("loading");
    await act(async () => { await vi.advanceTimersByTimeAsync(ASYNC_READ_DEADLINE_MS); });
    expect(result.current.status).toBe("error");
    if (result.current.status === "error") expect(result.current.error).toMatch(/deadline exceeded/);
  });

  it("resolves just before the deadline → still loading (a slow-but-healthy read is not false-failed)", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useReadState(true, null, [], "k"));
    await act(async () => { await vi.advanceTimersByTimeAsync(ASYNC_READ_DEADLINE_MS - 1); });
    expect(result.current.status).toBe("loading");
  });
});
