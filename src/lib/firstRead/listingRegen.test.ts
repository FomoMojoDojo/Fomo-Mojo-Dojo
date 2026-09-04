// LISTING REGEN core (operator ruling 2026-09-04, shape (b)+(e)) with a stub store. Proves: (a) CB1 refused before
// ANY read; (b) the review gate — an unapproved URL is refused, never read; (c) apply mints ONE listing signal with
// the signed fields (evidence_class listing, quote = title line, identity host+product+price) under a ledger row;
// (d) a rerun dedups on identity (zero minted); (e) dry writes NOTHING but the ledger (status planned).
import { describe, expect, it } from "vitest";
import { runListingRegen } from "../../../supabase/functions/_shared/listingRegen.ts";
import { extractStructured } from "../../../supabase/functions/_shared/listingDetect.ts";

const CB1 = "58b2b15b-bada-4bcd-9c12-b7e66a37d0bc";
const CO = "fd3f7f63-968b-4698-b946-3d6b6450d79d";
const URL = "https://wineandeggs.com/products/cafe-barra-machado-de-assis-brazil";
const OTHER = "https://www.instagram.com/lefrenchrooster.us/";
const HTML = `<html><head><script type="application/ld+json">{"@type":"Product","name":"Cafe Barra Machado de Assis Brazil","brand":{"@type":"Thing","name":"Cafe Barra"},"offers":{"price":"22.0","priceCurrency":"USD"}}</script></head><body></body></html>`;
type Row = Record<string, unknown>;

function fakeStore(tables: Record<string, Row[]>) {
  const calls: Array<{ table: string; op: string }> = []; const writes: Array<{ table: string; payload: Row }> = [];
  function chain(table: string, op: string, payload?: Row | Row[]) {
    const filters: Array<(r: Row) => boolean> = []; calls.push({ table, op });
    const run = () => {
      let rows = tables[table] ?? []; for (const f of filters) rows = rows.filter(f);
      if (op === "insert") { const list = Array.isArray(payload) ? payload : [payload!]; (tables[table] ??= []).push(...list.map((p) => ({ ...p }))); for (const p of list) writes.push({ table, payload: p }); return { data: list, error: null }; }
      return { data: rows, error: null };
    };
    const q: Record<string, unknown> = {};
    q.eq = (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; };
    q.in = (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return q; };
    q.select = () => q; q.order = () => q; q.limit = () => q;
    q.maybeSingle = () => { const r = run() as { data: Row[] }; return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); };
    q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej);
    return q;
  }
  tables.companies ??= [{ id: CO, name: "Cafe Barra 2", website: "https://cafebarra.com", frozen: false, entity_anchors_json: ["Cafe Barra", "cafebarra.com"] }];
  const supabase = { from: (t: string) => ({ select: () => chain(t, "select"), insert: (p: Row | Row[]) => chain(t, "insert", p) }) };
  return { supabase, calls, writes, tables };
}
const base = () => ({
  outside_page_snapshots: [
    { company_id: CO, source_url: URL, fetch_status: "ok", clean_text: "Cafe Barra\nCafe Barra Machado de Assis Brazil\n$22.00\n", text_sha256: "7a42", crawled_at: "2026-08-26T05:15:00Z", structured: extractStructured(HTML) },
    { company_id: CO, source_url: OTHER, fetch_status: "ok", clean_text: "Instagram", text_sha256: "5ede", crawled_at: "2026-08-26T05:15:00Z", structured: extractStructured("<html></html>") },
  ],
  outside_recrawl_review: [{ company_id: CO, run_id: "run-1", source_url: URL, operator_decision: "approve" }, { company_id: CO, run_id: "run-1", source_url: OTHER, operator_decision: "reject" }],
  signals: [] as Row[],
});
const NOW = "2026-09-04T12:00:00.000Z";

describe("runListingRegen", () => {
  it("(a) CB1 refused before any read", async () => {
    const s = fakeStore(base());
    expect(await runListingRegen({ supabase: s.supabase, companyId: CB1, runId: "run-1", mode: "apply", nowIso: NOW })).toEqual({ ok: false, skipped: "frozen_company" });
    expect(s.calls).toHaveLength(0);
  });
  it("(b)+(c) apply: gate refuses the rejected URL; wineandeggs mints one listing signal with the signed fields + ledger", async () => {
    const s = fakeStore(base());
    const r = await runListingRegen({ supabase: s.supabase, companyId: CO, runId: "run-1", mode: "apply", nowIso: NOW });
    expect(r.ok && r.review_refused).toEqual([{ url: OTHER, reason: "rejected" }]);
    expect(r.ok && r.totals).toMatchObject({ detected: 1, would_mint: 1, minted: 1, review_refused: 1 });
    const sig = s.tables.signals[0];
    expect(sig).toMatchObject({ evidence_class: "listing", voice_class: "outside_voice_about_client", structure_level: "extracted", source_type: "outside_listing_regen", source_url: URL, evidence_excerpt: "Cafe Barra Machado de Assis Brazil", quote: "Cafe Barra Machado de Assis Brazil", event_date: "2026-08-26" });
    expect(sig.listing).toMatchObject({ product_name: "Cafe Barra Machado de Assis Brazil", price: 22, currency: "USD", attribution_text: "Cafe Barra", detected_from: "ld+json" });
    expect(String(sig.quote_source_text)).toContain("Cafe Barra Machado de Assis Brazil");
    expect(s.tables.integrity_runs).toHaveLength(1);
    expect(s.tables.integrity_runs[0]).toMatchObject({ component: "r3_outside_listing", status: "completed", admitted: 1 });
  });
  it("(d) rerun dedups on identity: zero minted, refused duplicate_identity", async () => {
    const s = fakeStore(base());
    await runListingRegen({ supabase: s.supabase, companyId: CO, runId: "run-1", mode: "apply", nowIso: NOW });
    const r2 = await runListingRegen({ supabase: s.supabase, companyId: CO, runId: "run-1", mode: "apply", nowIso: NOW });
    expect(r2.ok && r2.totals.minted).toBe(0);
    expect(r2.ok && r2.refused).toEqual([{ url: URL, reason: "duplicate_identity" }]);
    expect(s.tables.signals).toHaveLength(1);
  });
  it("(e) dry: would-mint reported, NOTHING written but the ledger (status planned)", async () => {
    const s = fakeStore(base());
    const r = await runListingRegen({ supabase: s.supabase, companyId: CO, runId: "run-1", mode: "dry", nowIso: NOW });
    expect(r.ok && r.would_mint.map((w) => [w.host, w.listing.product_name, w.listing.price, w.listing.currency])).toEqual([["wineandeggs.com", "Cafe Barra Machado de Assis Brazil", 22, "USD"]]);
    expect(s.tables.signals).toHaveLength(0);
    expect(s.writes.every((w) => w.table === "integrity_runs")).toBe(true);
    expect(s.tables.integrity_runs[0]).toMatchObject({ status: "planned", admitted: 0 });
  });
});
