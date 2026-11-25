// Evidence presence (2026-09-16) — the single server writer of mojo_scores rows checks the
// predicate: a company with no evidence gets no score row and no companies write-back, and the
// skip is ledgered (integrity_runs 'mojo_score_snapshot' / skipped_empty_input).
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fakeDb } from "./fakeSupabaseForTests.ts";
import { snapshotMojoScore, MOJO_SCORE_SNAPSHOT_COMPONENT } from "./snapshotMojoScore.ts";

const CO = "co-snap";
const seed = (signals: number) => fakeDb({
  companies: [{ id: CO, mojo_score: null, area_scores_json: {} }],
  signals: Array.from({ length: signals }, (_, i) => ({ id: `s${i}`, company_id: CO })),
  claims: [], routes: [], odi_needs: [], job_steps: [], positioning_canvases: [], strategy_cascades: [],
  odi_market_definitions: [], integrity_runs: [], mojo_scores: [],
});

Deno.test("no evidence → no mojo_scores row, no companies write-back, ledgered skip", async () => {
  const db = seed(0);
  await snapshotMojoScore(db as any, CO);
  assertEquals(db.tables.mojo_scores.length, 0);
  assertEquals(db.tables.companies[0].mojo_score, null);
  assertEquals(db.writes, [{ table: "integrity_runs", op: "insert" }]);
  const row = db.tables.integrity_runs[0];
  assertEquals(row.component, MOJO_SCORE_SNAPSHOT_COMPONENT);
  assertEquals(row.status, "skipped_empty_input");
  assertEquals((row.excluded_by_rule as { reason: string }).reason, "no_evidence_yet");
});

Deno.test("evidence present → mojo_scores row written, companies written back, no skip ledger", async () => {
  const db = seed(1);
  await snapshotMojoScore(db as any, CO);
  assertEquals(db.tables.mojo_scores.length, 1);
  assertEquals(typeof db.tables.companies[0].mojo_score, "number");
  assertEquals(db.tables.integrity_runs.filter((r) => r.component === MOJO_SCORE_SNAPSHOT_COMPONENT).length, 0);
});

// ── SP-478 / SP-682 (2026-11-25): the one writer of the stored copies ────────────────────────────
// A row only when the total changes; the cache only when a cached number differs; never a frozen
// company; a dry run reads everything and writes nothing; and the inputs come through the one rule.
const T = "2026-11-01T00:00:00Z";
const claim = (id: string, over: Record<string, unknown> = {}) => ({
  id, company_id: CO, state: "diagnose", claim_type: "x", topic: "t", outside_support_count: 1,
  organization_support_count: 0, customer_support_count: 0, updated_at: T, status: "active", ...over,
});
const scored = (over: Record<string, unknown[]> = {}, company: Record<string, unknown> = {}) => fakeDb({
  companies: [{ id: CO, frozen: false, mojo_score: null, potential_score: null, projected_score: null, area_scores_json: {}, ...company }],
  signals: [{ id: "s0", company_id: CO }],
  claims: [claim("c1")], routes: [], needs_in_market: [], job_steps: [], positioning_canvases: [], strategy_cascades: [],
  odi_market_definitions: [], integrity_runs: [], mojo_scores: [], ...over,
});
const writesTo = (db: { writes: Array<{ table: string; op: string }> }, table: string) => db.writes.filter((w) => w.table === table).length;

Deno.test("a second call with nothing changed writes NOTHING — no row, no cache update", async () => {
  const db = scored();
  const first = await snapshotMojoScore(db as any, CO);
  assertEquals([first.row, first.cache], ["inserted", "updated"]);
  assertEquals(db.tables.mojo_scores.length, 1);
  const before = db.writes.length;
  const second = await snapshotMojoScore(db as any, CO);
  assertEquals([second.row, second.cache, second.previous_total], ["unchanged", "unchanged", first.total]);
  assertEquals(db.tables.mojo_scores.length, 1);
  assertEquals(db.writes.length, before);
});

Deno.test("a changed total adds exactly one row and updates the cache", async () => {
  const db = scored();
  const first = await snapshotMojoScore(db as any, CO);
  // every claim becomes old: the freshness part of the score falls
  for (const c of db.tables.claims) c.updated_at = "2020-01-01T00:00:00Z";
  db.tables.claims.push(claim("c2", { state: "flow", customer_support_count: 3, updated_at: "2020-01-01T00:00:00Z" }));
  const second = await snapshotMojoScore(db as any, CO);
  if (second.total === first.total) throw new Error("the fixture did not move the total — this test would prove nothing");
  assertEquals([second.row, second.cache], ["inserted", "updated"]);
  assertEquals(db.tables.mojo_scores.length, 2);
  assertEquals(db.tables.companies[0].mojo_score, second.total);
});

Deno.test("a FROZEN company is never written — not a row, not the cache, not the ledger", async () => {
  const db = scored({}, { frozen: true, mojo_score: 19 });
  const out = await snapshotMojoScore(db as any, CO);
  assertEquals(out.skipped, "frozen");
  assertEquals(out.cached_before, 19);
  assertEquals(db.writes, []);
  assertEquals(db.tables.mojo_scores.length, 0);
  assertEquals(db.tables.companies[0].mojo_score, 19);
});

Deno.test("a DRY RUN reads everything and writes nothing, and says what it would have done", async () => {
  const db = scored({}, { mojo_score: 99 });
  const out = await snapshotMojoScore(db as any, CO, { dryRun: true });
  assertEquals([out.dry_run, out.row, out.cache, out.cached_before], [true, "would_insert", "would_update", 99]);
  assertEquals(typeof out.total, "number");
  assertEquals(db.writes, []);
  assertEquals(db.tables.companies[0].mojo_score, 99);
  // and a dry run on a company with no evidence writes no ledger row either
  const empty = seed(0);
  const skipped = await snapshotMojoScore(empty as any, CO, { dryRun: true });
  assertEquals(skipped.skipped, "no_evidence");
  assertEquals(empty.writes, []);
});

Deno.test("the tick's quiet skip: a company with no evidence is skipped without a ledger row", async () => {
  const db = seed(0);
  const out = await snapshotMojoScore(db as any, CO, { quietSkip: true });
  assertEquals(out.skipped, "no_evidence");
  assertEquals(db.writes, []);
});

Deno.test("the cache is repaired when it differs, without a new row when the total has not changed", async () => {
  const db = scored();
  const first = await snapshotMojoScore(db as any, CO);
  db.tables.companies[0].mojo_score = 0;             // the legacy "reset" writes 0 to the cache
  const rows = db.tables.mojo_scores.length;
  const second = await snapshotMojoScore(db as any, CO);
  assertEquals([second.row, second.cache], ["unchanged", "updated"]);
  assertEquals(db.tables.mojo_scores.length, rows);
  assertEquals(db.tables.companies[0].mojo_score, first.total);
});

Deno.test("'has the total changed' compares with the newest MOJO SCORE row, never an outside-score row", async () => {
  const db = scored();
  const first = await snapshotMojoScore(db as any, CO);
  // a newer row of the OTHER calculation, with a different total
  db.tables.mojo_scores.push({ id: "outside", company_id: CO, computed_at: "2099-01-01T00:00:00Z", total_score: 77, methodology_version: "outside-v1.1.0" });
  const second = await snapshotMojoScore(db as any, CO);
  assertEquals([second.row, second.previous_total], ["unchanged", first.total]);
});

Deno.test("the writer reads its inputs through the one rule: struck, inactive, retracted, proposed and company-held rows do not move the score", async () => {
  const need = (id: string, over: Record<string, unknown> = {}) => ({ id, company_id: CO, desired_outcome: id, importance: 8, satisfaction: 3, opportunity_score: 13, service_state: "underserved", updated_at: T, status: "active", journey_key: "customer", ...over });
  const route = (id: string, state: string) => ({ id, company_id: CO, category: "fix", level: "route", parent_id: null, updated_at: T, relevance_state: state });
  const clean = scored({ routes: [route("r1", "active")], needs_in_market: [need("n1")] });
  const noisy = scored({
    claims: [claim("c1"), claim("c-struck", { status: "struck", state: "flow", customer_support_count: 9 })],
    routes: [route("r1", "active"), route("r-off", "deprioritized")],
    needs_in_market: [need("n1"), need("n1", { journey_key: "revenue" }), need("n-ret", { status: "retracted" }), need("n-prop", { status: "proposed" }), need("n-held", { journey_key: null })],
  });
  const a = await snapshotMojoScore(clean as any, CO, { dryRun: true });
  const b = await snapshotMojoScore(noisy as any, CO, { dryRun: true });
  assertEquals(b.total, a.total);
  assertEquals([b.potential, b.projected], [a.potential, a.projected]);
});
