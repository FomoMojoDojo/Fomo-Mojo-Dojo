// OWN-WORDS RETYPE BACKFILL — core guards (operator ruling 2026-09-03). The sanctioned door for re-typing
// existing own_words claims. Proves: (a) CB1 (frozen) is refused before ANY store read; (b) dry-run judges
// and plans but WRITES NOTHING; (c) apply writes the two columns + one audit row per change under a ledger
// row, and a missing kind proposes no change (fail-toward-eligible, nothing written from a glitch).
import { describe, expect, it, vi } from "vitest";
import { runOwnWordsRetype } from "../../../supabase/functions/_shared/ownWordsRetype.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const CO = "fd3f7f63-968b-4698-b946-3d6b6450d79d";
type Row = Record<string, unknown>;

function fakeStore(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; op: string }> = [];
  const writes: Array<{ table: string; op: string; payload: Row }> = [];
  function chain(table: string, op: string, payload?: Row) {
    const filters: Array<[string, unknown]> = [];
    calls.push({ table, op });
    const run = () => {
      let rows = tables[table] ?? [];
      for (const [col, v] of filters) rows = rows.filter((r) => r[col] === v);
      if (op === "update") { for (const r of rows) { Object.assign(r, payload); writes.push({ table, op, payload: { ...payload!, id: r.id } }); } return { data: null, error: null }; }
      if (op === "insert") { (tables[table] ??= []).push(payload!); writes.push({ table, op, payload: payload! }); return { data: payload, error: null }; }
      return { data: rows, error: null };
    };
    const q: Record<string, unknown> = {};
    q.eq = (col: string, v: unknown) => { filters.push([col, v]); return q; };
    q.select = () => q; q.order = () => q; q.limit = () => q;
    q.maybeSingle = () => { const r = run() as { data: Row[] }; return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); };
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    return q;
  }
  const supabase = { from: (t: string) => ({ select: () => chain(t, "select"), update: (p: Row) => chain(t, "update", p), insert: (p: Row) => chain(t, "insert", p) }) };
  return { supabase, calls, writes, tables };
}

const claims = () => [
  { id: "c-pos", company_id: CO, claim_type: "own_words", status: "active", statement: "We roast for cafés that want a partner, not a vendor.", raw_payload: { page_url: "https://www.cafebarra.com/partnerships" }, statement_kind: null, declared_eligible: true },
  { id: "c-instr", company_id: CO, claim_type: "own_words", status: "active", statement: "Just add hot water.", raw_payload: { page_url: "https://www.cafebarra.com/home" }, statement_kind: null, declared_eligible: true },
  { id: "c-glitch", company_id: CO, claim_type: "own_words", status: "active", statement: "This is the Barra Method.", raw_payload: { page_url: "https://www.cafebarra.com/home" }, statement_kind: null, declared_eligible: true },
];
const judge = vi.fn(async (_page: string | null, statements: string[]) => statements.map((q) => {
  if (q.startsWith("We roast")) return { quote: q, kind: "positioning", kindReason: "why choose us" };
  if (q.startsWith("Just add")) return { quote: q, kind: "instruction", kindReason: "usage copy" };
  return { quote: q, kind: "tagline-ish", kindReason: "invalid kind on purpose" }; // glitch
}));

describe("(a) CB1 refused before any read", () => {
  it("frozen fixture → skipped, zero store calls, judge never called", async () => {
    const store = fakeStore({ companies: [{ id: CB1, frozen: true }], claims: [] });
    const j = vi.fn();
    const out = await runOwnWordsRetype({ supabase: store.supabase, companyId: CB1, mode: "apply", judge: j, nowIso: "2026-09-03T23:00:00Z" });
    expect(out).toEqual({ ok: false, skipped: "frozen_company" });
    expect(store.calls).toHaveLength(0);
    expect(j).not.toHaveBeenCalled();
  });
});

describe("(b) dry-run plans, writes nothing", () => {
  it("one judge call per page; plan carries the proposals; ZERO inserts/updates", async () => {
    const store = fakeStore({ companies: [{ id: CO, frozen: false }], claims: claims(), own_words_page_snapshots: [{ company_id: CO, source_url: "https://www.cafebarra.com/home", clean_text: "Just add hot water. This is the Barra Method." }] });
    judge.mockClear();
    const out = await runOwnWordsRetype({ supabase: store.supabase, companyId: CO, mode: "dry_run", judge, nowIso: "2026-09-03T23:00:00Z" });
    if (!out.ok) throw new Error("expected ok");
    expect(out.mode).toBe("dry_run");
    expect(out.totals.pages).toBe(2);
    expect(judge).toHaveBeenCalledTimes(2);
    const byId = new Map(out.plan.map((p) => [p.claim_id, p]));
    expect(byId.get("c-pos")).toMatchObject({ proposed_kind: "positioning", proposed_eligible: true, changed: true });
    expect(byId.get("c-instr")).toMatchObject({ proposed_kind: "instruction", proposed_eligible: false, changed: true });
    expect(byId.get("c-glitch")).toMatchObject({ proposed_kind: null, proposed_eligible: true, kind_missing: true, changed: false });
    expect(store.writes).toHaveLength(0);
    expect(store.tables.claims.every((c) => c.statement_kind === null && c.declared_eligible === true)).toBe(true);
  });
});

describe("(c) apply writes the two columns + one audit row per change under a ledger row", () => {
  it("changed rows updated and audited; the glitch row untouched; ledger running → completed", async () => {
    const store = fakeStore({ companies: [{ id: CO, frozen: false }], claims: claims(), own_words_page_snapshots: [], long_runner_runs: [], own_words_retypes: [] });
    const out = await runOwnWordsRetype({ supabase: store.supabase, companyId: CO, mode: "apply", judge, nowIso: "2026-09-03T23:00:00Z", runId: "run-1" });
    if (!out.ok) throw new Error("expected ok");
    expect(out.totals.applied).toBe(2);
    expect(out.totals.audited).toBe(2);
    const c = new Map(store.tables.claims.map((r) => [r.id, r]));
    expect(c.get("c-pos")).toMatchObject({ statement_kind: "positioning", declared_eligible: true });
    expect(c.get("c-instr")).toMatchObject({ statement_kind: "instruction", declared_eligible: false });
    expect(c.get("c-glitch")).toMatchObject({ statement_kind: null, declared_eligible: true });
    expect(store.tables.own_words_retypes).toHaveLength(2);
    expect(store.tables.own_words_retypes.find((a) => a.claim_id === "c-instr")).toMatchObject({ from_eligible: true, to_eligible: false, to_kind: "instruction", run_id: "run-1" });
    expect(store.tables.long_runner_runs[0]).toMatchObject({ run_kind: "own_words_retype", status: "completed", done_count: 2 });
    // never a delete, never a rewritten statement
    expect(store.calls.some((x) => x.op === "delete")).toBe(false);
    expect(store.tables.claims.map((r) => r.statement)).toEqual(claims().map((r) => r.statement));
  });
});
