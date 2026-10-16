// ── C1-S (operator ruling, 2026-10-14): a STILL-SOURCED line must be continued ──────────────────
//
// WHY THIS EXISTS. Wasabi's positioning read was staged twice and discarded twice. The second time
// (31f2bba2, audit 10266) the FedRAMP differentiator was dropped while cc5707ad — the row it cites —
// was IN the pool: P1 had just put it there. The evidence was in front of the model and the line
// still went, because the generation prompt never showed the model the current read's lines. C1 was
// enforcing continuation of lines the model could not see, and C1-P's report-only mode against a
// pre-rules predecessor meant it could not even refuse the loss.
//
// C1-S splits what C1 had treated alike:
//   STILL-SOURCED      ≥1 citation is a record/you SIGNAL or OWN_WORD in the new pool. Shown to the
//                      model in the prompt; dropping it REFUSES on any rules.
//   NOT STILL-SOURCED  nothing it cites survives as a usable source. C1-P unchanged: report-only
//                      against a pre-rules predecessor.
//
// Measured over the 22 current positioning reads before building: 94 of 104 lines are still-sourced.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyContinuity, isStillSourced, sourcingIdsOf, stillSourcedDrops, stillSourcedPromptBlock,
  type CitedLine,
} from "./stageContinuity.ts";
import { GEN_RULES_VERSION } from "./genRulesVersion.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const L = (field: string, text: string, refs: string[], cls: string | null = "record"): CitedLine =>
  ({ field, text, cls, refs });

// the pool shapes the ruling names and the ones it excludes
const POOL = [
  { id: "sigRec", kind: "signal", source_class: "record" },
  { id: "sigYou", kind: "signal", source_class: "you" },
  { id: "owYou", kind: "own_word", source_class: "you" },
  { id: "sigOurs", kind: "signal", source_class: "our_read" },   // analysis — not a source
  { id: "find1", kind: "finding", source_class: "our_read" },     // a finding is never a source
  { id: "delta1", kind: "delta", source_class: "record" },        // nor a delta
];

// ── what counts as a source ──────────────────────────────────────────────────────────────────────

Deno.test("C1-S. only record/you signals and own_words count as sourcing rows", () => {
  const ids = sourcingIdsOf(POOL);
  assertEquals([...ids].sort(), ["owYou", "sigRec", "sigYou"]);
  assert(!ids.has("find1"), "a finding is our synthesis — never a source");
  assert(!ids.has("delta1"), "a delta is a composed pair — never a source");
  assert(!ids.has("sigOurs"), "an analysis row is our read — it cannot source the record");
});

Deno.test("C1-S. a line citing ONLY a finding or a delta is NOT still-sourced", () => {
  const ids = sourcingIdsOf(POOL);
  assertEquals(isStillSourced(L("a", "x", ["find1"]), ids), false, "finding alone");
  assertEquals(isStillSourced(L("a", "x", ["delta1"]), ids), false, "delta alone");
  assertEquals(isStillSourced(L("a", "x", ["find1", "delta1", "sigOurs"]), ids), false, "all three together");
  // and one real source is enough
  assertEquals(isStillSourced(L("a", "x", ["find1", "sigRec"]), ids), true, "one usable row suffices");
});

Deno.test("C1-S. a line whose citations are all OUTSIDE the pool is not still-sourced", () => {
  const ids = sourcingIdsOf(POOL);
  assertEquals(isStillSourced(L("a", "x", ["gone1", "gone2"]), ids), false);
  assertEquals(isStillSourced(L("a", "x", []), ids), false, "an uncited line cites nothing to survive");
});

// ── the prompt block ─────────────────────────────────────────────────────────────────────────────

Deno.test("C1-S. the prompt block lists every still-sourced line, and ONLY those", () => {
  const ids = sourcingIdsOf(POOL);
  const block = stillSourcedPromptBlock([
    L("unique_attributes[0]", "FedRAMP Ready status for federal customers", ["sigRec"]),
    L("unique_attributes[1]", "a line whose sources are gone", ["gone"]),
    L("unique_attributes[2]", "a line citing only a finding", ["find1"]),
    L("value", "the company's own words", ["owYou"]),
  ], ids);
  assert(block.includes("FedRAMP Ready status for federal customers"), "the still-sourced line is shown");
  assert(block.includes("the company's own words"), "and the own-words one");
  assert(!block.includes("a line whose sources are gone"), "a line with no surviving source is NOT shown");
  assert(!block.includes("a line citing only a finding"), "nor one sourced only by a finding");
});

Deno.test("C1-S. the block carries line TEXT and CITATION IDS ONLY", () => {
  const ids = sourcingIdsOf(POOL);
  const block = stillSourcedPromptBlock([
    L("unique_attributes[0]", "FedRAMP Ready status", ["sigRec", "find1", "gone"], "record"),
  ], ids);
  assert(block.includes("FedRAMP Ready status"), "the text");
  // NP (2026-10-15): the entry is now two labelled lines under the text — the rows that still source
  // it, and the rows that state each of its names. The ids are still the only ids that travel.
  // U1 (2026-10-15): ids render BRACKETED — the only form CITE_RULE lets the model cite.
  assert(block.includes("still stated by: [sigRec]"), "and the ids that make it still-sourced");
  assert(/names to source:/.test(block), "and the name rows, which is what NP added");
  // nothing else may travel: no class, no field path, no specifics, no reason
  assert(!block.includes("unique_attributes[0]"), "not the field path");
  // an entry is a quoted text line; its two labelled lines are indented further under it
  const dataLines = block.split("\n").filter((x) => /^  "/.test(x));
  assertEquals(dataLines.length, 1, "one text entry per still-sourced line");
  assert(!/specific|reason|licens|\bclass\b|drop/i.test(dataLines.join(" ")), "no gate vocabulary in the text line");
  assertEquals(block.split("\n").filter((x) => /^      still stated by:/.test(x)).length, 1, "with one sourcing line");
  assertEquals(block.split("\n").filter((x) => /^      names to source:/.test(x)).length, 1, "and one names line");
  // and only the SOURCING citations, not every citation it ever had
  assert(!block.includes("find1"), "a non-sourcing citation is not listed");
  assert(!block.includes("[gone]") && !block.includes("by: gone"), "nor one that left the pool");
});

Deno.test("C1-S. an empty still-sourced set yields an empty block, not a stray heading", () => {
  assertEquals(stillSourcedPromptBlock([L("a", "x", ["gone"])], sourcingIdsOf(POOL)), "");
  assertEquals(stillSourcedPromptBlock([], sourcingIdsOf(POOL)), "");
});

Deno.test("C1-S. the generator puts the block in the USER prompt, before the carry notice", async () => {
  const src = await read("../generate-public-read/index.ts");
  // NP: the call gained the pool and the company name, because the block now carries name rows.
  assert(src.includes("const ssBlock = stillSourcedPromptBlock(currentForPrompt, sourcingIds, feedbackPool(), companyName, refByUuidLive());"),
    "the block is built from this run's pool");
  // RP (2026-10-15): the generation prompt became buildGenUser, the ONE prompt every generator call
  // sends. The ORDER this pins is unchanged — ledger, context, still-sourced block, carry notice —
  // it is now stated once in the builder instead of at the generation site.
  assert(src.includes("${CAT_LIVE}${p.extra}${p.ssBlock}${p.takenBlock}"),
    "and interpolated into the user prompt, after the ledger and before the carry notice");
  assert(src.includes("genUserParts[kind as Kind] = { extra, ssBlock, takenBlock };"),
    "the parts are kept so every re-ask sends the same block, not a shorter prompt");
});

// ── the refusal ──────────────────────────────────────────────────────────────────────────────────

const base = {
  stagedLines: [] as CitedLine[],
  textByRef: { sigRec: "FedRAMP Ready authorisation for federal and regulated customers" },
  classByRef: { sigRec: "record", owYou: "you" },
};

Deno.test("C1-S. a dropped still-sourced line is MARKED, and a dropped unsourced one is not", () => {
  const ids = sourcingIdsOf(POOL);
  const split = classifyContinuity({
    currentLines: [
      L("unique_attributes[0]", "FedRAMP Ready status for federal customers", ["sigRec"]),
      L("unique_attributes[1]", "a line whose sources are gone", ["gone"]),
    ],
    newLedgerIds: new Set(["sigRec"]), sourcingIds: ids, ...base,
  });
  // the gone-sources line is LICENSED (cause 1), so only the FedRAMP line can be dropped
  assertEquals(split.licensed.length, 1);
  assertEquals(split.dropped.length, 1);
  assertEquals(split.dropped[0].still_sourced, true, "its own source is in the pool");
  assertEquals(split.dropped[0].sourcing_citations, ["sigRec"], "and it names which citation");
  assertEquals(stillSourcedDrops(split).length, 1, "so it is in the refusing set");
});

Deno.test("C1-S. with no sourcingIds given, nothing is still-sourced — the pre-C1-S behaviour", () => {
  const split = classifyContinuity({
    currentLines: [L("unique_attributes[0]", "FedRAMP Ready status", ["sigRec"])],
    newLedgerIds: new Set(["sigRec"]), ...base,
  });
  assertEquals(split.dropped.length, 1);
  assertEquals(split.dropped[0].still_sourced, false, "absent ⇒ not still-sourced, so the old licence applies");
  assertEquals(stillSourcedDrops(split).length, 0);
});

Deno.test("C1-S. a still-sourced drop refuses UNCONDITIONALLY; everything else keeps C1-P", async () => {
  const src = await read("../generate-public-read/index.ts");
  const i = src.indexOf("const ssDropped = stillSourcedDrops(split);");
  assert(i > 0, "the still-sourced set is computed");
  const after = src.slice(i, i + 700);
  assert(after.includes("if (ssDropped.length > 0) throw new StageRefusal(CONTINUITY_GUARD"),
    "and refuses on its own, with NO c1Enforced condition");
  // the unconditional throw must not be gated on the predecessor's stamp
  const ssThrow = after.slice(after.indexOf("if (ssDropped.length > 0)"), after.indexOf("\n", after.indexOf("if (ssDropped.length > 0)")));
  assert(!ssThrow.includes("c1Enforced"), "a still-sourced drop does NOT consult the predecessor's rules");
  // and the C1-P licence survives for the rest
  assert(after.includes("if (split.dropped.length > 0 && c1Enforced) throw new StageRefusal(CONTINUITY_GUARD"),
    "a not-still-sourced drop still reports only against a pre-rules read");
  // order: the unconditional refusal is reached first
  assert(after.indexOf("if (ssDropped.length > 0)") < after.indexOf("&& c1Enforced"),
    "the still-sourced refusal is evaluated before the licensed one");
});

Deno.test("C1-S. the split and the block are fed the SAME sourcing set", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("const sourcingIds = sourcingIdsOf(inputs as Array<{ id: string; kind: string; source_class: string }>);"),
    "one set, built from the pool the ledger was built from");
  assert(src.includes("stillSourcedPromptBlock(currentForPrompt, sourcingIds, feedbackPool(), companyName, refByUuidLive())"), "the prompt uses it");
  assert(src.includes("sourcingIds,                                       // C1-S: which drops refuse on any rules"),
    "and so does the classifier — a second set is how the two would disagree about what was shown");
});

Deno.test("C1-S. the block and its counts are recorded, not only used", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("still_sourced_count: stillSourcedByKind[kind]?.length ?? 0,"), "the count is on the block");
  assert(src.includes("still_sourced_lines: stillSourcedByKind[kind] ?? [],"), "with the lines themselves");
  assert(src.includes("still_sourced: stillSourcedByKind,"), "and the response reports them");
});

Deno.test("C1-S. GEN_RULES_VERSION was bumped — the generation PROMPT changed", () => {
  assert(GEN_RULES_VERSION !== "2026-10-13.2", "the pre-C1-S stamp must not still be written");
  assertEquals(GEN_RULES_VERSION, "2026-10-15.2");
  assert(/^\d{4}-\d{2}-\d{2}\.\d+$/.test(GEN_RULES_VERSION), "still a dated stamp");
});
