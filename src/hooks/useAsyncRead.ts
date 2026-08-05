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
