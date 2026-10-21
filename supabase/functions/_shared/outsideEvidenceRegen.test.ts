// R31 (2026-10-18) — the stored excerpt is the raw page slice; abbreviations do not end sentences; a bare attribution is refused.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { admitOutsideEvidence, isBareAttribution } from "./outsideEvidenceRegen.ts";
import { retainConcreteEvidence, splitSentences } from "../../../src/lib/evidenceMappers.ts";

const PAGE_NL = "Benefits\nCoreViva’s approach is built around patient needs, offering a unique set of benefits:\nDirect Consultation: Patients receive a 1:1 consultation with a board-certified radiologist to review scan results.\nRapid Results";
const PAGE_NBSP = "Plan\nWith support from the Newport Beach Fire Department Foundation, the department is also expanding cancer prevention and screening initiatives, including whole-body MRI screenings for personnel with  CoreViva .\nNext";

Deno.test("R31 (a): a model copy that crosses a newline is stored as the PAGE slice — bytes equal the page at (offset, length); the model copy rides as model_text", () => {
  const copy = "CoreViva’s approach is built around patient needs, offering a unique set of benefits: Direct Consultation: Patients receive a 1:1 consultation with a board-certified radiologist to review scan results.";
  const r = admitOutsideEvidence(copy, PAGE_NL);
  assert(r.admit, JSON.stringify(r));
  assert(r.excerpt.includes("\n"), "the stored text carries the page's newline");
  assertEquals(PAGE_NL.slice(r.offset, r.offset + r.length), r.excerpt);
  assertEquals(r.offset, PAGE_NL.indexOf("CoreViva’s approach"));
  assertEquals(r.model_text, copy);
});

Deno.test("R31 (a): a no-break space in the page is kept in the stored slice; the single-space model copy is only the locator", () => {
  const copy = "With support from the Newport Beach Fire Department Foundation, the department is also expanding cancer prevention and screening initiatives, including whole-body MRI screenings for personnel with CoreViva .";
  const r = admitOutsideEvidence(copy, PAGE_NBSP);
  assert(r.admit, JSON.stringify(r));
  assert(r.excerpt.includes(" "), "the no-break space is the page's");
  assertEquals(PAGE_NBSP.slice(r.offset, r.offset + r.length), r.excerpt);
  assertEquals(r.excerpt.length, copy.length + 1);
});

Deno.test("R31 (b): 'founded by radiologists Dr. A. Alexander and Dr. Brian Tsui.' stays ONE sentence through the splitter, E2 shaping and admission", () => {
  const page = "CoreViva, founded by radiologists Dr. A. Alexander and Dr. Brian Tsui, officially opened its flagship clinic in Newport Beach this month. It also opened a lab.";
  const cand = "CoreViva, founded by radiologists Dr. A. Alexander and Dr. Brian Tsui, officially opened its flagship clinic in Newport Beach this month.";
  assertEquals(splitSentences(cand).length, 1);
  assertEquals(retainConcreteEvidence(cand), cand);
  const r = admitOutsideEvidence(cand, page);
  assert(r.admit, JSON.stringify(r)); assertEquals(r.excerpt, cand);
  for (const a of ["Mr.", "Mrs.", "Ms.", "Inc.", "Co.", "Ltd.", "St.", "No.", "Jr.", "Sr.", "vs."]) {
    assertEquals(splitSentences(`We met Acme ${a} Then we left.`).length, 1, `${a} does not end a sentence`);
  }
  assertEquals(splitSentences("We met Dr. Who. Then we left."), ["We met Dr. Who.", "Then we left."], "Dr. joins its own period only; the next boundary is real");
  assertEquals(splitSentences("Written by J. K. Rowling. Sold well."), ["Written by J. K. Rowling.", "Sold well."], "capital initials are non-terminal");
  assertEquals(splitSentences("We chose plan b. Next we left.").length, 2, "a lowercase letter is not an initial");
  assertEquals(splitSentences("It was late. We left.").length, 2);
});

Deno.test("R31 (c): a bare attribution clause is refused (e2_bare_attribution); reported speech or a quotation with the same verb is not bare", () => {
  const page = "Geniant Chairman and Co-CEO David Lancashire said. “We are thrilled,” he added. Demand is large, Alexander said. Our goal is to catch cancer earlier, Alexander told the Business Journal.";
  assertEquals(isBareAttribution("Geniant Chairman and Co-CEO David Lancashire said."), true);
  assertEquals(isBareAttribution("Geniant Chairman and Co-CEO David Lancashire said"), true);
  assertEquals(isBareAttribution("Geniant Chairman and Co-CEO David Lancashire said. “We are thrilled,” he added."), false, "a quotation follows — not bare");
  assertEquals(isBareAttribution("Demand is large, Alexander said."), false, "reported content before the comma");
  assertEquals(isBareAttribution("Our goal is to catch cancer earlier, Alexander told the Business Journal."), false);
  assertEquals(isBareAttribution("Geniant plans to deliver experiences with an AI-first approach."), false);
  const r = admitOutsideEvidence("Geniant Chairman and Co-CEO David Lancashire said.", page);
  assert(!r.admit); assertEquals(r.reason, "e2_bare_attribution");
  const ok = admitOutsideEvidence("Demand is large, Alexander said.", page);
  assert(ok.admit, JSON.stringify(ok));
});

// ── R32: deterministic attribution detection, every form; apostrophes never count as quotation marks ──────────
import { detectAttribution } from "./outsideEvidenceRegen.ts";
const OCBJ = "CoreViva has opened a full-body MRI clinic in Newport Beach.\n“Our goal is to catch cancer earlier,” Alexander told the Business Journal.\nCoreViva’s MRIs aren’t limited to just detecting cancer. They’re capable of finding more than 500 elusive diseases, including joint disease and reproductive issues, according to the company.\nWhat differentiates CoreViva from other existing full-body MRIs is that it not only looks at all organs, but also brain health and musculoskeletal health, Alexander said.\nTogether, they developed the “fastest, most accurate and most comprehensive whole-body MRI that exists,” Alexander said.";
const INDY = "The Foundation supports first responders.\n“We couldn’t be more pleased with our partnership with CoreViva. Their preventive health whole-body MRI scans were an immediate answer to better understanding the individual health needs of our first responders. It’s important to take care of our firefighters,” said Brian Bowis, Chairman of the Newport Beach Fire Department Foundation.\nThe Foundation has already sent more than 40 members.";
const SUBSTACK = "Drs. Alexander and Tsui join the show. They explain their unique edge: faster scan times (~35 minutes), highest-quality images, and comprehensive reporting using custom AI.";
const DMAG = "Geniant Chairman and Co-CEO David Lancashire said the studio will support rebranding strategies.";

Deno.test("R32: the forms — quoted + told, according to, reported ', X said', reported pronoun, titled speaker, quotation interior with the attribution after the close", () => {
  const a = detectAttribution("“Our goal is to catch cancer earlier,” Alexander told the Business Journal.", OCBJ)!;
  assertEquals(a.form, "quoted_with_attribution"); assertEquals(a.speaker_string, "Alexander");
  const b = detectAttribution("They’re capable of finding more than 500 elusive diseases, including joint disease and reproductive issues, according to the company.", OCBJ)!;
  assertEquals(b.form, "according_to"); assertEquals(b.speaker_string, "the company");
  const c = detectAttribution("What differentiates CoreViva from other existing full-body MRIs is that it not only looks at all organs, but also brain health and musculoskeletal health, Alexander said.", OCBJ)!;
  assertEquals(c.form, "reported_name_verb"); assertEquals(c.speaker_string, "Alexander");
  const d = detectAttribution("Together, they developed the “fastest, most accurate and most comprehensive whole-body MRI that exists,” Alexander said.", OCBJ)!;
  assertEquals(d.form, "quoted_with_attribution"); assertEquals(d.speaker_string, "Alexander");
  const e = detectAttribution("They explain their unique edge: faster scan times (~35 minutes), highest-quality images, and comprehensive reporting using custom AI.", SUBSTACK)!;
  assertEquals(e.form, "reported_pronoun_verb"); assertEquals(e.speaker_string, "They");
  const f = detectAttribution("Geniant Chairman and Co-CEO David Lancashire said the studio will support rebranding strategies.", DMAG)!;
  assertEquals(f.form, "reported_titled_speaker"); assert(f.speaker_string.includes("David Lancashire"), f.speaker_string);
  const g = detectAttribution("Their preventive health whole-body MRI scans were an immediate answer to better understanding the individual health needs of our first responders.", INDY)!;
  assertEquals(g.form, "quotation_interior"); assertEquals(g.speaker_string, "Brian Bowis, Chairman of the Newport Beach Fire Department Foundation");
  assert(g.span.startsWith("“We couldn’t be more pleased") && g.span.endsWith("Fire Department Foundation."), "the unit runs from the opening mark to the attribution clause's sentence end: " + g.span);
  assertEquals(INDY.slice(g.offset, g.offset + g.span.length), g.span, "the unit's offset indexes the page");
});

Deno.test("R32: apostrophes never count as quotation marks (the pilot-3 false positive); plain reporting is not attribution", () => {
  const page = "“One thing that concerned our company,” said Doering.\nTo ensure Scott’s neutrality, Whispering AI founder Jack Skates integrated safeguards into the AI’s application.\n“Jack created parameters,” said Doering.";
  assertEquals(detectAttribution("To ensure Scott’s neutrality, Whispering AI founder Jack Skates integrated safeguards into the AI’s application.", page), null);
  assertEquals(detectAttribution("CoreViva has opened a full-body MRI clinic in Newport Beach.", OCBJ), null);
  assertEquals(detectAttribution("Whispering AI is headquartered at 6929 North Hayden Road, Scottsdale.", ""), null);
  assertEquals(detectAttribution("", OCBJ), null);
});


// ── R42: speakerContext — the paragraph plus every sentence naming the speaker, deduped, capped ──────────
import { speakerContext, SPEAKER_CONTEXT_CAP } from "./attribution.ts";
Deno.test("R42: speakerContext = paragraph (whole) + sentences containing the speaker string or its surname, in page order, deduped, under the cap", () => {
  const page = "Steve Brierley, Riverlane's founder and CEO, has spent a decade on error correction.\n\nA quote: “key to unlocking useful quantum computing”, said Brierley. Investors agreed.\n\nBrierley added that hiring continues. Brierley added that hiring continues.";
  const off = page.indexOf("A quote"); const len = "A quote: “key to unlocking useful quantum computing”, said Brierley.".length;
  const ctx = speakerContext(page, off, len, "Brierley");
  assert(ctx.startsWith("A quote:"), "paragraph first");
  assert(ctx.includes("Steve Brierley, Riverlane's founder and CEO"), "the earlier sentence is added");
  assertEquals(ctx.split("Brierley added that hiring continues.").length - 1, 1, "deduped");
  assertEquals(speakerContext(page, off, len, ""), page.slice(page.lastIndexOf("\n\n", off) + 2, page.indexOf("\n\n", off + len)), "no speaker string → the paragraph alone, without the separator");
  const long = page + "\n\n" + Array.from({ length: 200 }, (_, i) => `Brierley said thing number ${i} about the future of quantum error correction and the company's plans.`).join(" ");
  const capped = speakerContext(long, off, len, "Brierley");
  assert(capped.length <= SPEAKER_CONTEXT_CAP + 200, `cut near the cap (${capped.length})`); assert(capped.startsWith("A quote:"));
  const shortTok = speakerContext(page, off, len, "the company"); assert(!shortTok.includes("founder and CEO"), "a last token under 4 chars is not searched; 'the company' matches nothing else here");
});

// ── R48 (R51, 2026-10-20): unquoted reported speech of a named speaker ─────────────────────────────────────────────
import { matchLowerTitled, matchNameAppositive } from "./attribution.ts";
Deno.test("R48: the Auletta sentence — a sentence-initial name with a two-segment appositive chain, then 'said' — is reported_name_appositive with the speaker string carrying the title; the two measured false positives (a possessive name, a participle) are null; a lowercase title + name + verb is reported_titled_speaker; a sentence-initial name before 'called' names the speaker of a quotation", () => {
  const AULETTA = "Ken Auletta, Edgewood’s chief human resources officer, who led the nonprofit organization’s end of the negotiations, said management was equally pleased by the contract.";
  const a = detectAttribution(AULETTA, "")!;
  assertEquals(a.form, "reported_name_appositive");
  assertEquals(a.speaker_string, "Ken Auletta, Edgewood’s chief human resources officer, who led the nonprofit organization’s end of the negotiations");
  assertEquals(matchNameAppositive(AULETTA)?.verb, "said");
  const g = detectAttribution("Gotham Sports, the joint venture between the YES Network and MSG Networks, announced on Friday it is reducing prices.", "")!;
  assertEquals([g.form, g.speaker_string], ["reported_name_appositive", "Gotham Sports, the joint venture between the YES Network and MSG Networks"]);
  const s = detectAttribution("New Hampshire-headquartered SIAA says its model and operations will remain unchanged under the new ownership plan.", "")!;
  assertEquals([s.form, s.speaker_string], ["reported_name_appositive", "New Hampshire-headquartered SIAA"]);
  // the false positives
  assertEquals(detectAttribution("Spence's comments haven't gone down brilliantly with users of the r/sonos subreddit, where there's been plenty of discussion.", ""), null, "a possessive is not a speaker");
  assertEquals(detectAttribution("The original East Burnside roastery runs a Probat L12 with a Loring S15 added later, both dialed in with Wille's cupping discipline.", ""), null, "a participle is not a report");
  assertEquals(matchNameAppositive("Lancashire added later that the studio would grow."), null, "'added later' is read as a participle tail");
  // P4: a lowercase title
  const l = detectAttribution("The company's chief financial officer Greg Wagner said the department would fund the plan.", "")!;
  assertEquals([l.form, l.speaker_string], ["reported_titled_speaker", "chief financial officer Greg Wagner"]);
  assertEquals(matchLowerTitled("A spokeswoman Jane Doe said the deal closed.")?.speaker, "spokeswoman Jane Doe");
  // the quoted branch prefers the sentence-initial name over the verb-then-name form
  const h = detectAttribution("Supervisor Matt Haney called Edgewood “an essential institution for our city.”", "")!;
  assertEquals([h.form, h.speaker_string], ["quoted_with_attribution", "Supervisor Matt Haney"]);
  // unchanged: function words at a sentence start are never names; plain prose is not attribution
  assertEquals(detectAttribution("They explain their unique edge: faster scan times.", "")?.form, "reported_pronoun_verb");
  assertEquals(detectAttribution("We have an affiliate who successfully transferred from SIAA to PIIB, it took a lot of work.", ""), null);
  assertEquals(detectAttribution("CoreViva has opened a full-body MRI clinic in Newport Beach.", ""), null);
});

// ── R55a (2026-10-21): a quoted term is not a quotation — the quotation form needs an attribution marker ──────────
Deno.test("R55a: a quoted TERM with a verb used as an adjective is not a quotation (f2630d58 → none); a true quotation keeps its form", () => {
  const term = "The reported metrics mark the completion of the “Quantum Memory” phase (Phase 1) of Riverlane’s multi-year QEC roadmap.";
  assertEquals(detectAttribution(term), null);
  const q = detectAttribution("“This acquisition strengthens our position,” said David Friend, Wasabi Technologies’ co-founder and CEO.")!;
  assertEquals(q.form, "quoted_with_attribution"); assertEquals(q.speaker_string, "David Friend");
  const noun = detectAttribution("“We remain committed to our members,” the company said.")!;
  assertEquals(noun.form, "quoted_with_attribution"); assertEquals(noun.speaker_string, "the company");
  const dash = detectAttribution("“Simply Business’s technology brings value to our members.” – Meghan Leary, SVP of Strategic Partnerships of SIAA.")!;
  assertEquals(dash.form, "quoted_with_attribution"); assertEquals(dash.speaker_string, "Meghan Leary, SVP of Strategic Partnerships of SIAA");
});

// ── R55a' (2026-10-21): the speaker of a quotation is the speaker of every sentence inside it, dash attribution included ──
Deno.test("R55a': a candidate that opens a multi-sentence quotation takes the dash attribution after the close (08ff48ad → Leary)", () => {
  const page = "Together, we're making it simpler for agents.” – Mike Carvalho, VP of Insurance Panel and Partnerships at Simply Business U.S.\n" +
    "“Simply Business’s technology brings transparency, choice, and value to our members. By integrating this platform into our MarketFinder platform, we’re equipping agencies with the tools to efficiently serve the small business segment. This partnership aligns perfectly with SIAA’s mission to provide unparalleled resources to agents.” – Meghan Leary, SVP of Strategic Partnerships of SIAA.\nShare this";
  const cand = "“Simply Business’s technology brings transparency, choice, and value to our members.";
  const a = detectAttribution(cand, page)!;
  assertEquals(a.form, "quotation_interior"); assertEquals(a.speaker_string, "Meghan Leary, SVP of Strategic Partnerships of SIAA");
  const mid = "By integrating this platform into our MarketFinder platform, we’re equipping agencies with the tools to efficiently serve the small business segment.";
  assertEquals(detectAttribution(mid, page)?.speaker_string, "Meghan Leary, SVP of Strategic Partnerships of SIAA");
  // a closed quotation with no attribution after it stays unattributed
  assertEquals(detectAttribution("“A plain quoted line with nothing after.", "Intro. “A plain quoted line with nothing after. Still going.” Next paragraph."), null);
});

// ── R55d (2026-10-21): narrator words + a quotation in one candidate is form mixed, detected — never judged ──────────
Deno.test("R55d: narration then a quotation opener in one candidate (e4d0217a) is mixed; attributed speech and a quoted term are not", () => {
  const e4 = "When the backlash hit, Sonos’s replies sounded like a robot reading legal disclaimers: “Hello, fixing the app continues to be our top priority.";
  assertEquals(detectAttribution(e4)?.form, "mixed");
  // an attribution clause before the quotation is attributed speech, not narration
  assertEquals(detectAttribution("A Sonos spokesperson on Reddit with the username KeithFromSonos explained that \"No changes were made to the sound profile in the last firmware update.\"")?.form, "quoted_with_attribution");
  // a quoted term that closes mid-sentence is not a quotation (R55a)
  assertEquals(detectAttribution("They gambled that loyal customers would “deal with it” and moved on to the next launch."), null);
});
// ── R55a'' (2026-10-21): a quotation directly after an attributed quotation continues that speaker ───────────────────
Deno.test("R55a'': 4beedd7e's quotation follows Friend's attributed one with nothing between — the speaker carries", () => {
  const page = "The two platforms integrate with various data protection and backup providers.\n“This acquisition strengthens our position as the world’s leading pure-play cloud storage vendor,” David Friend, Wasabi Technologies’ co-founder and CEO, said in a statement . “Seagate has built a loyal enterprise customer base for Lyve Cloud storage, and we welcome those customers to Wasabi. We are focused on supporting their growth with our global network of data centers.”\nRelated Resources";
  const a = detectAttribution("“Seagate has built a loyal enterprise customer base for Lyve Cloud storage, and we welcome those customers to Wasabi.", page)!;
  assertEquals(a.form, "quotation_interior"); assertEquals(a.speaker_string, "David Friend, Wasabi Technologies’ co-founder and CEO");
  // narrator words between the two quotations stop the carry
  const page2 = page.replace("said in a statement . “Seagate", "said in a statement . Seagate became a shareholder after the deal. “Seagate");
  assertEquals(detectAttribution("“Seagate has built a loyal enterprise customer base for Lyve Cloud storage, and we welcome those customers to Wasabi.", page2), null);
});

// ── R55a''' (2026-10-21): a named subject + any verb + comma/colon opening a quotation is an attribution ─────────────
Deno.test("R55a''': 'the interim CEO confessed, “…”' and 'Sonos bragged, “…”' are quoted_with_attribution whatever the verb; a pronoun and a quoted term are not", () => {
  const a = detectAttribution("Even the interim CEO confessed, “We’ve let far too many people down.”")!;
  assertEquals(a.form, "quoted_with_attribution"); assertEquals(a.speaker_string, "the interim CEO");
  const b = detectAttribution("By October 2024, Sonos bragged, “We’ve restored 80% of the app’s features!”")!;
  assertEquals(b.form, "quoted_with_attribution"); assertEquals(b.speaker_string, "Sonos");
  // negative controls: a pronoun subject is not a named one; a quoted term mid-sentence is not a quotation opener after a verb + comma
  assertEquals(detectAttribution("It flashed, “error 1002” and quit.")?.form ?? null, null);
  assertEquals(detectAttribution("The reported metrics mark the completion of the “Quantum Memory” phase (Phase 1) of Riverlane’s multi-year QEC roadmap."), null);
});
