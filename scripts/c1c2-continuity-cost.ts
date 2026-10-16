#!/usr/bin/env -S deno run --allow-all
// ── C1 / C2 cost harness — the harness of record (H1, operator ruling 2026-10-13) ───────────────
//
// WHAT IT MEASURES. For every public read that carries a classes map in its input_ledger — the reads
// C1 and C2 can actually see — it runs both checks the way finalize runs them, with that read as the
// STAGED read and THE READ IT REPLACED as the current one. That pairing is the harness of record:
// comparing a read against itself (the other reading, which this replaces) can only ever return
// zero, because a line trivially continues itself. Only the predecessor pairing answers the question
// the checks exist to ask — what would C1/C2 have refused over this company's history.
//
// WHY IT IS COMMITTED. The first version of this was a scratch script, and the figure it produced
// ("0 refused over the 10 classed live reads") could not be reproduced afterwards because the script
// was gone and the live set had moved on. A measurement that cannot be re-run is not a baseline.
//
// HOW IT IS READ. The harness asks the question C1 asks, with the SAME function and the same
// inputs: only a STILL-SOURCED drop — one C1-S would refuse — fails the run. A licensed drop (a
// findings-only line, a pre-rules line whose sourcing rows have left the pool) is LISTED as
// licensed and does not fail. A still-sourced drop that is NOT in KNOWN_PRE_C1 below fails; the
// filed ones are drops that happened before C1 existed, history rather than regressions.
//
//   deno run --allow-all scripts/c1c2-continuity-cost.ts          # the GATE: live reads
//   deno run --allow-all scripts/c1c2-continuity-cost.ts --all    # diagnostic: every classed read
//
// Read-only: four SELECTs (reads, row texts, companies for C1-U) and no write of any kind.
Object.defineProperty(Deno, "serve", {   // the emitter lives beside a Deno.serve; don't bind a port
  configurable: true,
  value: () => ({ finished: Promise.resolve(), shutdown: () => {}, ref: () => {}, unref: () => {} }),
});
const { linesOfStoredPayload } = await import("../supabase/functions/generate-public-read/index.ts");
const { classifyContinuity, sourcingIdsOf, softenedSpecifics, stillSourcedDrops } =
  await import("../supabase/functions/_shared/stageContinuity.ts");
const { reReadRowTexts } = await import("../supabase/functions/_shared/classSourcingScope.ts");
const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.57.4");
const { predecessorOf } = await import("./continuityPairing.ts");

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
if (!URL_ || !KEY) {
  console.error("harness: FAIL SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (never pass vacuously)");
  Deno.exit(2);
}
const ALL = Deno.args.includes("--all");
const db = createClient(URL_, KEY);

/** Drops that predate C1 (landed 2026-10-13, commit 5f931836). Filed, not fixed: the reads were
 *  generated before anything compared a staged read to the one it would replace. */
const KNOWN_PRE_C1: ReadonlyArray<{ read: string; starts: string; why: string }> = [
  {
    read: "5efba9ef",
    starts: "Edgewood established the first kinship program in the country in 1993",
    why: "positioning generated 2026-10-08, five days before C1; the 1993 specific left the line when it replaced b599a705",
  },
  {
    read: "0e0ebc6e",
    starts: "Relationship management with referral gatekeepers",
    why: "strategy generated 2026-10-08, before C1; superseded by 466fc9ff on 2026-10-13",
  },
  {
    read: "0e0ebc6e",
    starts: "To be the leading nonprofit provider of expert, trauma-informed mental healthcare",
    why: "strategy generated 2026-10-08, before C1; superseded by 466fc9ff on 2026-10-13",
  },
];
const filed = (read: string, statement: string) =>
  KNOWN_PRE_C1.find((k) => read.startsWith(k.read) && statement.startsWith(k.starts));

type Read = {
  id: string; company_id: string; kind: string; is_current: boolean; created_at: string;
  payload: Record<string, unknown>; input_ledger: Record<string, unknown> | null;
  superseded_by: string | null;
};

// H2: the pairing rule lives in ./continuityPairing.ts so a test can reach it without running this
// sweep — this file does its work at import time and exits.
const { data: all, error } = await db.from("public_reads")
  .select("id, company_id, kind, is_current, created_at, payload, input_ledger, superseded_by").order("created_at");
if (error) { console.error(`harness: FAIL ${error.message}`); Deno.exit(2); }
const rows = (all ?? []) as Read[];
// C1-U needs each read's company NAME (unsupportedByPool excludes the company's own name from the
// names it asks the pool to state). Resolved by query, never from memory.
const { data: cos, error: coErr } = await db.from("companies").select("id, name");
if (coErr) { console.error(`harness: FAIL ${coErr.message}`); Deno.exit(2); }
const companyNameById = new Map(((cos ?? []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name]));
const subject = rows.filter((r) =>
  (r.input_ledger as { classes?: unknown } | null)?.classes && (ALL || r.is_current));

console.log(`C1/C2 cost harness — ${subject.length} classed read(s)${ALL ? "" : ", live only"}\n`);
let unfiled = 0, filedSeen = 0, c2Seen = 0, comparedN = 0, vacuousN = 0, refTotal = 0, refResolved = 0;

for (const r of subject) {
  const classes = (r.input_ledger as { classes: Record<string, string> }).classes;
  const ids = (r.input_ledger as { ids?: string[] }).ids ?? [];
  // sourcingIdsOf needs each row's KIND as well as its class — a finding may never source, whatever
  // class it carries, and that is the distinction this harness was missing.
  const kindById = new Map<string, string>();
  for (const [k, list] of Object.entries(
    ((r.input_ledger as { by_kind?: Record<string, string[]> }).by_kind ?? {}))) {
    for (const id of list) kindById.set(id, k);
  }
  const texts = await reReadRowTexts(db as never, ids);
  refTotal += ids.length;
  refResolved += ids.filter((i) => texts[i] !== undefined).length;

  const prior = predecessorOf(r, rows);
  const currentLines = linesOfStoredPayload(prior?.payload ?? null);
  const stagedLines = linesOfStoredPayload(r.payload);

  // None of these reads CARRIED anything (the carry landed 2026-10-13 and no carried read has been
  // staged yet), so carriedFields is empty and C1-A cannot reach them. Passed explicitly so that a
  // future carried read is measured under the same rule the generator uses.
  const carriedFields = new Set(Object.keys(
    (r.input_ledger as { carried?: Record<string, unknown> }).carried ?? {}));
  // ── THE PRODUCTION RULE (operator ruling, 2026-10-15) ────────────────────────────────────────
  // The harness used droppedLines(), a wrapper that calls classifyContinuity WITHOUT sourcingIds.
  // Every drop therefore came back still_sourced:false and the licensed bucket was discarded, so
  // the harness could not tell a drop C1-S would REFUSE from one C1-S licenses — and it failed on
  // both. Wasabi's promoted offering 523da9ea dropped a line whose only two citations were
  // FINDINGS (37343b4c, 93914b30): our own synthesis, which can never source, so C1-S did not
  // refuse it and C1-P licensed it report-only. The harness called it UNFILED and failed the run.
  //
  // It now asks the same question C1 asks, with the same function and the same inputs: only a
  // STILL-SOURCED drop fails. A licensed one is listed as licensed.
  const sourcingIds = sourcingIdsOf(ids.map((id) => ({
    id, kind: kindById.get(id) ?? "", source_class: classes[id] ?? "",
  })));
  // C1-U: the pool as NP2 sees it — the same shape feedbackPool() builds in the generator, so the
  // harness measures the rule the generator enforces and not a looser one.
  const pool = ids.map((id) => ({
    id, kind: kindById.get(id) ?? "", cls: classes[id] ?? "", text: texts[id] ?? "",
  }));
  const split = classifyContinuity({
    currentLines, stagedLines, newLedgerIds: new Set(ids),
    textByRef: texts, classByRef: classes, carriedFields, sourcingIds,
    pool, companyName: companyNameById.get(r.company_id) ?? "",
  });
  const missing = stillSourcedDrops(split);
  const licensed = [
    ...split.licensed.map((l) => ({ statement: l.statement, why: l.reason })),
    ...split.dropped.filter((d) => d.still_sourced !== true)
      .map((d) => ({ statement: d.statement, why: `${d.reason} — no surviving sourcing row, so C1-S does not refuse it` })),
  ];
  const softened = stagedLines.flatMap((l) =>
    softenedSpecifics(l, texts, classes).map((h) => ({ field: l.field ?? "", ...h })));

  prior ? comparedN++ : vacuousN++;
  const against = prior ? `vs ${prior.id.slice(0, 8)} (${prior.created_at.slice(0, 10)})` : "no predecessor";
  console.log(`${r.id.slice(0, 8)} ${r.company_id.slice(0, 8)} ${r.kind.padEnd(11)} ` +
    `${String(stagedLines.length).padStart(2)} line(s) ${against.padEnd(28)} ` +
    `C1=${missing.length} C2=${softened.length}${licensed.length ? ` licensed=${licensed.length}` : ""}` +
    `${carriedFields.size ? ` carried=${carriedFields.size}` : ""}`);
  for (const l of licensed) {
    console.log(`    C1 licensed "${l.statement.slice(0, 72)}${l.statement.length > 72 ? "…" : ""}"\n       ${l.why}`);
  }
  for (const m of missing) {
    const f = filed(r.id, m.statement);
    if (f) { filedSeen++; console.log(`    C1 filed (pre-C1) "${m.statement.slice(0, 72)}…"\n       ${f.why}`); }
    else { unfiled++; console.log(`    C1 ✗ UNFILED "${m.statement}"\n       specifics ${JSON.stringify(m.specifics)} · ${m.reason}`); }
  }
  for (const s of softened) {
    c2Seen++;
    console.log(`    C2 ✗ ${s.ref.slice(0, 8)} "${s.word}" shared_run="${s.shared_run}" in: ${s.field.slice(0, 72)}`);
  }
}

console.log(`\ncompared against a predecessor: ${comparedN} · no predecessor: ${vacuousN}`);
console.log(`ledger refs resolved through rowTextOf: ${refResolved}/${refTotal}` +
  (refResolved < refTotal ? `  (${refTotal - refResolved} live in tables rowTextOf does not cover)` : ""));
console.log(`C1 filed pre-C1 drops: ${filedSeen} · C1 UNFILED: ${unfiled} · C2 refusals: ${c2Seen}`);
// The GATE is the live set. --all deliberately includes superseded and discarded reads — among them
// the two staged reads a human rejected on 2026-10-13 (f794c846, e9c985dc), which C1 and C2 both
// refuse. Those refusals are the checks working, not regressions, so --all reports and never gates.
if (ALL) {
  console.log("harness: DIAGNOSTIC (--all) — the gate applies to the live set only; refusals above " +
    "include superseded and discarded reads, which the checks are SUPPOSED to refuse");
  Deno.exit(0);
}
if (unfiled === 0 && c2Seen === 0) { console.log("harness: PASS"); Deno.exit(0); }
console.log(`harness: FAIL (${unfiled} unfiled C1, ${c2Seen} C2)`);
Deno.exit(1);
