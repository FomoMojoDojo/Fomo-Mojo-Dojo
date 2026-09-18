// Operator ruling 6 (signed 2026-09-18) — promote re-routes cascade gaps.
//
// Guards (each with a by-hand planted failure, reported in the gate; non-empty fixtures on both sides):
//   (a) promote of a staged STRATEGY supersedes the prior live cascade_gap rows and inserts the new set — derived
//       from the staged row's cascade_source (raw rungs) + judge coherence, so a tension stays a tension
//   (b) promote of a NON-strategy kind (promise) flips its rows and touches no cascade_gap row
//   (c) a strategy that failed a guard was never staged, so promote finds no staged row and routes nothing — the
//       same rule the direct write applies (runKindsIsolated commits on accept only)
//   (d) FAIL CLOSED (amendment 2026-09-18): a staged strategy WITHOUT cascade_source → promote refused with an error
//       naming the read id; the prior row stays current, the 913b716a-style row stays live, zero writes
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CASCADE_SOURCE_KEY, cascadeItemsForPromotedStrategy, cascadeSourceOf, hasCascadeSource, PromoteRefused, promoteStagedReads } from "./publicReadPromote.ts";

type Row = Record<string, unknown>;
const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const CO = "3dd2cfbb-0792-4bf1-9cd4-15db9646874b";

/** A fake client with the operators the promote path uses, recording every UPDATE and INSERT. */
function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = rows.map((r) => ({ ...r }));
  const log: string[] = [];
  const from = (table: string) => {
    tables[table] ??= [];
    let rows = [...tables[table]];
    let pending: Row | null = null;
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    const apply = () => { if (pending) { const ids = new Set(rows.map((r) => r.id)); for (const r of tables[table]) if (ids.has(r.id)) Object.assign(r, pending); log.push(`${table}:update:${[...ids].join(",")}:${JSON.stringify(pending)}`); pending = null; } return Promise.resolve({ data: rows, error: null }); };
    Object.assign(b, {
      select: () => b,
      update: (patch: Row) => { pending = patch; return b; },
      insert: (newRows: Row[]) => { for (const r of newRows) tables[table].push({ id: `new-${tables[table].length + 1}`, ...r }); log.push(`${table}:insert:${newRows.length}`); return Promise.resolve({ data: null, error: null }); },
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      is: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] == v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      order: (c: string, o: { ascending: boolean }) => chain((r) => [...r].sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (o.ascending ? 1 : -1))),
      limit: (n: number) => chain((r) => r.slice(0, n)),
      maybeSingle: () => (pending ? apply().then((r) => ({ data: r.data[0] ?? null, error: null })) : Promise.resolve({ data: rows[0] ?? null, error: null })),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => apply().then(res),
    });
    return b;
  };
  return { tables, log, from };
}

const RAW = { winning_aspiration: "Every Bay Area youth in crisis gets a bed within a day.", where_to_play: "SF and San Mateo county-referred youth.", how_to_win: "The only 24/7 CSU for under-12s.", must_have_capabilities: [{ text: "A staffed 24/7 crisis unit" }], management_systems: [] };
const COHERENCE = { how_to_win: { coherent: false, reason: "does not serve where-to-play" }, capabilities: [] };

function world(opts: { stagedKind: "strategy" | "promise" | "strategy-no-source" | null }) {
  const stagedStrategy = { id: "r-staged", company_id: CO, kind: "strategy", is_current: false, superseded_by: null, created_at: "2026-09-18T20:00:00Z", model_provider: "external_openai", model_name: "gpt-4.1-mini",
    payload: { ...RAW, how_to_win: "", ...(opts.stagedKind === "strategy-no-source" ? {} : { [CASCADE_SOURCE_KEY]: cascadeSourceOf(RAW) }) }, judge_verdict: { accept: true, cascade_coherence: COHERENCE } };
  const stagedPromise = { id: "r-staged-p", company_id: CO, kind: "promise", is_current: false, superseded_by: null, created_at: "2026-09-18T20:00:00Z", model_provider: "external_openai", model_name: "gpt-4.1-mini", payload: { promise: "We see families within a week." }, judge_verdict: { accept: true } };
  return fakeDb({
    public_reads: [
      { id: "r-cur-strategy", company_id: CO, kind: "strategy", is_current: true, superseded_by: null, created_at: "2026-08-28T00:00:00Z", payload: {}, judge_verdict: {} },
      { id: "r-cur-promise", company_id: CO, kind: "promise", is_current: true, superseded_by: null, created_at: "2026-08-28T00:00:00Z", payload: {}, judge_verdict: {} },
      ...(opts.stagedKind === "strategy" || opts.stagedKind === "strategy-no-source" ? [stagedStrategy] : opts.stagedKind === "promise" ? [stagedPromise] : []),
    ],
    first_read_open_questions: [
      { id: "913b716a", company_id: CO, source_kind: "cascade_gap", status: "live", anchor_identity: "management_systems", question_text: "The public record doesn't show the systems that run the strategy — what is it?" },
      { id: "q-finding", company_id: CO, source_kind: "finding", status: "live", anchor_identity: "f-1", question_text: "A finding question that must stay live." },
    ],
    integrity_runs: [],
  });
}

Deno.test("(a) promote of a staged strategy supersedes the prior live cascade_gap rows and inserts the new set (tension kept, from cascade_source)", async () => {
  const db = world({ stagedKind: "strategy" });
  const r = await promoteStagedReads(db as never, CO, ["strategy"]);
  assertEquals(r.promoted, [{ kind: "strategy", staged: "r-staged", superseded: "r-cur-strategy" }]);
  assertEquals(r.cascade_routing?.superseded, 1);
  assertEquals(r.cascade_routing?.inserted, 2, "management_systems gap + how_to_win tension");
  const q = db.tables.first_read_open_questions;
  assertEquals(q.find((x) => x.id === "913b716a")?.status, "superseded", "the prior live cascade_gap row is superseded");
  assertEquals(q.find((x) => x.id === "q-finding")?.status, "live", "a finding question is untouched");
  const inserted = q.filter((x) => String(x.id).startsWith("new-")).map((x) => x.question_identity).sort();
  assertEquals(inserted, ["cascade_gap:management_systems", "cascade_tension:how_to_win"]);
  // the rows flipped
  const reads = db.tables.public_reads;
  assertEquals(reads.find((x) => x.id === "r-staged")?.is_current, true);
  assertEquals(reads.find((x) => x.id === "r-cur-strategy")?.superseded_by, "r-staged");
  // the derivation reads cascade_source — from the SPINE alone the blanked how_to_win would be a gap, not a tension,
  // which is why the derivation refuses a row without it (guard d) rather than falling back
  assert(hasCascadeSource({ payload: { [CASCADE_SOURCE_KEY]: cascadeSourceOf(RAW) } }) && !hasCascadeSource({ payload: { ...RAW } }));
});

Deno.test("(d) FAIL CLOSED: a staged strategy without cascade_source → promote refused naming the read; prior row current, cascade_gap row live, zero writes", async () => {
  const db = world({ stagedKind: "strategy-no-source" });
  let err: unknown = null;
  try { await promoteStagedReads(db as never, CO, ["strategy"]); } catch (e) { err = e; }
  assert(err instanceof PromoteRefused, "refused with PromoteRefused");
  assertEquals((err as PromoteRefused).readId, "r-staged");
  assertEquals((err as PromoteRefused).kind, "strategy");
  assert((err as Error).message.includes("read r-staged") && (err as Error).message.includes("cascade_source"), (err as Error).message);
  const reads = db.tables.public_reads;
  assertEquals(reads.find((x) => x.id === "r-cur-strategy")?.is_current, true, "prior row still current");
  assertEquals(reads.find((x) => x.id === "r-cur-strategy")?.superseded_by, null);
  assertEquals(reads.find((x) => x.id === "r-staged")?.is_current, false, "staged row not flipped");
  assertEquals(db.tables.first_read_open_questions.find((x) => x.id === "913b716a")?.status, "live", "the live cascade_gap row is untouched");
  assertEquals(db.log, [], "zero writes");
  // the derivation itself refuses too (no payload fallback)
  let e2: unknown = null;
  try { cascadeItemsForPromotedStrategy({ id: "r-x", payload: { ...RAW }, judge_verdict: { cascade_coherence: COHERENCE } }); } catch (e) { e2 = e; }
  assert(e2 instanceof PromoteRefused && (e2 as PromoteRefused).readId === "r-x");
});

Deno.test("(b) promote of a non-strategy kind flips its rows and touches no cascade_gap row", async () => {
  const db = world({ stagedKind: "promise" });
  const r = await promoteStagedReads(db as never, CO, ["promise"]);
  assertEquals(r.promoted, [{ kind: "promise", staged: "r-staged-p", superseded: "r-cur-promise" }]);
  assertEquals(r.cascade_routing, null);
  assertEquals(db.tables.first_read_open_questions.map((x) => x.status), ["live", "live"]);
  assert(!db.log.some((l) => l.startsWith("first_read_open_questions:")), "no write to first_read_open_questions");
  assertEquals(db.tables.public_reads.find((x) => x.id === "r-staged-p")?.is_current, true);
});

Deno.test("(c) a strategy that failed a guard was never staged — promote finds no staged row and routes nothing (the direct write's rule)", async () => {
  const db = world({ stagedKind: null });
  db.tables.integrity_runs.push({ id: 1, company_id: CO, component: "first_read_public_read_strategy", status: "rejected", excluded_by_rule: { guard: "citations_unresolved" } });
  const r = await promoteStagedReads(db as never, CO, ["strategy"]);
  assertEquals(r.promoted, [{ kind: "strategy", staged: "", superseded: null }]);
  assertEquals(r.cascade_routing, null);
  assertEquals(db.tables.first_read_open_questions.find((x) => x.id === "913b716a")?.status, "live", "the prior cascade_gap row stays live");
  assertEquals(db.tables.public_reads.find((x) => x.id === "r-cur-strategy")?.is_current, true);
  assert(!db.log.some((l) => l.startsWith("first_read_open_questions:")));
});

Deno.test("source guard: the generator stages cascade_source on a strategy row, promotes through the shared path, and the direct write calls the same writeCascadeGaps", async () => {
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("const { promoted, cascade_routing } = await promoteStagedReads(supabase, company_id, activeKinds);"), "promote goes through publicReadPromote");
  assert(gen.includes("if (e instanceof PromoteRefused) return json({ ok: false, error: e.message, refused: { kind: e.kind, read_id: e.readId } }, 409);"), "a refused promote is a 409 naming the read");
  const prm = await read("./publicReadPromote.ts");
  assert(prm.includes('if (kind === "strategy" && !hasCascadeSource(stagedRow!)) {') && !prm.includes("?? payload) as StrategyPayload"), "fail closed: refusal before any write, no payload fallback");
  assert(gen.includes("[CASCADE_SOURCE_KEY]: cascadeSourceOf(translateCitations(payload, uuidByRef) as Record<string, unknown>)"), "stage stores the raw rungs");
  assert(gen.includes('if (kind === "strategy") {\n        cascadeRouting = await writeCascadeGaps('), "direct write unchanged");
  assert(!gen.includes("async function writeCascadeGaps("), "one writeCascadeGaps, in _shared");
  const per = await read("./publicReadPerKind.ts");
  assert(per.includes("if (!deps.accepts(kind, verdict)) {") && per.includes("await deps.commit(kind, payload, verdict);"), "commit (stage/write) only on accept");
});
