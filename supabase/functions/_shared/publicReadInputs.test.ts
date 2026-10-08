// 1a-4 (signed 2026-10-07) — SOURCE CLASS on every pool row.
//
// Guards:
//   (a) classOfSignal: the analysis mark wins over voice_class, under EVERY mark (label, the
//       raw_payload.source_type marker, the hypothesis shape) — including a shape-only row stamped
//       client_voice, which is the live Cafe Barra case the label alone misses.
//   (b) inheritedClass: WEAKEST wins (ruling 2A-ii). A line citing one record row and one our-read
//       row inherits our_read — one record citation can never launder the analysis beside it.
//   (c) classOfDelta: either side resting on an analysis-cited claim makes the pair our read.
//   (d) classStrongerThan: the ordering the slot check compares with.
// Source guards: every lane stamps a class; the signal lane tests isAnalysisRow BEFORE voice_class;
//   PUBLIC_SIGNAL_VOICES admits analysis; selectSignals admits an analysis row past the page gate.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classOfDelta, classOfSignal, classStrongerThan, inheritedClass,
  PUBLIC_SIGNAL_VOICES, type SourceClass,
} from "./publicReadInputs.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("(a) classOfSignal — the analysis mark beats the voice label, under every mark", () => {
  assertEquals(classOfSignal({ voice_class: "analysis", raw_payload: {} }), "our_read", "the label");
  assertEquals(classOfSignal({ voice_class: "client_voice", raw_payload: { source_type: "analysis" } }), "our_read", "the pre-D1 marker under a client_voice stamp");
  assertEquals(classOfSignal({ voice_class: "client_voice", raw_payload: { hypothesis: "…" } }), "our_read", "SHAPE only — the live Cafe Barra rows");
  assertEquals(classOfSignal({ voice_class: null, raw_payload: { hypothesis: "…" } }), "our_read", "shape with no label at all");
  // the honest non-analysis cases
  assertEquals(classOfSignal({ voice_class: "client_voice", raw_payload: { page_url: "https://x/" } }), "you");
  assertEquals(classOfSignal({ voice_class: "outside_voice_about_client", raw_payload: { url: "https://x/" } }), "record");
  assertEquals(classOfSignal({ voice_class: "market_context", raw_payload: { url: "https://x/" } }), "record");
  assertEquals(classOfSignal({ voice_class: "competitor_voice", raw_payload: { url: "https://x/" } }), "record");
  assertEquals(classOfSignal({ voice_class: null, raw_payload: { url: "https://x/" } }), "record", "unclassified is not ours to claim");
});

Deno.test("(b) inheritedClass — WEAKEST wins (2A-ii)", () => {
  const m = new Map<string, SourceClass>([["S1", "record"], ["O1", "you"], ["F1", "our_read"]]);
  assertEquals(inheritedClass(["S1"], m), "record");
  assertEquals(inheritedClass(["O1"], m), "you");
  assertEquals(inheritedClass(["F1"], m), "our_read");
  assertEquals(inheritedClass(["S1", "O1"], m), "you", "record + you → you");
  assertEquals(inheritedClass(["S1", "F1"], m), "our_read", "THE RULING: one record citation never launders our read");
  assertEquals(inheritedClass(["S1", "O1", "F1"], m), "our_read", "all three → the weakest");
  assertEquals(inheritedClass(["F1", "S1"], m), "our_read", "order-independent");
  assertEquals(inheritedClass([], m), null, "uncited ⇒ no class (the field must be empty)");
  assertEquals(inheritedClass(["NOPE"], m), null, "an unknown ref contributes nothing");
});

Deno.test("(c) classOfDelta — an analysis-cited claim on either side makes the pair ours", () => {
  const analysis = new Set(["c-analysis"]);
  assertEquals(classOfDelta({ declared_claim_id: "c1", public_claim_id: "c2" }, analysis), "record");
  assertEquals(classOfDelta({ declared_claim_id: "c-analysis", public_claim_id: "c2" }, analysis), "our_read", "declared side");
  assertEquals(classOfDelta({ declared_claim_id: "c1", public_claim_id: "c-analysis" }, analysis), "our_read", "public side");
  assertEquals(classOfDelta({ declared_claim_id: null, public_claim_id: null }, analysis), "record");
});

Deno.test("(d) classStrongerThan — the ordering", () => {
  assert(classStrongerThan("record", "our_read"));
  assert(classStrongerThan("record", "you"));
  assert(classStrongerThan("you", "our_read"));
  assert(!classStrongerThan("our_read", "record"));
  assert(!classStrongerThan("you", "you"));
});

Deno.test("source guard: every lane stamps a class, analysis is admitted, and the mark is tested first", async () => {
  const src = await read("./publicReadInputs.ts");
  // every rows.push carries source_class — four lanes, four pushes
  const pushes = src.split("rows.push({").slice(1);
  assertEquals(pushes.length, 4, "four lanes");
  for (const p of pushes) {
    assert(p.slice(0, 400).includes("source_class:"), "every lane stamps source_class");
  }
  assert(src.includes('kind: "signal", provenance: "public_observed", source_class: classOfSignal(s)'), "signals by classOfSignal");
  assert(src.includes('kind: "own_word", provenance: "public_observed", source_class: "you"'), "own words are always you");
  assert(src.includes('kind: "finding", provenance: "public_inferred", source_class: "our_read"'), "every finding is our read (1A-i)");
  assert(src.includes("source_class: classOfDelta(d, analysisClaimIds)"), "deltas by classOfDelta");
  // the mark is tested BEFORE the voice label
  const fn = src.slice(src.indexOf("export function classOfSignal("));
  assert(fn.indexOf("isAnalysisRow(s)") > 0 && fn.indexOf("isAnalysisRow(s)") < fn.indexOf('s.voice_class === "client_voice"'), "analysis mark first");
  // analysis joined the admitted voices, and the selector lets it past the page gate
  assert(PUBLIC_SIGNAL_VOICES.includes("analysis"), "analysis is admitted");
  const sel = await read("./publicReadSelection.ts");
  assert(sel.includes('export const SELECTION_VERSION = "gpr-select-2026-10-07.1" as const;'), "selection version stepped");
  assert(sel.includes("if (!isAnalysisRow(s) && !isPageShapedRow(s))"), "an analysis row is admitted past the page-shape gate");
});
