// Evidence presence (2026-09-16) — planted cases for the ONE predicate and the record's idempotence.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fakeDb } from "./fakeSupabaseForTests.ts";
import { noEvidenceYet, readEvidencePresence, recordEvidencePresence } from "./evidencePresence.ts";

const CO = "co-ev";
const seed = (o: { signals?: number; steps?: number; defs?: number; outsideScore?: boolean; presence?: Array<"none" | "present"> } = {}) => fakeDb({
  signals: Array.from({ length: o.signals ?? 0 }, (_, i) => ({ id: `s${i}`, company_id: CO })),
  job_steps: Array.from({ length: o.steps ?? 0 }, (_, i) => ({ id: `j${i}`, company_id: CO })),
  odi_market_definitions: Array.from({ length: o.defs ?? 0 }, (_, i) => ({ id: `d${i}`, company_id: CO, retracted: false })),
  routes: [], positioning_canvases: [], strategy_cascades: [],
  integrity_runs: [
    ...(o.outsideScore ? [{ id: "os", company_id: CO, component: "first_read_outside_score", ran_at: "2026-09-01T00:00:00Z", excluded_by_rule: { state: "ineligible" } }] : []),
    ...(o.presence ?? []).map((state, i) => ({ id: `ep${i}`, company_id: CO, component: "evidence_presence", ran_at: `2026-09-0${i + 1}T00:00:00Z`, excluded_by_rule: { state } })),
  ],
});

Deno.test("planted cases", async () => {
  assertEquals(await noEvidenceYet(seed(), CO), true, "0 signals / 0 spine / no record → none");
  assertEquals(await noEvidenceYet(seed({ signals: 1 }), CO), false, "1 signal → present");
  assertEquals(await noEvidenceYet(seed({ steps: 8 }), CO), false, "spine only (job_steps) → present");
  assertEquals(await noEvidenceYet(seed({ defs: 1 }), CO), false, "spine only (live definition) → present");
  assertEquals(await noEvidenceYet(seed({ outsideScore: true }), CO), false, "outside-score record only → present");
});

Deno.test("record: null when absent; newest row wins; append only on change", async () => {
  const db = seed();
  assertEquals(await readEvidencePresence(db, CO), null);
  const first = await recordEvidencePresence(db, CO, "t");
  assertEquals(first, { state: "none", written: true });
  const again = await recordEvidencePresence(db, CO, "t");
  assertEquals(again, { state: "none", written: false });
  assertEquals(db.tables.integrity_runs.filter((r) => r.component === "evidence_presence").length, 1);
  // evidence lands → state flips → one more row; the newest reads
  db.tables.signals.push({ id: "s1", company_id: CO });
  const flipped = await recordEvidencePresence(db, CO, "t");
  assertEquals(flipped, { state: "present", written: true });
  assertEquals(db.tables.integrity_runs.filter((r) => r.component === "evidence_presence").length, 2);
  const db2 = seed({ presence: ["none", "present"] });
  assertEquals(await readEvidencePresence(db2, CO), "present");
});
