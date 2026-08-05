// GATE A (client-view honest failure handling) — the shared async-read primitive.
//
// WHY THIS EXISTS: every client-view hook today swallows a returning query error
// into an empty result (so the act renders its honest-empty / signed-absence copy)
// and has NO deadline (so a never-returning request hangs on the loading string
// forever). A dropped connection could render "Everything you've told us turned up
// somewhere in what we've read." — the strongest absence claim on the surface,
// produced by the weakest cause. This primitive makes loading / error / ready a
// DISCRIMINATED, mutually-exclusive state, and converts a hang into an error at a
// bounded deadline. Gate A builds it; NO act is migrated onto it here (Gate B).
//
// The three states are a discriminated union on `status`. The compiler enforces
// exclusivity: the 'error' variant carries NO `data`, the 'ready' variant carries
// NO `error` — it is not representable to hold a populated data value and an error
// at the same time. This is real type-level enforcement, not a runtime convention.

import { useEffect, useRef, useState, type DependencyList } from "react";

export type AsyncState<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: T };

// Deadline justification (design gate, measured read-only): healthy client-view
// reads cost 0.1–1.3ms server-side / ~8–12ms loopback round-trip / sub-second over
// Tailscale. 10s is 20–50× the pessimistic-healthy case, so nothing healthy can
// false-fail, and a genuinely slow (<10s) request still completes and shows data.
// A request still pending at 10s transitions to ERROR — never to empty. This bound
// is network/DB, NOT the 150s edge-isolate ceiling (these are direct
// browser→PostgREST reads and never enter an isolate).
export const ASYNC_READ_DEADLINE_MS = 10_000;

/**
 * Run `fetcher` and expose its outcome as a discriminated {loading|error|ready}.
 * The fetcher receives an AbortSignal it SHOULD honor (e.g. supabase
 * `.abortSignal(signal)`), but the deadline does not depend on cooperation: the
 * outcome races the fetcher against a timeout, so a fetcher that ignores the
 * signal still transitions to `error` at the deadline rather than hanging.
 */
export function useAsyncRead<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  opts?: { deadlineMs?: number },
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ status: "loading" });
  const deadlineMs = opts?.deadlineMs ?? ASYNC_READ_DEADLINE_MS;
  // `deps` intentionally drives re-fetch; the fetcher itself is read from the
  // latest render via a ref so callers need not memoize it to avoid staleness.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const data = await Promise.race([
          fetcherRef.current(controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new Error(`async-read deadline exceeded (${deadlineMs}ms)`));
            }, deadlineMs);
          }),
        ]);
        if (!cancelled) setState({ status: "ready", data });
      } catch (e) {
        if (!cancelled) {
          setState({ status: "error", error: String((e as Error)?.message ?? e) });
        }
      } finally {
        if (timer) clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true; // stale/unmounted runs never setState
      controller.abort();
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, deadlineMs]);

  return state;
}

// ── GATE C — adapter for hooks that expose {loading, error?, data} ────────────
// Most client-view hooks already own their fetch (useState/useEffect or react-query)
// and cannot all be rewritten onto useAsyncRead without disturbing their many other
// consumers. useReadState converts a hook's existing {loading, error?, data} into the
// discriminated AsyncState an act feeds to <ActData>, AND adds the 10s deadline at the
// ACT boundary (mode i): if the read is still loading after the deadline it becomes an
// error. The hook's own loading is NOT bounded — only this act-side view flips — so a
// hook shared with ExportButton keeps its exact loading behaviour (Gate D's blocked-
// export invariant is preserved). `error` (mode ii) still comes FROM the hook: a hook
// that swallows a query error to empty must additively expose it, or a returning error
// is indistinguishable from a genuine empty here.
export function useReadState<T>(
  loading: boolean,
  error: string | null | undefined,
  data: T,
  resetKey: unknown,
  deadlineMs: number = ASYNC_READ_DEADLINE_MS,
): AsyncState<T> {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    setExpired(false);
    if (!loading) return;
    const t = setTimeout(() => setExpired(true), deadlineMs);
    return () => clearTimeout(t);
  }, [loading, resetKey, deadlineMs]);

  if (error != null) return { status: "error", error };
  if (loading && expired) return { status: "error", error: `async-read deadline exceeded (${deadlineMs}ms)` };
  if (loading) return { status: "loading" };
  return { status: "ready", data };
}
