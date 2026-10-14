// ── P1/P2 (operator rulings, 2026-10-13): the specifics rules, proven ───────────────────────────
//
// The rules decide what the model is TOLD, so most of these are source guards on the prompt text —
// the only place the instruction exists. The two behavioural legs run the GATE over fixtures that
// stand for a sourceable and an unsourceable specific, because the rewrite must not loosen it: a
// specific absent from every cited record/you row must still be refused.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideFieldClass } from "./classFactCheck.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const readPrompt = async () => {
  const src = await read("../generate-public-read/index.ts");
  const a = src.indexOf("const SPECIFICS_RULE = `");
  return src.slice(a, src.indexOf("`;", a));
};
const slotPrompt = async () => {
  const src = await read("../generate-read-slots/index.ts");
  const a = src.indexOf("`SPECIFICS. A specific is");
  return src.slice(a, src.indexOf("JSON only", a));
};

// the real Edgewood rows
const RDF = "Kinship Support Network celebrates 30 years; in 1993 Edgewood established the first kinship program in the country; over 90% of youth served stayed in family settings to age 18; model replicated throughout U.S. and internationally.";
const R99 = "Lists Edgewood as a key resource for families; highlights the Kinship program's national-first status and 90%+ family-placement retention rate over three decades.";

Deno.test("1. a planted SOURCEABLE superlative appears verbatim in the rule's instruction and clears the gate", async () => {
  const p = await readPrompt();
  assert(p.includes("STATED AS THAT ROW STATES IT"), "the rule names the obligation");
  // Q3 (2026-10-13): the worked example no longer quotes a LIVE row. It used to show the obligation
  // with "the first kinship program in the country" — the exact sentence the carry lifts from
  // dfb6da68 — which handed the model the carried line and told it to write that and cite the row.
  // The obligation is unchanged; only the sentence it is demonstrated with is now a neutral one.
  assert(p.includes("'the longest-running apprenticeship in the state'"), "and shows it with an example from no live row");
  assert(!p.includes("'the first kinship program in the country'"), "and no longer with a live one");
  // and the gate accepts that exact wording against the row that carries it
  const d = decideFieldClass({
    field: "unique_attributes[1]", cls: "our_read",
    text: "the first kinship program in the country, with over 90% family-placement retention",
    citedSourceTexts: [RDF, R99],
  });
  assertEquals(d.branch, "sourced", JSON.stringify(d.unsourced));
});

Deno.test("2. a planted sourceable superlative is never hedged into a reading", async () => {
  const p = await readPrompt();
  // the rule still shows a stated-vs-hedged PAIR, which is what teaches the distinction; after Q3
  // the pair is neutral. (It used to be "the first kinship program in the country" vs "a nationally
  // pioneering kinship program" — the real wording of the 2026-10-13 run that prompted P1.)
  assert(/write that and cite the row — never '[^']+'/.test(p), "a stated-vs-hedged pair is still shown");
  assert(p.includes("never 'a long-established apprenticeship program'"), "with the neutral hedge");
  assert(p.includes("hedging it misreports the record"), "and says why");
  // the hedge wording must NOT be offered anywhere as an acceptable output
  assert(!/is either written as our reading/.test(p), "the old 'either hedge or omit' door is gone");
});

Deno.test("3. a planted UNSOURCEABLE specific is LEFT OUT, not hedged — and the gate still refuses it", async () => {
  const p = await readPrompt();
  assert(p.includes("is LEFT OUT"), "omission is the only resolution");
  assert(p.includes("a reading is for a judgement we are making, not for a fact we could not source"),
    "and the rule says why a hedge is not a substitute");
  // THE NON-LOOSENING LEG: a specific in no cited row is still unsourced
  const d = decideFieldClass({
    field: "unique_attributes[0]", cls: "our_read",
    text: "the only level 14 residential facility in northern California",
    citedSourceTexts: [RDF, R99],
  });
  assert(d.branch !== "sourced", "an unsourceable specific must NOT clear");
  assertEquals(d.unsourced.map((u) => u.token).includes("14"), true);
});

Deno.test("4. a sourceable differentiator must survive a regeneration — clause 7, after Q1", async () => {
  const p = await readPrompt();
  // Q1 (2026-10-13) rewrote clause (7) to refer only to what the prompt SHOWS. It used to say "keep
  // every differentiator the company's CURRENT read carries" — and the current read is not in the
  // prompt at all. Measured on run 9976's 79-row ledger: not one of the three current differentiators
  // appears verbatim in any row the model saw. So clause (7) had exactly one available referent, the
  // ALREADY WRITTEN notice, and a model obeying it had to write back the lines the notice forbids.
  assert(p.includes("Besides the lines listed as ALREADY WRITTEN"), "it refers to the notice");
  assert(p.includes("keep every differentiator you can source from the ledger"), "and to the ledger");
  assert(p.includes("dropping a sourceable one is a loss, not a simplification"), "and says why");
  assert(!p.includes("CURRENT read"), "and names no document outside the prompt");
});

Deno.test("5. the two licensed reasons to drop a line live in the ENFORCER, not the prompt", async () => {
  // They were in clause (7) and Q1 took them out, because the model cannot evaluate either: it
  // cannot see the line, its citations, or whether they are still in the ledger. They are decided in
  // code, by C1, and that is where this test now pins them — the invariant did not move, the
  // statement of it did.
  const c1 = await read("./stageContinuity.ts");
  assert(c1.includes("// licensed: its sources left the pool"), "reason 1: the cited rows left the ledger");
  assert(c1.includes("// licensed: fails the check now"), "reason 2: the line no longer passes the specifics check");
  const fn = c1.slice(c1.indexOf("export function droppedLines"), c1.indexOf("export type ContinuityBlock"));
  assert(!/cap/i.test(fn), "a character cap is not a reason to drop a read differentiator");
  // and the prompt no longer claims to carry rules the model cannot apply
  const p = await readPrompt();
  assert(!p.includes("no longer in the ledger"), "the prompt does not restate a licence it cannot evaluate");
});

Deno.test("6. the slot shortening keeps the figure's unit", async () => {
  const p = await slotPrompt();
  assert(p.includes("A figure keeps its unit: '90%+' is not '90' and not 'high'"),
    "the unit rule is explicit — the old gate's defect was exactly losing the unit");
});

Deno.test("7. the slot omits a LINE it cannot fit rather than hollowing it out", async () => {
  const p = await slotPrompt();
  assert(p.includes("shorten the WORDS AROUND it — drop the framing, not the fact"), "the cap pressures the prose");
  assert(p.includes("omit that line and say so"), "and the fallback is omitting the line");
  assert(p.includes("never keep the line\\n` +\n    `  with the fact hollowed out") || p.includes("never keep the line"),
    "and never a hollowed line");
  // the old instruction is gone
  assert(!/drop the specific and name the plain thing instead/.test(p),
    "the old 'drop the specific' door is closed");
});

Deno.test("8. prompt source guard: no clause offers a hedge as an alternative to omission", async () => {
  for (const [name, p] of [["read", await readPrompt()], ["slot", await slotPrompt()]] as const) {
    // 'we read you as' may appear ONLY as something the rule forbids, never as an offered output
    const idx = p.indexOf("we read you as");
    if (idx >= 0) {
      const around = p.slice(Math.max(0, idx - 160), idx + 60);
      assert(/never|not|Do NOT|forbid/i.test(around),
        `${name} prompt offers 'we read you as' as an output: ${around}`);
    }
    assert(!/or left out/.test(p), `${name} prompt still offers hedge-or-omit as equal choices`);
  }
});
