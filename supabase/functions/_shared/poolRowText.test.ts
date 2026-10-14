// ── R1 / R3 (operator rulings, 2026-10-14): ONE row-text assembly, and what a span may cut from ──
//
// WHY THESE TESTS EXIST. Wasabi's positioning stage was refused by carried_span_drift (audit 10153,
// `unique_attributes[0] 4aa9b5e3:sha_drift`) on a row whose text had not moved at all. Two defects:
//
//   A  selectPublicInputs built a signal's pool text as (claim_text ?? evidence_excerpt) plus
//      " (" + source_title + ")". The drift re-read asks rowTextOf — claim_text + " " +
//      evidence_excerpt. No re-read could reproduce what the span had been cut from, so EVERY span
//      cut from a base-selection signal failed: 20 of 20 of Wasabi's pool signals. The only carries
//      that ever re-verified were the R4-admitted ones, because liveRecordCandidates already used
//      rowTextOf. That is the whole of Edgewood's green — not evidence the lane worked.
//
//   B  A delta entered the pool classed `record`, so poolSpans cut spans from it, but rowTextOf has
//      no delta table: reReadRowTexts returns nothing and driftedSpans says row_missing. Every delta
//      carry, always (Riverlane 99adc9d7, Brand AI 7ab1a1aa, SIAA fb2ac69f).
//
// These are SOURCE-LEVEL census tests on purpose. The defect was not a wrong value that a unit test
// over a fixture would have caught — it was two call sites answering the same question differently.
// What has to be pinned is that there is now ONE answer and that both lanes reach it.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ROW_TEXT_COLUMNS, rowTextOf, type SourcingRow } from "./classSourcingScope.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── R1 ───────────────────────────────────────────────────────────────────────────────────────────

Deno.test("R1. selectPublicInputs takes a signal's text from rowTextOf, and appends NOTHING to it", async () => {
  const src = await read("./publicReadInputs.ts");
  const push = src.slice(src.indexOf('for (const s of sigSel.kept) {'));
  const line = push.slice(0, push.indexOf("\n  }"));
  assert(
    line.includes('text: rowTextOf("signal", s)'),
    "the signal row's text IS rowTextOf's text — this is the one assembly (R1)",
  );
  // The exact shapes that caused defect A. A regression would reintroduce one of them.
  assert(!line.includes("signalText("), "signalText must not build a pool row's text any more");
  assert(!/text:\s*`/.test(line), "no template literal may assemble a signal's pool text");
  assert(!line.includes("source_title}"), "the source title is never interpolated into the text");
  assert(line.includes("source_title: s.source_title"), "the title travels as its OWN field instead");
});

Deno.test("R1. rowTextOf is the only text assembly selectPublicInputs imports for signals", async () => {
  const src = await read("./publicReadInputs.ts");
  assert(
    /import \{ rowTextOf \} from "\.\/classSourcingScope\.ts";/.test(src),
    "imported, never re-stated — a second copy is how the two lanes drifted apart",
  );
  // signalText may still exist for the SELECTION's own empty-text and dedupe keys, but this file
  // must not import it: that import is what made the wrong assembly reachable here.
  assert(
    !/import \{[^}]*\bsignalText\b[^}]*\} from "\.\/publicReadSelection\.ts";/.test(src),
    "publicReadInputs no longer imports signalText",
  );
});

Deno.test("R1. a planted pool text that differs from rowTextOf is caught", () => {
  // The shape of the bug, as data: both columns populated and different, plus a title.
  const row = { claim_text: "Wasabi charges no egress fees", evidence_excerpt: "Pricing is flat-rate", source_title: "Wasabi public baseline" };
  const correct = rowTextOf("signal", row);
  const planted = `${row.claim_text} (${row.source_title})`;           // the OLD assembly
  assertEquals(correct, "Wasabi charges no egress fees Pricing is flat-rate");
  assert(planted !== correct, "the old assembly and rowTextOf disagree — this IS defect A");
  // and the drift check's question is exactly this equality, so a span cut from `planted`
  // could never re-verify against `correct`.
  assert(!correct.includes(row.source_title), "rowTextOf never carries the title");
});

Deno.test("R1. the catalogue renders the title AFTER the text, not inside it", async () => {
  // S2 (2026-10-14) moved this template into catalogueLine, the ONE renderer both catalogues use.
  // The assertion is unchanged in substance: the title follows the text, so a span is only ever cut
  // from what precedes it.
  const src = await read("../generate-public-read/index.ts");
  const i = src.indexOf("export function catalogueLine(");
  assert(i > 0, "the one catalogue renderer still exists");
  const fn = src.slice(i);
  const line = fn.slice(fn.indexOf("return `["), fn.indexOf("\n}"));
  assert(/\$\{collapseHalves\(text\)\.slice\(0, 400\)\}/.test(line), "the text is still the body of the line");
  assert(
    line.indexOf("title") > line.indexOf("collapseHalves(text).slice(0, 400)"),
    "the title comes after the text — a span is only ever cut from what precedes it",
  );
});

Deno.test("R1. the selection version was bumped past the pre-fix value", async () => {
  const { SELECTION_VERSION } = await import("./publicReadSelection.ts");
  assert(SELECTION_VERSION !== "gpr-select-2026-10-07.1", "the pre-R1 version must not still be stamped");
  assertEquals(SELECTION_VERSION, "gpr-select-2026-10-14.1");
});

// ── R3 ───────────────────────────────────────────────────────────────────────────────────────────

Deno.test("R3. poolSpans applies the span-source law BEFORE the class test", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(
    /const SPAN_SOURCE_KINDS: ReadonlySet<string> = new Set\(\["signal", "own_word"\]\);/.test(src),
    "the law is stated once, as a set of kinds",
  );
  const fn = src.slice(src.indexOf("const poolSpans = async ()"));
  const body = fn.slice(0, fn.indexOf("\n    };"));
  const lawAt = body.indexOf("SPAN_SOURCE_KINDS.has");
  const classAt = body.indexOf('cls !== "record" && cls !== "you"');
  assert(lawAt > 0, "poolSpans consults SPAN_SOURCE_KINDS");
  assert(classAt > 0, "the class test is still there");
  assert(
    lawAt < classAt,
    "the kind law runs FIRST — a delta is class `record` and would sail through the class test",
  );
});

Deno.test("R3. a planted delta span is refused by the law — no span can carry a delta id", () => {
  // The guard as a predicate, exercised on every kind the pool admits.
  const SPAN_SOURCE_KINDS: ReadonlySet<string> = new Set(["signal", "own_word"]);
  for (const kind of ["signal", "own_word"]) {
    assert(SPAN_SOURCE_KINDS.has(kind), `${kind} is a legitimate span source`);
  }
  for (const kind of ["delta", "finding"]) {
    assertEquals(SPAN_SOURCE_KINDS.has(kind), false, `${kind} must never be a span source`);
  }
  // and the reason, pinned: there is no table rowTextOf could re-read a delta from.
  assertEquals(Object.keys(ROW_TEXT_COLUMNS).sort(), ["finding", "own_word", "signal"]);
  assert(!("delta" in ROW_TEXT_COLUMNS), "rowTextOf has no delta kind — so a delta span is unverifiable");
});

Deno.test("R3. the R4 lane cannot yield a delta: SourcingRow.kind admits only signal|own_word", async () => {
  const src = await read("./classSourcingScope.ts");
  assert(
    /export type SourcingRow = \{ id: string; kind: "signal" \| "own_word"; text: string; cls: SourcingClass \};/.test(src),
    "the type itself is the guard on the R4 lane",
  );
  // the compiler enforces it; this pins that a delta literal is not assignable
  const ok: SourcingRow = { id: "x", kind: "signal", text: "t", cls: "record" };
  assertEquals(ok.kind, "signal");
  // @ts-expect-error a delta is not a SourcingRow — if this ever compiles, the R4 lane has reopened
  const bad: SourcingRow = { id: "y", kind: "delta", text: "t", cls: "record" };
  assert(bad.kind === "delta", "the literal exists only to prove the type rejects it");
});

Deno.test("R3. liveRecordCandidates reads only the two span-source tables", async () => {
  const src = await read("./classSourcingScope.ts");
  const fn = src.slice(src.indexOf("export async function liveRecordCandidates("));
  const body = fn.slice(0, fn.indexOf("\n  return { candidates, searched };"));
  const tables = [...body.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assertEquals(
    [...new Set(tables)].sort(),
    ["claims", "own_words_candidates", "signals"],
    "signals + own_words_candidates are the span sources; claims is the active-identity lookup, never a span source",
  );
  assert(!tables.includes("claim_deltas"), "the R4 lane never reads claim_deltas");
});
