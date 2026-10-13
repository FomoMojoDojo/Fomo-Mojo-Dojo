// ── V1 (+ A1, A2, R1–R3), proven on the real Edgewood rows ──────────────────────────────────────
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CARRIED_DRIFT_GUARD, carriedBlockOf, carryForLine, chooseSecondSpan, chooseSpan, clausesOf,
  driftedSpans, joinSpans, relevantSpans, renderCarried, spanRelevantTo, spanUsable,
  usableSpansOf, type CarriedSpan,
  assembleByPath, rekeyCarriedBlock, type CarryPlacement, type CarriedBlock,
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
  assert(g.includes("spliceCarries(p, carries)"), "and the carried text is spliced over the answer");
  assert(g.indexOf("await run(genChoice") < g.indexOf("spliceCarries(p, carries)"), "splice AFTER the answer");
  assert(g.indexOf("spliceCarries(p, carries)") < g.indexOf("stampAndDecide"), "and BEFORE classes are stamped");
});

Deno.test("hook: a carried line's citations are REPLACED, so its class is the span's", async () => {
  const gen = await readSrc("../generate-public-read/index.ts");
  // S1 moved the placement into _shared/carriedSpan.ts; the invariant is unchanged and pinned in
  // both halves — the hook hands over the span's refs ALONE, and the assembly stores them as-is.
  assert(gen.includes("const citations = c.add_refs.map((u) => refByUuid.get(u)).filter((x): x is string => !!x);"),
    "the span's rows, and nothing merged in");
  const car = await readSrc("./carriedSpan.ts");
  assert(car.includes("byIndex.set(Number(m[1]), { line: { text: p.text, citations: p.citations }, field: p.field });"),
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

// ── V1-R4 / V1-R5 (operator rulings, 2026-10-13) ────────────────────────────────────────────────
import { liveRecordCandidates } from "./classSourcingScope.ts";
import { searchLiveRecordForSpans } from "./carriedSpan.ts";

const LIVE_ROWS = [
  { id: "dfb6da68", kind: "signal" as const, text: RDF, cls: "record" },
  { id: "99037383", kind: "signal" as const, text: R99, cls: "record" },
  { id: "34405b08", kind: "signal" as const, text: R34, cls: "you" },
  { id: "cc224d8e", kind: "signal" as const, text: CC2, cls: "our_read" },
];
const DIFF_LINES = [
  { field: "unique_attributes[1]", text: KINSHIP_LINE },
  { field: "unique_attributes[0]", text: "the only crisis stabilization unit serving youth under 12 in the Bay Area" },
];

Deno.test("R4. a carry candidate ABSENT from the base selection wins a span and is admitted", async () => {
  // the base selection holds neither kinship row — exactly the 9791 situation
  const won = await searchLiveRecordForSpans([DIFF_LINES[0]], LIVE_ROWS);
  assertEquals(won.length, 1);
  assertEquals(won[0].field, "unique_attributes[1]");
  assertEquals(won[0].row.id, "dfb6da68");
  assertEquals(won[0].span.start, 45);
  assertEquals(won[0].span.end, 114);
  assertEquals(won[0].row.cls, "record");
});

Deno.test("R4. admission is NARROW — a relevant row that wins no span is not admitted", async () => {
  // 99037383 is highly relevant to the kinship line but every clause is unusable (reporting verbs)
  assertEquals(await spansOf("99037383", R99, "record"), []);
  const won = await searchLiveRecordForSpans([DIFF_LINES[0]], LIVE_ROWS);
  assertEquals(won.map((w) => w.row.id), ["dfb6da68"], "only the span WINNER is admitted");
  // and an our_read row is never a candidate at all
  const onlyOurRead = await searchLiveRecordForSpans([DIFF_LINES[0]], [LIVE_ROWS[3]]);
  assertEquals(onlyOurRead, []);
});

Deno.test("R4. a row irrelevant to every line is not admitted even though it holds usable spans", async () => {
  const spans = await spansOf("34405b08", R34, "you");
  assert(spans.length > 0, "34405b08 does hold usable spans");
  const won = await searchLiveRecordForSpans([DIFF_LINES[0]], LIVE_ROWS);
  assert(!won.some((w) => w.row.id === "34405b08"), "not relevant to the kinship line ⇒ not admitted");
  // but it IS admitted for the line it is relevant to
  const both = await searchLiveRecordForSpans(DIFF_LINES, LIVE_ROWS);
  assertEquals(both.map((w) => `${w.field}:${w.row.id}`).sort(),
    ["unique_attributes[0]:34405b08", "unique_attributes[1]:dfb6da68"]);
});

Deno.test("R4. the carry runs over the ENLARGED pool", async () => {
  const base: CarriedSpan[] = await spansOf("34405b08", R34, "you");   // base selection: no kinship row
  assertEquals(carryForLine("unique_attributes[1]", KINSHIP_LINE, base), null, "base alone carries nothing");
  const won = await searchLiveRecordForSpans([DIFF_LINES[0]], LIVE_ROWS);
  const enlarged = [...base, ...(await spansOf(won[0].row.id, RDF, "record"))];
  const c = carryForLine("unique_attributes[1]", KINSHIP_LINE, enlarged)!;
  assertEquals(c.primary.row_id, "dfb6da68");
  assertEquals(c.primary.start, 45);
});

Deno.test("R4. the notice lists exactly the carried lines", async () => {
  const gen = await readSrc("../generate-public-read/index.ts");
  const g = gen.slice(gen.indexOf("generate: async (kind) =>"), gen.indexOf("judge: async (kind, payload)"));
  assert(g.includes("carries.map((c) => `  ${c.field}: ${c.stored_text}`).join"),
    "one notice line per carry, with its field and its stored text — nothing else");
  assert(g.includes("carries.length === 0 ? \"\" :"), "no notice at all when nothing is carried");
  // the notice is built from the SAME carries the splice applies, so it cannot drift from the truth
  assert(g.indexOf("const carries = await selectCarries") < g.indexOf("ALREADY WRITTEN"));
  assert(g.indexOf("ALREADY WRITTEN") < g.indexOf("spliceCarries(p, carries)"));
});

Deno.test("R4. the admission goes through admitSourcingRow and is recorded as admitted_from_live_record", async () => {
  const gen = await readSrc("../generate-public-read/index.ts");
  assert(gen.includes("const ref = admitSourcingRow(w.row);"), "the caller's own admission path");
  // REACHABILITY, not mere presence. A plant that put `if (true) continue;` at the top of this loop
  // left every string below intact and turned no test red — a source guard that checks only for a
  // call cannot tell a live call from a dead one. So assert the loop body STARTS with the admission.
  const loop = gen.slice(gen.indexOf("for (const w of won) {"));
  const body = loop.slice(loop.indexOf("{") + 1, loop.indexOf("}"));
  assertEquals(body.trim().split("\n")[0].trim(), "const ref = admitSourcingRow(w.row);",
    "the admission is the first statement — nothing may guard it out");
  assert(!/\b(continue|return|break)\b/.test(body), "no early exit inside the admission loop");
  assert(gen.includes("admitted.push({ ref, id: w.row.id, kind: w.row.kind, cls: w.row.cls, sourced: [`carry:${w.field}`] });"),
    "recorded in the same list PASS 2 reports as admitted_from_live_record, tagged with the line it won");
  assert(gen.includes("refByUuid.set(w.row.id, ref);"), "and the splice can map it back to its ref token");
  // PASS 2 itself is untouched: it still calls the specifics search, not the span search
  assert(gen.includes("searchLiveRecordForSpecifics(supabase, company_id, specifics, alreadyCited)"));
});

Deno.test("R5. PASS 2's candidate gathering is EXTRACTED, not reimplemented", async () => {
  const scope = await readSrc("./classSourcingScope.ts");
  assert(scope.includes("export async function liveRecordCandidates("), "the gatherer is exported");
  assert(scope.includes("const gathered = await liveRecordCandidates(supabase, companyId, alreadyCited);"),
    "and PASS 2 calls it — one query, two searches");
  // the query predicates appear exactly ONCE in the file
  assertEquals(scope.split('.eq("signal_band", "outside")').length - 1, 1, "no second copy of the signals query");
  assertEquals(scope.split('.eq("judge_keep", true)').length - 1, 1, "no second copy of the own-words query");
});

Deno.test("R5. the dry run builds the pool as the generate path does at the carry point", async () => {
  // THE RULE: base selection + pre-generation admissions. NEVER the current read's stored ledger.
  // The first dry run read the stored ledger, which already held PASS-2 admissions from the run that
  // produced it — so it predicted a carry the live run could not make (refusal 9791).
  const base = await spansOf("34405b08", R34, "you");                       // stands for the base selection
  const won = await searchLiveRecordForSpans(DIFF_LINES, LIVE_ROWS);        // the pre-generation admissions
  const admittedSpans: CarriedSpan[] = [];
  for (const w of won) admittedSpans.push(...await spansOf(w.row.id, w.row.text, w.row.cls));
  const poolAtCarry = [...base, ...admittedSpans];
  // the kinship carry is reachable from THIS pool and from no smaller one
  assertEquals(carryForLine("unique_attributes[1]", KINSHIP_LINE, poolAtCarry)!.primary.row_id, "dfb6da68");
  assertEquals(carryForLine("unique_attributes[1]", KINSHIP_LINE, base), null);
  // and the dry-run harness must not be handed a stored ledger: the generate path has none at this point
  const gen = await readSrc("../generate-public-read/index.ts");
  const sel = gen.slice(gen.indexOf("const selectCarries = async"), gen.indexOf("const spliceCarries"));
  assert(!/input_ledger/.test(sel), "the carry point reads no stored ledger");
  assert(sel.includes("await poolSpans()"), "it builds the pool from the catalogue it has just enlarged");
});

// ── S1: unique_attributes is assembled BY PATH, not by the model's index ───────────────────────
//
// Run 9868's defect. The old splice did `attrs[i] = carry` at each carried index, which assumes the
// model's array is index-aligned with the field paths. The prompt guarantees otherwise: it tells the
// model not to write the carried lines, so what comes back are the lines it DID write, at indices
// 0, 1, … — exactly where the carries land. Every generated differentiator was overwritten, the
// staged read held two carried lines and nothing else, and C1 refused the dropped third line.
const CARRIES_01: CarryPlacement[] = [
  { field: "unique_attributes[0]", text: "CARRY-0", citations: ["S21"] },
  { field: "unique_attributes[1]", text: "CARRY-1", citations: ["S22"] },
];
const genLines = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `GEN-${i}`, citations: ["X"] }));
const shape = (a: { lines: ReadonlyArray<Record<string, unknown>> }) => a.lines.map((x) => String(x.text));

Deno.test("S1. carries at [0],[1] + ONE model line ⇒ 3 entries, the generated line at [2]", () => {
  const out = assembleByPath(genLines(1), CARRIES_01);
  assertEquals(out.lines.length, 3);
  assertEquals(shape(out), ["CARRY-0", "CARRY-1", "GEN-0"]);
  assertEquals(out.lines[2].citations, ["X"], "the generated line keeps its own citations");
  assertEquals(out.lines[0].citations, ["S21"], "a carried line's citations ARE its span's row (R3)");
  assertEquals(out.placedAt, { "unique_attributes[0]": "unique_attributes[0]", "unique_attributes[1]": "unique_attributes[1]" }, "nothing shifted");
});

Deno.test("S1. carries at [0],[1] + ZERO model lines ⇒ 2 entries", () => {
  assertEquals(shape(assembleByPath(genLines(0), CARRIES_01)), ["CARRY-0", "CARRY-1"]);
});

Deno.test("S1. the model's lines are placed IN ORDER, never by their index", () => {
  assertEquals(shape(assembleByPath(genLines(2), CARRIES_01)), ["CARRY-0", "CARRY-1", "GEN-0", "GEN-1"]);
  assertEquals(shape(assembleByPath(genLines(3), CARRIES_01)), ["CARRY-0", "CARRY-1", "GEN-0", "GEN-1", "GEN-2"]);
  // and NOTHING the model returned is lost — the 9868 failure mode, stated as a property
  for (const n of [0, 1, 2, 3, 5]) {
    const out = assembleByPath(genLines(n), CARRIES_01);
    assertEquals(shape(out).filter((t) => t.startsWith("GEN-")).length, n, `all ${n} generated line(s) survive`);
  }
});

Deno.test("S1. a carry at a NON-leading path still owns its slot, and no hole is stored", () => {
  const carries: CarryPlacement[] = [
    { field: "unique_attributes[0]", text: "CARRY-0", citations: ["S21"] },
    { field: "unique_attributes[2]", text: "CARRY-2", citations: ["S23"] },
  ];
  assertEquals(shape(assembleByPath(genLines(1), carries)), ["CARRY-0", "GEN-0", "CARRY-2"]);
  assertEquals(shape(assembleByPath(genLines(0), carries)), ["CARRY-0", "CARRY-2"], "the gap closes rather than storing an empty slot");
  for (const x of assembleByPath(genLines(0), carries).lines) assert(x && typeof x.text === "string", "no hole");
});

Deno.test("S1. NO carries ⇒ the model's array, in its own order, untouched", () => {
  assertEquals(shape(assembleByPath(genLines(3), [])), ["GEN-0", "GEN-1", "GEN-2"]);
  const src = genLines(2);
  assertEquals(assembleByPath(src, []).lines, [...src]);
  assertEquals(assembleByPath(src, []).placedAt, {}, "nothing was placed");
});

Deno.test("S1. the hook delegates placement and never indexes the model's array itself", async () => {
  const src = await readSrc("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf("const spliceCarries ="), src.indexOf("const stampAndDecide ="));
  assert(fn.includes("const { lines, placedAt } = assembleByPath(modelLines, placements);"), "one assembly, in _shared");
  assert(fn.includes("payload.unique_attributes = lines;"), "and the payload takes exactly what it returned");
  assert(!/attrs\[/.test(fn) && !/modelLines\[\s*(?:i|Number)/.test(fn), "no index placement in the hook");
  assert(fn.includes('if (citations.length === 0) return [];'), "a span whose row is not in the catalogue is not placed");
});

Deno.test("S1. a carry whose slot SHIFTS is re-keyed, so the carried block never lies about its path", () => {
  // paths [0] and [2] carried, nothing generated: [1] has no filler, so the [2] carry is STORED at [1]
  const carries: CarryPlacement[] = [
    { field: "unique_attributes[0]", text: "CARRY-0", citations: ["S21"] },
    { field: "unique_attributes[2]", text: "CARRY-2", citations: ["S23"] },
  ];
  const out = assembleByPath(genLines(0), carries);
  assertEquals(shape(out), ["CARRY-0", "CARRY-2"]);
  assertEquals(out.placedAt, {
    "unique_attributes[0]": "unique_attributes[0]",
    "unique_attributes[2]": "unique_attributes[1]",     // ← it moved, and says so
  });
  // the block follows the line, not the selection
  const block = {
    "unique_attributes[0]": { primary: { row_id: "a" }, second: null, stored_text: "CARRY-0", rejected: [] },
    "unique_attributes[2]": { primary: { row_id: "b" }, second: null, stored_text: "CARRY-2", rejected: [] },
  } as unknown as CarriedBlock;
  const rekeyed = rekeyCarriedBlock(block, out.placedAt);
  assertEquals(Object.keys(rekeyed), ["unique_attributes[0]", "unique_attributes[1]"]);
  assertEquals((rekeyed["unique_attributes[1]"] as { stored_text: string }).stored_text, "CARRY-2");

  // and when nothing shifts, re-keying is the identity
  const same = assembleByPath(genLines(1), carries);
  assertEquals(shape(same), ["CARRY-0", "GEN-0", "CARRY-2"]);
  assertEquals(Object.keys(rekeyCarriedBlock(block, same.placedAt)), ["unique_attributes[0]", "unique_attributes[2]"]);
});

Deno.test("S1. the hook re-keys the block from the SAME call that assembles the payload", async () => {
  const src = await readSrc("../generate-public-read/index.ts");
  assert(src.includes("carriedBlocks[kind as Kind] = rekeyCarriedBlock(carriedBlocks[kind as Kind] ?? {}, spliceCarries(p, carries));"),
    "one call, one truth — the block cannot be re-keyed from a different assembly than the one stored");
  const genBlock = src.slice(src.indexOf("generate: async (kind) => {"), src.indexOf("judge: async (kind, payload)"));
  assert(genBlock.includes("rekeyCarriedBlock("), "re-keyed inside generate — which runs before finalize is ever called");
  assert(src.includes("const carriedNow = carriedBlocks[kind] ?? {};"), "and the drift check reads the block as generate left it");
});
