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
