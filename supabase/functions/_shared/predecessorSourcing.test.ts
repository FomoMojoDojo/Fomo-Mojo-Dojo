// R5-P (operator ruling, 2026-10-22): a predecessor line reaches the prompt — and is demanded by continuity —
// only if every specific in it passes R5 against its own cited rows.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { predecessorLineKey, predecessorVerdicts, withheldKeysOf } from "./predecessorSourcing.ts";
import {
  type CitedLine, classifyContinuity, promptablePredecessorLines, stillSourcedDrops, stillSourcedPromptBlock,
} from "./stageContinuity.ts";

// Spectrum's current strategy 43542649, in shape: where_to_play cites three rows whose excerpts are now blank
// (model summaries, blanked by run b2_spectrum_no_page_words_20261022), so R5 reads each as "".
const WHERE: CitedLine = {
  field: "where_to_play", cls: "record",
  text: "The U.S. residential and business broadband, TV, mobile, and home phone markets across 45 states, including the newly acquired Cox footprint",
  refs: ["f8a2d3c1", "f35be264", "2ddcc9ca"],
};
const SERVES: CitedLine = {
  field: "winning_aspiration", cls: "you", text: "Serve over 57 million customers in 41 states", refs: ["1149c6be"],
};
const TEXT: Record<string, string> = {
  f8a2d3c1: "", f35be264: "", "2ddcc9ca": "",
  "1149c6be": "Spectrum serves over 57 million customers in 41 states",
};
const CLASSES: Record<string, string> = { f8a2d3c1: "record", f35be264: "record", "2ddcc9ca": "record", "1149c6be": "you" };

Deno.test("R5-P: a line whose specifics do not source against its own cited rows is withheld; a sourced one is not", () => {
  const v = predecessorVerdicts({ lines: [WHERE, SERVES], textByRef: TEXT, classes: CLASSES, findingIds: new Set(), companyName: "Spectrum" });
  const where = v.find((x) => x.field === "where_to_play")!;
  assert(where.unsourced.map((u) => u.token).includes("45"), `45 must be unsourced: ${JSON.stringify(where.unsourced)}`);
  // the same tokens the stage gate refused on the restated line (audit 13247): 45 [figure], U.S. [name]
  assert(where.unsourced.map((u) => u.token).includes("U.S."), `U.S. must be unsourced: ${JSON.stringify(where.unsourced)}`);
  assertEquals(v.find((x) => x.field === "winning_aspiration")!.unsourced, []);
  const withheld = withheldKeysOf(v);
  assert(withheld.has(predecessorLineKey(WHERE)));
  assert(!withheld.has(predecessorLineKey(SERVES)));
});

Deno.test("R5-P: the prompt block and the stored still-sourced lines never carry a withheld line", () => {
  const sourcing = new Set(Object.keys(TEXT));
  const withheld = new Set([predecessorLineKey(WHERE)]);
  const kept = promptablePredecessorLines([WHERE, SERVES], sourcing, withheld);
  assertEquals(kept.map((l) => l.field), ["winning_aspiration"]);
  const block = stillSourcedPromptBlock([WHERE, SERVES], sourcing, [], "Spectrum", undefined, withheld);
  assert(!block.includes("45 states"), "a withheld line reached the prompt");
  assert(block.includes("57 million customers in 41 states"), "a sourced line must still reach the prompt");
  // without the withheld set, the pre-R5-P behaviour: both lines are shown
  assert(stillSourcedPromptBlock([WHERE, SERVES], sourcing, [], "Spectrum").includes("45 states"));
});

Deno.test("R5-P: continuity licenses a withheld line instead of demanding it", () => {
  const args = {
    currentLines: [WHERE], stagedLines: [] as CitedLine[], newLedgerIds: new Set(Object.keys(TEXT)),
    textByRef: { ...TEXT, f8a2d3c1: "Spectrum sells across 45 states including the Cox footprint" }, classByRef: CLASSES,
    sourcingIds: new Set(Object.keys(TEXT)),
  };
  // the control: without R5-P the dropped line is still-sourced and refuses
  const before = classifyContinuity(args);
  assertEquals(stillSourcedDrops(before).length, 1);
  const after = classifyContinuity({ ...args, withheld: new Set([predecessorLineKey(WHERE)]) });
  assertEquals(after.dropped.length, 0);
  assertEquals(after.licensed.length, 1);
  assert(after.licensed[0].reason.includes("withheld from the prompt"));
});

Deno.test("R5-P: an unclassed line is checked as record (fail closed); findings never source", () => {
  const unclassed: CitedLine = { field: "x", cls: null, text: "The largest operator across 45 states", refs: ["fd1"] };
  const v = predecessorVerdicts({
    lines: [unclassed], textByRef: { fd1: "The largest operator across 45 states" }, classes: { fd1: "our_read" },
    findingIds: new Set(["fd1"]),
  });
  assert(v[0].unsourced.length > 0, "a finding's text must not source a predecessor line");
});
