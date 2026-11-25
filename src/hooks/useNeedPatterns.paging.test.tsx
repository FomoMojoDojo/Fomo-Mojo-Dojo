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
    // SP-502: the parts read is a FOURTH paged read. Until this branch existed it fell through to the
    // signals catch-all and returned nothing, so every assertion about parts would have passed on an
    // empty list — the same vacuous-pass shape that let pattern-lane-guard (l2) sit green while red.
    if (table === "need_pattern_parts") {
      // 1,200 rows: one full page then a short one. pat1's three parts arrive OUT of ordinal order,
      // because the read is ordered by id for a stable page boundary and sorted in the hook.
      const total = 1200;
      const all = [
        { pattern_id: "pat1", ordinal: 3, predicate: "third predicate" },
        { pattern_id: "pat1", ordinal: 1, predicate: "first predicate" },
        { pattern_id: "pat1", ordinal: 2, predicate: "second predicate" },
        ...Array.from({ length: total - 3 }, (_, i) => ({ pattern_id: `other${i}`, ordinal: 1, predicate: `p${i}` })),
      ];
      return all.slice(from, Math.min(to + 1, total));
    }
    if (table === "need_pattern_quotes") {
      // 2,100 quote rows under the one pattern — two full pages then a short one
      const total = 2100;
      return Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({
        pattern_id: "pat1", signal_id: `s${from + i}`, bears: true,
        // SP-665: each quote row carries its own stored span
        states_span: `span of s${from + i}`,
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

  it("SP-502: the PARTS read is paged too, and the parts come back in ordinal order", async () => {
    const { result } = renderHook(() => useNeedPatterns("co-parts"));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10_000 });
    const pp = calls.filter((c) => c.table === "need_pattern_parts");
    expect(pp.length).toBeGreaterThanOrEqual(2);
    expect(pp[0]).toMatchObject({ from: 0, to: PAGE - 1 });
    expect(pp[1]).toMatchObject({ from: PAGE, to: 2 * PAGE - 1 });
    // the mock serves them 3,1,2 — a claim's predicates must never render in page order
    expect(result.current.patterns[0].parts).toEqual(["first predicate", "second predicate", "third predicate"]);
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

  it("SP-665: the representative quote's stored span comes from THIS pattern's own row for that quote", async () => {
    const { result } = renderHook(() => useNeedPatterns("co-span"));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10_000 });
    // pat1's representative is s0; the span is the one stored on (pat1, s0), not another row's
    expect(result.current.patterns[0].representative?.signalId).toBe("s0");
    expect(result.current.patterns[0].representativeSpan).toBe("span of s0");
  });

  it("SP-674: each pattern hands out its supporting quotes — the rows `supporting` counts — from the reads it already makes", async () => {
    const { result } = renderHook(() => useNeedPatterns("co-quotes"));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10_000 });
    const pat = result.current.patterns[0];
    expect(pat.quotes).toHaveLength(pat.supporting);
    expect(pat.quotes).toHaveLength(2100);
    // the verified quote, the page it came from and its date; no brand, because signals carries none
    expect(pat.quotes!.find((x) => x.signalId === "s7")).toEqual({ signalId: "s7", quote: "quote s7", brand: "", sourceUrl: "https://www.bbb.org/s7", eventDate: "2026-09-30" });
    // no read was added for it: the same four tables as before
    expect([...new Set(calls.map((c) => c.table))].sort()).toEqual(["need_pattern_parts", "need_pattern_quotes", "need_patterns", "signals"]);
  });

  it("makes no read at all without a company", async () => {
    const { result } = renderHook(() => useNeedPatterns(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls).toHaveLength(0);
    expect(result.current.patterns).toEqual([]);
  });
});
