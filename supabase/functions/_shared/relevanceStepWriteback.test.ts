// RELEVANCE MARKER (2026-09-18) — causeway 09-17: the fill awaited refresh-relevance-step to `drained: true`
// (14 s) and then recorded `handed_off` → ledger 'running', no finished_at; refresh-relevance-step had no
// writeback for fr_relevance_backstop; sweep_stale_chains buried it 20 min later as "stalled" (3/3).
//
// Scenarios:
//   relevanceStepTerminal: drained → completed; stepped/retry → handed_off with run=<id>; skipped → completed_empty;
//     200 {ok:false,error} → failed (the stepper closed its own row; the fill records the observed terminal)
//   closeFillMarker (the writeback): closes ONLY the running fr_relevance_backstop marker whose note names
//     this run; another run's marker and an already-terminal marker stay untouched
//   the simulated chain: fill records handed_off (stepped, run=X) → stepper finishes → marker completed with
//     finished_at — never left for the sweeper
// Source guards: the fill records relevanceStepTerminal's verdict; refresh-relevance-step's finish calls the
//   writeback with markerKind fr_relevance_backstop and its child id; every response carries run.
// NON-VACUITY (run by hand, reported): remove the closeFillMarker call from the stepper's finish → the
//   source guard fails; make relevanceStepTerminal return handed_off on drained → the first scenario fails.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chainKindIsTerminal, chainKindLedgerStatus, closeFillMarker, relevanceStepTerminal } from "./firstReadFill.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
type Row = Record<string, unknown>;

/** A long_runner_runs fake: insert + update().eq().eq().eq().like() with the like as a %substr% match. */
function fakeLedger(rows: Row[] = []) {
  const table = [...rows];
  let n = 1;
  return {
    table,
    from: (t: string) => {
      if (t !== "long_runner_runs") throw new Error(`unexpected table ${t}`);
      return {
        insert: (r: Row) => { table.push({ id: `lr-${n++}`, ...r }); return Promise.resolve({ error: null }); },
        update: (patch: Row) => {
          const filters: Array<(r: Row) => boolean> = [];
          const b: Record<string, unknown> = {};
          const done = () => { for (const r of table) if (filters.every((f) => f(r))) Object.assign(r, patch); return Promise.resolve({ error: null }); };
          Object.assign(b, {
            eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b; },
            like: (c: string, pat: string) => { const sub = pat.replace(/^%|%$/g, ""); filters.push((r) => String(r[c] ?? "").includes(sub)); return b; },
            then: (res: (v: { error: null }) => unknown) => done().then(res),
          });
          return b;
        },
      };
    },
  };
}

Deno.test("relevanceStepTerminal: an awaited drained is completed; stepped/retry are handed_off with run=; ok:false is failed", () => {
  assertEquals(relevanceStepTerminal({ ok: true, drained: true, totals: {}, run: "X" } as never), { status: "completed", note: "relevance backstop drained · run=X" });
  assertEquals(relevanceStepTerminal({ ok: true, stepped: true, remaining: 12, run: "X" }), { status: "handed_off", note: "handed off to refresh-relevance-step · remaining=12 · run=X" });
  assertEquals(relevanceStepTerminal({ ok: true, retry: true, attempt: 2, run: "X" }), { status: "handed_off", note: "handed off to refresh-relevance-step · retry attempt=2 · run=X" });
  assertEquals(relevanceStepTerminal({ ok: true, skipped: "nothing_to_stamp" }), { status: "completed_empty", note: "nothing to stamp" });
  assertEquals(relevanceStepTerminal({ ok: false, error: "relevance backstop refused: company is frozen", run: "X" }), { status: "failed", note: "refresh-relevance-step failed: relevance backstop refused: company is frozen · run=X" });
  assertEquals(relevanceStepTerminal(null).status, "handed_off");
  // ledger semantics the fill applies to the verdict: completed is terminal (finished_at); handed_off is not
  assertEquals(chainKindLedgerStatus("completed"), "completed"); assert(chainKindIsTerminal("completed"));
  assertEquals(chainKindLedgerStatus("handed_off"), "running"); assert(!chainKindIsTerminal("handed_off"));
});

Deno.test("closeFillMarker closes ONLY the running marker naming this run; other runs' and terminal markers stay", async () => {
  const db = fakeLedger([
    { id: "m1", company_id: "c", run_kind: "fr_relevance_backstop", status: "running", error_text: "handed off to refresh-relevance-step · remaining=12 · run=X", finished_at: null },
    { id: "m2", company_id: "c", run_kind: "fr_relevance_backstop", status: "running", error_text: "handed off to refresh-relevance-step · remaining=3 · run=Y", finished_at: null },
    { id: "m3", company_id: "c", run_kind: "fr_relevance_backstop", status: "completed", error_text: "relevance backstop drained · run=X", finished_at: "t0" },
    { id: "m4", company_id: "c", run_kind: "fr_signal_recurrence", status: "running", error_text: "recurrence handed off · run=X", finished_at: null },
    { id: "m5", company_id: "other", run_kind: "fr_relevance_backstop", status: "running", error_text: "… · run=X", finished_at: null },
  ]);
  await closeFillMarker(db as never, { companyId: "c", markerKind: "fr_relevance_backstop", runId: "X", status: "completed", label: "relevance backstop" });
  const m = (id: string) => db.table.find((r) => r.id === id)!;
  assertEquals(m("m1").status, "completed"); assert(m("m1").finished_at); assertEquals(m("m1").error_text, "relevance backstop completed · run=X");
  assertEquals(m("m2").status, "running"); assertEquals(m("m2").finished_at, null);
  assertEquals(m("m3").finished_at, "t0"); assertEquals(m("m3").error_text, "relevance backstop drained · run=X");
  assertEquals(m("m4").status, "running");
  assertEquals(m("m5").status, "running");
});

Deno.test("simulated chain: fill hands off (stepped) → stepper finishes → the marker is closed, never left for the sweeper", async () => {
  const db = fakeLedger();
  // the fill: the stepper answered stepped (more rows than one isolate) → marker handed_off / running
  const v = relevanceStepTerminal({ ok: true, stepped: true, remaining: 41, run: "R1" });
  await db.from("long_runner_runs").insert({ run_kind: "fr_relevance_backstop", company_id: "c", status: chainKindLedgerStatus(v.status), error_text: v.note, finished_at: chainKindIsTerminal(v.status) ? "now" : null });
  assertEquals(db.table[0].status, "running"); assertEquals(db.table[0].finished_at, null);
  // the stepper's last step: finish("completed") → writeback
  await closeFillMarker(db as never, { companyId: "c", markerKind: "fr_relevance_backstop", runId: "R1", status: "completed", label: "relevance backstop" });
  assertEquals(db.table[0].status, "completed"); assert(db.table[0].finished_at);
  // and the awaited-drained shape never opens a running marker at all
  const d = relevanceStepTerminal({ ok: true, drained: true, run: "R2" });
  assertEquals(chainKindLedgerStatus(d.status), "completed"); assert(chainKindIsTerminal(d.status));
});

Deno.test("source guard: the fill records the verdict; the stepper's finish writes back on fr_relevance_backstop; run rides every response", async () => {
  const fill = await read("../first-read-fill/index.ts");
  assertStringIncludes(fill, "return relevanceStepTerminal(res.data as Parameters<typeof relevanceStepTerminal>[0]);");
  assert(!fill.includes('note: `handed off to refresh-relevance-step · ${d?.drained ? "drained"'), "the old drained→handed_off line is gone");
  const step = await read("../refresh-relevance-step/index.ts");
  const finish = step.indexOf("const finish = async (status");
  const closer = step.indexOf('await closeFillMarker(supabase, { companyId: company_id, markerKind: "fr_relevance_backstop", runId: String(childId), status, label: "relevance backstop" });');
  const finishEnd = step.indexOf("\n  };", finish); // the arrow body's close, not the patch literal's
  assert(finish > 0 && closer > finish && closer < finishEnd, "the writeback lives inside finish()");
  for (const shape of ["drained: true, totals, run: childId", "stepped: true, remaining, run: childId", "retry: true, attempt: attempt + 1, reason: res.reason, run: childId", "error: msg, run: childId", "error: res.reason, run: childId"]) {
    assertStringIncludes(step, shape);
  }
});
