// fetchAllRows (2026-09-17) — the recurrence plan and finalize see EVERY banked verdict past PostgREST's
// max_rows. Planted: 70 eligible signals on 70 registrable domains (2,415 candidate pairs) and 2,300 banked verdicts across
// three pages of 1,000 — 1,931 rejected eligible pairs (ids a…), 300 orphans whose identities match no eligible
// signal (ids b…), and a 69-link ACCEPTED chain s0↔s1↔…↔s69 (ids c…). Ordered by id the accepted chain and the
// orphans sit on pages 2–3, so a first-page-only read would (a) call 1,415 pairs fresh instead of 415,
// (b) prune 0 orphans instead of 300 and (c) find 0 clusters instead of the one 70-member cluster.
// Non-vacuity: with the helper bypassed (single page) every one of those assertions fails — shown below.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fakeDb } from "./fakeSupabaseForTests.ts";
import { fetchAllRows } from "./fetchAllRows.ts";
import { computeRecurrenceForCompany, recurrencePairIdentity } from "./signalRecurrence.ts";
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

const CO = "co-paged";
const N = 70;
const text = (i: number) => `Edgewood crisis stabilization unit serves youth under twelve — outlet ${i}`;
const signals = Array.from({ length: N }, (_, i) => ({
  id: `s${String(i).padStart(2, "0")}`, company_id: CO, signal_band: "outside", source_url: `https://outlet${i}.com/p`,
  voice_class: "outside_voice_about_client", evidence_class: "prose", claim_text: text(i), syndicated_from_client: false, superseded_at: null, held_at: null,
}));

async function plant() {
  const ident = await Promise.all(signals.map((s) => sha256Hex(normalizeForHash(s.claim_text))));
  const verdicts: Array<Record<string, unknown>> = [];
  const row = (id: string, a: number, b: number, verdict: "accepted" | "rejected") => ({
    id, company_id: CO, signal_a_id: signals[a].id, signal_b_id: signals[b].id,
    statement_a_identity: ident[a], statement_b_identity: ident[b], verdict,
  });
  // 1,931 rejected eligible pairs (ids a0000…), skipping the chain pairs (i, i+1)
  let k = 0;
  outer: for (let i = 0; i < N; i++) {
    for (let j = i + 2; j < N; j++) {
      const r = row(`a${String(k).padStart(4, "0")}`, i, j, "rejected");
      verdicts.push({ ...r, pair_identity: await recurrencePairIdentity(signals[i].claim_text, signals[j].claim_text) });
      if (++k === 1931) break outer;
    }
  }
  // 300 orphans (ids b0000…): identities of statements that are NOT eligible signals
  for (let o = 0; o < 300; o++) {
    const ta = `orphan statement ${o} alpha`, tb = `orphan statement ${o} beta`;
    verdicts.push({ id: `b${String(o).padStart(4, "0")}`, company_id: CO, signal_a_id: "gone-a", signal_b_id: "gone-b",
      statement_a_identity: await sha256Hex(normalizeForHash(ta)), statement_b_identity: await sha256Hex(normalizeForHash(tb)),
      verdict: "rejected", pair_identity: await recurrencePairIdentity(ta, tb) });
  }
  // the 69-link accepted chain (ids c0000…)
  for (let i = 0; i < N - 1; i++) {
    verdicts.push({ ...row(`c${String(i).padStart(4, "0")}`, i, i + 1, "accepted"), pair_identity: await recurrencePairIdentity(signals[i].claim_text, signals[i + 1].claim_text) });
  }
  assertEquals(verdicts.length, 2300);
  return fakeDb({
    companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org" }],
    signals: signals.map((s) => ({ ...s })),
    signal_recurrence_verdicts: verdicts,
    findings: [], finding_cluster_verdicts: [], finding_recurrence: [],
  });
}

Deno.test("fetchAllRows pages until a short page; a single page is one round trip; bad page size refused", async () => {
  const db = fakeDb({ t: Array.from({ length: 2300 }, (_, i) => ({ id: `r${String(i).padStart(4, "0")}` })) });
  let calls = 0;
  const all = await fetchAllRows<{ id: string }>((from, to) => { calls++; return db.from("t").select("id").order("id").range(from, to); });
  assertEquals([all.length, calls], [2300, 3]);
  assertEquals(all[0].id, "r0000"); assertEquals(all[2299].id, "r2299");
  assertEquals(new Set(all.map((r) => r.id)).size, 2300, "no overlap between pages");
  calls = 0;
  const small = await fetchAllRows<{ id: string }>((from, to) => { calls++; return db.from("t").select("id").order("id").range(from, to); }, 5000);
  assertEquals([small.length, calls], [2300, 1]);
  let threw = false;
  try { await fetchAllRows(() => Promise.resolve({ data: [], error: null }), 0); } catch (e) { threw = true; assertStringIncludes(String(e), "pageSize"); }
  assert(threw);
  // a query that ignores .range() (always a full page) is stopped, never spun forever
  const full = Array.from({ length: 1000 }, (_, i) => ({ id: String(i) }));
  let spun = false;
  try { await fetchAllRows(() => Promise.resolve({ data: full, error: null })); } catch (e) { spun = true; assertStringIncludes(String(e), "exceeded"); }
  assert(spun);
});

Deno.test("plan: 2,300 banked verdicts across 3 pages are ALL frozen — 415 fresh, never 1,415", async () => {
  const db = await plant();
  const plan = await computeRecurrenceForCompany({ supabase: db, companyId: CO, ollamaUrl: "", nowIso: "2026-09-17T00:00:00Z", write: false, plan: true });
  assert(plan.ok && "candidates_total" in plan);
  assertEquals(plan.eligible_signals, 70);
  assertEquals(plan.candidates_total, 2415);
  assertEquals(plan.candidates_frozen, 2000, "1,931 rejected + 69 accepted banked eligible pairs");
  assertEquals(plan.candidates_fresh, 415);
  assert(!plan.pairs.some((p) => p.status === "fresh" && /^c/.test(p.signal_a_id)), "no chain pair is fresh");
});

Deno.test("finalize (dry): the full set is pruned and clustered — 300 orphans pruned, ONE 70-member cluster", async () => {
  const db = await plant();
  const fin = await computeRecurrenceForCompany({ supabase: db, companyId: CO, ollamaUrl: "", nowIso: "2026-09-17T00:00:00Z", write: false });
  assert(fin.ok && "totals" in fin);
  assertEquals(fin.totals.verdicts_pruned, 300);
  assertEquals(fin.totals.clusters, 1);
  assertEquals(db.writes.length, 0, "dry run writes nothing");
});

Deno.test("source guard: no unranged signal_recurrence_verdicts select remains in the recurrence path", async () => {
  const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
  for (const f of ["./signalRecurrence.ts", "../recurrence-step/index.ts", "../generate-signal-recurrence/index.ts"]) {
    const s = await read(f);
    const re = /\.from\(\s*"signal_recurrence_verdicts"\s*\)\s*\.select\([\s\S]*?(?=;\s*\n|\)\s*\n\s*\))/g;
    for (const m of s.matchAll(re)) assert(/\.range\(/.test(m[0]), `${f}: unranged select on signal_recurrence_verdicts:\n${m[0].slice(0, 200)}`);
  }
  const rec = await read("./signalRecurrence.ts");
  assertStringIncludes(rec, 'import { fetchAllRows } from "./fetchAllRows.ts";');
  assertStringIncludes(rec, ".order(\"id\", { ascending: true })\n        .range(from, to)");
});
