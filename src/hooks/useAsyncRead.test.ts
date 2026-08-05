// GATE A falsification — the async-read primitive: a never-returning fetch must
// transition to ERROR at the deadline (never loading/ready), and a returning error
// must land in ERROR (never ready). Proven with fake timers so no real network.
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAsyncRead, ASYNC_READ_DEADLINE_MS } from "./useAsyncRead";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("useAsyncRead", () => {
  it("deadline is 10s", () => {
    expect(ASYNC_READ_DEADLINE_MS).toBe(10_000);
  });

  it("a never-resolving fetch transitions to ERROR at the deadline — not loading, not empty", async () => {
    vi.useFakeTimers();
    // Ignores the abort signal entirely: proves the deadline does not depend on
    // fetcher cooperation (Promise.race drives the transition).
    const neverResolves = () => new Promise<string[]>(() => {});
    const { result } = renderHook(() => useAsyncRead<string[]>(neverResolves, []));

    expect(result.current.status).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ASYNC_READ_DEADLINE_MS);
    });

    expect(result.current.status).toBe("error");
    if (result.current.status === "error") {
      expect(result.current.error).toMatch(/deadline exceeded/);
    }
    // structurally impossible to also be holding data — assert the shape has none.
    expect((result.current as { data?: unknown }).data).toBeUndefined();
  });

  it("stays loading just before the deadline (a slow-but-healthy request is not false-failed)", async () => {
    vi.useFakeTimers();
    const neverResolves = () => new Promise<string[]>(() => {});
    const { result } = renderHook(() => useAsyncRead<string[]>(neverResolves, []));
    await act(async () => { await vi.advanceTimersByTimeAsync(ASYNC_READ_DEADLINE_MS - 1); });
    expect(result.current.status).toBe("loading");
  });

  it("a returning error lands in ERROR — not ready", async () => {
    const failing = () => Promise.reject(new Error("PostgREST 500"));
    const { result } = renderHook(() => useAsyncRead<string[]>(failing, []));
    await waitFor(() => expect(result.current.status).toBe("error"));
    if (result.current.status === "error") expect(result.current.error).toContain("PostgREST 500");
  });

  it("a resolving fetch lands in READY with its data", async () => {
    const ok = () => Promise.resolve(["a", "b"]);
    const { result } = renderHook(() => useAsyncRead<string[]>(ok, []));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status === "ready") expect(result.current.data).toEqual(["a", "b"]);
  });
});
