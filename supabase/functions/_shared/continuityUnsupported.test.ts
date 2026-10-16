// ── C1-U (operator ruling, 2026-10-15): C1 NEVER REQUIRES A WORD THE POOL CANNOT SOURCE ─────────
//
// WHY THIS EXISTS. Wasabi's strategy deadlocked between two gates over the SAME TWO WORDS. The
// current winning_aspiration reads "To be the LEADING global cloud storage provider ... with
// UNMATCHED cost-effectiveness and reliability", and no row in Wasabi's pool states either word —
// verified against every outside signal and every judge-kept own word, not merely the selection.
//
//   S1b / NP2 said   remove "leading" and "unmatched", or cite a row that states them. None can.
//   C1 said          a staged line continues this one only if it carries every specific of it,
//                    and extractSpecifics returns exactly ["leading", "unmatched"].
//
// Audit 10696 is the model dropping the line outright. Audit 10738 is the model COMPLYING: it
// rewrote the line as "To store all the world's data ..." and cited 0c93c536, a row the current line
// also cites — and C1 refused it for not containing the two words it had been ordered to remove.
// Obeying either gate violated the other, and no re-ask budget could resolve it.
//
// C1-U removes the impossible half of the demand and nothing else: the required set excludes every
// token in unsupportedByPool FOR THAT LINE, and a dropped specific the pool CAN source still
// refuses. The two sets meet by TOKEN STRING, not by kind — "leading" and "unmatched" come back
// from extractSpecifics as `exclusivity` and are NOT in S1_POSITION_WORDS, so unsupportedByPool
// supplies them through its reputation lane (S1b). A rule keyed on kind would miss them.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyContinuity, sourcingIdsOf, stillSourcedDrops, type CitedLine } from "./stageContinuity.ts";
import { unsupportedByPool } from "./reaskFeedback.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const L = (field: string, text: string, refs: string[], cls: string | null = "you"): CitedLine =>
  ({ field, text, cls, refs });

// Wasabi's real pair, by its field path. Shortened only where the tail carries no specific.
const CURRENT_ASPIRATION =
  "To be the leading global cloud storage provider by delivering simple, affordable, predictable, " +
  "and secure data storage solutions that empower customers to store all their data with unmatched " +
  "cost-effectiveness and reliability.";
const STAGED_REWRITE =
  "To store all the world's data by making data storage simple, affordable, predictable, and secure.";

// A pool that states NEITHER word — the situation the deadlock arose in. `o1` is the row both the
// current line and the rewrite cite, so the shared-citation half of the carriage test is satisfied
// and the specifics half is the only thing that can fail.
const POOL_NO_WORDS = [
  { id: "o1", kind: "own_word", cls: "you", text: "Our mission is to store all the world's data" },
  { id: "s1", kind: "signal", cls: "record", text: "Wasabi sells hot cloud storage at a flat rate with no egress fees" },
];
const ROWS = POOL_NO_WORDS.map((r) => ({ id: r.id, kind: r.kind, source_class: r.cls }));
const texts = (pool: typeof POOL_NO_WORDS) => Object.fromEntries(pool.map((r) => [r.id, r.text]));
const classes = (pool: typeof POOL_NO_WORDS) => Object.fromEntries(pool.map((r) => [r.id, r.cls]));

// ── 1. the deadlock itself ───────────────────────────────────────────────────────────────────────

Deno.test("C1-U. a rewrite that removes ONLY words no pool row states is CONTINUED, not dropped", () => {
  // the premise, stated rather than assumed: the pool supports neither word
  assertEquals(unsupportedByPool(CURRENT_ASPIRATION, POOL_NO_WORDS, "Wasabi Technologies"),
    ["leading", "unmatched"]);
  const split = classifyContinuity({
    currentLines: [L("winning_aspiration", CURRENT_ASPIRATION, ["o1", "s1"])],
    stagedLines: [L("winning_aspiration", STAGED_REWRITE, ["o1"])],
    newLedgerIds: new Set(["o1", "s1"]),
    textByRef: texts(POOL_NO_WORDS), classByRef: classes(POOL_NO_WORDS),
    sourcingIds: sourcingIdsOf(ROWS),
    pool: POOL_NO_WORDS, companyName: "Wasabi Technologies",
  });
  assertEquals(split.dropped.length, 0, "10738's refusal does not happen under C1-U");
  assertEquals(stillSourcedDrops(split).length, 0, "so nothing refuses");
  assertEquals(split.continued.length, 1, "the rewrite continues the line it was asked to rewrite");
  assertEquals(split.continued[0].specifics, [], "C1 required nothing of it");
  assertEquals(split.continued[0].excused, ["leading", "unmatched"],
    "and the row says which words C1 stopped requiring");
  assert(split.continued[0].reason.includes("C1-U excused [leading, unmatched]"),
    "the reason names them too, so it cannot read as a shorter demand than it was");
});

Deno.test("C1-U. with no pool given, nothing is excused — the pre-C1-U behaviour, unchanged", () => {
  const split = classifyContinuity({
    currentLines: [L("winning_aspiration", CURRENT_ASPIRATION, ["o1", "s1"])],
    stagedLines: [L("winning_aspiration", STAGED_REWRITE, ["o1"])],
    newLedgerIds: new Set(["o1", "s1"]),
    textByRef: texts(POOL_NO_WORDS), classByRef: classes(POOL_NO_WORDS),
    sourcingIds: sourcingIdsOf(ROWS),
  });
  assertEquals(split.dropped.length, 1, "this is 10738 exactly");
  assertEquals(split.dropped[0].specifics, ["leading", "unmatched"]);
  assertEquals(split.dropped[0].excused, undefined, "and no line claims an excuse it did not get");
});

// ── 2. the half that must NOT be removed ─────────────────────────────────────────────────────────

const FIGURES = "Edgewood serves 25,000 children a year across 170+ years of history";
// the pool states the 25,000 and not the 170+ — so exactly one of the two is excusable
const POOL_ONE_FIGURE = [
  { id: "o1", kind: "signal", cls: "record", text: "Edgewood serves 25,000 children a year" },
];

Deno.test("C1-U. a dropped specific the pool CAN source still refuses", () => {
  assertEquals(unsupportedByPool(FIGURES, POOL_ONE_FIGURE, "Edgewood"), ["170+"],
    "only the unstated figure is excusable");
  const split = classifyContinuity({
    currentLines: [L("unique_attributes[0]", FIGURES, ["o1"], "record")],
    // the staged line keeps neither figure, and cites the same row
    stagedLines: [L("unique_attributes[0]", "Edgewood serves children and families", ["o1"], "record")],
    newLedgerIds: new Set(["o1"]),
    textByRef: texts(POOL_ONE_FIGURE), classByRef: classes(POOL_ONE_FIGURE),
    sourcingIds: sourcingIdsOf(POOL_ONE_FIGURE.map((r) => ({ id: r.id, kind: r.kind, source_class: r.cls }))),
    pool: POOL_ONE_FIGURE, companyName: "Edgewood",
  });
  assertEquals(split.continued.length, 0, "dropping a sourced figure is still a drop");
  assertEquals(split.dropped.length, 1);
  assertEquals(split.dropped[0].specifics, ["25,000"], "C1 still requires the figure the pool states");
  assertEquals(split.dropped[0].excused, ["170+"], "and only the one it does not");
  assertEquals(split.dropped[0].still_sourced, true);
  assertEquals(stillSourcedDrops(split).length, 1, "so it REFUSES");
});

Deno.test("C1-U. carrying the sourced specific is enough — the excused one is not required back", () => {
  const split = classifyContinuity({
    currentLines: [L("unique_attributes[0]", FIGURES, ["o1"], "record")],
    stagedLines: [L("unique_attributes[0]", "Edgewood serves 25,000 children a year", ["o1"], "record")],
    newLedgerIds: new Set(["o1"]),
    textByRef: texts(POOL_ONE_FIGURE), classByRef: classes(POOL_ONE_FIGURE),
    sourcingIds: sourcingIdsOf(POOL_ONE_FIGURE.map((r) => ({ id: r.id, kind: r.kind, source_class: r.cls }))),
    pool: POOL_ONE_FIGURE, companyName: "Edgewood",
  });
  assertEquals(split.dropped.length, 0);
  assertEquals(split.continued.length, 1);
  assertEquals(split.continued[0].specifics, ["25,000"]);
  assertEquals(split.continued[0].excused, ["170+"]);
});

// ── 3. ONE implementation of "what the pool cannot support" ──────────────────────────────────────

Deno.test("C1-U. the excuse set is unsupportedByPool's, not a second scan of the pool", async () => {
  // THE BEHAVIOURAL DISCRIMINATOR. The only row stating "leading" is a FINDING — our own synthesis,
  // which canSource bars outright. unsupportedByPool therefore still calls the word unsupported, so
  // C1-U still excuses it. A hand-rolled "does any row contain this word" scan would call it
  // supported, require it carried, and refuse the rewrite.
  const POOL_FINDING_ONLY = [
    { id: "o1", kind: "own_word", cls: "you", text: "Our mission is to store all the world's data" },
    { id: "f1", kind: "finding", cls: "you", text: "Wasabi presents itself as the leading hot storage vendor with unmatched pricing" },
  ];
  assertEquals(unsupportedByPool(CURRENT_ASPIRATION, POOL_FINDING_ONLY, "Wasabi Technologies"),
    ["leading", "unmatched"], "a finding may not source either word");
  const split = classifyContinuity({
    currentLines: [L("winning_aspiration", CURRENT_ASPIRATION, ["o1"])],
    stagedLines: [L("winning_aspiration", STAGED_REWRITE, ["o1"])],
    newLedgerIds: new Set(["o1", "f1"]),
    textByRef: texts(POOL_FINDING_ONLY), classByRef: classes(POOL_FINDING_ONLY),
    sourcingIds: sourcingIdsOf(POOL_FINDING_ONLY.map((r) => ({ id: r.id, kind: r.kind, source_class: r.cls }))),
    pool: POOL_FINDING_ONLY, companyName: "Wasabi Technologies",
  });
  assertEquals(split.dropped.length, 0, "the finding does not resurrect the demand");
  assertEquals(split.continued[0].excused, ["leading", "unmatched"]);

  // AND the structural half: one implementation, so a correct re-implementation is still refused.
  const src = await read("./stageContinuity.ts");
  const fn = src.slice(src.indexOf("export function classifyContinuity"),
    src.indexOf("export type ContinuityBlock"));
  assert(fn.includes("unsupportedByPool("), "C1-U calls the shared function");
  const code = fn.split("\n").filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"));
  const own = code.filter((l) => /args\.pool[\s\S]*(\.filter\(|\.some\(|\.includes\()/.test(l));
  assertEquals(own, [], `C1-U must not scan the pool itself: ${own.join(" | ")}`);
});

// ── 4. both production callers measure the same rule ─────────────────────────────────────────────

Deno.test("C1-U. the generator and the cost harness both pass the pool NP2 reads", async () => {
  const gen = await read("../generate-public-read/index.ts");
  const call = gen.slice(gen.indexOf("const split = classifyContinuity({"));
  const args = call.slice(0, call.indexOf("});"));
  assert(args.includes("pool: feedbackPool()"), "the generator passes the SAME builder NP2 uses");
  assert(args.includes("companyName"), "and the name unsupportedByPool needs");
  // NP2's own call site must be that same builder, or the prompt and the gate could disagree
  assert(gen.includes("stillSourcedPromptBlock(currentForPrompt, sourcingIds, feedbackPool()"),
    "and the prompt block is built from it too");

  const harness = await read("../../../scripts/c1c2-continuity-cost.ts");
  const hcall = harness.slice(harness.indexOf("const split = classifyContinuity({"));
  const hargs = hcall.slice(0, hcall.indexOf("});"));
  assert(/pool,/.test(hargs) && /companyName/.test(hargs),
    "the harness measures the rule the generator enforces, not a looser one");
});
