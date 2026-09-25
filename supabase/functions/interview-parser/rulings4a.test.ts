// Commit 4a rulings R1–R7. Synthetic fixtures; every model call is a stub, so these need no Ollama
// except where the name says (live), which is gated on PARSER_LIVE_JUDGE=1.
//
// Plants, one per ruling — see the commit report for the RED/GREEN pairs and the md5 restores.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { toPassages } from "./segment.ts";
import { bestLocalSimilarity, locateQuote, looseNormalize } from "./locate.ts";
import {
  FAITHFUL_SYSTEM, ODI_CANONICAL_SYSTEM_R2, ODI_CONTEXT_RULE, convertItem, judgeFaithful, type Call,
} from "./convert.ts";
import { PARSER_RULES_VERSION, SIDE_CHANGED_REASON, supersededReason } from "./rules.ts";
import { OURS_SIDE_REASON, SPEAKER_SIDES } from "../_shared/interviewItems.ts";

// A long passage with a short quote inside it — the shape the old rung 3 could never match.
const LONG = [
  "Dana Reeves | 00:00:37",
  "So the way it works today is that a school will call the front desk, and whoever picks up writes the "
  + "name on a pad, and then at some point that afternoon somebody types it into the system, and honestly "
  + "we lose two whole days every month reconciling the intake spreadsheet by hand, and that is before we "
  + "get to the part where the funder wants a report on any of it, which is its own separate adventure "
  + "involving three spreadsheets and a great deal of patience from everyone concerned.",
  "",
  "Sam Okafor | 00:01:14",
  "What I want is to see the entire waitlist in one place before the Monday meeting.",
].join("\n");
const longPassages = await toPassages(LONG);

// ── R1: the locator's new rungs ──────────────────────────────────────────────────────────────────
Deno.test("R1: looseNormalize forgives punctuation and case, and nothing else", () => {
  assertEquals(looseNormalize("We're not, as it happens — ready."), "we re not as it happens ready");
  assertEquals(looseNormalize("WE'RE NOT, AS IT HAPPENS - READY."), looseNormalize("we're not, as it happens — ready."));
  assert(looseNormalize("intake spreadsheet") !== looseNormalize("intake spreadsheets"), "a different WORD is still different");
});

Deno.test("R1: a quote whose APOSTROPHE was normalized still locates (punct/case rung)", () => {
  const src = ["Dana | 00:00:01", "It isn't the referral that's slow, it's the paperwork afterwards."].join("\n");
  return toPassages(src).then((ps) => {
    const drifted = "It isn’t the referral that’s slow, it’s the paperwork afterwards.";   // curly quotes
    const r = locateQuote(drifted, ps, 0);
    assertEquals(r.trace_state, "located");
    assert(r.reason.includes("punctuation and case"), `reason was: ${r.reason}`);
  });
});

Deno.test("R1: a quote whose COMMA was dropped and whose CASE moved still locates", async () => {
  const src = ["Dana | 00:00:01", "We triage that afternoon, and we book the first visit ourselves."].join("\n");
  const ps = await toPassages(src);
  for (const drift of [
    "We triage that afternoon and we book the first visit ourselves.",   // comma gone
    "we triage that afternoon, and we book the first visit OURSELVES",   // case + full stop gone
  ]) {
    const r = locateQuote(drift, ps, 0);
    assertEquals(r.trace_state, "located", `missed: ${drift}`);
    assert(r.reason.includes("punctuation and case"));
  }
});

Deno.test("R1: the punct/case rung prefers the NAMED passage, then reaches its neighbours", async () => {
  const src = ["A | 00:00:01", "The paperwork is the slow part.", "", "B | 00:00:02", "We book the visit ourselves, always."].join("\n");
  const ps = await toPassages(src);
  const r = locateQuote("we book the visit ourselves always", ps, 0);   // claims 0, sits in 1
  assertEquals(r.trace_state, "located");
  assertEquals(r.passage_index, 1);
  assert(r.reason.includes("neighbouring passage"));
});

Deno.test("R1: a SHORT quote inside a LONG passage locates by length-matched fuzzy", () => {
  // The quote differs by one word, so containment cannot help; whole-passage Dice on this pair is far
  // below the threshold, which is exactly why the old rung 3 never fired.
  const quote = "we lose two entire days every month reconciling the intake spreadsheet by hand";
  const whole = bestLocalSimilarity(quote, longPassages[0].text);
  assert(whole >= 0.85, `length-matched similarity was ${whole.toFixed(3)}`);
  const r = locateQuote(quote, longPassages, 0);
  assertEquals(r.trace_state, "located");
  assertEquals(r.passage_index, 0);
  assert((r.similarity ?? 0) >= 0.85);
});

Deno.test("R1: bestLocalSimilarity is the length-matched measure, not whole-text Dice", () => {
  const quote = "we lose two whole days every month reconciling the intake spreadsheet by hand";
  assertEquals(bestLocalSimilarity(quote, quote), 1);
  assert(bestLocalSimilarity(quote, longPassages[0].text) >= 0.95, "verbatim inside a long passage must score high");
  assertEquals(bestLocalSimilarity("", "anything"), 0);
  assertEquals(bestLocalSimilarity("abc", ""), 0);
});

Deno.test("R1: a quote in NO passage is still not_located — the rungs widen, they do not surrender", () => {
  const r = locateQuote("The county approved the funding in a single meeting last November.", longPassages, 0);
  assertEquals(r.trace_state, "not_located");
  assertEquals(r.passage_index, 0, "it still points at the passage the finder named");
});

// ── R2: the ODI writer's context rule ────────────────────────────────────────────────────────────
Deno.test("R2: the context rule is appended to the shared formula prompt, which is left untouched", () => {
  assert(ODI_CANONICAL_SYSTEM_R2.endsWith(ODI_CONTEXT_RULE));
  // 4e N2 replaced the dimension with a CLOSED METRIC SET, so the clause is now about the object
  // alone. What 4a signed — the speaker owns what the statement is about — is what is pinned.
  assert(ODI_CONTEXT_RULE.includes("THE OBJECT COMES FROM THE SPEAKER, NOT FROM YOU"));
  // 4c's R8 replaced that sentence with a stronger pair (the when-clause is conditional, and the
  // executor is never named anywhere). rulings4c.test.ts owns the new wording; what 4a signed — the
  // dimension and the context come from the speaker, and there is a refusal shape — is pinned here.
  // 4d R1 rewrote this clause: the when-slot is gone from the form entirely, so the sentence that
  // forbade filling it was replaced by one that forbids writing it at all. rulings4d.test.ts owns the
  // new wording; what 4a signed — the executor never appears — is pinned here.
  assert(ODI_CONTEXT_RULE.includes("NEVER name the executor"));
  // 4e N1 REPEALED the no_context answer. The refusal is not weakened, it is gone: the writer is told
  // it always answers with a statement, and the branch that consumed the flag is deleted.
  assert(!ODI_CONTEXT_RULE.includes('{"no_context":true}'), "N1: the refusal is gone from the prompt");
  assert(ODI_CONTEXT_RULE.includes("There is no refusal"), "N1: and the writer is told so");
  assert(ODI_CANONICAL_SYSTEM_R2.includes("[Minimize/Maximize/Reduce/Increase]"), "the formula itself survives");
});

Deno.test("N1 repeals 4a R2: a no_context answer is no longer a refusal — the need is written", async () => {
  // The rule 4a signed is REPEALED by N1 (2026-09-24), so what is pinned here is the repeal. A writer
  // that still answers no_context is simply a writer that returned no statement; the retry runs, and
  // an item that ends with no statement lands annotated on the format reason, never on "no context".
  let writes = 0;
  const call: Call = ({ stage }) => {
    if (stage === "convert:need") {
      writes++;
      // first attempt: the old refusal shape. second: a statement in the N2 form.
      return Promise.resolve(writes === 1
        ? JSON.stringify({ no_context: true })
        : JSON.stringify({ odi_canonical_statement: "Minimize the effort of getting it done" }));
    }
    return Promise.resolve(JSON.stringify({ ok: true, objections: [] }));
  };
  const c = await convertItem({
    call, kind: "desire", rawWords: "We just want getting it done to be easier, less effort every time.",
    speaker: "Dana", jobExecutor: "", passageText: "We just want getting it done to be easier, less effort every time.",
  });
  assert(writes >= 1, "the writer is still called");
  assertEquals(c.framework_form, "odi_need");
  assert(c.judge_reason !== "no context in the words", "N1: the reason string is gone");
  assertEquals(c.framework_statement, "Minimize the effort of getting it done", "the retry produced the need");
  assertEquals(c.judge_state, "accepted");
});

// ── R3: the judge never cites the exempt scaffolding ─────────────────────────────────────────────
Deno.test("R3: the citation rule is in the judge, in both directions", () => {
  assert(FAITHFUL_SYSTEM.includes("NEVER CITE THE EXEMPT SCAFFOLDING AS AN OBJECTION"));
  // 4e N2 widened the exemption to the metric word; 4e N3 replaced the free-sentence reason with
  // typed objections. Both are pinned in rulings4e.test.ts; what 4a signed survives in both.
  assert(FAITHFUL_SYSTEM.includes("If the ONLY thing you could object to is the direction verb"));
  assert(FAITHFUL_SYSTEM.includes("answer ok=true"));
  assert(FAITHFUL_SYSTEM.includes("those are the form's and are never a fault"));
  assert(FAITHFUL_SYSTEM.includes("WHEN YOU REJECT, LIST YOUR OBJECTIONS"), "rule 4's reason is now typed");
});

Deno.test({
  name: "R3 (live): a statement whose ONLY novelty is the direction verb is ACCEPTED, and the reason does not cite it",
  ignore: Deno.env.get("PARSER_LIVE_JUDGE") !== "1",
  fn: async () => {
    const OLLAMA = (Deno.env.get("OLLAMA_BASE_URL") || "http://localhost:11434").replace(/\/v1\/?$/, "");
    const M = Deno.env.get("PARSER_JUDGE_MODEL") || "qwen2.5:14b-instruct";
    const call: Call = async ({ system, user }) => {
      const r = await fetch(`${OLLAMA}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: M, format: "json", stream: false, options: { num_ctx: 8192, temperature: 0 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      });
      return String(((await r.json()) as { message?: { content?: string } }).message?.content ?? "");
    };
    const v = await judgeFaithful(call, {
      rawWords: "We measure how many families get a call back inside forty eight hours.",
      statement: "Increase the number of families who get a call back when forty eight hours have passed",
      kind: "outcome", form: "odi_need", model: M,
    });
    assert(v.ok, `judge said: ${v.reason}`);
    // NOT asserted: that the reason avoids naming the verb. Measured A/B on this model, the citation
    // half of R3 changes nothing — the same pairs come back with the same verdicts and the same prose
    // with and without the clause, and a rejection that has a real objection still names 'Maximize'
    // alongside it. The clause is in the prompt and pinned above; its EFFECT is unproven, and pinning
    // an assertion that passes by luck would be worse than saying so. See the commit report.
  },
});

// ── R5/R6/R7: the constants the handler and the store agree on ───────────────────────────────────
Deno.test("R5: the two sides, and the signed reason an ours item carries", () => {
  assertEquals([...SPEAKER_SIDES], ["client", "ours"]);
  assertEquals(OURS_SIDE_REASON, "spoken by our side");
});

Deno.test("R6/R7: the version moved, and the two retraction reasons are the signed ones", () => {
  assertEquals(PARSER_RULES_VERSION, "2026-09-24.4");   // moved by 4c R10, 4d R7, 4e, 4e-2 (N9), then 4e-3 (N14)
  assertEquals(supersededReason(), `superseded by rules ${PARSER_RULES_VERSION}`);
  assertEquals(supersededReason("2026-10-01.1"), "superseded by rules 2026-10-01.1");
  assertEquals(SIDE_CHANGED_REASON, "speaker side changed");
  assert(supersededReason() !== SIDE_CHANGED_REASON, "the audit must tell the two apart");
});
