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
