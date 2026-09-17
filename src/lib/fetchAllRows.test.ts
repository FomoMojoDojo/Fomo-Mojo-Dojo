// fetchAllRows (client mirror, 2026-09-17) + the First Read beat-2 "strong" membership read that uses it.
// Planted: 2,300 accepted verdicts across three pages of 1,000, each introducing a distinct signal id — the
// rendered figure (count of strong signals) must equal the full set (2,300), never the first page (1,000).
// Bypass (single page) fails; the contract matches supabase/functions/_shared/fetchAllRows.ts.
import { describe, expect, it } from "vitest";
import { FETCH_ALL_MAX_PAGES, fetchAllRows } from "./fetchAllRows";
import { loadAcceptedSignalIds } from "@/views/client/firstReadPreview/useFirstReadPreviewData";
import { strengthForSignal } from "@/views/client/firstReadPreview/mapping";

type Row = Record<string, unknown>;
/** A 3-page fake: filters, stable order by id, .range slicing, a call counter. */
function fakeClient(tables: Record<string, Row[]>) {
  let calls = 0;
  // deno-lint-ignore no-explicit-any
  const from = (table: string): any => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let rows = [...(tables[table] ?? [])];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      order: (c: string, o?: { ascending?: boolean }) => chain((r) => [...r].sort((x, y) => (String(x[c]) < String(y[c]) ? -1 : 1) * (o?.ascending === false ? -1 : 1))),
      range: (a: number, z: number) => chain((r) => r.slice(a, z + 1)),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) => { calls++; return Promise.resolve({ data: rows, error: null }).then(resolve); },
    });
    return b;
  };
  return { from, calls: () => calls };
}

const CO = "co-beat2";
const HUB = "signal-hub";
const planted = Array.from({ length: 2300 }, (_, i) => ({
  id: `v${String(i).padStart(4, "0")}`, company_id: CO, verdict: "accepted", signal_a_id: `sig-${String(i).padStart(4, "0")}`, signal_b_id: HUB,
}));

describe("fetchAllRows (client mirror)", () => {
  it("pages until a short page — 2,300 rows in 3 round trips, no overlap; one round trip when it fits", async () => {
    const db = fakeClient({ t: Array.from({ length: 2300 }, (_, i) => ({ id: `r${String(i).padStart(4, "0")}` })) });
    const all = await fetchAllRows<{ id: string }>((a, z) => db.from("t").select("id").order("id").range(a, z));
    expect(all.length).toBe(2300); expect(db.calls()).toBe(3);
    expect(new Set(all.map((r) => r.id)).size).toBe(2300);
    const db2 = fakeClient({ t: [{ id: "x" }] });
    expect((await fetchAllRows<{ id: string }>((a, z) => db2.from("t").select("id").order("id").range(a, z))).length).toBe(1);
    expect(db2.calls()).toBe(1);
  });
  it("refuses a bad page size and a query that ignores .range()", async () => {
    await expect(fetchAllRows(() => Promise.resolve({ data: [], error: null }), 0)).rejects.toThrow(/pageSize/);
    const full = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
    await expect(fetchAllRows(() => Promise.resolve({ data: full, error: null }))).rejects.toThrow(new RegExp(`exceeded ${FETCH_ALL_MAX_PAGES}`));
  });
});

describe("beat 2 'strong' membership — every accepted verdict, not the first page", () => {
  it("2,300 planted accepted verdicts across 3 pages → 2,300 strong signals (+ the hub); only accepted rows count", async () => {
    const db = fakeClient({ signal_recurrence_verdicts: [
      ...planted,
      { id: "zz-rejected", company_id: CO, verdict: "rejected", signal_a_id: "sig-rejected", signal_b_id: HUB },
      { id: "zz-other-co", company_id: "other", verdict: "accepted", signal_a_id: "sig-other", signal_b_id: HUB },
    ] });
    const confirmed = await loadAcceptedSignalIds(db, CO);
    expect(confirmed.size).toBe(2301);
    expect(confirmed.has("sig-rejected")).toBe(false);
    expect(confirmed.has("sig-other")).toBe(false);
    expect(db.calls()).toBe(3);
    // the rendered figure: strong = confirmed, whatever the confidence
    const eligible = planted.map((v) => ({ id: v.signal_a_id as string, confidence: "low" }));
    const strong = eligible.filter((s) => strengthForSignal(s.confidence, confirmed.has(s.id)) === "strong").length;
    expect(strong).toBe(2300);
  });
  it("BYPASS: a first-page-only read (the pre-fix shape) renders 1,000 strong for the same set — the fabricated figure", async () => {
    const db = fakeClient({ signal_recurrence_verdicts: planted });
    const firstPage = (await db.from("signal_recurrence_verdicts").select("signal_a_id, signal_b_id, verdict").eq("company_id", CO).eq("verdict", "accepted").order("id").range(0, 999)) as { data: Row[] };
    const confirmed = new Set<string>();
    for (const r of firstPage.data) { confirmed.add(String(r.signal_a_id)); confirmed.add(String(r.signal_b_id)); }
    const strong = planted.filter((v) => confirmed.has(String(v.signal_a_id))).length;
    expect(strong).toBe(1000); // what the beat used to render on a >1,000-accepted company
  });
});
