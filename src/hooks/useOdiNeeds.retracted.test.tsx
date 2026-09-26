// Gate 3 (2026-09-16) — the KEYED needs read embeds the interview record and excludes retracted
// rows (status='retracted'); the no-key path keeps its select('*') and excludes retracted rows too.
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const calls = vi.hoisted(() => ({ needs: [] as Array<{ select: string; filters: string[] }> }));
vi.mock("@/integrations/supabase/client", () => {
  const builder = (table: string) => {
    const rec = { select: "", filters: [] as string[] };
    if (table === "odi_needs") calls.needs.push(rec);
    const b: Record<string, unknown> = {};
    b.select = (c: string) => { rec.select = c; return b; };
    b.eq = (c: string, v: unknown) => { rec.filters.push(`eq ${c}=${v}`); return b; };
    b.neq = (c: string, v: unknown) => { rec.filters.push(`neq ${c}=${v}`); return b; };
    b.not = (c: string, op: string, v: unknown) => { rec.filters.push(`not ${c} ${op} ${v}`); return b; };
    b.order = () => b; b.limit = () => b; b.maybeSingle = () => b;
    b.then = (res: (v: unknown) => void) => res({ data: table === "odi_needs" ? [] : null, error: null });
    return b;
  };
  return { supabase: { from: builder } };
});
import { useOdiNeeds } from "./useOdiNeeds";

describe("useOdiNeeds — keyed read (gate 3)", () => {
  it("embeds interview_records and excludes status=retracted", async () => {
    calls.needs.length = 0;
    const { result } = renderHook(() => useOdiNeeds("co", 0, "customer"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls.needs).toHaveLength(1);
    const q = calls.needs[0];
    expect(q.select).toBe("*, interview_records(id, speaker_role, person_name, interviewed_at, verbatim, retracted_at)");
    expect(q.filters).toEqual(["eq company_id=co", "eq journey_key=customer", "neq status=retracted"]);
  });
  it("the no-key path keeps select('*'), excludes status=retracted (gate 3 delta, ruling 1) AND the empty market (4f-6)", async () => {
    calls.needs.length = 0;
    const { result } = renderHook(() => useOdiNeeds("co", 0));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(calls.needs).toHaveLength(1);
    const q = calls.needs[0];
    expect(q.select).toBe("*");
    // 4f-6 (F9): the no-key path is still a MARKET surface, so a company-held need (journey_key
    // NULL) is excluded server-side. Without this the home, the shell and the score would count it.
    expect(q.filters).toEqual(["eq company_id=co", "not journey_key is null", "neq status=retracted"]);
  });
});
