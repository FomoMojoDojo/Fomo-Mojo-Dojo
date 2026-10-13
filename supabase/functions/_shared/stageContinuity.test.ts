// ── C1 / C2, proven on the real Edgewood rows ───────────────────────────────────────────────────
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CONTINUITY_GUARD, POSITION_WORDS, REPUTATIONAL_WORDS, SHARED_RUN_WORDS, SOFTENING_GUARD,
  continuityBlock, droppedLines, sharedRun, softenedSpecifics, type CitedLine,
} from "./stageContinuity.ts";

// the real rows, verbatim from the database
const R99 = "Lists Edgewood as a key resource for families; highlights the Kinship program's national-first status and 90%+ family-placement retention rate over three decades.";
const RDF = "Kinship Support Network celebrates 30 years; in 1993 Edgewood established the first kinship program in the country; over 90% of youth served stayed in family settings to age 18; model replicated throughout U.S. and internationally.";
const E756 = "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area; opened 2014 in conjunction with SF Department of Public Health.";
const D4A = "We are a leading nonprofit mental healthcare provider for San Francisco Bay Area youth and families facing mental health challenges, trauma, and family crises.";
const O3B = "We have been transforming lives since 1851, offering over 15 innovative programs in 6 locations throughout the Bay Area.";
const F838 = "Edgewood's primary competitive moat is its 170+ year institutional history, its status as the only youth-under-12 CSU in the Bay Area, and deep government payer relationships - not brand differentiation with end-user families.";

const TEXTS = { r99: R99, rdf: RDF, e756: E756, d4a: D4A, o3b: O3B, f838: F838 };
const CLASSES = { r99: "record", rdf: "record", e756: "you", d4a: "you", o3b: "you", f838: "our_read" };

// the current read's kinship line, and the two hedges the model actually produced
const CURRENT_KINSHIP: CitedLine = {
  text: "the first kinship program in the country, with a family-placement retention rate over three decades",
  cls: "record", refs: ["r99"],
};
const HEDGE_E9: CitedLine = {
  text: "nationally pioneering kinship program with 90%+ family-placement retention rate over three decades",
  cls: "our_read", refs: ["r99", "rdf"],
};
const HEDGE_F7: CitedLine = {
  text: "a nationally pioneering kinship program with over 90% family-placement retention rate",
  cls: "our_read", refs: ["r99", "rdf"],
};
const IMPROVED: CitedLine = {
  text: "the first kinship program in the country, with a 90%+ family-placement retention rate over three decades",
  cls: "our_read", refs: ["r99", "rdf"],
};

Deno.test("1. a still-sourced current line must be continued", () => {
  const missing = droppedLines({
    currentLines: [CURRENT_KINSHIP], stagedLines: [HEDGE_E9],
    newLedgerIds: new Set(["r99", "rdf"]), textByRef: TEXTS, classByRef: CLASSES,
  });
  assertEquals(missing.length, 1);
  assertEquals(missing[0].statement, CURRENT_KINSHIP.text);
  assertEquals(missing[0].specifics, ["first"]);
});

Deno.test("2. a line whose record source left the ledger may be dropped (the real 170+ case)", () => {
  const line170: CitedLine = {
    text: "a 170+ year institutional history with deep government payer relationships",
    cls: "our_read", refs: ["f838", "o3b", "gone8e1b"],
  };
  // 8e1ba6ae (the record row) is absent; f838 is a finding (our_read, cannot source); o3b remains
  const missing = droppedLines({
    currentLines: [line170], stagedLines: [{ text: "over 15 innovative programs in 6 locations throughout the Bay Area", cls: "you", refs: ["o3b"] }],
    newLedgerIds: new Set(["f838", "o3b"]), textByRef: TEXTS, classByRef: CLASSES,
  });
  assertEquals(missing, [], "clause 7 licenses this drop — it no longer passes against what remains");
});

Deno.test("3. a line with NO cited row left in the ledger may be dropped", () => {
  const missing = droppedLines({
    currentLines: [CURRENT_KINSHIP], stagedLines: [],
    newLedgerIds: new Set(["somethingelse"]), textByRef: TEXTS, classByRef: CLASSES,
  });
  assertEquals(missing, [], "its sources are gone — licensed");
});

Deno.test("4. continuity ALLOWS an improved line (the 90% added)", () => {
  const missing = droppedLines({
    currentLines: [CURRENT_KINSHIP], stagedLines: [IMPROVED],
    newLedgerIds: new Set(["r99", "rdf"]), textByRef: TEXTS, classByRef: CLASSES,
  });
  assertEquals(missing, [], "the improved line shares a citation and carries 'first' — it continues");
  // and the match is NOT equality: the texts differ
  assert(IMPROVED.text !== CURRENT_KINSHIP.text);
});

Deno.test("5. a softened position claim is refused", () => {
  for (const [label, line] of [["e9c985dc", HEDGE_E9], ["f794c846", HEDGE_F7]] as const) {
    const hits = softenedSpecifics(line, TEXTS, CLASSES);
    assert(hits.length > 0, `${label} must be refused`);
    assertEquals(hits[0].word, "first");
    assert(hits[0].shared_run.includes("family-placement"), hits[0].shared_run);
  }
  // the line that states it as the row does is silent
  assertEquals(softenedSpecifics(IMPROVED, TEXTS, CLASSES), []);
});

Deno.test("6. a REPUTATIONAL superlative is NOT a softening", () => {
  // d4a says "leading"; a read that declines to repeat it has softened nothing
  const line: CitedLine = { text: "nonprofit youth mental healthcare provider", cls: "our_read", refs: ["d4a"] };
  assertEquals(softenedSpecifics(line, TEXTS, CLASSES), []);
  for (const w of REPUTATIONAL_WORDS) assert(!(POSITION_WORDS as readonly string[]).includes(w), `${w} must not be a position word`);
});

Deno.test("7. an exclusivity word about a DIFFERENT program does not fire", () => {
  // e756 carries "only" — about the CSU, not the kinship program
  const line: CitedLine = { text: "nationally pioneering kinship program with 90%+ family-placement retention rate", cls: "our_read", refs: ["e756"] };
  assertEquals(softenedSpecifics(line, TEXTS, CLASSES), []);
  assertEquals(sharedRun(E756, line.text, SHARED_RUN_WORDS), null, "no shared 3-run — different claims");
  // and N=2 WOULD have fired, which is why N is 3
  assert(sharedRun(D4A, "nonprofit youth mental healthcare provider", 2) !== null, "N=2 is too loose");
});

Deno.test("8. a STRENGTHENED line is refused by the existing gate, not by this check", async () => {
  const { decideFieldClass } = await import("./classFactCheck.ts");
  const ROW = "The Edgewood CSU is one of only a few CSUs designed to serve youth 5-17 years of age in the entire state of California and the only one serving youth under 12 in the Bay Area.";
  const stronger = { field: "f", cls: "our_read", text: "the only CSU in the entire state of California", citedSourceTexts: [ROW] };
  assertEquals(decideFieldClass(stronger).branch, "judge_required", "the gate already catches strengthening");
  // and C2 stays silent on it — it only looks for words the ROW has and the LINE lacks
  const line: CitedLine = { text: stronger.text, cls: "our_read", refs: ["strongrow"] };
  assertEquals(softenedSpecifics(line, { strongrow: ROW }, { strongrow: "you" }), [],
    "the line CARRIES 'only', so nothing was softened — strengthening is the gate's job");
});

Deno.test("the guards are named strings and the block counts both ways", () => {
  assertEquals(CONTINUITY_GUARD, "continuity_line_dropped");
  assertEquals(SOFTENING_GUARD, "specific_softened");
  assertEquals(continuityBlock(3, [], []), { required: 3, continued: 3, missing: [], softened: [] });
  const b = continuityBlock(3, [{ statement: "x", specifics: ["first"], reason: "r" }], []);
  assertEquals([b.required, b.continued], [3, 2]);
});

// ── the hook sites ──────────────────────────────────────────────────────────────────────────────
const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

Deno.test("hook: both checks run in finalize, BEFORE any persistence and AFTER the re-ask", async () => {
  const gen = await read("../generate-public-read/index.ts");
  const fin = gen.indexOf("const finalize = async (rawKind: string");
  const body = gen.slice(fin, gen.indexOf("if (!doWrite) return;", fin));
  // both checks inside finalize
  assert(body.includes("softenedSpecifics(l, textByUuid, classByUuid)"), "C2 runs in finalize");
  assert(body.includes("droppedLines({"), "C1 runs in finalize");
  // BEFORE the stage insert and before prepareStorage
  assert(body.indexOf("droppedLines({") < body.indexOf("prepareStorage(kind"), "checks precede any payload build");
  assert(body.indexOf("softenedSpecifics(") < body.indexOf('from("public_reads").insert'), "checks precede the insert");
  // AFTER the re-ask: the re-ask is wired on the runKindsIsolated options, which come later in the file
  assert(gen.indexOf("const finalize = async") < gen.indexOf("reaskOnClassRefusal:"), "finalize is defined before the re-ask wiring, and runs after it");
  // REFUSES, never rewrites. V3: the throw is a typed StageRefusal so the wrapper keeps the guard.
  assert(body.includes("throw new StageRefusal(SOFTENING_GUARD"), "C2 throws typed");
  assert(body.includes("throw new StageRefusal(CONTINUITY_GUARD"), "C1 throws typed");
  assert(!/softened\s*=\s*\[\]|missing\s*=\s*\[\]/.test(body), "nothing clears a hit by assignment");
});

Deno.test("hook: the continuity block is computed either way, and the refusal row comes from the wrapper", async () => {
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("continuityBlocks[kind] = block;"), "the block is recorded on accept and on refuse");
  // V3: the check no longer writes its own row — runKindsIsolated writes exactly one, with the
  // guard the StageRefusal carries. The V3 tests below assert that end of it.
  assert(!/recordKindIntegrity\(kind,\s*\{\s*status:\s*"rejected",\s*guard:\s*(SOFTENING|CONTINUITY)_GUARD/.test(gen),
    "no self-recorded refusal row — that is what duplicated 9712/9713");
});

Deno.test("hook: the SLOT path runs C2 and not C1", async () => {
  const slots = await read("../generate-read-slots/index.ts");
  assert(slots.includes("softenedSpecifics(line, Object.fromEntries(sourceRowTextById), ledgerClasses)"), "C2 on the slot path");
  assert(slots.includes("throw new StageRefusal(SOFTENING_GUARD"), "and it refuses, typed");
  assert(!slots.includes("droppedLines"), "C1 is NOT on the slot path — a slot has no prior slot to continue");
  // and it refuses before the insert
  assert(slots.indexOf("softenedSpecifics(line") < slots.indexOf('from("first_read_slots").insert'), "before the insert");
});

// ── V2 / V3 (operator rulings, 2026-10-13) ──────────────────────────────────────────────────────
import { StageRefusal, detailOf } from "./publicReadPerKind.ts";
import { softeningDetail as sd, continuityDetail as cd } from "./stageContinuity.ts";

/** The real refused line, in full — 97 characters, which the first refusal stored 60 of. */
const REFUSED = "nationally pioneering kinship program with 90%+ family-placement retention rate over three decades";

Deno.test("V2. a refusal carries the FULL refused field text, never a slice", () => {
  const detail = sd([{ field: REFUSED, ref: "99037383-3e52-43d8-bfba-6d941b246b79", word: "first", shared_run: "90%+ family-placement retention" }]);
  assert(detail.includes(REFUSED), `the whole line must be in the detail:\n${detail}`);
  assert(detail.includes("over three decades"), "including its tail, which the 60-char slice lost");
  assertEquals(detail, `"${REFUSED}" 99037383:first:"90%+ family-placement retention"`);
  // and the continuity detail carries whole statements too
  const c = cd([{ statement: REFUSED, specifics: ["first"], reason: "r" }]);
  assert(c.includes("over three decades"));
});

Deno.test("V2. the source no longer slices the line into the detail", async () => {
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("softenedSpecifics(l, textByUuid, classByUuid).map((h) => ({ field: l.text, ...h }))"),
    "the full text goes in");
  assert(!/field:\s*l\.text\.slice\(/.test(gen), "no slice of the field text anywhere in the hook");
});

Deno.test("V2. reject() hands the FULL detail to the integrity row and the capped one to the log", async () => {
  const perKind = await read("./publicReadPerKind.ts");
  assert(perKind.includes("await deps.recordIntegrity?.(kind, { status: \"rejected\", guard, detail: full });"),
    "the row gets the uncapped detail");
  assert(perKind.includes("deps.onReject?.(kind, guard, detail);"), "the log line keeps its 200-char cap");
  // detailOf still caps, because the log line and the error column still want that
  assertEquals(detailOf("x".repeat(300)).length, 200);
});

Deno.test("V3. a StageRefusal carries its own guard and the wrapper passes it through", () => {
  const r = new StageRefusal("specific_softened", `"${REFUSED}" 99037383:first:"x"`);
  assertEquals(r.guard, "specific_softened");
  assertEquals(r.name, "StageRefusal");
  assert(r.detail.includes(REFUSED), "the typed error carries the full detail");
  assert(r instanceof Error, "still an Error, so an un-updated catch still sees it");
  assertEquals(new StageRefusal("continuity_line_dropped", "d").guard, "continuity_line_dropped");
});

Deno.test("V3. ONE row per refusal — the check does not record its own", async () => {
  const gen = await read("../generate-public-read/index.ts");
  const fin = gen.indexOf("const finalize = async (rawKind: string");
  const body = gen.slice(fin, gen.indexOf("if (!doWrite) return;", fin));
  assert(body.includes("throw new StageRefusal(SOFTENING_GUARD"), "C2 throws typed");
  assert(body.includes("throw new StageRefusal(CONTINUITY_GUARD"), "C1 throws typed");
  // the duplicate-row bug: the check must NOT call recordKindIntegrity for its own refusal
  assert(!/recordKindIntegrity\(kind,\s*\{\s*status:\s*"rejected",\s*guard:\s*(SOFTENING|CONTINUITY)_GUARD/.test(body),
    "the check must not write its own row — runKindsIsolated writes exactly one");
  // and the wrapper uses the refusal's guard, not write_error
  const perKind = await read("./publicReadPerKind.ts");
  assert(perKind.includes("refusal ? refusal.guard : \"write_error\""), "guard passed through");
  assert(perKind.includes("refusal ? refusal.detail : (e as Error).message"), "detail passed through");
  // the two names are in the guard vocabulary, so no caller can invent them
  assert(perKind.includes('| "continuity_line_dropped"') && perKind.includes('| "specific_softened"'));
});

Deno.test("V3. a genuine write failure is still write_error — a refusal's name is not borrowed", async () => {
  const perKind = await read("./publicReadPerKind.ts");
  const blk = perKind.slice(perKind.indexOf("await deps.commit(kind, payload, g.verdict);"));
  assert(blk.slice(0, 700).includes('"write_error"'), "a non-StageRefusal throw stays write_error");
});

Deno.test("V2/V3 on the SLOT path too: full detail, named guard, not run_failed", async () => {
  const slots = await read("../generate-read-slots/index.ts");
  assert(slots.includes("throw new StageRefusal(SOFTENING_GUARD"), "the slot refusal is typed");
  assert(slots.includes("const guard = refusal ? refusal.guard : \"run_failed\";"), "named guard survives");
  assert(slots.includes("excluded_by_rule: { kind, guard, detail: full }"), "and the FULL detail is stored");
  assert(!/excluded_by_rule: \{ kind, guard: "run_failed", detail: String\(e\)\.slice/.test(slots),
    "the old run_failed + slice shape is gone");
});
