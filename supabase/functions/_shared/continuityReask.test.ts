// ── C1-R (operator ruling, 2026-10-15): one re-ask per stage, C1-S drops included ───────────────
//
// WHY. Wasabi's fifth stage attempt was refused by C1-S (audit 10378). Every name was sourced — N1a
// had dropped bare "AI", and the "enterprise-class, tier-free" line that had been unsourced against
// techradar came back correctly classed `you` and cited to c3dcff4e, the company's own words, which
// state it verbatim. The model then gave ua[1] to that new line and DROPPED the still-sourced
// AI-products line, whose two sourcing rows (2242bdd1, 7638775d) were both sitting in the pool.
//
// Under C1 law that is substitution, so the refusal was right. What was missing was the second
// attempt: N1c's re-ask covered the S1/N1 gate only, and C1-S is raised inside commit, after the
// judge, so nothing reached the model. C1-R routes that refusal to the SAME single re-ask, on the
// SAME budget — one per stage, however the first attempt was refused.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CONTINUITY_GUARD } from "./stageContinuity.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── the trigger ─────────────────────────────────────────────────────────────────────────────────

Deno.test("C1-R. a C1-S drop routes to the re-ask, from inside the commit catch", async () => {
  const src = await read("./publicReadPerKind.ts");
  const fn = src.slice(src.indexOf("if (deps.commit) {"));
  const body = fn.slice(0, fn.indexOf("await deps.recordIntegrity?.(kind, { status: \"completed\" });"));
  assert(body.includes("if (refusal?.guard === CONTINUITY_GUARD && !reasked && deps.reaskOnSourcingRefusal) {"),
    "the continuity refusal is recognised where it is actually caught — inside commit");
  assert(body.includes('deps.reaskOnSourcingRefusal(kind, payload, refusal.detail, "continuity")'),
    "and it calls the ONE re-ask, tagged as the continuity case");
  assert(body.includes("if (next) { payload = next; reasked = true; continue; }"),
    "the fresh payload re-enters the loop");
  // the guard string has one definition, in the module that throws it
  assertEquals(CONTINUITY_GUARD, "continuity_line_dropped");
  assert(src.includes('import { CONTINUITY_GUARD } from "./stageContinuity.ts";'),
    "imported, never re-stated as a literal here");
});

Deno.test("C1-R. ONE re-ask per stage in total — the two triggers share the flag", async () => {
  const src = await read("./publicReadPerKind.ts");
  const fn = src.slice(src.indexOf("for (;;) {"));
  // every re-ask path is gated on !reasked and sets it, so N1-then-C1-S cannot get two attempts
  // THREE re-ask paths now share the one flag: the sourcing (S1/N1) trigger, the continuity (C1-S)
  // trigger C1-R adds, and the pre-existing class trigger. That sharing IS the budget: a stage
  // refused by N1 and then by C1-S gets one attempt in total, not one per fault.
  const gates = [...fn.matchAll(/!reasked && deps\.reask/g)].length;
  assertEquals(gates, 3, "sourcing, continuity and class triggers, all gated on the one flag");
  const sets = [...fn.matchAll(/reasked = true;/g)].length;
  assertEquals(sets, 3, "sourcing, continuity, and the pre-existing class re-ask all set it");
  // and there is exactly one flag, declared once per kind
  const decls = [...fn.matchAll(/let reasked = false;/g)].length;
  const outer = [...src.matchAll(/let reasked = false;/g)].length;
  assertEquals(outer, 1, "one flag, declared once inside the per-kind loop");
  assertEquals(decls, 0, "and not re-declared inside the attempt loop, which would reset it");
});

Deno.test("C1-R. a second refusal stands — no third attempt", async () => {
  const src = await read("./publicReadPerKind.ts");
  const fn = src.slice(src.indexOf("for (;;) {"));
  // after a re-ask, `reasked` is true, so both triggers are closed and every path reaches reject()
  assert(fn.includes("if (refusal?.guard === CONTINUITY_GUARD && !reasked"), "continuity checks the flag");
  assert(fn.includes("if (g.sourcingDetail !== undefined && !reasked"), "sourcing checks the flag");
  const commitCatch = fn.slice(fn.indexOf("if (deps.commit) {"));
  assert(commitCatch.includes("await reject("), "a re-asked-and-refused kind still reaches reject()");
});

// ── what the re-ask carries ─────────────────────────────────────────────────────────────────────

Deno.test("C1-R. the prompt carries the dropped line's TEXT and its SOURCING IDS", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf('if (because === "continuity") {'));
  const body = fn.slice(0, fn.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  assert(body.includes("m.statement"), "the dropped line's own text");
  assert(body.includes("m.sourcing_citations"), "and the rows that still source it");
  assert(body.includes("${lines}"), "and the block reaches the user prompt");
  // NP (2026-10-15): the rendering moved into the ONE feedback builder, which prints the
  // "still stated by" line and the per-name rows. The branch feeds it; it no longer formats.
  assert(body.includes("reaskFeedbackBlock({"), "built by the one re-ask feedback builder");
  const shared = await read("./reaskFeedback.ts");
  assert(shared.includes("still stated by:"), "named in the prompt");
  // the ids are rendered as REF TOKENS, because those are what the model may cite
  assert(body.includes("refByUuid: refByUuidLive()"), "the branch hands it the uuid -> ref map");
  assert(shared.includes("args.refByUuid?.get(id) ?? id"), "translated to the ref tokens the model can cite");
});

Deno.test("C1-R. the prompt carries the RULE: keep the still-sourced, replace only the rest", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf('if (because === "continuity") {'));
  const body = fn.slice(0, fn.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  assert(body.includes("keep or improve EVERY line listed here"), "keep or improve every still-sourced line");
  assert(body.includes("A new line may ` +\n            `replace only a line that is NOT listed here"), "a new line replaces only a non-listed one");
  assert(body.includes("it must still say what it says"), "improving is allowed, losing the claim is not");
});

Deno.test("C1-R. only STILL-SOURCED drops are put to the model", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf('if (because === "continuity") {'));
  const body = fn.slice(0, fn.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  assert(body.includes("(block?.missing ?? []).filter((m) => m.still_sourced === true)"),
    "a line whose sources left the pool cannot be continued from this ledger — asking for it would be asking for an unsourced sentence");
  assert(body.includes("if (dropped.length === 0) return null;"),
    "and with nothing still-sourced to repair, the refusal stands rather than a pointless retry");
});

Deno.test("C1-R. CODE NEVER REWRITES A LINE", async () => {
  const src = await read("../generate-public-read/index.ts");
  const fn = src.slice(src.indexOf('if (because === "continuity") {'));
  const body = fn.slice(0, fn.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  // L1 (2026-10-15): the call carries its attempt and its role, so its cost row names them.
  assert(body.includes("const again = await run(genChoice, sys, user, 0.2,"), "the model answers again");
  assert(body.includes('attempt: (attemptNo[kind as Kind] ?? 1) + 1, role: "generator"'),
    "ledgered as the attempt it produces");
  assert(body.includes("return again;"), "and its answer is what is returned");
  assert(!/payload\[/.test(body), "the refused payload is never edited in place");
  assert(!body.includes("...payload"), "nor merged into");
  assert(!body.includes("m.statement}\"") || !body.includes("payload ="), "the dropped line is never spliced back by code");
});

// ── the second output faces every gate ──────────────────────────────────────────────────────────

Deno.test("C1-R. the re-asked payload re-enters runGates, so C1 runs on it too", async () => {
  const src = await read("./publicReadPerKind.ts");
  const loop = src.slice(src.indexOf("for (;;) {"));
  const gatesAt = loop.indexOf("const g = await runGates(kind, payload);");
  const contAt = loop.indexOf("if (refusal?.guard === CONTINUITY_GUARD");
  assert(gatesAt >= 0 && contAt > gatesAt, "the continuity re-ask sits inside the loop whose head calls runGates");
  // the branch's own statement must CONTINUE, not break: a break would commit the second answer
  // without re-running the citation guards, S1/N1, the judge, or C1 itself.
  const branch = loop.slice(contAt, loop.indexOf("await reject(", contAt));
  assert(/if \(next\) \{ payload = next; reasked = true; continue; \}/.test(branch),
    "it continues back to the loop head");
  assert(!/if \(next\)[^\n]*break;/.test(branch), "a break here would skip every gate including C1");
  // and commit — which is where C1 lives — runs again on the second pass
  assert(loop.includes("await deps.commit(kind, payload, g.verdict);"), "commit, and so C1, runs again");
});

Deno.test("C1-R. a re-ask that drops a still-sourced line again cannot stage", async () => {
  const src = await read("./publicReadPerKind.ts");
  const loop = src.slice(src.indexOf("for (;;) {"));
  // the second pass reaches commit again; C1-S throws again; `reasked` is now true so the trigger is
  // closed; the only remaining path is reject(). Nothing between the throw and reject() can stage.
  const commitBlock = loop.slice(loop.indexOf("if (deps.commit) {"));
  const guardAt = commitBlock.indexOf("if (refusal?.guard === CONTINUITY_GUARD && !reasked");
  const rejectAt = commitBlock.indexOf("await reject(");
  const writtenAt = commitBlock.indexOf('outcomes.push({ kind, status: "written"');
  assert(guardAt > 0 && rejectAt > guardAt, "the closed trigger falls through to reject()");
  assert(rejectAt < writtenAt, "and reject() precedes the written outcome — a refused second attempt never reaches it");
  assert(commitBlock.slice(rejectAt, writtenAt).includes("break;"), "the kind breaks out before being recorded as written");
});

// ── auditing ────────────────────────────────────────────────────────────────────────────────────

Deno.test("C1-R. each attempt is audited, and the first BEFORE the retry", async () => {
  const src = await read("./publicReadPerKind.ts");
  const fn = src.slice(src.indexOf("if (deps.commit) {"));
  const branch = fn.slice(fn.indexOf("if (refusal?.guard === CONTINUITY_GUARD"), fn.indexOf("await reject("));
  assert(branch.includes('deps.recordIntegrity?.(kind, { status: "rejected"'), "attempt 1 is recorded");
  assert(branch.includes("attempt 1 of 2, re-asked"), "and says which attempt it was");
  assert(branch.includes("payload"), "carrying the refused payload (V4/V4a)");
  assert(branch.indexOf("recordIntegrity") < branch.indexOf("deps.reaskOnSourcingRefusal("),
    "audited first, then re-asked — a crash in the retry cannot erase the record");
});

Deno.test("C1-R. V4: one audit row per ATTEMPT, and every one carries the payload", async () => {
  const src = await read("./publicReadPerKind.ts");
  const fn = src.slice(src.indexOf("export async function runKindsIsolated("));
  const calls = [...fn.matchAll(/recordIntegrity\?\.\(kind, \{ status: "rejected"[\s\S]*?\}\);/g)].map((m) => m[0]);
  assertEquals(calls.length, 3, "reject()'s funnel, N1c's attempt-1 record, and C1-R's attempt-1 record");
  for (const c of calls) assert(c.includes("payload"), `every rejected-status audit carries the payload: ${c.slice(0, 60)}`);
});
