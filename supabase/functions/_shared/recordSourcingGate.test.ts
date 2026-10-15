// ── S1 / S2 / C1-P / F1 / V4 (operator rulings, 2026-10-14) ─────────────────────────────────────
//
// WHAT THESE GUARD. Wasabi's positioning stage was refused twice: first by carried_span_drift
// (audit 10153, defect A/B — fixed by R1/R3), then by C1 continuity_line_dropped (audit 10190).
// The second refusal exposed three separate faults and one standing hole:
//
//   S1   The hole. decideFieldClass returns not_applicable for every line that is not our_read, and
//        C2 gates the same way, so NOTHING tested a rendered specific for verbatim sourcing on a
//        record- or you-classed line — at stage or at promote. All six of Wasabi's fields were
//        record/you and every one reported examined: 0. The Sep 18 promote law requires that check.
//   F1   FIGURE_RE read the figure "3" out of "S3 compatibility", and C1 then demanded the record
//        carry "3" verbatim. Same for B2B, B2C, B2B2C, H4, H6, Q2, Q4, H100.
//   C1-P C1 refused a regeneration for dropping lines of a read generated 2026-08-22 under rules
//        that no longer exist. Enforced against such a predecessor, no company could ever leave the
//        old rules.
//   S2   71% of signals carry claim_text = evidence_excerpt, so rowTextOf's assembly renders them
//        doubled to the model. R1 made that text the pool's text deliberately, so the fix is at the
//        render, never in the text a span is cut from.
//   V4   Audits 10153 and 10190 name the guard and the reason but not the words refused: the
//        payload was in hand and went only to the HTTP response.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { S1_POSITION_WORDS, extractSpecifics, s1Detail, s1Unsourced } from "./classFactCheck.ts";
import { collapseHalves } from "../generate-public-read/index.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── F1 ───────────────────────────────────────────────────────────────────────────────────────────

const figures = (t: string) => extractSpecifics(t).filter((s) => s.kind === "figure").map((s) => s.token);

Deno.test("F1. a digit run preceded by a letter is not a figure", () => {
  assertEquals(figures("S3 compatibility"), [], "S3 is a protocol name, not a quantity");
  assertEquals(figures("H100 GPUs"), [], "H100 is a part number");
  assertEquals(figures("B2B wholesale and B2C retail"), [], "B2B / B2C are segment names");
  assertEquals(figures("B2B2C partnerships"), []);
  assertEquals(figures("revenue in Q4 and Q2"), [], "quarters are not quantities");
  assertEquals(figures("COVID-19 relief"), [], "already excluded by the hyphen lookbehind");
});

Deno.test("F1. a TRAILING letter still counts, and every real figure survives", () => {
  assertEquals(figures("3x growth"), ["3"]);
  assertEquals(figures("10M users"), ["10M"]);
  assertEquals(figures("5k seats"), ["5k"]);
  assertEquals(figures("$350K raised"), ["$350K"]);
  assertEquals(figures("90%+ placement"), ["90%+"], "G1's suffix run is untouched");
  assertEquals(figures("170+ years"), ["170+"]);
  assertEquals(figures("in 1993 it began"), ["1993"]);
  assertEquals(figures("ages 3-21"), ["3-21"], "the small-range arm is untouched");
  assertEquals(figures("US$100 million"), ["$100"], "the letter precedes the $, not the digit");
  assertEquals(figures("172k in Q2 2026"), ["172k", "2026"], "the real figures survive beside a quarter");
});

Deno.test("F1. the lookbehind sits AFTER the optional currency mark", async () => {
  const src = await read("./classFactCheck.ts");
  const m = /const FIGURE_RE = (\/.*\/g);/.exec(src);
  assert(m, "FIGURE_RE is still one literal");
  assert(
    m[1].indexOf("(?<![A-Za-z])") > m[1].indexOf("\\$?"),
    "the letter lookbehind must follow \\$? — before it, US$100 would wrongly lose its figure",
  );
});

// ── S1 ───────────────────────────────────────────────────────────────────────────────────────────

const SRC_FIG = ["Wasabi charges no egress fees and reached 170+ customers in 2024"];

Deno.test("S1. a record line whose figure IS in a cited row passes", () => {
  const r = s1Unsourced({ field: "unique_attributes[0]", cls: "record", citedSourceTexts: SRC_FIG,
    text: "reached 170+ customers on flat-rate pricing" });
  assertEquals(r.unsourced, []);
  assert(r.examined > 0, "the figure was actually tested, not skipped");
});

Deno.test("S1. a record line whose figure is ABSENT from its cited rows is refused", () => {
  const r = s1Unsourced({ field: "unique_attributes[0]", cls: "record", citedSourceTexts: SRC_FIG,
    text: "reached 900+ customers on flat-rate pricing" });
  assertEquals(r.unsourced.map((u) => u.token), ["900+"]);
  assert(s1Detail([r]).includes("900+"), "the refusal names the specific");
  assert(s1Detail([r]).includes("unique_attributes[0]"), "and the field it was in");
});

Deno.test("S1. a `you` line whose position word is absent from its cited rows is refused", () => {
  const src = ["Wasabi provides hot cloud storage for backups and AI datasets"];
  const r = s1Unsourced({ field: "value", cls: "you", citedSourceTexts: src,
    text: "the only hot cloud storage for AI datasets" });
  assertEquals(r.unsourced.map((u) => u.token.toLowerCase()), ["only"]);
  assertEquals(r.unsourced[0].kind, "exclusivity");
});

Deno.test("S1. the same position word, present in a cited row, passes", () => {
  const src = ["Wasabi is the only hot cloud storage priced flat for AI datasets"];
  const r = s1Unsourced({ field: "value", cls: "you", citedSourceTexts: src,
    text: "the only hot cloud storage for AI datasets" });
  assertEquals(r.unsourced, []);
});

Deno.test("S1. position words are EXACTLY the four the ruling names", () => {
  assertEquals([...S1_POSITION_WORDS].sort(), ["first", "largest", "only", "sole"]);
  // a reputational judgement is NOT one of them: a read declining to repeat "leading" is correct
  const r = s1Unsourced({ field: "value", cls: "record", citedSourceTexts: ["a storage provider"],
    text: "a leading, premier storage provider" });
  assertEquals(r.unsourced, [], "leading/premier are outside S1 by ruling");
});

Deno.test("S1. our_read and unclassed lines are not S1's business", () => {
  for (const cls of ["our_read", null]) {
    const r = s1Unsourced({ field: "f", cls, citedSourceTexts: [], text: "we read 900+ customers" });
    assertEquals(r.examined, 0, `${cls} is left to (b)`);
    assertEquals(r.unsourced, []);
  }
});

Deno.test("S1. FAILS CLOSED on a record line whose text could not be resolved", () => {
  const r = s1Unsourced({ field: "f", cls: "record", citedSourceTexts: ["anything"], text: "   " });
  assertEquals(r.unsourced.length, 1);
  assertEquals(r.unsourced[0].kind, "unresolved");
});

Deno.test("S1. a figure carried ONLY by a cited finding is refused — a finding is never a source", async () => {
  // The exclusion is the caller's: it filters by class AND by kind. This pins both halves.
  const src = await read("../generate-public-read/index.ts");
  // F1: the closure reads fieldClasses[kind] instead of stamping the payload itself, so its
  // signature dropped the payload. The filter this test pins is unchanged.
  const fn = src.slice(src.indexOf("s1Refusal: (kind, _payload) =>"));
  const body = fn.slice(0, fn.indexOf("\n      },"));
  assert(body.includes('if (cls !== "record" && cls !== "you") return false;'), "our_read cannot source");
  assert(body.includes('kindByRef.get(r) !== "finding"'), "and a finding is excluded by KIND as well");
  // and the predicate itself: with the finding's text withheld, the figure is unsourced
  const withFinding = s1Unsourced({ field: "f", cls: "record", text: "serving 12 counties",
    citedSourceTexts: [] });                                    // the finding's text never arrives
  assertEquals(withFinding.unsourced.map((u) => u.token), ["12"]);
});

Deno.test("S1. no second implementation — it calls the shared sourcing predicate", async () => {
  const src = await read("./classFactCheck.ts");
  const fn = src.slice(src.indexOf("export function s1Unsourced("));
  const body = fn.slice(0, fn.indexOf("export function s1Detail("));
  assert(body.includes("specificIsSourcedWithSecondChance("), "the SAME predicate (b) uses");
  assert(body.includes("extractSpecifics("), "and the SAME extractor, so F1/G1-G3 ride along");
  assert(!body.includes("verbatimProvable("), "it must not re-implement the verbatim test itself");
  // and it is the predicate (b) itself calls, not a lookalike
  const decide = src.slice(src.indexOf("export function decideFieldClass("));
  assert(decide.includes("specificIsSourcedWithSecondChance("), "(b) calls the same one");
});

Deno.test("S1. runs at STAGE as a guard before the judge, and never re-asks", async () => {
  const src = await read("./publicReadPerKind.ts");
  const fn = src.slice(src.indexOf("const runGates = async"));
  const body = fn.slice(0, fn.indexOf("\n  };"));
  const s1At = body.indexOf("deps.s1Refusal");
  const judgeAt = body.indexOf("await deps.judge(");
  const livePublicAt = body.indexOf("citationsLivePublic(");
  assert(s1At > 0 && judgeAt > 0 && livePublicAt > 0);
  assert(livePublicAt < s1At, "after the citation guards — a bad citation is not an unsourced specific");
  assert(s1At < judgeAt, "BEFORE the judge — deterministic, free, and unclearable by a judgment");
  // the re-ask is reachable only from `not_accepted`; S1 returns `rejected`, so it can never re-ask
  assert(body.includes('return { outcome: "rejected", guard: "record_specific_unsourced"'),
    "S1 refuses outright");
  const loop = src.slice(src.indexOf("for (;;) {"));
  assert(loop.indexOf("reaskOnClassRefusal") > loop.indexOf('g.outcome === "not_accepted"'),
    "the re-ask hangs off not_accepted only");
});

Deno.test("S1. runs again at PROMOTE, and refuses the promote", async () => {
  const src = await read("./publicReadPromote.ts");
  assert(src.includes("export async function promoteS1Refusal("), "the promote-side check exists");
  const fn = src.slice(src.indexOf("export async function promoteStagedReads("));
  const body = fn.slice(0, fn.indexOf("\n  return { promoted, cascade_routing: cascadeRouting };"));
  const checkAt = body.indexOf("await promoteS1Refusal(");
  const firstWriteAt = body.indexOf('.update({ is_current: false, superseded_by: stagedId })');
  assert(checkAt > 0, "promoteStagedReads calls it");
  assert(checkAt < firstWriteAt, "decided BEFORE any write — a refused promote flips nothing");
  assert(body.slice(checkAt, firstWriteAt).includes("throw new PromoteRefused("), "and it refuses");
  // the texts are re-read LIVE: a stage-time pass is no promise about now
  const helper = src.slice(src.indexOf("export async function promoteS1Refusal("));
  assert(helper.includes("reReadRowTexts("), "row texts come from a live re-read through rowTextOf");
});

// ── S2 ───────────────────────────────────────────────────────────────────────────────────────────

Deno.test("S2. an exactly-doubled row renders once; everything else is untouched", () => {
  const half = "Wasabi charges no egress fees";
  assertEquals(collapseHalves(`${half} ${half}`), half, "rowTextOf's space-joined doubling");
  assertEquals(collapseHalves(`${half}${half}`), half, "and an exact doubling with no separator");
  assertEquals(collapseHalves(half), half, "a single copy is unchanged");
  assertEquals(collapseHalves(`${half} and more`), `${half} and more`, "a near-miss is unchanged");
  assertEquals(collapseHalves(""), "", "empty is safe");
  assertEquals(collapseHalves("ab abc"), "ab abc", "unequal halves are unchanged");
});

Deno.test("S2. DISPLAY ONLY — the pool's text and the span anchors stay on rowTextOf", async () => {
  const inputs = await read("./publicReadInputs.ts");
  const push = inputs.slice(inputs.indexOf("const pushSignals = (list: readonly SelSignal[], reason: string | undefined) => {"));
  const line = push.slice(0, push.indexOf("\n  }"));
  // EXACTLY rowTextOf(...) and nothing chained onto it. Naming collapseHalves is not enough: any
  // transformation here — an inline regex, a .replace, a slice — reintroduces defect A by making the
  // pool text something the drift re-read cannot reproduce.
  const m = /text: (rowTextOf\("signal", s\))\s*,/.exec(line);
  assert(m, `the pool's text must be exactly rowTextOf("signal", s) — found: ${JSON.stringify(line.match(/text: [^,]*/)?.[0] ?? "(none)")}`);
  assert(!/text: rowTextOf\("signal", s\)\s*\./.test(line), "nothing may be chained onto it");
  assert(!line.includes("collapseHalves"), "and the collapse in particular must not touch it");
  const carried = await read("./carriedSpan.ts");
  assert(!carried.includes("collapseHalves"), "nor the span/hash path");
  const scope = await read("./classSourcingScope.ts");
  assert(!scope.includes("collapseHalves"), "nor the drift re-read");
});

Deno.test("S2. the renderer actually collapses — the text it emits goes through collapseHalves", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf("export function catalogueLine("));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert(
    /\$\{collapseHalves\(text\)\.slice\(/.test(body),
    "the rendered text must BE collapseHalves(text) — rendering raw text is the defect S2 removes",
  );
  assert(!/\$\{text\.slice\(/.test(body), "the raw text must not be rendered");
});

Deno.test("S2. ONE render function feeds both the generator and the judge catalogue", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("export function catalogueLine("), "one renderer");
  // every catalogue line in the file goes through it
  const rawLines = [...src.matchAll(/`\[\$\{ref\}\] \(/g)];
  assertEquals(rawLines.length, 1, "the only raw catalogue template is the one INSIDE catalogueLine");
  assert(src.includes("lines.push(catalogueLine("), "the base catalogue uses it");
  assert(src.includes("CAT_LIVE += `\\n${catalogueLine("), "and so does the live-admission catalogue");
});

// ── C1-P ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("C1-P. C1 refuses against a rules-current predecessor and reports against an older one", async () => {
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes('const c1Enforced = predecessorRules !== "" && predecessorRules >= "2026-10-13.1";'),
    "the mode is decided by the predecessor's own stamp");
  // P2 (2026-10-14) renamed the set: the refusal is on split.dropped, the lines that actually dropped.
  assert(src.includes("if (split.dropped.length > 0 && c1Enforced) throw new StageRefusal(CONTINUITY_GUARD"),
    "the refusal is conditional on the mode");
  // and the drops are computed and recorded either way
  const i = src.indexOf("const split = classifyContinuity({");
  assert(i > 0 && i < src.indexOf("const c1Enforced"), "the drops are computed BEFORE the mode is consulted");
  assert(src.includes('c1_mode: c1Enforced ? "enforced" : "report_only"'), "the block records which mode ran");
  assert(src.includes("predecessor_gen_rules_version: predecessorRules || null"), "and the fact that decided it");
});

Deno.test("C1-P. the version comparison is string-ordered on the dated stamp", () => {
  const enforced = (v: string) => v !== "" && v >= "2026-10-13.1";
  assertEquals(enforced(""), false, "no stamp at all ⇒ report only");
  assertEquals(enforced("2026-10-13.1"), true, "the boundary itself enforces");
  assertEquals(enforced("2026-10-13.2"), true);
  assertEquals(enforced("2026-10-14.1"), true);
  assertEquals(enforced("2026-10-07.1"), false, "an older stamp ⇒ report only");
  assertEquals(enforced("2026-09-18.1"), false);
});

// ── V4 ───────────────────────────────────────────────────────────────────────────────────────────

Deno.test("V4. the refused payload reaches the audit row, from the ONE reject funnel", async () => {
  const perKind = await read("./publicReadPerKind.ts");
  assert(perKind.includes("await deps.recordIntegrity?.(kind, { status: \"rejected\", guard, detail: full, payload });"),
    "reject() forwards the payload it already holds");
  const src = await read("../generate-public-read/index.ts");
  assert(src.includes("refused_payload: refusedPayload,"), "and the row stores it");
  assert(src.includes("refused_citations: refusedCitations,"), "with the citations it made");
  // V4a (2026-10-14) put the payload through translateCitations, so the capture is now two steps:
  // refusedRaw holds the model's answer (ref tokens) and refusedPayload the translated one. The
  // invariant is unchanged — null on an accepted kind, because the written row is the record there.
  assert(src.includes('const refusedRaw = row.status === "rejected" ? (row.payload ?? null) : null;'),
    "null on an accepted kind — the written row is the record there");
  assert(/const refusedPayload = refusedRaw\s*\n\s*\? translateCitations\(refusedRaw, uuidByRef\)/.test(src),
    "and the stored payload carries resolved ids (V4a)");
});

Deno.test("V4. EVERY guard routes through that one funnel, so none can omit the payload", async () => {
  const src = await read("./publicReadPerKind.ts");
  // every rejection in runKindsIsolated goes through reject(), which now carries the payload
  const fn = src.slice(src.indexOf("export async function runKindsIsolated("));
  const rejects = [...fn.matchAll(/await reject\(/g)];
  assert(rejects.length >= 3, `expected every rejection path to call reject(), saw ${rejects.length}`);
  // TWO places now call recordIntegrity with a rejected status, and BOTH carry the payload:
  //   reject()  — the one funnel every guard routes through, for the refusal that stands;
  //   N1c       — the attempt-1 record written BEFORE a bounded re-ask, so a re-asked kind leaves a
  //               record of both attempts rather than only of the one that stuck.
  // What V4 guards is that no rejected-status audit call can omit the payload, and that is still
  // every one of them.
  // span to the call's own closing `});`, not to the first `;` — N1c's detail template contains one
  // ("attempt 1 of 2; re-asked"), and a regex that stopped there would truncate the call before
  // `payload` and report a false failure.
  const rejectedCalls = [...fn.matchAll(/recordIntegrity\?\.\(kind, \{ status: "rejected"[\s\S]*?\}\);/g)].map((m) => m[0]);
  // C1-R (2026-10-15) added a third: its own attempt-1 record, inside the commit catch. V4's
  // invariant is unchanged — no rejected-status audit call may omit the payload, and none does.
  assertEquals(rejectedCalls.length, 3, "the reject funnel, N1c's and C1-R's attempt-1 records");
  for (const c of rejectedCalls) assert(c.includes("payload"), `every rejected-status audit carries the payload: ${c.slice(0, 70)}`);
});

Deno.test("V4. exactly ONE row per refusal — the fallback only runs when the first insert failed", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf("const recordKindIntegrity = async"));
  const body = fn.slice(0, fn.indexOf("\n    };"));
  const inserts = [...body.matchAll(/from\("integrity_runs"\)\.insert\(/g)];
  assertEquals(inserts.length, 2, "the insert and its status-downgrade fallback");
  assert(body.includes("if (!error) return;"), "the fallback is unreachable once the first insert succeeded");
});
