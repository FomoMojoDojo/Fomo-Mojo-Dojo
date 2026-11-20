// SP-455 round, 2026-11-19: the Brief's reads are PAGED and the signal read is CHUNKED.
//
// Both were real defects caught on the real page, not hypotheticals:
//   - unpaged, PostgREST returned the first 1,000 of Charter's 4,950 need_evidence rows and the page
//     rendered 3 hotspots and 12 thin spots where the stored rows say 11 and 4, with the top need at
//     7 counted quotes instead of 44. A count on a partial read is a fabricated number.
//   - unchunked, `id=in.(…330 ids)` is a ~12 KB request line and the fetch failed outright, so the
//     page rendered nothing at all.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const PAGE = 1000;
const calls = vi.hoisted(() => [] as Array<{ table: string; from?: number; to?: number; ids?: number }>);

vi.mock("@/integrations/supabase/client", () => {
  const rows = (table: string, from: number, to: number, ids: string[] | null) => {
    if (table === "odi_needs") return from === 0 ? [{ id: "n1", desired_outcome: "A NEED", source_path: "public_research" }] : [];
    if (table === "need_evidence") {
      // two FULL pages then a short one — 2,100 labels on one need
      const total = 2100;
      return Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => ({
        need_id: "n1", signal_id: `s${from + i}`, bears: true, polarity: "not working", brand: "spectrum",
      }));
    }
    // signals: answer only for the ids this chunk asked for
    return (ids ?? []).map((id) => ({ id, quote: `quote ${id}`, source_url: "https://www.bbb.org/x", event_date: "2026-09-30" }));
  };
  const make = (table: string) => {
    const state: { ids: string[] | null } = { ids: null };
    const builder: Record<string, unknown> = {};
    const chain = new Proxy(builder, {
      get: (_t, prop) => {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        }
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

import { useBriefNeeds } from "./useBriefNeeds";

describe("the Brief's reads", () => {
  beforeEach(() => { calls.length = 0; });
  it("page until a short page, so a count is never taken from the first page alone", async () => {
    const { result } = renderHook(() => useBriefNeeds("co"));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10_000 });

    const ev = calls.filter((c) => c.table === "need_evidence");
    expect(ev.length).toBeGreaterThanOrEqual(3);
    expect(ev[0]).toMatchObject({ from: 0, to: PAGE - 1 });
    expect(ev[1]).toMatchObject({ from: PAGE, to: 2 * PAGE - 1 });
    expect(ev[2]).toMatchObject({ from: 2 * PAGE, to: 3 * PAGE - 1 });
    // all 2,100 labels reached the tally, not the first 1,000
    expect(result.current.needs).toHaveLength(1);
    expect(result.current.needs[0].tally.counted).toBe(2100);
  });

  it("ask for the signals in chunks small enough to be a URL", async () => {
    const { result } = renderHook(() => useBriefNeeds("co2"));
    await waitFor(() => expect(result.current.loading).toBe(false), { timeout: 10_000 });
    const sig = calls.filter((c) => c.table === "signals");
    expect(sig.length).toBeGreaterThan(1);
    for (const c of sig) expect(c.ids).toBeLessThanOrEqual(60);
    // every id was asked for exactly once
    expect(sig.reduce((n, c) => n + (c.ids ?? 0), 0)).toBe(2100);
  });
});
