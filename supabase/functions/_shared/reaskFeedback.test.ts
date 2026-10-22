// ── NP / F1b / L1 (operator rulings, 2026-10-15) ────────────────────────────────────────────────
//
// WHY. Wasabi's run of 15:55 was refused twice, each gate seeing half the problem (10454 → 10455):
// C1-S named the rows that SOURCE the dropped line, the model cited exactly those, and N1 refused it
// because neither states "Wasabi Fire" or "AI/ML" — both of which were in the pool, on 9373abfc and
// c30e9189, admitted by N2's name harvest. One prompt knew continuity, the other knew names, the
// budget is one re-ask, and the line needed both.
//
//   NP   one function builds re-ask feedback for every refusal type, and it covers BOTH continuity
//        and names for every line involved. The still-sourced block carries the name rows too.
//   F1b  verdicts[kind] is cleared at the attempt-loop head, with the stamp. 10455 carried attempt
//        1's distinctness block because a verdict outlived its attempt.
//   L1   one model_calls row per model call, each naming its attempt and its prompt sha; every
//        attempt's audit row carries its prompt_sha.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  canSource, nameSupport, namesToSource, reaskFeedback, reaskFeedbackBlock, type SourceRow,
} from "./reaskFeedback.ts";
import { type CitedLine, sourcingIdsOf, stillSourcedPromptBlock } from "./stageContinuity.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// Wasabi's own shape: the rows that source the line state no name; the rows that state the names are
// elsewhere in the pool; a finding states both and may never source either.
const POOL: SourceRow[] = [
  { id: "2242bdd1", kind: "signal",   cls: "record",   text: "Wasabi AiR brings searchable intelligence to media archives" },
  { id: "7638775d", kind: "own_word", cls: "you",      text: "AI-focused storage for modern workloads" },
  { id: "9373abfc", kind: "signal",   cls: "record",   text: "Wasabi Fire is the new tier for active data" },
  { id: "c30e9189", kind: "signal",   cls: "you",      text: "built for backups, archives and AI/ML workloads" },
  { id: "37343b4c", kind: "finding",  cls: "our_read", text: "Wasabi Fire and AI/ML are the push upmarket" },
  { id: "sigOurs",  kind: "signal",   cls: "our_read", text: "Wasabi Fire reads as a response to Seagate" },
];
const LINE = "AI-focused storage solutions like Wasabi Fire and Wasabi AiR to support AI/ML workloads";

// ── what may source a name ──────────────────────────────────────────────────────────────────────

Deno.test("NP. a finding may never source a name, whatever its class says", () => {
  assertEquals(canSource({ id: "f", kind: "finding", cls: "record", text: "x" }), false,
    "excluded by KIND, so a finding mis-classed `record` still cannot source");
  assertEquals(canSource({ id: "s", kind: "signal", cls: "our_read", text: "x" }), false, "our read is not the record");
  assertEquals(canSource({ id: "s", kind: "signal", cls: "record", text: "x" }), true);
  assertEquals(canSource({ id: "o", kind: "own_word", cls: "you", text: "x" }), true);
});

Deno.test("NP. nameSupport finds the rows that state a name, and excludes the ones that may not", () => {
  assertEquals(nameSupport("Wasabi Fire", POOL), ["9373abfc"],
    "the finding and the our_read signal both state it and neither is offered");
  assertEquals(nameSupport("AI/ML", POOL), ["c30e9189"]);
  assertEquals(nameSupport("Nothing", POOL), [], "a name no row states returns empty, never a guess");
});

Deno.test("NP. the company's own name is not asked for — but a product name containing it is", () => {
  const names = namesToSource(LINE, "Wasabi Technologies");
  assert(!names.includes("Wasabi"), "'Wasabi' alone is the company, and N1 excludes it");
  assert(names.includes("Wasabi Fire"), "'Wasabi Fire' is a product and is checked");
  assert(names.includes("Wasabi AiR"), "so is 'Wasabi AiR'");
});

// ── the block states BOTH dimensions, for every line ────────────────────────────────────────────

Deno.test("NP. an entry carries its text, its sourcing ids, AND a row per name", () => {
  const entries = reaskFeedback({
    lines: [{ field: "unique_attributes[2]", text: LINE, sourcing_citations: ["2242bdd1", "7638775d"] }],
    pool: POOL, companyName: "Wasabi Technologies",
  });
  assertEquals(entries.length, 1);
  // U1 (2026-10-15): ids render BRACKETED. With no refByUuid these are already ref-token-shaped,
  // so they bracket as-is; a raw uuid would be dropped rather than printed.
  assertEquals(entries[0].sourcing, ["[2242bdd1]", "[7638775d]"], "the rows that still source the line");
  const byName = new Map(entries[0].names.map((n) => [n.name, n.support]));
  assertEquals(byName.get("Wasabi Fire"), ["[9373abfc]"], "and the row that states THIS name — not a sourcing row");
  assertEquals(byName.get("AI/ML"), ["[c30e9189]"]);
  assertEquals(byName.get("Wasabi AiR"), ["[2242bdd1]"]);
});

Deno.test("NP. THE WASABI CASE: the sourcing rows alone could not have carried the names", () => {
  // this is 10455, stated as a test: the two rows C1-R named state neither refused name
  const sourcingOnly = POOL.filter((r) => ["2242bdd1", "7638775d"].includes(r.id));
  assertEquals(nameSupport("Wasabi Fire", sourcingOnly), [], "no sourcing row states Wasabi Fire");
  assertEquals(nameSupport("AI/ML", sourcingOnly), [], "nor AI/ML");
  // and the block names the rows that do, so the second attempt has somewhere to cite
  const block = reaskFeedbackBlock({
    lines: [{ text: LINE, sourcing_citations: ["2242bdd1", "7638775d"] }],
    pool: POOL, companyName: "Wasabi Technologies",
  });
  assert(block.includes("9373abfc"), "the Wasabi Fire row is offered");
  assert(block.includes("c30e9189"), "and the AI/ML row");
});

Deno.test("NP. a name no row states is SAID SO, never silently dropped", () => {
  const block = reaskFeedbackBlock({
    lines: [{ text: "Wasabi Flame is our newest tier", sourcing_citations: ["9373abfc"] }],
    pool: POOL, companyName: "Wasabi Technologies",
  });
  assert(block.includes('"Wasabi Flame" -> stated in NO row of this ledger'),
    "the model is told to drop the name or the claim — a silence here reads as permission");
});

Deno.test("NP. a line with no surviving source says so rather than printing an empty list", () => {
  const block = reaskFeedbackBlock({
    lines: [{ text: "Wasabi Fire is a tier", sourcing_citations: [] }],
    pool: POOL, companyName: "Wasabi Technologies",
  });
  assert(block.includes("no row of this ledger — this line has no surviving source"));
  assert(block.includes("9373abfc"), "and its name rows are still offered");
});

Deno.test("NP. ids are rendered as the REF TOKENS the model may cite", () => {
  const block = reaskFeedbackBlock({
    lines: [{ text: LINE, sourcing_citations: ["2242bdd1"] }],
    pool: POOL, companyName: "Wasabi Technologies",
    refByUuid: new Map([["2242bdd1", "S4"], ["9373abfc", "S8"], ["c30e9189", "S5"]]),
  });
  // U1: BRACKETED, because CITE_RULE only accepts a token printed in square brackets.
  assert(block.includes("still stated by: [S4]"), "the sourcing id as a bracketed token");
  assert(block.includes("-> [S8]"), "and the name rows as bracketed tokens");
  assert(!block.includes("2242bdd1") && !block.includes("9373abfc"), "no raw uuid reaches the prompt");
});

// ── ONE builder: both branches and the generation block go through it ───────────────────────────

Deno.test("NP. exactly ONE feedback builder exists, and all three callers use it", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  const cont = await read("./stageContinuity.ts");
  // the C1-S / continuity re-ask, the S1/N1 re-ask, and the generation prompt's still-sourced block
  assertEquals([...gpr.matchAll(/reaskFeedbackBlock\(\{/g)].length, 2, "both re-ask branches build through it");
  assert(cont.includes("reaskFeedbackBlock({"), "and so does the still-sourced prompt block");
  // and there is no SECOND builder: the private formatters both branches had are gone
  assert(!gpr.includes("const supportFor = (token: string)"), "the N1c branch's private name lookup is gone");
  assert(!/still stated by \$\{/.test(gpr), "and the continuity branch's private formatter is gone");
  assert(!cont.includes("sourcingIds.has(r)).join(\", \")}]`"), "and the block's own formatter too");
  // the one implementation lives in its own module, imported by both
  assert(gpr.includes('from "../_shared/reaskFeedback.ts"'), "imported by the function");
  assert(cont.includes('from "./reaskFeedback.ts"'), "and by the continuity module");
});

Deno.test("NP. the C1-S re-ask carries NAME rows, not just sourcing ids", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  const fn = gpr.slice(gpr.indexOf('if (because === "continuity") {'));
  const body = fn.slice(0, fn.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  assert(body.includes("reaskFeedbackBlock({"), "built by the one builder, which always states names");
  assert(body.includes("pool: feedbackPool()"), "and it is given the pool, which is where the name rows are");
  assert(body.includes("companyName"), "and the company name, so the own name is not asked for");
  assert(body.includes("every name it uses must be stated by a row IT "), "the rule says so to the model");
});

Deno.test("NP. the N1 re-ask carries CONTINUITY lines, not just names", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  const fn = gpr.slice(gpr.indexOf("const results = s1Results[kind as Kind] ?? [];"));
  const body = fn.slice(0, fn.indexOf("\n      reaskOnClassRefusal:"));
  assert(body.includes("const ssForKind = stillSourcedByKind[kind as Kind] ?? [];"),
    "the still-sourced lines of the current read are in scope");
  // BY FIELD PATH, never by text. A refused line is one the model reworded, so a text-equality
  // lookup misses and the block then says "no surviving source" — the opposite of the truth, and an
  // invitation to drop the line. It also listed the same field twice, once each way.
  assert(body.includes("const ssByField = new Map(ssForKind.map((l) => [l.field, l]));"),
    "the current read's still-sourced lines are keyed by field path");
  assert(body.includes("sourcing_citations: ssByField.get(r.field)?.citations ?? []"),
    "a refused line that the current read still states carries its sourcing ids");
  assert(!body.includes("byText"), "no text-equality lookup survives — a rewrite defeats it");
  assert(/ssForKind\.filter\(\(l\) => !failing\.some\(\(r\) => r\.field === l\.field\)\)/.test(body),
    "and every OTHER still-sourced line is listed, de-duplicated by the same key");
  // RP: same clause, one indent deeper inside buildGenUser's feedback argument.
  assert(body.replace(/`\s*\+\s*`/g, "").includes("dropping one the read you are replacing still states is a loss"),
    "the rule says so to the model");
});

Deno.test("NP. the FIRST attempt is told the name rows too — not only a re-ask", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  assert(gpr.includes("stillSourcedPromptBlock(currentForPrompt, sourcingIds, feedbackPool(), companyName, refByUuidLive(), predecessorWithheld)"),
    "the generation prompt's still-sourced block gets the pool and the company name");
});

Deno.test("NP. the still-sourced block RESOLVES each name to its row — listing the names is not enough", () => {
  // BEHAVIOUR, not shape. An empty pool still prints a "names to source:" line — every name simply
  // resolves to "stated in NO row of this ledger" — so a guard that only looks for the label passes
  // on a block that helps the model not at all. What matters is the ID.
  const forSourcing = POOL.map((r) => ({ id: r.id, kind: r.kind, source_class: r.cls }));
  const line: CitedLine = { field: "unique_attributes[2]", text: LINE, cls: "record", refs: ["2242bdd1"] };
  const block = stillSourcedPromptBlock([line], sourcingIdsOf(forSourcing), POOL, "Wasabi Technologies");
  assert(block.includes('"Wasabi Fire" -> [9373abfc]'), "the row that states the name is NAMED");
  assert(block.includes('"AI/ML" -> [c30e9189]'), "and so is the row for the other name");
  assert(block.includes("still stated by: [2242bdd1]"), "alongside what still sources the line");
  // and the same call with no pool is visibly worse — which is what the plant does
  const starved = stillSourcedPromptBlock([line], sourcingIdsOf(forSourcing), [], "");
  assert(starved.includes("stated in NO row of this ledger"), "an empty pool can resolve nothing");
  assert(!starved.includes("9373abfc"), "so the plant is detectable by the ids, never by the label");
});

// ── F1b ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("F1b. the verdict is cleared at the attempt-loop head, with the stamp", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  const at = gpr.indexOf("stampPayload: async (kind, payload) => {");
  assert(at > 0, "the F1 stamp dep exists");
  const body = gpr.slice(at, gpr.indexOf("\n      },", at));
  assert(body.includes("delete verdicts[kind as Kind];"), "the previous attempt's verdict goes");
  assert(body.indexOf("delete verdicts") < body.indexOf("await stampAndDecide"),
    "cleared before the stamp is taken, so nothing in between can read a dead verdict");
  // and it is written in ONE place — the judge — so clearing it here is the whole lifecycle
  assertEquals([...gpr.matchAll(/verdicts\[kind as Kind\] = /g)].length, 1, "one writer: the judge");
});

Deno.test("F1b. a refused-before-the-judge attempt cannot inherit the previous verdict", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  // the audit row's distinctness comes from verdicts[kind]; with the clear in place, an attempt that
  // never reached the judge reports null instead of attempt 1's block (audit 10455).
  assert(gpr.includes("distinctness: (verdicts[kind as Kind]?.distinctness as unknown) ?? null,"),
    "the audit row reads the live verdict");
  const perKind = await read("./publicReadPerKind.ts");
  const stampAt = perKind.indexOf("await deps.stampPayload?.(kind, payload);");
  const judgeAt = perKind.indexOf("verdict = await deps.judge(kind, payload);");
  assert(stampAt > 0 && judgeAt > 0, "both sites exist");
  assert(perKind.indexOf("const g = await runGates(kind, payload);") > stampAt,
    "the clear happens before the gates that may refuse ahead of the judge");
});

// ── L1 ──────────────────────────────────────────────────────────────────────────────────────────

Deno.test("L1. ONE model_calls row per model call — the run-level aggregate is gone", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  // every call goes through run(), and run() ledgers each one
  const inRun = gpr.slice(gpr.indexOf("const run = async ("), gpr.indexOf("const { text: CAT,"));
  assert(inRun.includes("const ledgerRow = async (rec: ModelCallRecord) => {"), "run() has the one ledger writer");
  assert([...inRun.matchAll(/await ledgerRow\(/g)].length === 2, "both provider branches ledger their call");
  // UNCONDITIONALLY. A condition here — `if (attempt === 1)` above all — is exactly how two calls
  // come to write one row, which is the state this ruling exists to leave behind.
  for (const ln of inRun.split("\n").filter((l) => l.includes("await ledgerRow("))) {
    assert(/^\s*await ledgerRow\(/.test(ln),
      `a ledger call must not be guarded — every model call writes its row: ${ln.trim().slice(0, 80)}`);
  }
  // and nothing else writes a row: the end-of-run aggregate would double-count
  assertEquals([...gpr.matchAll(/await recordModelCall\(/g)].length, 1, "one call site, inside run()");
  assert(!gpr.includes('callSite: "generate-public-read",\n'), "the run-level aggregate row is gone");
});

Deno.test("L1. each row names its ATTEMPT and its PROMPT SHA", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  const inRun = gpr.slice(gpr.indexOf("const run = async ("), gpr.indexOf("const { text: CAT,"));
  assert(inRun.includes("attempt: meta?.attempt ?? null, promptSha: sha,"), "both travel on the row");
  assert(inRun.includes("const sha = await sha256Hex("), "the sha is of the prompt this call actually sent");
  // the writer accepts them and stores them, nullable — never a 0 or a guess
  const rec = await read("./recordModelCall.ts");
  assert(rec.includes("attempt: args.attempt ?? null,"), "stored, nullable");
  assert(rec.includes("prompt_sha: args.promptSha ?? null,"), "and the sha likewise");
});

Deno.test("L1. the attempt number advances at the attempt boundary, and the re-asks claim the next one", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  assert(gpr.includes("attemptNo[kind as Kind] = (attemptNo[kind as Kind] ?? 0) + 1;"),
    "the loop head — the one attempt boundary — advances it");
  const at = gpr.indexOf("stampPayload: async (kind, payload) => {");
  const body = gpr.slice(at, gpr.indexOf("\n      },", at));
  assert(body.includes("attemptNo[kind as Kind] = (attemptNo[kind as Kind] ?? 0) + 1;"), "inside the stamp dep");
  // generate is attempt 1; both re-asks produce the NEXT attempt
  assert(gpr.includes('{ kind: kind as Kind, attempt: 1, role: "generator" }'), "the first answer is attempt 1");
  assertEquals([...gpr.matchAll(/attempt: \(attemptNo\[kind as Kind\] \?\? 1\) \+ 1/g)].length, 4,
    "the level re-ask (ruling 14), the C1-S re-ask, the N1 re-ask and the class fix each produce the next attempt");
  assert(gpr.includes('attempt: attemptNo[kind as Kind] ?? 1, role: "judge"'),
    "and the judge is ledgered against the attempt it is judging");
});

Deno.test("L1. every attempt's audit row carries its prompt_sha and its attempt number", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  const at = gpr.indexOf("const recordKindIntegrity = async (kind: string, row: {");
  const body = gpr.slice(at, gpr.indexOf("\n    const stampAndDecide", at));
  assert(body.includes("attempt: attemptNo[kind as Kind] ?? null,"), "which attempt this row is");
  assert(body.includes("prompt_sha: promptSha[kind as Kind] ?? null,"), "and which prompt produced what it refused");
});

Deno.test("L1. a generator re-ask re-stamps promptSha, so a stored read names the prompt that wrote it", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  assert(gpr.includes('if (meta?.kind && meta.role !== "judge") promptSha[meta.kind] = sha;'),
    "every generator call stamps it; the judge's prompt is not the read's");
  // and the stored read reads that same map
  // both stored rows read that same map through the one stored-ledger builder (MODEL TRIAL,
  // 2026-10-15) — so a re-ask's sha cannot reach one stored row and not the other
  assert(gpr.includes("prompt_sha: promptSha[kind] ?? null,          // Q4: WHICH prompt wrote this read"),
    "the one builder stamps from it");
  assert(gpr.includes("input_ledger: storedLedger(kind, {"), "the staged row");
  assert(gpr.includes("input_ledger: storedLedger(kind),"), "and the written row");
});

Deno.test("L1. a billed call is ledgered even when its answer is unusable", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  const inRun = gpr.slice(gpr.indexOf("const run = async ("), gpr.indexOf("const { text: CAT,"));
  const ledgerAt = inRun.indexOf("await ledgerRow(openaiRecord(");
  const throwAt = inRun.indexOf("returned no JSON:");
  assert(ledgerAt > 0 && throwAt > ledgerAt, "ledgered BEFORE the parse that may throw");
});

Deno.test("L1. the local provider records nulls and its OWN provider, never openai and never 0", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  assert(gpr.includes("await ledgerRow({ provider: choice.provider, model: choice.model, prompt_tokens: null, completion_tokens: null, usd: null });"),
    "no usage means nulls — a 0 would read as a free call, and the provider is the one that ran");
});

Deno.test("L1. the columns exist, nullable, with the migration that added them", async () => {
  const mig = await Deno.readTextFile(new URL(
    "../../migrations/20261015170000_model_calls_attempt_prompt_sha.sql", import.meta.url));
  assert(mig.includes("add column if not exists attempt    int  null;"), "attempt, nullable");
  assert(mig.includes("add column if not exists prompt_sha text null;"), "prompt_sha, nullable");
  assert(/comment on column public\.model_calls\.attempt is/.test(mig), "each column says what it means");
  assert(/comment on column public\.model_calls\.prompt_sha is/.test(mig));
  assert(!/update public\.model_calls set/.test(mig), "and nothing backfills a sha nobody recorded");
});

// ── U1 (operator ruling, 2026-10-15): NO UUID REACHES ANY PROMPT ────────────────────────────────
//
// CITE_RULE tells the model the valid tokens are the ones "printed in square brackets at the start
// of its line (e.g. [S1])", and that any other token INVALIDATES THE WHOLE RESPONSE. The
// generation-time still-sourced block was built WITHOUT refByUuid, so it named rows as raw uuids —
// ids the model is forbidden to cite. It was pointing at evidence in a form that could not be used,
// which is the mechanism NP and NP2 both rest on.
describe_u1();
function describe_u1() {
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const POOLU: SourceRow[] = [
    { id: "2242bdd1-c2b4-4a25-9a39-4dccc729151e", kind: "signal", cls: "record", text: "Wasabi AiR brings intelligence" },
    { id: "9373abfc-09fa-40ad-ada4-fe1b68fe5a38", kind: "signal", cls: "record", text: "Wasabi Fire is the new tier" },
  ];
  const MAP = new Map([
    ["2242bdd1-c2b4-4a25-9a39-4dccc729151e", "S4"],
    ["9373abfc-09fa-40ad-ada4-fe1b68fe5a38", "S8"],
  ]);

  Deno.test("U1. with the map, every id renders as a BRACKETED token and no uuid survives", () => {
    const block = reaskFeedbackBlock({
      lines: [{ text: "Wasabi Fire and Wasabi AiR", sourcing_citations: ["2242bdd1-c2b4-4a25-9a39-4dccc729151e"] }],
      pool: POOLU, companyName: "Wasabi Technologies", refByUuid: MAP,
    });
    assert(block.includes("still stated by: [S4]"));
    assert(block.includes('"Wasabi Fire" -> [S8]'));
    assert(!UUID.test(block), "no uuid anywhere in the rendered block");
  });

  Deno.test("U1. an id with NO mapping is DROPPED, never printed as a uuid", () => {
    const block = reaskFeedbackBlock({
      lines: [{ text: "Wasabi Fire", sourcing_citations: ["2242bdd1-c2b4-4a25-9a39-4dccc729151e"] }],
      pool: POOLU, companyName: "Wasabi Technologies",
      refByUuid: new Map(),   // nothing maps
    });
    assert(!UUID.test(block), "a uuid in a prompt is worse than a missing one — the model may copy it");
  });

  Deno.test("U1. the STILL-SOURCED block carries the map on the FIRST attempt", async () => {
    const gpr = await read("../generate-public-read/index.ts");
    assert(gpr.includes("stillSourcedPromptBlock(currentForPrompt, sourcingIds, feedbackPool(), companyName, refByUuidLive(), predecessorWithheld)"),
      "the generation call passes refByUuid — it was the one prompt site that did not");
    // and the signature accepts it, so the block can honour it
    const cont = await read("./stageContinuity.ts");
    assert(cont.includes("refByUuid?: ReadonlyMap<string, string>,"), "the block takes the map");
    assert(cont.includes("pool, companyName, refByUuid,"), "and hands it to the one builder");
  });

  Deno.test("U1. BEHAVIOUR: the still-sourced block renders tokens, not uuids", () => {
    const forSourcing = POOLU.map((r) => ({ id: r.id, kind: r.kind, source_class: r.cls }));
    const line: CitedLine = {
      field: "unique_attributes[0]", text: "Wasabi Fire and Wasabi AiR together", cls: "record",
      refs: ["2242bdd1-c2b4-4a25-9a39-4dccc729151e"],
    };
    const block = stillSourcedPromptBlock([line], sourcingIdsOf(forSourcing), POOLU, "Wasabi Technologies", MAP);
    assert(block.includes("[S4]"), "the sourcing row as a token");
    assert(block.includes("[S8]"), "and the name row");
    assert(!UUID.test(block), "no uuid reaches the generation prompt");
  });

  Deno.test("NP2 wording. the signed sentence, exactly", () => {
    const block = reaskFeedbackBlock({
      lines: [{ text: "the leading provider", sourcing_citations: [], unsupported_by_pool: ["leading"] }],
      pool: POOLU, companyName: "Wasabi Technologies", refByUuid: MAP,
    });
    assert(block.includes('Keep this line. No row in the pool states: "leading". Remove those words, or cite a row that states them.'),
      "KEEP THIS LINE comes first: 'drop them' was read as drop the LINE, and the re-asked strategy "
      + "removed winning_aspiration entirely (10695 -> 10696)");
    assert(!block.includes("drop them or cite a row that does"), "the old wording is gone");
  });
}
