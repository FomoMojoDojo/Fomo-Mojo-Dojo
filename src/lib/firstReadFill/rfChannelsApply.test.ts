// RF CHANNELS APPLY — core guards (operator ruling 2026-09-04). Proves: (a) CB1 (frozen) is refused BEFORE any
// store read, and companies.frozen is refused after the first read; (b) apply writes the two columns + one audit
// row per change (decided_by judge, byte-exact reasons) under a ledger row; (c) a second identical run changes
// nothing and writes zero audit rows (idempotent); (d) own_words claims and invalid kinds are refused, never
// written; (e) the judge is never part of this door (no judge argument exists).
import { describe, expect, it } from "vitest";
import { runRfChannelsApply } from "../../../supabase/functions/_shared/rfChannelsApply.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const CO = "fd3f7f63-968b-4698-b946-3d6b6450d79d";
type Row = Record<string, unknown>;

function fakeStore(tables: Record<string, Row[]>, opts: { frozen?: boolean } = {}) {
  const calls: Array<{ table: string; op: string }> = [];
  const writes: Array<{ table: string; op: string; payload: Row }> = [];
  function chain(table: string, op: string, payload?: Row) {
    const filters: Array<(r: Row) => boolean> = [];
    calls.push({ table, op });
    const run = () => {
      let rows = tables[table] ?? [];
      for (const f of filters) rows = rows.filter(f);
      if (op === "update") { for (const r of rows) { Object.assign(r, payload); writes.push({ table, op, payload: { ...payload!, id: r.id } }); } return { data: null, error: null }; }
      if (op === "insert") { (tables[table] ??= []).push({ ...payload! }); writes.push({ table, op, payload: payload! }); return { data: payload, error: null }; }
      return { data: rows, error: null };
    };
    const q: Record<string, unknown> = {};
    q.eq = (col: string, v: unknown) => { filters.push((r) => r[col] === v); return q; };
    q.in = (col: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[col])); return q; };
    q.select = () => q; q.order = () => q; q.limit = () => q;
    q.maybeSingle = () => { const r = run() as { data: Row[] }; return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); };
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    return q;
  }
  tables.companies ??= [{ id: CO, frozen: !!opts.frozen }];
  const supabase = { from: (t: string) => ({ select: () => chain(t, "select"), update: (p: Row) => chain(t, "update", p), insert: (p: Row) => chain(t, "insert", p) }) };
  return { supabase, calls, writes, tables };
}
const claims = () => [
  { id: "c-aud", company_id: CO, claim_type: "inference", statement: "Dedicated partnerships page…", statement_kind: null, declared_eligible: true },
  { id: "c-instr", company_id: CO, claim_type: "inference", statement: "Just add hot water.", statement_kind: null, declared_eligible: true },
  { id: "c-prod", company_id: CO, claim_type: "inference", statement: "This medium roast tastes a little darker.", statement_kind: null, declared_eligible: true },
  { id: "c-own", company_id: CO, claim_type: "own_words", statement: "This is the Barra Method.", statement_kind: "positioning", declared_eligible: true },
];
const PLAN = [
  { claim_id: "c-aud", kind: "audience", reason: "identifies partners" },
  { claim_id: "c-instr", kind: "instruction", reason: "usage copy" },
  { claim_id: "c-prod", kind: "product_description", reason: null },
];
const NOW = "2026-09-04T09:00:00.000Z";

describe("rfChannelsApply", () => {
  it("(a) CB1 is refused before ANY store read; companies.frozen refused after the first read", async () => {
    const s = fakeStore({ claims: claims() });
    expect(await runRfChannelsApply({ supabase: s.supabase, companyId: CB1, plan: PLAN, mode: "apply", nowIso: NOW })).toEqual({ ok: false, skipped: "frozen_company" });
    expect(s.calls).toHaveLength(0);
    const f = fakeStore({ claims: claims() }, { frozen: true });
    expect(await runRfChannelsApply({ supabase: f.supabase, companyId: CO, plan: PLAN, mode: "apply", nowIso: NOW })).toEqual({ ok: false, skipped: "frozen_company" });
    expect(f.calls).toEqual([{ table: "companies", op: "select" }]);
    expect(f.writes).toHaveLength(0);
  });

  it("(b) apply writes kind + eligibility, one audit row per change (decided_by judge, byte-exact reasons), under a ledger row", async () => {
    const s = fakeStore({ claims: claims() });
    const r = await runRfChannelsApply({ supabase: s.supabase, companyId: CO, plan: PLAN, mode: "apply", nowIso: NOW, runId: "run-1" });
    expect(r.ok && r.mode === "apply" && r.totals).toEqual({ planned: 3, refused: 0, changed: 3, applied: 3, audited: 3 });
    const byId = new Map(s.tables.claims.map((c) => [c.id, c]));
    expect(byId.get("c-aud")).toMatchObject({ statement_kind: "audience", declared_eligible: true });
    expect(byId.get("c-instr")).toMatchObject({ statement_kind: "instruction", declared_eligible: false });
    expect(byId.get("c-prod")).toMatchObject({ statement_kind: "product_description", declared_eligible: false });
    expect(byId.get("c-own")).toMatchObject({ statement_kind: "positioning", declared_eligible: true }); // untouched
    const audits = s.tables.own_words_retypes;
    expect(audits).toHaveLength(3);
    expect(audits.every((a) => a.decided_by === "judge" && a.run_id === "run-1" && a.company_id === CO)).toBe(true);
    expect(audits.find((a) => a.claim_id === "c-aud")).toMatchObject({ from_kind: null, to_kind: "audience", from_eligible: true, to_eligible: true, reason: "judge: identifies partners" });
    expect(audits.find((a) => a.claim_id === "c-prod")).toMatchObject({ to_kind: "product_description", to_eligible: false, reason: "product description" });
    expect(s.tables.long_runner_runs).toHaveLength(1);
    expect(s.tables.long_runner_runs[0]).toMatchObject({ id: "run-1", run_kind: "rf_channels_admission", status: "completed", done_count: 3 });
  });

  it("(c) idempotent: the same plan again → zero changes, zero audit rows, zero claim updates", async () => {
    const s = fakeStore({ claims: claims() });
    await runRfChannelsApply({ supabase: s.supabase, companyId: CO, plan: PLAN, mode: "apply", nowIso: NOW, runId: "run-1" });
    const before = s.writes.length;
    const r2 = await runRfChannelsApply({ supabase: s.supabase, companyId: CO, plan: PLAN, mode: "apply", nowIso: NOW, runId: "run-2" });
    expect(r2.ok && r2.mode === "apply" && r2.totals).toEqual({ planned: 3, refused: 0, changed: 0, applied: 0, audited: 0 });
    expect(s.tables.own_words_retypes).toHaveLength(3);
    // only the ledger row for run-2 was written (insert + completion update)
    expect(s.writes.slice(before).every((w) => w.table === "long_runner_runs")).toBe(true);
  });

  it("(d) own_words claims, unknown claims and invalid kinds are refused — never written; dry_run writes nothing", async () => {
    const s = fakeStore({ claims: claims() });
    const plan = [{ claim_id: "c-own", kind: "instruction", reason: "x" }, { claim_id: "nope", kind: "offer", reason: "x" }, { claim_id: "c-aud", kind: "tagline-ish", reason: "x" }];
    const r = await runRfChannelsApply({ supabase: s.supabase, companyId: CO, plan, mode: "apply", nowIso: NOW, runId: "run-3" });
    expect(r.ok && r.rows.map((x) => x.refused)).toEqual(["own_words_claim", "unknown_claim", "invalid_kind"]);
    expect(s.tables.own_words_retypes ?? []).toHaveLength(0);
    expect(s.tables.claims.find((c) => c.id === "c-own")).toMatchObject({ statement_kind: "positioning" });
    const d = fakeStore({ claims: claims() });
    const dr = await runRfChannelsApply({ supabase: d.supabase, companyId: CO, plan: PLAN, mode: "dry_run", nowIso: NOW });
    expect(dr.ok && dr.mode).toBe("dry_run");
    expect(d.writes).toHaveLength(0);
  });
});
