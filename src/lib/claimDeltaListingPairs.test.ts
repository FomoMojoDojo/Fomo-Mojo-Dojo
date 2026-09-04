// LISTING PAIRS BY CONSTRUCTION (operator ruling 2026-09-04). A listing-backed observed claim admitted by
// listingMayCorroborate forms its echoed pair deterministically — basis 'listing', provider listing_predicate,
// verdict relevant — and NEVER enters the proposer, the rejection cache, or the router. Refused listing candidates
// are excluded from PLAN freshness and from WRITE by the same predicate call. PARITY: plan's fresh count equals
// write's attempted count for a fixed candidate set. Prose path unchanged (proposer + judge still run).
import { describe, expect, it, vi } from "vitest";
import { computeDeltasForCompany, LISTING_PREDICATE_PROVIDER } from "../../supabase/functions/_shared/claimDeltaSynthesis.ts";

const CO = "22222222-2222-2222-2222-222222222222";
type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  tables.claim_delta_removals ??= []; tables.integrity_runs ??= []; tables.claim_delta_rejections ??= []; tables.claim_deltas ??= []; tables.claim_delta_relevance_overrides ??= [];
  let n = 1;
  const db = {
    tables,
    rpc(_fn: string, a: { p_company_id?: string; p_ids?: string[] }) { const ids = a.p_ids ?? []; tables.claim_deltas = tables.claim_deltas.filter((r) => !ids.includes(r.id as string)); return Promise.resolve({ data: ids.length, error: null }); },
    from(table: string) {
      const f: Array<(r: Row) => boolean> = [];
      const chain: Record<string, unknown> = {
        select() { return chain; }, order() { return chain; }, limit() { return chain; },
        eq(c: string, v: unknown) { f.push((r) => r[c] === v); return chain; },
        in(c: string, vs: unknown[]) { f.push((r) => vs.includes(r[c])); return chain; },
        is(c: string, v: unknown) { f.push((r) => (r[c] ?? null) === v); return chain; },
        not(c: string, _op: string, _v: unknown) { f.push((r) => r[c] != null); return chain; },
        then(res: (v: { data: Row[]; error: null }) => void) { res({ data: (tables[table] ?? []).filter((r) => f.every((x) => x(r))), error: null }); },
        maybeSingle() { const rows = (tables[table] ?? []).filter((r) => f.every((x) => x(r))); return Promise.resolve({ data: rows[0] ?? null, error: null }); },
        insert(p: Row) { (tables[table] ??= []).push({ id: `row-${n++}`, pairing_kind: "public_vs_public", ...p }); return Promise.resolve({ error: null }); },
        delete() { return { in(c: string, ids: unknown[]) { tables[table] = tables[table].filter((r) => !ids.includes(r[c])); return Promise.resolve({ error: null }); } }; },
      };
      return chain;
    },
  };
  return db;
}
const LISTING = { product_name: "Cafe Barra Machado de Assis Brazil", price: 22, currency: "USD", attribution_text: "Cafe Barra", listing_url: "https://wineandeggs.com/products/cafe-barra-machado-de-assis-brazil", detected_from: "ld+json" };
const seed = (extraPublics: Row[] = [], extraSignals: Row[] = [], extraRefs: Row[] = []) => ({
  companies: [{ id: CO, name: "Cafe Barra 2", website: "https://cafebarra.com", frozen: false }],
  claims: [
    { id: "d-partner", company_id: CO, statement: "At Cafe Barra, our business to business relationships are considered partnerships, business allies.", topic: null, provenance: "public_observed", claim_type: "own_words", statement_kind: "positioning", declared_eligible: true, status: "active" },
    { id: "d-bean", company_id: CO, statement: "We take the time to carefully extract the potential of every Cafe Barra bean.", topic: null, provenance: "public_observed", claim_type: "own_words", statement_kind: "positioning", declared_eligible: true, status: "active" },
    { id: "p-listing", company_id: CO, statement: "Cafe Barra Machado de Assis Brazil", topic: "market", provenance: "public_observed", claim_type: "inference", status: "active", raw_payload: { evidence_class: "listing", listing: LISTING } },
    ...extraPublics,
  ],
  signals: [
    { id: "s-own", company_id: CO, voice_class: "client_voice", source_url: "https://cafebarra.com/partnerships", evidence_class: "prose" },
    { id: "s-listing", company_id: CO, voice_class: "outside_voice_about_client", source_url: LISTING.listing_url, evidence_class: "listing" },
    ...extraSignals,
  ],
  claim_signal_refs: [
    { company_id: CO, claim_id: "d-partner", signal_id: "s-own" }, { company_id: CO, claim_id: "d-bean", signal_id: "s-own" },
    { company_id: CO, claim_id: "p-listing", signal_id: "s-listing" }, ...extraRefs,
  ],
});
const base = (db: ReturnType<typeof fakeDb>) => ({ supabase: db as never, companyId: CO, ollamaUrl: "http://127.0.0.1:11434/v1", nowIso: "2026-09-04T21:00:00Z", pairingKind: "public_vs_public" as const });
type Routed = NonNullable<Parameters<typeof computeDeltasForCompany>[0]["routedCall"]>;
const neverCalled = () => vi.fn<Routed>(async () => { throw new Error("proposer must not be called"); });

describe("listing pairs by construction", () => {
  it("WRITE: admitted (positioning + 'partnerships') → ONE echoed delta, basis listing, provider listing_predicate, relevant; proposer NEVER called; refused (no token) counted, no rejection banked", async () => {
    const db = fakeDb(seed()); const routedCall = neverCalled();
    const r = await computeDeltasForCompany({ ...base(db), write: true, routedCall });
    if (!r.ok) throw new Error("expected ok: " + JSON.stringify(r));
    expect(routedCall).not.toHaveBeenCalled();
    expect(r.totals.pairs_listing).toBe(1); expect(r.totals.listing_corroboration_refused).toBe(1); expect(r.totals.pairs_rejected).toBe(0);
    const pairs = db.tables.claim_deltas.filter((x) => x.delta_type === "echoed");
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ declared_claim_id: "d-partner", public_claim_id: "p-listing", pairing_basis: "listing", model_provider: LISTING_PREDICATE_PROVIDER, relevance_verdict: "relevant", relevance_provider: LISTING_PREDICATE_PROVIDER });
    expect(db.tables.claim_delta_rejections).toHaveLength(0);
    // the refused declared claim falls to publicly_silent (no pair), the listing claim is paired (no internally_silent)
    expect(db.tables.claim_deltas.filter((x) => x.delta_type === "publicly_silent").map((x) => x.declared_claim_id)).toEqual(["d-bean"]);
    expect(db.tables.claim_deltas.filter((x) => x.delta_type === "internally_silent")).toHaveLength(0);
  });
  it("PLAN: refused never counted as a candidate; admitted is ONE fresh before the write and cached after", async () => {
    const db = fakeDb(seed());
    const before = await computeDeltasForCompany({ ...base(db), write: false, plan: true as const });
    if (!before.ok) throw new Error("plan");
    const byId = new Map(before.claims.map((c) => [c.declared_claim_id, c]));
    expect(byId.get("d-partner")).toMatchObject({ candidates_total: 1, candidates_fresh: 1, candidates_cached: 0, candidates_rejected: 0 });
    expect(byId.get("d-bean")).toMatchObject({ candidates_total: 0, candidates_fresh: 0 });
    await computeDeltasForCompany({ ...base(db), write: true, routedCall: neverCalled() });
    const after = await computeDeltasForCompany({ ...base(db), write: false, plan: true as const });
    if (!after.ok) throw new Error("plan");
    expect(after.fresh_total).toBe(0);
    expect(new Map(after.claims.map((c) => [c.declared_claim_id, c])).get("d-partner")).toMatchObject({ candidates_cached: 1, candidates_fresh: 0 });
  });
  it("PARITY: plan fresh count equals write attempted count for the same candidate set", async () => {
    const db = fakeDb(seed());
    const plan = await computeDeltasForCompany({ ...base(db), write: false, plan: true as const }); if (!plan.ok) throw new Error("plan");
    const w = await computeDeltasForCompany({ ...base(db), write: true, routedCall: neverCalled() }); if (!w.ok) throw new Error("write");
    const attempted = (w.totals.pairs_listing ?? 0) + w.totals.pairs_confirmed + w.totals.pairs_inferred + w.totals.pairs_rejected + w.totals.spans_unjudged;
    expect(plan.fresh_total).toBe(attempted); expect(attempted).toBe(1);
  });
  it("PROSE path unchanged: a prose observed claim still goes through proposer + judge", async () => {
    const db = fakeDb(seed(
      [{ id: "p-prose", company_id: CO, statement: "Cafe Barra partnerships with local cafés are described as business allies by the roaster.", topic: null, provenance: "public_observed", claim_type: "inference", status: "active" }],
      [{ id: "s-prose", company_id: CO, voice_class: "outside_voice_about_client", source_url: "https://restaurantguru.com/x", evidence_class: "prose" }],
      [{ company_id: CO, claim_id: "p-prose", signal_id: "s-prose" }],
    ));
    const routedCall = vi.fn<Routed>(async ({ role }) => ({ content: JSON.stringify(role === "generator" ? { same_subject: true, relation: "echo", reason: "same subject" } : { same_subject: true, relation: "echo", confident: true, reason: "match", span: "Cafe Barra partnerships with local cafés are described as business allies by the roaster." }), provider: "stub", model: "stub" }));
    const r = await computeDeltasForCompany({ ...base(db), write: true, routedCall }); if (!r.ok) throw new Error("write");
    expect(routedCall).toHaveBeenCalled(); // prose pairs still judged
    const pairs = db.tables.claim_deltas.filter((x) => x.delta_type === "echoed");
    expect(pairs.some((x) => x.public_claim_id === "p-listing" && x.pairing_basis === "listing")).toBe(true);
    expect(pairs.some((x) => x.public_claim_id === "p-prose" && x.pairing_basis !== "listing")).toBe(true);
  });
});
