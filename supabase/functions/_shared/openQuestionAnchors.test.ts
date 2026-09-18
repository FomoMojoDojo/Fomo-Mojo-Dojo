// Gate 0 (ruling 4, 2026-09-18) — question anchors are OPEN findings only.
//
// Fake client; the same loader + finalize rule the handler runs (loadQuestionAnchors → orphanQuestionIds):
//   run 12 has an OPEN finding (F-open) and a RESOLVED finding (F-resolved), one live question on each, plus a
//   silent_delta question whose delta still exists and one whose delta is gone.
//   → anchors = {F-open, the live delta}; orphans at finalize = {question on F-resolved, question on the gone delta};
//     the question on F-open and the live-delta question stay. Both sides non-empty.
// NON-VACUITY (run by hand, reported): drop the status filter from the loader → F-resolved anchors again → its
//   question is not an orphan → the assertion fails.
// Source guard: the handler imports the shared loader and applies orphanQuestionIds at finalize; no other reader
//   loads question anchors (open-questions-step only resolves the run id; compute-featured-defaults picks a
//   featured finding, not an anchor).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ANCHORABLE_FINDING_STATUS, loadQuestionAnchors, orphanQuestionIds } from "./openQuestionAnchors.ts";
import { contentIdentity } from "./contentIdentity.ts";

type Row = Record<string, unknown>;
const CO = "33333333-3333-3333-3333-333333333333";
const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

function fakeDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [t, rows] of Object.entries(seed)) tables[t] = [...rows];
  const from = (table: string) => {
    tables[table] ??= [];
    let rows = [...tables[table]];
    const b: Record<string, unknown> = {};
    const chain = (fn: (r: Row[]) => Row[]) => { rows = fn(rows); return b; };
    Object.assign(b, {
      select: () => b,
      eq: (c: string, v: unknown) => chain((r) => r.filter((x) => x[c] === v)),
      in: (c: string, vs: unknown[]) => chain((r) => r.filter((x) => vs.includes(x[c]))),
      not: () => b, order: () => b, limit: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    });
    return b;
  };
  return { tables, from };
}

const OPEN_BODY = "Revenue concentration in county contracts leaves the program exposed to a single funder decision.";
const RESOLVED_BODY = "Revenue stabilized and turned positive in FY2024 after a prior-year deficit.";
const DECLARED = "We provide the people, place, and path for exceptional youth mental healthcare.";

async function world() {
  const idOpen = await contentIdentity(OPEN_BODY), idResolved = await contentIdentity(RESOLVED_BODY);
  const db = fakeDb({
    findings: [
      { id: "F-open", company_id: CO, origin_run_id: 12, body: OPEN_BODY, status: "open" },
      { id: "F-resolved", company_id: CO, origin_run_id: 12, body: RESOLVED_BODY, status: "resolved" },
      { id: "F-other-run", company_id: CO, origin_run_id: 11, body: "an older run's finding", status: "open" },
    ],
    claim_deltas: [{ company_id: CO, pairing_kind: "public_vs_public", delta_type: "publicly_silent", content_identity: "delta-live", declared_claim_id: "c1" }],
    claims: [{ id: "c1", statement: DECLARED, status: "active" }], // ruling 7 (2026-09-18): an anchor needs an ACTIVE claim
    claim_signal_refs: [{ claim_id: "c1", signal_id: "s1" }],
    signals: [{ id: "s1", source_type: "public_baseline_run" }],
    first_read_open_questions: [
      { id: "Q-open", company_id: CO, run_id: "12", status: "live", source_kind: "finding", anchor_identity: idOpen },
      { id: "Q-resolved", company_id: CO, run_id: "12", status: "live", source_kind: "finding", anchor_identity: idResolved },
      { id: "Q-delta-live", company_id: CO, run_id: "12", status: "live", source_kind: "silent_delta", anchor_identity: "delta-live" },
      { id: "Q-delta-gone", company_id: CO, run_id: "12", status: "live", source_kind: "silent_delta", anchor_identity: "delta-gone" },
    ],
  });
  return { db, idOpen, idResolved };
}

Deno.test("anchors: OPEN findings of the run + live publicly_silent deltas; a resolved finding anchors nothing", async () => {
  const { db, idOpen, idResolved } = await world();
  const anchors = await loadQuestionAnchors(db as never, CO, "12");
  assertEquals(anchors.map((a) => [a.kind, a.identity]).sort(), [["finding", idOpen], ["silent_delta", "delta-live"]].sort());
  assert(!anchors.some((a) => a.identity === idResolved), "the resolved finding is not an anchor");
  assertEquals(ANCHORABLE_FINDING_STATUS, "open");
});

Deno.test("finalize: the resolved finding's question and the gone-delta question are orphans; the open finding's and the live-delta questions stay", async () => {
  const { db } = await world();
  const anchors = await loadQuestionAnchors(db as never, CO, "12");
  const live = db.tables.first_read_open_questions.filter((r) => r.status === "live") as Array<{ id: string; anchor_identity: string | null }>;
  const orphans = orphanQuestionIds(live, anchors).sort();
  assertEquals(orphans, ["Q-delta-gone", "Q-resolved"]);
  assert(live.length - orphans.length === 2, "the kept side is non-empty too");
  assertEquals(orphanQuestionIds([{ id: "x", anchor_identity: null }], anchors), ["x"], "an anchorless row is an orphan");
});

Deno.test("source guard: the handler loads anchors through the shared loader and finalizes with orphanQuestionIds; no second anchor loader exists", async () => {
  const src = await read("../generate-open-questions/index.ts");
  // ruling 7 (2026-09-18): the handler reads the detailed loader (anchors + named exclusions) and audits the finalize
  assert(src.includes("const { anchors, excluded: anchorExclusions } = await loadQuestionAnchorsDetailed(supabase, company_id, runId);"));
  assert(src.includes("const orphanIds = orphanQuestionIds((liveRows ?? []) as Array<{ id: string; anchor_identity: string | null }>, anchors);"));
  assert(!src.includes("async function loadAnchors("), "the local loader is gone");
  const mod = await read("./openQuestionAnchors.ts");
  assert(mod.includes('.eq("status", ANCHORABLE_FINDING_STATUS)'), "the finding query carries the open-only filter");
  // open-questions-step reads findings only to resolve the run id (no anchor semantics)
  const step = await read("../open-questions-step/index.ts");
  assert(step.includes('from("findings").select("origin_run_id")') && !step.includes("anchor_identity"));
});
