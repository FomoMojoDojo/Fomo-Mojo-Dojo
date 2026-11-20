// ── SP-465 / SP-463: the pattern reads are PAGED and the signal read is CHUNKED ──────────────────
//
// The same two defects useBriefNeeds was fixed for, and for the same reason: a derived count taken
// from the first 1,000 rows of a larger set is a fabricated number, and `id=in.(…)` is a URL with a
// length limit. A pattern's supporting count is derived on every render (SP-463 stores none), so a
// partial read of need_pattern_quotes would understate the evidence under a finding.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const PAGE = 1000;
const calls = vi.hoisted(() => [] as Array<{ table: string; from?: number; to?: number; ids?: number }>);

vi.mock("@/integrations/supabase/client", () => {
  const rows = (table: string, from: number, to: number, ids: string[] | null) => {
    if (table === "need_patterns") {
      return from === 0
        ? [{ id: "pat1", need_id: "n1", name: "A PATTERN", strength: "confirmed rule", signed_at: null, representative_signal_id: "s0" }]
        : [];
    }
    if (table === "need_pattern_quotes") {
      // 2,100 quote rows under the one pattern — two full pages then a short one
      const total = 2100;
      return Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({
        pattern_id: "pat1", signal_id: `s${from + i}`, bears: true,
      }));
    }
    return (ids ?? []).map((id) => ({ id, quote: `quote ${id}`, source_url: `https://www.bbb.org/${id}`, event_date: "2026-09-30" }));
  };
  const make = (table: string) => {
    const state: { ids: string[] | null } = { ids: null };
    const chain = new Proxy({} as Record<string, unknown>, {
      get: (_t, prop) => {
        if (prop === "then") return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return (...a: unknown[]) => {
          if (prop === "in") state.ids = a[1] as string[];
          if (prop === "range") {
            const [from, to] = a as [number, number];
            calls.push({ table, from, to, ids: state.ids?.length });
            return { then: (resolve: (v: unknown) => void) => resolve({ data: rows(table, from, to, state.ids), error: null }) };
          }
          return chain;
        };
      },
    });
    return chain;
  };
  return { supabase: { from: (t: string) => make(t) } };
});

import { useNeedPatterns } from "./useNeedPatterns";

describe("the pattern layer's reads", () => {
  beforeEach(() => { calls.length = 0; });

  it("page until a short page, so a derived supporting count is never the first page's", async () => {
    const { result } = renderHook(() => useNeedPatterns("co"));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10_000 });
    const pq = calls.filter((c) => c.table === "need_pattern_quotes");
    expect(pq.length).toBeGreaterThanOrEqual(3);
    expect(pq[0]).toMatchObject({ from: 0, to: PAGE - 1 });
    expect(pq[1]).toMatchObject({ from: PAGE, to: 2 * PAGE - 1 });
    expect(result.current.patterns).toHaveLength(1);
    expect(result.current.patterns[0].supporting).toBe(2100);
  });

  it("ask for the signals in chunks small enough to be a URL", async () => {
    const { result } = renderHook(() => useNeedPatterns("co2"));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10_000 });
    const sig = calls.filter((c) => c.table === "signals");
    expect(sig.length).toBeGreaterThan(1);
    for (const c of sig) expect(c.ids).toBeLessThanOrEqual(60);
  });

  it("derives the SITE count through siteOf, not from a stored column", async () => {
    const { result } = renderHook(() => useNeedPatterns("co3"));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10_000 });
    // every mocked signal is a bbb.org url, so 2,100 quotes sit on exactly ONE site
    expect(result.current.patterns[0].sites).toBe(1);
  });

  it("makes no read at all without a company", async () => {
    const { result } = renderHook(() => useNeedPatterns(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toHaveLength(0);
    expect(result.current.patterns).toEqual([]);
  });
});
