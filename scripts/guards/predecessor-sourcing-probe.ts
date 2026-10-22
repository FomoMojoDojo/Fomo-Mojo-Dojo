// R5-P probe (2026-10-22) — a predecessor line reaches the prompt only if its specifics source. Fixtures only (a guard
// checks invariants, never a live company's rows); no network, no model. One JSON line.
//   p1 an R5-failing predecessor line (Spectrum's 43542649 where_to_play shape: 45 / U.S. on rows that read "") is
//      withheld and never reaches the prompt block or the stored still-sourced lines; a sourced line still does
//   p2 continuity does not demand a withheld line: it is licensed, and stillSourcedDrops is empty
//   p3 wiring: generate-public-read passes the same withheld set to the prompt block, the stored lines and continuity
import { predecessorLineKey, predecessorVerdicts, withheldKeysOf } from "../../supabase/functions/_shared/predecessorSourcing.ts";
import {
  type CitedLine, classifyContinuity, promptablePredecessorLines, stillSourcedDrops, stillSourcedPromptBlock,
} from "../../supabase/functions/_shared/stageContinuity.ts";

const ROOT = new URL("../../", import.meta.url);
const WHERE: CitedLine = {
  field: "where_to_play", cls: "record",
  text: "The U.S. residential and business broadband, TV, mobile, and home phone markets across 45 states, including the newly acquired Cox footprint",
  refs: ["s-a", "s-b"],
};
const SERVES: CitedLine = { field: "winning_aspiration", cls: "you", text: "Serve over 57 million customers in 41 states", refs: ["o-1"] };
const TEXT: Record<string, string> = { "s-a": "", "s-b": "", "o-1": "Spectrum serves over 57 million customers in 41 states" };
const CLASSES: Record<string, string> = { "s-a": "record", "s-b": "record", "o-1": "you" };
const sourcing = new Set(Object.keys(TEXT));

const withheld = withheldKeysOf(predecessorVerdicts({ lines: [WHERE, SERVES], textByRef: TEXT, classes: CLASSES, findingIds: new Set(), companyName: "Spectrum" }));
const block = stillSourcedPromptBlock([WHERE, SERVES], sourcing, [], "Spectrum", undefined, withheld);
const stored = promptablePredecessorLines([WHERE, SERVES], sourcing, withheld).map((l) => l.field);
const p1 = {
  withheld: withheld.has(predecessorLineKey(WHERE)), sourced_kept: !withheld.has(predecessorLineKey(SERVES)),
  block_has_withheld: block.includes("45 states"), block_has_sourced: block.includes("41 states"), stored,
};
const split = classifyContinuity({
  currentLines: [WHERE], stagedLines: [], newLedgerIds: sourcing,
  textByRef: { ...TEXT, "s-a": "across 45 states including the Cox footprint" }, classByRef: CLASSES, sourcingIds: sourcing, withheld,
});
const p2 = { dropped: split.dropped.length, licensed: split.licensed.length, still_sourced_drops: stillSourcedDrops(split).length };
const gpr = await Deno.readTextFile(new URL("supabase/functions/generate-public-read/index.ts", ROOT));
const p3 = {
  prompt: gpr.includes("stillSourcedPromptBlock(currentForPrompt, sourcingIds, feedbackPool(), companyName, refByUuidLive(), predecessorWithheld)"),
  stored: gpr.includes("stillSourcedByKind[kind as Kind] = promptablePredecessorLines(currentForPrompt, sourcingIds, predecessorWithheld)"),
  continuity: gpr.includes("withheld: (await predecessorGateFor(kind)).withheld,"),
  gate: gpr.includes("const g = await predecessorGate(supabase,"),
};
console.log(JSON.stringify({ p1, p2, p3 }));
