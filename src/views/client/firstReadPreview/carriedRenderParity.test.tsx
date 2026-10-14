// ── D2 (operator ruling, 2026-10-13): A2's render is wired, on carried lines only ───────────────
//
// renderCarried was written on 2026-10-13 and had NO CALLER anywhere in the repo until D2, so staged
// read dbdf897c rendered its carried line as "In 1993 Edgewood established the first kinship program
// in the country" — the raw span — instead of A2's "established the first kinship program in the
// country". These tests run the REAL hook (useFirstReadPreviewData, the same one the First Read
// renders from) over the real dbdf897c payload and carried block.
//
// STORE/RENDER PARITY is the point: the payload the hook read is byte-identical afterwards, and the
// drift check's own test (verbatimProvable against the stored span) is unaffected — only what the
// reader sees is shortened.
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";

// verbatim from public_reads.payload of dbdf897c, and from its input_ledger.carried
const CARRY_0 = "CSU 'one of only a few CSUs designed to serve youth 5-17 in all of California and the only one serving youth under 12 in the Bay Area'";
const CARRY_1 = "in 1993 Edgewood established the first kinship program in the country";
const GENERATED = "a 170+ year institutional history with deep government payer relationships";

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
      like: () => b, not: () => b, gte: () => b, order: () => b,
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

/** The payload object the test hands the hook — kept by reference so parity can be checked after. */
const payload = {
  market_category: "nonprofit youth mental healthcare provider",
  market_category_class: "our_read",
  market_category_citations: [],
  value_for_customer: "expert mental healthcare and comprehensive support services",
  value_class: "you", value_citations: [],
  best_fit_customers: "children, youth, and families in the San Francisco Bay Area",
  best_fit_class: "our_read", best_fit_citations: [],
  unique_attributes: [
    { text: CARRY_0, class: "you", citations: [] },
    { text: CARRY_1, class: "record", citations: [] },
    { text: GENERATED, class: "our_read", citations: [] },
  ],
};
const ledger = {
  classes: {},
  carried: {
    "unique_attributes[0]": { primary: { row_id: "ba7ee838", start: 42, end: 176 }, second: null, stored_text: CARRY_0, rejected: [] },
    "unique_attributes[1]": { primary: { row_id: "dfb6da68", start: 45, end: 114 }, second: null, stored_text: CARRY_1, rejected: [] },
  },
};

let db = fakeSupabase({});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => db.from(t), functions: { invoke: vi.fn() } },
  HAS_SUPABASE_CREDENTIALS: true,
  RESOLVED_SUPABASE_URL: "http://localhost",
}));

import { useFirstReadPreviewData } from "@/views/client/firstReadPreview/useFirstReadPreviewData";

const fixture = () => fakeSupabase({
  companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org/" }],
  public_reads: [{ kind: "positioning", payload, input_ledger: ledger, is_current: true, company_id: CO, created_at: "2026-10-13T00:00:00Z" }],
});

describe("D2: A2's render on the real First Read hook", () => {
  it("a CARRIED line renders A2's render; the GENERATED line is untouched", async () => {
    db = fixture();
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const diffs = result.current.data.positioning?.differentiators ?? [];
    expect(diffs).toHaveLength(3);
    // line 02 — the one dbdf897c got wrong
    expect(diffs[1]).toBe("established the first kinship program in the country");
    expect(diffs[1]).not.toContain("1993");
    expect(diffs[1]).not.toContain("Edgewood");
    // line 01 has no leading date phrase and does not open with the company name, so A2 changes
    // nothing about it — the render is narrow, not a general trim
    expect(diffs[0]).toBe(CARRY_0);
    // line 03 is OURS, not the record's, and is never trimmed as if it were
    expect(diffs[2]).toBe(GENERATED);
  });

  it("STORE/RENDER PARITY: the stored payload is byte-identical after the render", async () => {
    const before = JSON.stringify(payload);
    db = fixture();
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(JSON.stringify(payload)).toBe(before);
    expect(payload.unique_attributes[1].text).toBe(CARRY_1);
    expect(ledger.carried["unique_attributes[1]"].stored_text).toBe(CARRY_1);
  });

  it("CARRIED LINES ONLY: with no carried block, every line renders as stored", async () => {
    db = fakeSupabase({
      companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org/" }],
      public_reads: [{ kind: "positioning", payload, input_ledger: { classes: {} }, is_current: true, company_id: CO, created_at: "2026-10-13T00:00:00Z" }],
    });
    const { result } = renderHook(() => useFirstReadPreviewData(CO));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const diffs = result.current.data.positioning?.differentiators ?? [];
    expect(diffs[1]).toBe(CARRY_1);  // the raw span, exactly as dbdf897c rendered it before D2
  });
});
