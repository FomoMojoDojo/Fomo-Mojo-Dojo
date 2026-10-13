// ── V1 (+ A1, A2, R1–R3), proven on the real Edgewood rows ──────────────────────────────────────
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CARRIED_DRIFT_GUARD, carriedBlockOf, carryForLine, chooseSecondSpan, chooseSpan, clausesOf,
  driftedSpans, joinSpans, relevantSpans, renderCarried, spanRelevantTo, spanUsable,
  usableSpansOf, type CarriedSpan,
} from "./carriedSpan.ts";
import { VERBATIM_MAX_CHARS } from "./readSlots.ts";
import { sha256Hex } from "./contentIdentity.ts";
import { decideFieldClass } from "./classFactCheck.ts";
import { softenedSpecifics, droppedLines } from "./stageContinuity.ts";

const RDF = "Kinship Support Network celebrates 30 years; in 1993 Edgewood established the first kinship program in the country; over 90% of youth served stayed in family settings to age 18; model replicated throughout U.S. and internationally.";
const R99 = "Lists Edgewood as a key resource for families; highlights the Kinship program's national-first status and 90%+ family-placement retention rate over three decades.";
const R34 = "GuideStar/Candid profile confirms CSU created with SF DPH; accepts Kaiser and most private insurances and Medi-Cal SF; only CSU serving youth under 12 in Bay Area.";
const CC2 = "The gap between Edgewood's public-facing mission messaging ('transforming lives', 'leading nonprofit') and employees' internal experience of understaffing, below-market pay, and disconnected upper management suggests a culture alignment gap that threatens long-term talent retention and service quality.";
const KINSHIP_LINE = "the first kinship program in the country, with a family-placement retention rate over three decades";

const spansOf = async (id: string, t: string, cls: string) => (await usableSpansOf(id, t, cls)).spans;

Deno.test("1. a clause span of a record row qualifies", async () => {
  const s = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  assertEquals(s.end, 114);
  assertEquals(s.cls, "record");
  assertEquals(s.text, "in 1993 Edgewood established the first kinship program in the country");
  assertEquals(s.specifics.sort(), ["1993", "first"]);
  assertEquals(s.row_sha, await sha256Hex(RDF));
});

Deno.test("2. the adjacent clause is NOT carried — provability is bounded to the span", async () => {
  const s = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  for (const tok of ["90%", "over 90%", "age 18"]) {
    assert(!s.text.toLowerCase().includes(tok.toLowerCase()), `"${tok}" must be outside the span`);
    assert(RDF.toLowerCase().includes(tok.toLowerCase()), `"${tok}" IS in the whole row — that is the point`);
  }
});

Deno.test("3. an our_read row never qualifies", async () => {
  assertEquals(await spansOf("cc224d8e", CC2, "our_read"), []);
  const one = clausesOf(CC2)[0];
  const r = spanUsable({ rowId: "cc224d8e", rowSha: "x".repeat(64), cls: "our_read", clause: one });
  assert(!r.ok); assertEquals(r.reason, "class_our_read");
});

Deno.test("4. a reporting-verb span fails self-containment", async () => {
  assertEquals(await spansOf("99037383", R99, "record"), [], "both clauses open on Lists/highlights");
  for (const c of clausesOf(R99)) {
    const r = spanUsable({ rowId: "99037383", rowSha: "x".repeat(64), cls: "record", clause: c });
    assert(!r.ok); assertEquals(r.reason, "not_self_contained");
  }
});

Deno.test("5. a span over 140 chars fails, at the boundary", () => {
  // exactly at the cap and exactly one over it. "we serve " is 9 chars and " in 1851" is 8, so the
  // filler is cap-17 and cap-16 — the first draft used cap-20/cap-19 and BOTH were under the cap,
  // which made the over-case assertion fail against a module that was behaving correctly.
  const mk = (t: string) => ({ start: 0, end: t.length, text: t, index: 0 });
  const at = `we serve ${"x".repeat(VERBATIM_MAX_CHARS - 17)} in 1851`;
  const over = `we serve ${"x".repeat(VERBATIM_MAX_CHARS - 16)} in 1851`;
  assertEquals(at.length, VERBATIM_MAX_CHARS);
  assertEquals(over.length, VERBATIM_MAX_CHARS + 1);
  assert(spanUsable({ rowId: "r", rowSha: "x".repeat(64), cls: "record", clause: mk(at) }).ok);
  const r = spanUsable({ rowId: "r", rowSha: "x".repeat(64), cls: "record", clause: mk(over) });
  assert(!r.ok); assertEquals(r.reason, "over_cap");
});

Deno.test("6. the four-key order: class, then specifics, then length, then id", () => {
  const mk = (o: Partial<CarriedSpan>): CarriedSpan => ({
    row_id: "a", row_sha: "x".repeat(64), start: 0, end: 1, cls: "record",
    clause_index: 0, text: "t", specifics: ["s"], ...o,
  });
  assertEquals(chooseSpan([mk({ cls: "you", row_id: "a" }), mk({ cls: "record", row_id: "b" })])!.cls, "record");
  assertEquals(chooseSpan([mk({ specifics: ["a"], row_id: "a" }), mk({ specifics: ["a", "b"], row_id: "b" })])!.row_id, "b");
  assertEquals(chooseSpan([mk({ text: "longer text", row_id: "a" }), mk({ text: "sh", row_id: "b" })])!.row_id, "b");
  assertEquals(chooseSpan([mk({ row_id: "b" }), mk({ row_id: "a" })])!.row_id, "a");
  assertEquals(chooseSpan([]), null);
});

Deno.test("7. a carried line passes C2 by construction", async () => {
  const s = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  assertEquals(
    softenedSpecifics({ text: s.text, cls: s.cls, refs: [s.row_id] }, { [s.row_id]: RDF }, { [s.row_id]: "record" }),
    [], "a non-our_read line is never examined, and a byte-exact copy cannot lack the row's word",
  );
});

Deno.test("8. a carried line passes C1 by construction", async () => {
  const s = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  const missing = droppedLines({
    currentLines: [{ text: KINSHIP_LINE, cls: "record", refs: ["99037383"] }],
    stagedLines: [{ text: s.text, cls: s.cls, refs: [s.row_id, "99037383"] }],
    newLedgerIds: new Set(["99037383", s.row_id]),
    textByRef: { "99037383": R99, [s.row_id]: RDF },
    classByRef: { "99037383": "record", [s.row_id]: "record" },
  });
  assertEquals(missing, [], "shares the citation and carries 'first' — it continues");
});

Deno.test("9. a carried line is not fact-checked", async () => {
  const s = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  assertEquals(
    decideFieldClass({ field: "f", cls: s.cls, text: s.text, citedSourceTexts: [RDF] }).branch,
    "not_applicable", "the gate polices OUR assertions; a carried line is not one",
  );
});

Deno.test("10. row drift refuses the stage (fail closed)", async () => {
  const s = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  const block = carriedBlockOf([{ field: "f", primary: s, second: null, stored_text: s.text, add_refs: [s.row_id], chosen_over: [] }]);
  assertEquals(await driftedSpans(block, { [s.row_id]: RDF }), [], "unchanged row holds");
  assertEquals((await driftedSpans(block, {}))[0].why, "row_missing");
  assertEquals((await driftedSpans(block, { [s.row_id]: RDF + " extra" }))[0].why, "sha_drift");
  assertEquals(CARRIED_DRIFT_GUARD, "carried_span_drift");
});

Deno.test("11. the stored line is byte-exact or the stage refuses", async () => {
  const s = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  const tampered = carriedBlockOf([{ field: "f", primary: s, second: null, stored_text: s.text.replace("first", "premier"), add_refs: [s.row_id], chosen_over: [] }]);
  assertEquals((await driftedSpans(tampered, { [s.row_id]: RDF }))[0].why, "span_mismatch");
});

Deno.test("12. the ledger records the span and what it was chosen over", async () => {
  const pool = [...await spansOf("dfb6da68", RDF, "record"), ...await spansOf("34405b08", R34, "you")];
  const c = carryForLine("unique_attributes[1]", KINSHIP_LINE, pool)!;
  const block = carriedBlockOf([c]);
  const e = block["unique_attributes[1]"];
  assertEquals(e.primary.start, 45);
  assertEquals(e.second, null);
  assertEquals(e.stored_text, "in 1993 Edgewood established the first kinship program in the country");
  assert(!("text" in (e.primary as Record<string, unknown>)), "the span's text is not duplicated — stored_text is the line");
  assert(e.chosen_over.some((o) => o.reason === "not_relevant"), "the gated-out spans are recorded");
});

// ── A1 / A2 ─────────────────────────────────────────────────────────────────────────────────────
Deno.test("13. A1: a second span is appended only when it adds a specific", async () => {
  const prim = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  const sameSpecs: CarriedSpan = { ...prim, row_id: "zz", clause_index: 9, text: "in 1993 the first programme began", specifics: ["1993", "first"] };
  // relevant (shares "first kinship program"? no) — build one that IS relevant and adds nothing
  const relevantNoAdd: CarriedSpan = { ...prim, row_id: "zz", clause_index: 8, text: "the first kinship program in the country again", specifics: ["first"] };
  assertEquals(chooseSecondSpan(prim, [prim, relevantNoAdd], KINSHIP_LINE), null, "adds no specific ⇒ not appended");
  const relevantAdds: CarriedSpan = { ...prim, row_id: "zz", clause_index: 7, text: "the first kinship program in the country, 90% retained", specifics: ["first", "90%"] };
  assertEquals(chooseSecondSpan(prim, [prim, relevantAdds], KINSHIP_LINE)?.clause_index, 7);
  assert(sameSpecs.specifics.length > 0);
});

Deno.test("14. NO second span on today's kinship rows", async () => {
  const pool = [...await spansOf("dfb6da68", RDF, "record"), ...await spansOf("99037383", R99, "record")];
  const c = carryForLine("unique_attributes[1]", KINSHIP_LINE, pool)!;
  assertEquals(c.second, null);
  assertEquals(c.stored_text, c.primary.text, "V1-R3: the stored line is the primary span alone");
  // and WHY: 99037383's clauses are unusable, dfb6da68{116,176} is usable but NOT relevant
  assertEquals(await spansOf("99037383", R99, "record"), []);
  const ninety = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 116)!;
  assertEquals(ninety.specifics.sort(), ["18", "90%"]);
  assertEquals(spanRelevantTo(ninety, KINSHIP_LINE), false, "a different measure — gated out by relevance, not by usability");
});

Deno.test("15. A2: render drops a leading date phrase and the company name; stored text unchanged", async () => {
  const s = (await spansOf("dfb6da68", RDF, "record")).find((x) => x.start === 45)!;
  assertEquals(s.text, "in 1993 Edgewood established the first kinship program in the country");
  assertEquals(renderCarried(s.text, "Edgewood"), "established the first kinship program in the country");
  // STORED is untouched, so verbatimProvable against the span still holds
  assertEquals(RDF.slice(s.start, s.end), s.text);
  assertEquals(renderCarried("since 1993 Edgewood ran it", "Edgewood"), "ran it");
  assertEquals(renderCarried("only CSU serving youth under 12 in Bay Area", "Edgewood"), "only CSU serving youth under 12 in Bay Area");
});

// ── R1 / R2 / R3 ────────────────────────────────────────────────────────────────────────────────
Deno.test("16. R1: a relevant span OUTSIDE the line's citations is a candidate, and its row joins the citations", async () => {
  const pool = await spansOf("dfb6da68", RDF, "record");
  const c = carryForLine("unique_attributes[1]", KINSHIP_LINE, pool)!;
  assertEquals(c.primary.row_id, "dfb6da68");
  // the current line cites only 99037383 — dfb6da68 is NOT among its citations
  assertEquals(["99037383"].includes(c.primary.row_id), false);
  assertEquals(c.add_refs, ["dfb6da68"], "the span's row is added to the line's citations");
});

Deno.test("17. R2: relevance is a GATE — the 90% clause is never primary", async () => {
  const pool = await spansOf("dfb6da68", RDF, "record");
  // ungated, the four-key order picks {116,176}: same class, same specific count, 60 chars < 69
  const ungated = chooseSpan(pool)!;
  assertEquals(ungated.start, 116, "this is the bug the gate exists to prevent");
  // gated, it picks the kinship claim
  assertEquals(carryForLine("f", KINSHIP_LINE, pool)!.primary.start, 45);
  assertEquals(relevantSpans(pool, KINSHIP_LINE).length, 1, "the gate EXCLUDES; it does not merely re-rank");
});

Deno.test("18. a non-relevant span is never appended even when it adds a specific", async () => {
  const pool = await spansOf("dfb6da68", RDF, "record");
  const prim = pool.find((x) => x.start === 45)!;
  const ninety = pool.find((x) => x.start === 116)!;
  assert(ninety.specifics.some((s) => !prim.specifics.includes(s)), "it DOES add specifics (90%, 18)");
  assertEquals(chooseSecondSpan(prim, pool, KINSHIP_LINE), null, "but it is not relevant, so it is not appended");
});

Deno.test("19. R3: a carried line contains no generated text", async () => {
  const pool = [...await spansOf("dfb6da68", RDF, "record"), ...await spansOf("34405b08", R34, "you")];
  for (const [field, line] of [["unique_attributes[1]", KINSHIP_LINE], ["unique_attributes[0]", "the only crisis stabilization unit serving youth under 12 in the Bay Area"]] as const) {
    const c = carryForLine(field, line, pool);
    if (!c) continue;
    const parts = [c.primary.text, ...(c.second ? [c.second.text] : [])];
    // every character of the stored text comes from a span, modulo the join
    const stripped = c.stored_text.replace(/,\s(with\s)?/g, " ").replace(/\s+/g, " ").trim();
    const fromSpans = parts.join(" ").replace(/\s+/g, " ").trim();
    assertEquals(stripped, fromSpans, `${field}: stored text is span text only`);
    assertEquals(joinSpans(c.primary, null), c.primary.text);
  }
});

// ── the hook sites ──────────────────────────────────────────────────────────────────────────────
const readSrc = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("hook: carry-before-generate — selection, the prompt notice, then the splice", async () => {
  const gen = await readSrc("../generate-public-read/index.ts");
  const g = gen.slice(gen.indexOf("generate: async (kind) =>"), gen.indexOf("judge: async (kind, payload)"));
  assert(g.includes("const carries = await selectCarries(kind as Kind);"), "selection runs first");
  assert(g.indexOf("selectCarries") < g.indexOf("await run(genChoice"), "BEFORE the model call");
  assert(g.includes("ALREADY WRITTEN"), "the generator is told which lines are taken");
  assert(g.includes("spliceCarries(p, carries);"), "and the carried text is spliced over the answer");
  assert(g.indexOf("await run(genChoice") < g.indexOf("spliceCarries(p, carries);"), "splice AFTER the answer");
  assert(g.indexOf("spliceCarries(p, carries);") < g.indexOf("stampAndDecide"), "and BEFORE classes are stamped");
});

Deno.test("hook: a carried line's citations are REPLACED, so its class is the span's", async () => {
  const gen = await readSrc("../generate-public-read/index.ts");
  assert(gen.includes("attrs[i] = { text: c.stored_text, citations: refs };"),
    "replaced, not merged — a merged finding would drag the class to our_read");
});

Deno.test("hook: the ledger carries the block, and drift fails closed before C1/C2", async () => {
  const gen = await readSrc("../generate-public-read/index.ts");
  assert(gen.includes("input_ledger: { ...ledger, carried: carriedBlocks[kind] ?? {} },"), "the block is stored");
  assert(gen.includes("throw new StageRefusal(\n            CARRIED_DRIFT_GUARD,"), "drift refuses");
  const fin = gen.indexOf("const finalize = async (rawKind: string");
  const body = gen.slice(fin, gen.indexOf("if (!doWrite) return;", fin));
  assert(body.indexOf("CARRIED_DRIFT_GUARD") < body.indexOf("softenedSpecifics"), "drift is checked before C2");
  assert(body.indexOf("CARRIED_DRIFT_GUARD") < body.indexOf("droppedLines"), "and before C1");
});

Deno.test("hook: only the differentiator paths carry in slice 1", async () => {
  const gen = await readSrc("../generate-public-read/index.ts");
  assert(/if \(!\/\^unique_attributes\\\[\\d\+\\\]\$\/\.test\(line\.field \?\? ""\)\) continue;/.test(gen),
    "narrative fields are compositions, not carries");
});
