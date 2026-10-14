// ── VS3 (operator ruling, 2026-10-14): A2's render reaches the SHORT FORM ───────────────────────
//
// D2 wired renderCarried on the full read, so a carried line reads "established the first kinship
// program in the country" there. The short form lifts the SAME line through the signed slot and
// rendered it raw — "In 1993 Edgewood established …" — so the two surfaces disagreed about one
// sentence. These legs run the REAL hook over the real slot and the real carried block.
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
const READ = "cc5f64e3-b71e-4c60-b132-9f662f9309fb";

// verbatim from the stored slot e80010c9 and the carried block of read cc5f64e3
const CARRY_0 = "CSU 'one of only a few CSUs designed to serve youth 5-17 in all of California and the only one serving youth under 12 in the Bay Area'";
const CARRY_1 = "in 1993 Edgewood established the first kinship program in the country";
const GENERATED = "4-star Charity Navigator rating indicating solid performance in accountability, finance, and leadership";

type Row = Record<string, unknown>;
function fakeSupabase(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      neq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] !== v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      is: (c: string, v: unknown) => chain((r) => r.filter((x) => (x[c] ?? null) === v)),
      not: (c: string, _op: string, v: unknown) => chain((r) => r.filter((x) => (x[c] ?? null) !== v)),
      like: () => b, gte: () => b, order: () => b,
      limit: (n: number) => chain((r) => r.slice(0, n)),
      range: (a: number, z: number) => chain((r) => r.slice(a, z + 1)),
      abortSignal: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    });
    return b;
  };
  return { from, functions: { invoke: vi.fn() } };
}

/** the slot object, kept by reference so store/render parity can be checked after */
const slots = {
  differentiators: [
    { path: "verbatim", text: CARRY_0, citations: [], source_class: "you" },
    { path: "verbatim", text: CARRY_1, citations: [], source_class: "record" },
    { path: "verbatim", text: GENERATED, citations: [], source_class: "our_read" },
  ],
  category_context: { path: "generated", text: "nonprofit youth mental healthcare provider", citations: [], source_class: "our_read" },
};
const ledger = {
  classes: {},
  carried: {
    "unique_attributes[0]": { stored_text: CARRY_0 },
    "unique_attributes[1]": { stored_text: CARRY_1 },
  },
};

let db = fakeSupabase({});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => db.from(t), functions: { invoke: vi.fn() } },
  HAS_SUPABASE_CREDENTIALS: true,
  RESOLVED_SUPABASE_URL: "http://localhost",
}));

import { useFirstReadPreviewData } from "@/views/client/firstReadPreview/useFirstReadPreviewData";

// NOTE: a default parameter would be re-applied by an explicit `undefined`, which is how the
// no-carried-block leg first passed vacuously. `null` is the absent case and cannot default back.
const fixture = (carried: Record<string, unknown> | null = ledger.carried) => fakeSupabase({
  companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org/" }],
  public_reads: [{
    id: READ, kind: "positioning", company_id: CO, is_current: true, created_at: "2026-10-14T05:27:47Z",
    payload: { market_category: "nonprofit youth mental healthcare provider", market_category_class: "our_read", market_category_citations: [],
               unique_attributes: [{ text: CARRY_0, class: "you", citations: [] }, { text: CARRY_1, class: "record", citations: [] }, { text: GENERATED, class: "our_read", citations: [] }] },
    input_ledger: { ...ledger, carried: carried ?? undefined },
  }],
  first_read_slots: [{ kind: "positioning", company_id: CO, is_current: true, signed_at: "2026-10-14T05:39:05Z", source_read_id: READ, slots }],
});

describe("VS3: A2's render on the signed slot's short form", () => {
  it("a verbatim differentiator lifted from a CARRIED line renders A2's render", async () => {
    db = fixture();
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const lines = result.current.data.positioningSlots?.differentiators ?? [];
    expect(lines).toHaveLength(3);
    expect(lines[1].text).toBe("established the first kinship program in the country");
    expect(lines[1].text).not.toContain("1993");
    expect(lines[1].text).not.toContain("Edgewood");
    // line 01 is carried too, but has no leading date phrase and does not open with the company name
    expect(lines[0].text).toBe(CARRY_0);
  });

  it("a verbatim line the read did NOT carry is not trimmed", async () => {
    db = fixture();
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const lines = result.current.data.positioningSlots?.differentiators ?? [];
    expect(lines[2].text).toBe(GENERATED); // our own prose, verbatim-lifted but never carried
  });

  it("with NO carried block, every slot line renders exactly as stored", async () => {
    db = fixture(null);
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const lines = result.current.data.positioningSlots?.differentiators ?? [];
    expect(lines[1].text).toBe(CARRY_1); // the raw span — exactly what the short form showed before VS3
  });

  it("STORE/RENDER PARITY: the stored slot is byte-identical after the render", async () => {
    const before = JSON.stringify(slots);
    db = fixture();
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(JSON.stringify(slots)).toBe(before);
    expect(slots.differentiators[1].text).toBe(CARRY_1);
  });
});
