// ── S1b / N1d / O1 (operator rulings, 2026-10-15) ───────────────────────────────────────────────
//
// S1b. Wasabi's staged strategy said "To be the leading global cloud storage provider ... unmatched
// ...", class `you`, and NEITHER word appears in any of its three cited rows. S1 cleared it with
// examined:0 — correctly under the rules as they stood, which govern figures plus the four position
// words. But the read was attributing those words to the company's own voice with nothing behind
// them, which is the same fault S1 refuses for the four it does govern.
//
// N1d. Wasabi's offering refused TWICE (audits 10613, 10614) on `open_questions[0] (record): Is
// Wasabi [name]`. "Is" is capitalized because it opens the question, the multi-word run regex
// swallowed it, and the own-name exclusion could not fire because the token was "Is Wasabi", not
// "Wasabi". It generalises: "Does Wasabi…", "Has Edgewood…". Every open question phrased as a
// question about the company was unstageable.
//
// O1. An offering item stamps as `items[n]` with its STATEMENT as the text, so the LABEL was read
// by nothing. The refused payload carried "Wasabi GovCloud with FedRAMP Ready status" and "Wasabi
// AiR AI recognition technology" — names asserted in a field no gate looked at.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  namesIn, reputationWordsIn, S1B_REPUTATION_WORDS, s1Unsourced, SENTENCE_OPENERS,
  unsourcedLabelNames, unsourcedReputation,
} from "./classFactCheck.ts";
import {
  OFFERING_KIND_HINTS, OFFERING_OQ_REASONS, offeringStructureViolations,
} from "./publicReadGuards.ts";
import { reaskFeedbackBlock, type SourceRow, unsupportedByPool } from "./reaskFeedback.ts";
import { type CitedLine, sourcingIdsOf, stillSourcedPromptBlock } from "./stageContinuity.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));

// ── S1b ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("S1b. the signed set, and 'number one' is two words", () => {
  assertEquals([...S1B_REPUTATION_WORDS].sort(), [
    "best", "foremost", "leading", "number one", "premier", "superior", "top", "unmatched",
    "unparalleled", "world-class",
  ]);
  assertEquals(reputationWordsIn("we are number one and world-class"), ["number one", "world-class"]);
  // hyphen and space are interchangeable in the match, so neither spelling escapes
  assertEquals(reputationWordsIn("a world class service"), ["world class"]);
});

Deno.test("S1b. a word with no cited row behind it refuses; one a row states passes", () => {
  assertEquals(unsourcedReputation({ text: "the leading provider", cls: "you", citedSourceTexts: ["affordable storage"] }),
    ["leading"]);
  assertEquals(unsourcedReputation({ text: "the leading provider", cls: "you", citedSourceTexts: ["the leading provider of X"] }),
    [], "the record says it, so the read may");
  // THE WASABI LINE, verbatim shape
  assertEquals(
    unsourcedReputation({
      text: "To be the leading global cloud storage provider with unmatched speed",
      cls: "you", citedSourceTexts: ["affordable, simple, secure cloud storage", "no egress fees"],
    }).sort(), ["leading", "unmatched"]);
});

Deno.test("S1b. it governs record and you only — our_read and unclassed are (b)'s business", () => {
  for (const cls of ["our_read", null, "", "nonsense"]) {
    assertEquals(unsourcedReputation({ text: "the leading provider", cls, citedSourceTexts: [] }), [],
      `${cls} is not S1b's`);
  }
});

Deno.test("S1b. it rides in the SAME result and the SAME refusal, as its own kind", () => {
  const r = s1Unsourced({ field: "winning_aspiration", cls: "you", text: "To be the leading provider",
    citedSourceTexts: ["cloud storage"] });
  assertEquals(r.unsourced.map((u) => [u.kind, u.token]), [["reputation", "leading"]]);
  // and a figure in the same line still reports as a figure — the kinds stay distinguishable
  const r2 = s1Unsourced({ field: "f", cls: "record", text: "the leading provider serving 12 counties",
    citedSourceTexts: ["a provider"] });
  assertEquals([...new Set(r2.unsourced.map((u) => u.kind))].sort(), ["figure", "reputation"]);
});

Deno.test("S1b. C2 is untouched — softening asks a different question", async () => {
  const cont = await read("./stageContinuity.ts");
  assert(cont.includes('export const REPUTATIONAL_WORDS = ["best", "leading", "premier", "foremost"] as const;'),
    "C2 keeps its own list and its own meaning: did WE soften a row's position word");
  assert(!cont.includes("S1B_REPUTATION_WORDS"), "C2 does not import S1b's set");
});

// ── N1d ─────────────────────────────────────────────────────────────────────────────────────────

Deno.test("N1d. the closed set, exactly as signed", () => {
  assertEquals([...SENTENCE_OPENERS].sort(), [
    "are", "can", "could", "did", "do", "does", "had", "has", "have", "how", "is", "should",
    "was", "were", "what", "when", "where", "which", "who", "why", "will", "would",
  ]);
});

Deno.test("N1d. THE WASABI QUESTION: 'Is Wasabi…' no longer mints a name", () => {
  assertEquals(namesIn("Is Wasabi's data corruption incident in TX location still an ongoing issue?"),
    ["Wasabi"], "the company's own name, which the own-name exclusion then drops");
  assertEquals(namesIn("Does Wasabi still do Y?"), ["Wasabi"]);
  assertEquals(namesIn("Has Edgewood kept Z?"), ["Edgewood"]);
});

Deno.test("N1d. it only fires at a sentence start, and only on the listed words", () => {
  // mid-sentence, the same word is part of the name
  assert(namesIn("We asked whether Is Wasabi was right").includes("Is Wasabi"),
    "not at a start — untouched");
  // a run whose first word is NOT in the set keeps every word
  assertEquals(namesIn("Wasabi Fire is the new tier"), ["Wasabi Fire"]);
  // N1e (2026-10-15) retires this false positive outright: "AI" is a two-letter all-caps token, so
  // it never extends a run, and the single word left over falls to nameShaped, which rejects a
  // plain Capitalized word. It was ruled to STAY under N1d alone; N1e removes it as a consequence
  // of its own rule, not by special-casing. Measured fleet-wide, this is the ONLY line of 61
  // classed lines whose names change (BlueSkyAI strategy how_to_win).
  assertEquals(namesIn("Deliver AI to the team"), [],
    "'AI' never extends a run, and 'Deliver' alone is not name-shaped");
  // a two-word name whose first word IS in the set loses it at a start: the cost of the closed set
  assertEquals(namesIn("Will Smith joined the board"), ["Smith"]);
});

Deno.test("N1d. the remainder stays a name BY CONSTRUCTION, as the ruling says", () => {
  // The ruling is "drops its FIRST WORD" — what remains is still the name the run regex had
  // captured, and a multi-word run is a name by construction (it does not go through nameShaped).
  // Keeping the remainder is what preserves a single-word name the opener was hiding: "Is Seagate
  // still shipping X?" must still name Seagate, and "Seagate" alone would not survive nameShaped.
  assertEquals(namesIn("Is Seagate still shipping X?"), ["Seagate"]);
  assertEquals(namesIn("Is Wasabi's incident ongoing?"), ["Wasabi"]);
  // the cost of that, stated: a two-letter remainder is kept too, where a bare token would not be
  assertEquals(namesIn("Is Ai the answer?"), ["Ai"]);
  assertEquals(namesIn("Ai is the answer."), [], "the same word NOT behind an opener is not a name");
  // and a three-word run keeps its remaining two
  assertEquals(namesIn("What Wasabi AiR does next?"), ["Wasabi AiR"]);
});

// ── O1 ──────────────────────────────────────────────────────────────────────────────────────────

Deno.test("O1. BEHAVIOUR: a label name absent from the item's cited rows refuses", () => {
  // THE WASABI LABELS, verbatim. The item cites the row its STATEMENT rests on; the label asserts
  // names on top of that, and until O1 nothing read them.
  assertEquals(
    unsourcedLabelNames({
      field: "items[2]", label: "Wasabi GovCloud with FedRAMP Ready status", cls: "record",
      citedSourceTexts: ["Wasabi GovCloud achieves FedRAMP Ready status for federal agencies"],
      companyName: "Wasabi Technologies",
    }), [], "every name the label uses is in the row the item cites");
  assertEquals(
    unsourcedLabelNames({
      field: "items[3]", label: "Wasabi AiR AI recognition technology", cls: "record",
      // the REAL row 2242bdd1 states "Wasabi AiR" — verified against the signals table, not invented
      citedSourceTexts: ["Wasabi AiR significantly reduces manual efforts due to its seamless use of AI recognition technology"],
      companyName: "Wasabi Technologies",
    }), [],
    "N1e: the run stops at the two-letter category word, so the label asserts 'Wasabi AiR' — which "
    + "the item's cited row DOES state. The refusal this test was written against (audits 10655, "
    + "10656) is resolved by the name rule, not by loosening O1.");
  // and O1 still refuses a label naming something the item's rows do not state
  assertEquals(
    unsourcedLabelNames({
      field: "items[3]", label: "Wasabi Fire recognition technology", cls: "record",
      citedSourceTexts: ["the product reduces manual effort through recognition technology"],
      companyName: "Wasabi Technologies",
    }), ["Wasabi Fire"], "a label name absent from the item's cited rows still refuses");
  // the own name alone is never demanded of the record
  assertEquals(unsourcedLabelNames({ field: "items[0]", label: "Wasabi", cls: "you",
    citedSourceTexts: ["storage"], companyName: "Wasabi Technologies" }), []);
  // an empty label asserts nothing
  assertEquals(unsourcedLabelNames({ field: "items[1]", label: "   ", cls: "record", citedSourceTexts: [] }), []);
  // and class decides, exactly as N1: our_read labels are checked too (N1b), unclassed are not
  assertEquals(unsourcedLabelNames({ field: "i", label: "Wasabi Fire", cls: null, citedSourceTexts: [] }), []);
  assertEquals(unsourcedLabelNames({ field: "i", label: "Wasabi Fire", cls: "our_read", citedSourceTexts: [],
    companyName: "Wasabi Technologies" }), ["Wasabi Fire"]);
});

Deno.test("O1. the gate calls it for every item, with the item's own refs", async () => {
  const src = await read("../generate-public-read/index.ts");
  const at = src.indexOf("for (const f of stamped) {");
  assert(at > 0, "the label loop exists");
  const body = src.slice(at, src.indexOf("s1Results[kind as Kind] = results;", at));
  assert(body.includes('if (!/^items\\[\\d+\\]$/.test(f.field)) continue;'), "items only");
  assert(body.includes("(f.obj as Record<string, unknown>).label"), "it reads the LABEL, not the statement");
  assert(body.includes("unsourcedLabelNames({ field: f.field, label"), "through the one label predicate");
  assert(body.includes("companyName"), "with the own-name exclusion, so a label saying 'Wasabi' is not demanded");
  assert(body.includes('kindByRef.get(r) !== "finding"'), "a finding may not source a label name either");
  assert(body.includes("`${f.field}.label`"), "and it reports under its own field path");
});

Deno.test("O1. kind_hint and reason were ALREADY closed enums — not re-stated here", async () => {
  // BEHAVIOUR, not shape: a guard that only looks for the constant passes on a validator that has
  // stopped pushing the violation. Call it and read the verdict.
  const refs = new Set(["S1"]);
  const ok = { items: [{ label: "x", statement: "y", refs: ["S1"], kind_hint: "product" }], open_questions: [] };
  assertEquals(offeringStructureViolations(ok, refs).map((v) => v.code), [], "a legal payload passes");
  const badHint = { ...ok, items: [{ ...ok.items[0], kind_hint: "widget" }] };
  assert(offeringStructureViolations(badHint, refs).some((v) => v.code === "item_bad_kind_hint"),
    "a kind_hint outside the enum REFUSES");
  const badReason = { ...ok, open_questions: [{ text: "q?", refs: ["S1"], reason: "vibes" }] };
  assert(offeringStructureViolations(badReason, refs).some((v) => v.code === "oq_bad_reason"),
    "a reason outside the enum REFUSES");
  // and the enums are the signed values
  assertEquals([...OFFERING_OQ_REASONS].sort(), ["currency", "entity", "other"]);
  assert(OFFERING_KIND_HINTS.has("product") && !OFFERING_KIND_HINTS.has("widget"));
  // the label check must NOT duplicate them: one rule, one place
  const src = await read("../generate-public-read/index.ts");
  const at = src.indexOf("for (const f of stamped) {");
  const body = src.slice(at, src.indexOf("s1Results[kind as Kind] = results;", at));
  assert(!body.includes("kind_hint") || body.includes("kind_hint and open_questions"),
    "the loop may MENTION them in its comment, never re-check them");
  assert(!body.includes("OFFERING_KIND_HINTS") && !body.includes("OFFERING_OQ_REASONS"),
    "a second definition of the same rule is how two checks come to disagree");
});

// ── N1e / NP2 (operator rulings, 2026-10-15) ────────────────────────────────────────────────────
//
// N1e. N1a already said a two-letter all-caps token is a CATEGORY word — but only on the
// single-token path. The run regex bypasses nameShaped ("a multi-word capitalized run is a name by
// construction"), so "Wasabi AiR AI recognition technology" yielded "Wasabi AiR AI" and Wasabi's
// offering refused twice (10655, 10656) because its cited row states "Wasabi AiR".
//
// NP2. In both refusals the model had written a word the POOL could not support anywhere, and
// learned so only by being refused — by which time its one re-ask was spent. The still-sourced
// block already names the rows that state each name; it now also names the words no row states.
describe_n1e();
function describe_n1e() {
  Deno.test("N1e. a two-letter all-caps token never extends a run", () => {
    assertEquals(namesIn("Wasabi AiR AI recognition technology"), ["Wasabi AiR"]);
    assertEquals(namesIn("AI Wasabi Fire"), ["Wasabi Fire"], "at the head, too");
    assertEquals(namesIn("Wasabi AI Storage"), [],
      "an interior split leaves single words, which fall to nameShaped and are not names");
  });

  Deno.test("N1e. slash, digit and mixed-case forms are untouched", () => {
    assertEquals(namesIn("AI/ML workloads"), ["AI/ML"]);
    assertEquals(namesIn("S3 compatibility"), ["S3"]);
    assertEquals(namesIn("FedRAMP Ready status"), ["FedRAMP Ready"]);
    assertEquals(namesIn("Medi-Cal/Medicare coverage"), ["Medi-Cal/Medicare"]);
    assertEquals(namesIn("CRM and SMBs").sort(), ["CRM", "SMBs"], "three letters or more stays a name");
  });

  Deno.test("N1e. N1d still works through it", () => {
    assertEquals(namesIn("Is Seagate still shipping X?"), ["Seagate"]);
    assertEquals(namesIn("Wasabi Fire is the new tier"), ["Wasabi Fire"]);
  });

  // ── NP2 ───────────────────────────────────────────────────────────────────────────────────────

  const POOL2: SourceRow[] = [
    { id: "S1", kind: "signal", cls: "record", text: "Wasabi AiR brings searchable intelligence" },
    { id: "S2", kind: "signal", cls: "you", text: "built for backups and AI/ML workloads" },
    { id: "F1", kind: "finding", cls: "our_read", text: "we read them as the leading provider" },
  ];

  Deno.test("NP2. a word NO sourcing row states is listed; one a row states is not", () => {
    assertEquals(unsupportedByPool("Wasabi AiR supports AI/ML", POOL2, "Wasabi Technologies"), [],
      "both names are in the pool");
    assertEquals(unsupportedByPool("Wasabi Fire supports AI/ML", POOL2, "Wasabi Technologies"),
      ["Wasabi Fire"], "a name no row states");
    // a FINDING cannot support anything — it is our own synthesis
    assertEquals(unsupportedByPool("the leading provider", POOL2, "Wasabi Technologies"), ["leading"],
      "only the finding says 'leading', and a finding may not source");
  });

  Deno.test("NP2. it covers specifics, names AND reputation words — the three gates", () => {
    const pool: SourceRow[] = [{ id: "S1", kind: "signal", cls: "record", text: "serving 12 counties" }];
    const got = unsupportedByPool("the only provider serving 12 counties, world-class, with Wasabi Fire",
      pool, "Wasabi Technologies").sort();
    assert(got.includes("only"), "S1's position word");
    assert(got.includes("world-class"), "S1b's reputation word");
    assert(got.includes("Wasabi Fire"), "N1's name");
    assert(!got.includes("12"), "a figure the pool DOES state is not listed");
  });

  Deno.test("NP2. the note is the signed sentence, beside its own line", () => {
    const block = reaskFeedbackBlock({
      lines: [{ text: "Wasabi Fire is world-class", sourcing_citations: ["S1"],
                unsupported_by_pool: ["Wasabi Fire", "world-class"] }],
      pool: POOL2, companyName: "Wasabi Technologies",
    });
    assert(block.includes('Keep this line. No row in the pool states: "Wasabi Fire", "world-class". '
      + 'Remove those words, or cite a row that states them.'),
      "the ruling's own sentence — 'drop them' was read as drop the LINE (10695 -> 10696)");
    // it sits under the line it is about
    const lines = block.split("\n");
    const textAt = lines.findIndex((l) => l.includes("Wasabi Fire is world-class"));
    const noteAt = lines.findIndex((l) => l.includes("No row in the pool states"));
    assert(textAt >= 0 && noteAt > textAt, "beside its line, not in a separate list");
  });

  Deno.test("NP2. a line the pool fully supports carries no note", () => {
    const block = reaskFeedbackBlock({
      lines: [{ text: "Wasabi AiR supports AI/ML", sourcing_citations: ["S1"], unsupported_by_pool: [] }],
      pool: POOL2, companyName: "Wasabi Technologies",
    });
    assert(!block.includes("No row in the pool states"), "no note where there is nothing to say");
  });

  Deno.test("NP2. BEHAVIOUR: the still-sourced block itself carries the note", () => {
    // end to end through the real function the generation prompt calls — not a grep for the call.
    const forSourcing = POOL2.map((r) => ({ id: r.id, kind: r.kind, source_class: r.cls }));
    const line: CitedLine = {
      field: "unique_attributes[0]", text: "Wasabi Fire is world-class", cls: "record", refs: ["S1"],
    };
    const block = stillSourcedPromptBlock([line], sourcingIdsOf(forSourcing), POOL2, "Wasabi Technologies");
    assert(block.includes("Wasabi Fire is world-class"), "the line is shown");
    assert(block.includes('Keep this line. No row in the pool states: "Wasabi Fire", "world-class"'),
      "with the words the pool cannot support");
    // and a line the pool fully supports gets the block WITHOUT a note
    const ok: CitedLine = { field: "x", text: "Wasabi AiR supports AI/ML", cls: "record", refs: ["S1"] };
    const clean = stillSourcedPromptBlock([ok], sourcingIdsOf(forSourcing), POOL2, "Wasabi Technologies");
    assert(clean.includes("Wasabi AiR supports AI/ML"));
    assert(!clean.includes("No row in the pool states"), "nothing to say, so nothing said");
  });

  Deno.test("NP2. ONE builder — the still-sourced block computes it, nothing re-implements it", async () => {
    const cont = await read("./stageContinuity.ts");
    assert(cont.includes("unsupported_by_pool: unsupportedByPool(l.text, pool, companyName),"),
      "the still-sourced block feeds the one builder");
    assert(cont.includes('from "./reaskFeedback.ts"'), "importing it, never redefining it");
    // the computation lives in the NP module and nowhere else
    const np = await read("./reaskFeedback.ts");
    assert(np.includes("export function unsupportedByPool("), "one implementation");
    for (const f of ["stageContinuity.ts", "../generate-public-read/index.ts"]) {
      const src = await read(`./${f}`.replace("./../", "../"));
      // CODE only. C1-U's own header explains the deadlock in prose — "no row in the pool states
      // either word" — and a comment can neither render the sentence to the model nor re-implement
      // the computation, so matching one is a false positive. (The same fault as the earlier
      // {"fixes" assertion, which matched its own comment before it matched any code.)
      const code = src.split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("/*"))
        .join("\n");
      assert(!/No row in the pool states/i.test(code), `${f} must not render the sentence itself`);
    }
  });
}

// ── O1 AT PROMOTE / the harness's drop rule (operator rulings, 2026-10-15) ──────────────────────
describe_promote_and_harness();
function describe_promote_and_harness() {
  Deno.test("O1 at promote: the re-check reads every items[n].label, not just the statement", async () => {
    const prom = await read("./publicReadPromote.ts");
    // linesOfStoredPayload takes a line's text from text|statement|promise|body — never `label`,
    // so labels were invisible to the re-check. The whole point of the re-check is that the ROWS
    // are re-read live, which makes the label the half most able to drift unseen.
    assert(prom.includes("const labelLines:"), "labels are gathered");
    assert(prom.includes("unsourcedLabelNames({"), "and run through the SAME predicate as at stage");
    assert(prom.includes('`items[${i}].label`'), "reported under its own field path");
    // the same exclusions as at stage: record/you only, findings barred, own name not demanded
    const at = prom.indexOf("for (const l of labelLines) {");
    const body = prom.slice(at, prom.indexOf("return results.some(", at));
    assert(body.includes('classes[id] === "record" || classes[id] === "you"'), "record/you only");
    assert(body.includes("!findingIds.has(id)"), "a finding may not source a label name");
    assert(body.includes("companyName"), "the own-name exclusion travels");
    // and the label's rows are fetched live with everything else
    assert(prom.includes("...labelLines.flatMap((l) => l.refs)"), "their rows are in the live re-read");
  });

  Deno.test("the harness classifies drops with the PRODUCTION classifier, not its own", async () => {
    const h = await Deno.readTextFile(new URL("../../../scripts/c1c2-continuity-cost.ts", import.meta.url));
    assert(h.includes("classifyContinuity({"), "it calls C1's own function");
    assert(h.includes("sourcingIds,"), "WITH sourcingIds — without them every drop reads still_sourced:false");
    assert(h.includes("const missing = stillSourcedDrops(split);"),
      "and fails only on a drop C1-S would refuse");
    // the CALL is gone; the comment that explains why may still name it
    const called = h.split("\n").filter((l) => l.includes("droppedLines(") && !l.trim().startsWith("//"));
    assert(called.length === 0,
      `droppedLines drops sourcingIds on the floor, which is what made a licensed drop fail the run: ${called.join(" | ")}`);
    // a licensed drop is REPORTED, not silently swallowed
    assert(h.includes("C1 licensed"), "licensed drops are listed");
    assert(h.includes("split.licensed.map"), "both licence causes: no surviving source, and C1-P's");
    // and the Wasabi line is licensed by the RULE, never by being filed as history
    assert(!/read:\s*"523da9ea"/.test(h), "523da9ea is not filed in KNOWN_PRE_C1");
  });
}
