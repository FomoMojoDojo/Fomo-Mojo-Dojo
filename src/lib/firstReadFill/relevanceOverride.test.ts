// OPERATOR RELEVANCE OVERRIDE — code-side guards (operator ruling 2026-09-03). The DB trigger is the
// structural guarantee (scripts/guards/relevance-override-guard.sql); these prove the two code paths that
// consult the override table so an overridden pair never costs a judge call and is born stamped:
//   (a) computeRelevanceForCompany: an overridden NULL row is stamped provider=operator from the override
//       and the router/judge never see it (the judge is not called even though the pair would route to it);
//   (b) the delta core's inline pair insert carries the override columns for a matching identity.
// Each proof fails if its branch is removed.
import { describe, expect, it, vi } from "vitest";
import { computeRelevanceForCompany } from "../../../supabase/functions/_shared/relevanceBackstop.ts";
import { overrideColumnsFor } from "../../../supabase/functions/_shared/claimDeltaSynthesis.ts";

const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";
type Row = Record<string, unknown>;

function fakeStore(tables: Record<string, Row[]>) {
  const updates: Array<{ id: unknown; patch: Row }> = [];
  function chain(table: string, op: string, payload?: unknown) {
    const filters: Array<[string, string, unknown]> = [];
    const run = () => {
      let rows = tables[table] ?? [];
      for (const [f, col, v] of filters) {
        if (f === "eq") rows = rows.filter((r) => r[col] === v);
        if (f === "in") rows = rows.filter((r) => (v as unknown[]).includes(r[col]));
        if (f === "is") rows = rows.filter((r) => (v === null ? r[col] == null : r[col] === v));
      }
      if (op === "update") { for (const r of rows) { Object.assign(r, payload as Row); updates.push({ id: r.id, patch: payload as Row }); } return { data: null, error: null }; }
      if (op === "insert") { (tables[table] ??= []).push(payload as Row); return { data: payload, error: null }; }
      return { data: rows, error: null };
    };
    const q: Record<string, unknown> = {};
    for (const f of ["eq", "in", "is"]) q[f] = (col: string, v: unknown) => { filters.push([f, col, v]); return q; };
    q.select = () => q; q.order = () => q; q.limit = () => q;
    q.maybeSingle = () => { const r = run() as { data: Row[] }; return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); };
    q.single = q.maybeSingle;
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    return q;
  }
  const supabase = { from: (table: string) => ({ select: () => chain(table, "select"), update: (p: Row) => chain(table, "update", p), insert: (p: Row) => chain(table, "insert", p) }) };
  return { supabase, updates, tables };
}

// A dov=1 pair: exactly one distinctive shared token ("youth") → would be routed to the JUDGE.
const DECLARED = "crisis stabilization for youth under twelve";
const OBSERVED = "Edgewood hosted a youth gala downtown";
const IDENT = "ident-overridden-pair";

describe("(a) backstop core honors a live override — stamped from it, judge never called", () => {
  it("overridden null row → provider operator / model operator_override / the operator's reason; judge not called", async () => {
    const delta = { id: "d-ov", company_id: CO, pairing_kind: "public_vs_public", delta_type: "echoed", declared_claim_id: "dc", public_claim_id: "pc", relevance_verdict: null, content_identity: IDENT };
    const store = fakeStore({
      companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org" }],
      claim_deltas: [delta],
      claims: [{ id: "dc", statement: DECLARED }, { id: "pc", statement: OBSERVED }],
      claim_delta_relevance_overrides: [{ id: "o1", company_id: CO, pairing_kind: "public_vs_public", content_identity: IDENT, verdict: "relevant", reason: "Operator review: the partner corroborates the claim", decided_at: "2026-09-03T21:00:00.000Z", superseded_by: null }],
      integrity_runs: [],
    });
    const judge = vi.fn(async () => ({ content: JSON.stringify({ relevance: "orthogonal", reason: "judge would strike", span: "" }), provider: "external_openai", model: "gpt-4.1-mini" }));
    const out = await computeRelevanceForCompany({ supabase: store.supabase, companyId: CO, nowIso: "2026-09-03T21:05:00.000Z", write: true, routedCall: judge, pairingKind: "public_vs_public" });
    expect(out.ok).toBe(true);
    expect(judge).not.toHaveBeenCalled();
    expect(delta.relevance_verdict).toBe("relevant");
    expect((delta as Row).relevance_provider).toBe("operator");
    expect((delta as Row).relevance_model).toBe("operator_override");
    expect((delta as Row).relevance_reason).toBe("Operator review: the partner corroborates the claim");
    if (out.ok) expect((out.totals as Record<string, number>).overridden).toBe(1);
  });

  it("a WITHDRAWN or superseded override is not an override — the pair routes normally (judge called)", async () => {
    const delta = { id: "d-w", company_id: CO, pairing_kind: "public_vs_public", delta_type: "echoed", declared_claim_id: "dc", public_claim_id: "pc", relevance_verdict: null, content_identity: IDENT };
    const store = fakeStore({
      companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org" }],
      claim_deltas: [delta],
      claims: [{ id: "dc", statement: DECLARED }, { id: "pc", statement: OBSERVED }],
      claim_delta_relevance_overrides: [
        { id: "o1", company_id: CO, pairing_kind: "public_vs_public", content_identity: IDENT, verdict: "relevant", reason: "old", decided_at: "2026-09-01T00:00:00Z", superseded_by: "o2" },
        { id: "o2", company_id: CO, pairing_kind: "public_vs_public", content_identity: IDENT, verdict: "withdrawn", reason: "handed back", decided_at: "2026-09-02T00:00:00Z", superseded_by: null },
      ],
      integrity_runs: [],
    });
    const judge = vi.fn(async () => ({ content: JSON.stringify({ relevance: "orthogonal", reason: "judge strikes", span: "" }), provider: "external_openai", model: "gpt-4.1-mini" }));
    await computeRelevanceForCompany({ supabase: store.supabase, companyId: CO, nowIso: "2026-09-03T21:05:00.000Z", write: true, routedCall: judge, pairingKind: "public_vs_public" });
    expect(judge).toHaveBeenCalledTimes(1);
    expect((delta as Row).relevance_provider).toBe("external_openai");
  });
});

describe("(b) delta core — an inline pair insert for an overridden identity carries the override columns", () => {
  it("overrideColumnsFor returns the operator columns for a live relevant/orthogonal override, nothing otherwise", () => {
    const map = new Map([[IDENT, { verdict: "orthogonal" as const, reason: "Operator review: off-topic co-mention", decided_at: "2026-09-03T21:00:00.000Z" }]]);
    expect(overrideColumnsFor(IDENT, map)).toEqual({
      relevance_verdict: "orthogonal", relevance_provider: "operator", relevance_model: "operator_override",
      relevance_reason: "Operator review: off-topic co-mention", relevance_span: null, relevance_judged_at: "2026-09-03T21:00:00.000Z",
    });
    expect(overrideColumnsFor("some-other-identity", map)).toEqual({});
  });
});
