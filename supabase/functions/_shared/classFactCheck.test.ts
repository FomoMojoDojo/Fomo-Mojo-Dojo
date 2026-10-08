// THE CLASS FACT-CHECK (tightening signed 2026-10-07).
//
// (b) is deterministic and runs FIRST: an our_read field clears without a judge call when every
// specific in it is verbatim-sourced in a cited row of class record or you. Only when (b) fails is
// the judge asked, and only then can a hedge save the field.
//
// 3A stays refused: nothing here forbids a word. "the only youth CSU in the Bay Area" is ADMITTED the
// moment a record row says so — it is refused only when we are the ones saying it first.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideFieldClass, extractSpecifics, fieldClassOk, classRefusals, specificIsSourced,
} from "./classFactCheck.ts";

// ── the REAL Edgewood row texts, as the record holds them ────────────────────────────────────────
// 38e60681, mightycause.com, published 2023-01-01, class `record` — the ONLY record-class row the
// live Level 14 field cites.
const MIGHTYCAUSE =
  "Mightycause fundraising profile: Edgewood operates 'the only level 14 residential facility in " +
  "northern California - the highest level of residential care available' and serves children and families.";
// e756386d, guidestar.org, class `you` (a self-reported filing).
const GUIDESTAR =
  "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area; " +
  "opened 2014 in conjunction with SF Department of Public Health.";
// 93989558 / 838ead35 — FINDINGS, class our_read. Our own rows, never sourcing evidence.
const FINDING_BODY =
  "Edgewood holds a near-monopoly position in San Francisco for certain high-acuity youth services " +
  "(sole Level 14 residential facility in Northern California; only CSU serving under-12 in the Bay Area).";

Deno.test("extractSpecifics finds the four categories and nothing else", () => {
  const got = extractSpecifics("the sole Level 14 residential facility in Northern California");
  const kinds = got.map((s) => `${s.kind}:${s.token}`);
  assert(kinds.includes("exclusivity:sole"), kinds.join(" | "));
  assert(kinds.includes("figure:14"), kinds.join(" | "));
  assert(kinds.includes("reach:Northern California"), kinds.join(" | "));
  // a service NAME is not a reach claim — naming it asserts no reach (3A stays refused)
  const named = extractSpecifics("a Crisis Stabilization Unit for young children");
  assertEquals(named.length, 0, "a capitalised service name is not a specific");
});

Deno.test("a probe is never one word — a bare 'only' cannot source itself", () => {
  const only = extractSpecifics("the only youth CSU anywhere").find((s) => s.token === "only")!;
  assert(only.probes.every((p) => p.trim().split(/\s+/).length >= 2), JSON.stringify(only.probes));
  // a cited row that merely contains the word "only" does not source it
  assertEquals(specificIsSourced(only, ["we are only getting started"]), false);
});

Deno.test("(b) PASSES a field whose 'the only…' is verbatim in a cited RECORD row", () => {
  const d = decideFieldClass({
    field: "unique_attributes[0]", cls: "our_read",
    text: "the only level 14 residential facility in northern California",
    citedSourceTexts: [MIGHTYCAUSE],
  });
  assertEquals(d.branch, "sourced", JSON.stringify(d.unsourced));
  assertEquals(d.unsourced, []);
  assertEquals(d.examined, 3, "the exclusivity word, the figure and the reach claim — all three sourced");
  // and it clears WITHOUT the judge — even a judge that says no cannot overturn it, because it is
  // never offered for judgment
  assertEquals(fieldClassOk(d, undefined), true);
  assertEquals(fieldClassOk(d, false), true);
});

Deno.test("(b) PASSES the same claim sourced to a YOU row (a self-reported filing counts)", () => {
  const d = decideFieldClass({
    field: "unique_attributes[1]", cls: "our_read",
    text: "the only crisis stabilization unit serving youth under 12 in the Bay Area",
    citedSourceTexts: [GUIDESTAR],
  });
  assertEquals(d.branch, "sourced", JSON.stringify(d.unsourced));
});

Deno.test("(b) FAILS the same field when the citation is a FINDING only — our read cannot source itself", () => {
  // the finding body contains the words verbatim, but a finding is class our_read and so is never
  // passed in as sourcing evidence: citedSourceTexts holds record/you rows ONLY.
  const d = decideFieldClass({
    field: "unique_attributes[0]", cls: "our_read",
    text: "the only level 14 residential facility in northern California",
    citedSourceTexts: [],                         // the caller filtered the our_read rows out
  });
  assertEquals(d.branch, "judge_required");
  assertEquals(d.unsourced.map((u) => u.token).sort(), ["14", "northern California", "only"], "all three unsourced once our own rows are excluded");
  // proof that the finding text WOULD have matched had it been admitted — so the filter is the gate
  const asIfAdmitted = decideFieldClass({
    field: "x", cls: "our_read",
    text: "the only level 14 residential facility in northern California",
    citedSourceTexts: [FINDING_BODY],
  });
  assert(asIfAdmitted.unsourced.length < 3, "the finding body does contain the words — which is why it is excluded by class, not by text");
});

Deno.test("the judge path is reached ONLY when (b) fails", () => {
  const sourced = decideFieldClass({ field: "a", cls: "our_read", text: "the only level 14 residential facility in northern California", citedSourceTexts: [MIGHTYCAUSE] });
  const unsourced = decideFieldClass({ field: "b", cls: "our_read", text: "the sole provider in Marin County", citedSourceTexts: [MIGHTYCAUSE] });
  assertEquals([sourced.branch, unsourced.branch], ["sourced", "judge_required"]);
  // the gate consults the judge for `b` and not for `a`
  assertEquals(fieldClassOk(sourced, false), true, "a sourced field ignores the judge");
  assertEquals(fieldClassOk(unsourced, false), false, "an unsourced field obeys the judge");
  assertEquals(fieldClassOk(unsourced, true), true, "a hedged unsourced field passes by the judge");
  assertEquals(fieldClassOk(unsourced, undefined), false, "FAIL-CLOSED: no answer is not a pass");
});

Deno.test("a HEDGED unsourced field passes by the judge; a field with no specifics needs neither", () => {
  const hedged = decideFieldClass({ field: "c", cls: "our_read", text: "we read Edgewood as the sole high-acuity provider in Marin County", citedSourceTexts: [] });
  assertEquals(hedged.branch, "judge_required", "the hedge is the JUDGE's call, not a word test (3B refused)");
  assertEquals(fieldClassOk(hedged, true), true);
  const plain = decideFieldClass({ field: "d", cls: "our_read", text: "a youth mental health provider serving families", citedSourceTexts: [] });
  assertEquals(plain.branch, "sourced", "no specifics ⇒ nothing to source");
  assertEquals(plain.examined, 0);
});

Deno.test("an our_read field whose TEXT did not resolve FAILS CLOSED — a plumbing fault never clears", () => {
  // the first version of the generator's text lookup returned "" for value_citations /
  // best_fit_citations and for every bare `citations` element, and a blank text used to read as
  // "no specifics ⇒ nothing to source". Two whole rungs and three differentiators cleared silently.
  const d = decideFieldClass({ field: "value", cls: "our_read", text: "", citedSourceTexts: [] });
  assertEquals(d.branch, "judge_required");
  assertEquals(d.unsourced.map((u) => u.kind), ["unresolved"]);
  assertEquals(fieldClassOk(d, undefined), false, "and it cannot clear without the judge");
});

Deno.test("record and you fields are not fact-checked — they are not our assertion", () => {
  for (const cls of ["record", "you", null]) {
    const d = decideFieldClass({ field: "e", cls, text: "the sole Level 14 facility in Northern California", citedSourceTexts: [] });
    assertEquals(d.branch, "not_applicable", `cls=${cls}`);
    assertEquals(fieldClassOk(d, undefined), true);
  }
});

// ── THE LIVE FIXTURE: Edgewood positioning.unique_attributes[0] with its REAL citations ─────────
// Cited: 93989558 (finding, our_read) · 838ead35 (finding, our_read) · 38e60681 (mightycause, record).
// So exactly ONE cited row is sourcing evidence: the mightycause row.
Deno.test("LIVE FIXTURE: the Edgewood Level 14 field takes the JUDGE branch, and names what it cannot source", () => {
  const LIVE = "only youth-under-12 Crisis Stabilization Unit (CSU) in the Bay Area and sole Level 14 residential facility in Northern California";
  const d = decideFieldClass({
    field: "unique_attributes[0]", cls: "our_read", text: LIVE,
    citedSourceTexts: [MIGHTYCAUSE],     // the two findings are excluded by class
  });
  assertEquals(d.branch, "judge_required");
  const tokens = d.unsourced.map((u) => u.token);
  // SOURCED by mightycause ("the only level 14 residential facility in northern California"):
  assert(!tokens.includes("14"), "the figure 14 IS sourced — mightycause says 'level 14 residential facility'");
  assert(!tokens.includes("Northern California"), "the reach IS sourced — mightycause says 'in northern California'");
  // NOT sourced — these are OURS:
  assert(tokens.includes("sole"), "'sole' is ours: mightycause says 'the only', and the July run said 'one of very few'");
  assert(tokens.includes("only"), "'only' here attaches to the under-12 CSU claim, which mightycause does not carry");
  assert(tokens.includes("Bay Area"), "mightycause says northern California, not the Bay Area");
  // the live wording carries no hedge, so a judge answering honestly refuses it
  assertEquals(fieldClassOk(d, false), false);
  const refusals = classRefusals([d], { "unique_attributes[0]": false });
  assertEquals(refusals.length, 1);
  assert(refusals[0].unsourced.includes("sole (exclusivity)"), refusals[0].unsourced);
});
