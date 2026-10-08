// S1 (signed 2026-09-18) — the analysis label wins over the own-host test.
//
// Guards (each with a by-hand planted failure, reported):
//   (a) classifyVoice: an entry labelled 'analysis' with the company's own URL → 'analysis' (own-host rows keep
//       client_voice; a bucket=company_claim row keeps client_voice; the legacy null → outside fallback stays)
//   (b) the claim rebuild's candidate predicate mints nothing from a synthesis row under EITHER mark — the label,
//       or raw_payload.source_type='analysis' under a client_voice stamp (the 100 pre-D1 rows) — while a true
//       client_voice row and an outside row stay candidates
//   (c) the own-words "page signal" pick never selects a synthesis row: two client_voice rows on one URL, the
//       synthesis row listed first → the pick is the true page row; a URL with only a synthesis row gets no pick
// Source guards: the three deciders read the shared predicate before any URL test.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyVoice } from "./claimProvenance.ts";
import { isClaimCandidateSignal } from "./evidencePhase1.ts";
import { pickPageSignals } from "./ownWordsExtract.ts";
import { ANALYSIS_VOICE, isAnalysisLabelled, isAnalysisRow } from "./voiceLabel.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const HOST = "edgewood.org";

Deno.test("(a) classifyVoice: the analysis label wins over the own-host URL; other own-host rows are still client_voice", () => {
  assertEquals(classifyVoice({ voice_class: "analysis", url: "https://edgewood.org/" }, HOST), "analysis");
  assertEquals(classifyVoice({ voice_class: "analysis", url: "https://www.edgewood.org/about/", bucket: "company_claim" }, HOST), "analysis");
  assertEquals(classifyVoice({ voice_class: "outside_voice_about_client", url: "https://edgewood.org/" }, HOST), "client_voice", "a non-analysis label on the own host is still the company speaking");
  assertEquals(classifyVoice({ voice_class: "client_voice", url: "https://edgewood.org/" }, HOST), "client_voice");
  assertEquals(classifyVoice({ voice_class: "outside_voice_about_client", url: "https://sfexaminer.com/x" }, HOST), "outside_voice_about_client");
  assertEquals(classifyVoice({ url: "https://sfexaminer.com/x" }, HOST), "outside_voice_about_client", "legacy null → outside fallback unchanged");
  assertEquals(classifyVoice({ voice_class: "analysis", url: "https://sfexaminer.com/x" }, HOST), "analysis");
  assert(isAnalysisLabelled({ voice_class: " analysis " }) && !isAnalysisLabelled({ voice_class: "client_voice" }) && !isAnalysisLabelled(null));
  assertEquals(ANALYSIS_VOICE, "analysis");
});

Deno.test("(b) the rebuild mints nothing from a synthesis row under either mark; true client_voice and outside rows stay candidates", () => {
  // the 100 pre-D1 rows: marker present, stamp wrong
  const preD1 = { voice_class: "client_voice", source_type: "public_baseline_run", raw_payload: { hypothesis: "x", source_type: "analysis" } };
  assertEquals(isClaimCandidateSignal(preD1), false);
  // D1 rows: label present
  assertEquals(isClaimCandidateSignal({ voice_class: "analysis", source_type: "public_baseline_run", raw_payload: { hypothesis: "x", source_type: "analysis" } }), false);
  // OUR analysis by the one authority (mojo_analysis) still mints analytic claims
  assertEquals(isClaimCandidateSignal({ voice_class: "analysis", source_type: "mojo_analysis", raw_payload: {} }), true);
  // the non-empty side: a true client_voice page row and an outside row are candidates
  assertEquals(isClaimCandidateSignal({ voice_class: "client_voice", source_type: "public_baseline_run", raw_payload: { page_url: "https://edgewood.org/about/" } }), true);
  assertEquals(isClaimCandidateSignal({ voice_class: "outside_voice_about_client", source_type: "public_baseline_run", raw_payload: {} }), true);
  assertEquals(isClaimCandidateSignal({ voice_class: "competitor_voice", source_type: "public_baseline_run", raw_payload: {} }), false);
  assert(isAnalysisRow(preD1) && !isAnalysisRow({ voice_class: "client_voice", raw_payload: { page_url: "x" } }));
});

Deno.test("(c) the own-words page-signal pick never selects a synthesis row", () => {
  const url = "https://edgewood.org/";
  const rows = [
    { id: "S-analysis", source_url: url, source_title: "Edgewood public baseline", voice_class: "client_voice", raw_payload: { hypothesis: "x", source_type: "analysis" } },
    { id: "S-page", source_url: url, source_title: "Edgewood public baseline", voice_class: "client_voice", raw_payload: { page_url: url } },
    // S2: the pick admits PAGE-shaped rows only — the about row carries its page address
    { id: "S-about", source_url: "https://edgewood.org/about/", source_title: null, voice_class: "client_voice", raw_payload: { page_url: "https://edgewood.org/about/" } },
    { id: "S-only-analysis", source_url: "https://edgewood.org/programs/", source_title: null, voice_class: "analysis", raw_payload: { source_type: "analysis" } },
  ];
  const picked = pickPageSignals(rows);
  assertEquals(picked.get(url)?.id, "S-page", "the synthesis row listed first is skipped");
  assertEquals(picked.get("https://edgewood.org/about/")?.id, "S-about");
  assertEquals(picked.has("https://edgewood.org/programs/"), false, "a URL with only a synthesis row gets no page signal");
  assertEquals(picked.size, 2);
});

Deno.test("source guard: the three deciders read the shared predicate BEFORE any URL / bucket test; the extractor uses the pick", async () => {
  const prov = await read("./claimProvenance.ts");
  const fn = prov.slice(prov.indexOf("function classifyVoice("), prov.indexOf("function classifyVoice(") + 1200);
  // S2 (2026-09-18): the deciders now read isAnalysisRow (label, marker OR shape) — still before the host test.
  assert(fn.indexOf("isAnalysisRow(entry)") > 0 && fn.indexOf("isAnalysisRow(entry)") < fn.indexOf("isCompanySource(entry, companyHost)"), "server: analysis first");
  const mirror = await read("../../../src/hooks/useSignalLandscape.ts");
  const mf = mirror.slice(mirror.indexOf("function classifyOutsideRow("), mirror.indexOf("function classifyOutsideRow(") + 700);
  assert(mf.indexOf("isAnalysisRow(row)") > 0 && mf.indexOf("isAnalysisRow(row)") < mf.indexOf("isCompanySource(row, companyHost)"), "mirror: analysis first");
  const pb = await read("../public-baseline/index.ts");
  assert(pb.includes("const voice_class = isAnalysisLabelled(e)\n        ? ANALYSIS_VOICE\n        : isCompanyHostUrl(url)"), "ingest overlay: label first");
  const ow = await read("../extract-own-words/index.ts");
  assert(ow.includes("const byUrl = pickPageSignals(sigs);") && !ow.includes("if (!byUrl.has(s.source_url!)) byUrl.set("), "the extractor keys on the shared pick");
  const ep = await read("./evidencePhase1.ts");
  assert(ep.includes("allSignals.filter((row) => isClaimCandidateSignal(row as ClaimCandidateSignalRow))") && ep.includes("if (isAnalysisRow(row)) {"));
});

// ── 1a-4 (signed 2026-10-07): the class clause reached both prompt sites ─────────────────────────
Deno.test("source guard: CITE_RULE carries the S1 class clause and judgeSysFor carries (e) CLASS", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  // S1, verbatim as signed
  assert(gpr.includes("Each ledger line names its SOURCE CLASS after its kind: the record (outside voices, filings), you (the company's own site and own words), or our read (our analysis of the record)."), "S1 opening, verbatim");
  assert(gpr.includes("A line you write may assert only as much as the weakest class it cites."), "S1 weakest-wins sentence");
  assert(gpr.includes("but a line resting on our read is written as our reading ('we read you as…'), never as an established fact."), "S1 closing, verbatim");
  assert(gpr.indexOf("Each ledger line names its SOURCE CLASS") > gpr.indexOf("const CITE_RULE ="), "S1 sits inside CITE_RULE");
  // S2, verbatim as signed, as check (e)
  assert(gpr.includes("(e) CLASS — each field names its source class."), "(e) CLASS");
  assert(gpr.includes("A field of class 'our_read' must read as an openly-held reading, never as an established fact."), "S2 our_read sentence");
  assert(gpr.includes("Set class_ok:false on any field that asserts more than its class allows, naming the words that do it."), "S2 closing");
  // the offering clause moved to (f)-(i) so (e) could be CLASS; its four checks are intact
  assert(gpr.includes("(f)–(i) OFFERING") && gpr.includes("(f) ENUMERABLE") && gpr.includes("(g) ENTITY ATTRIBUTION") && gpr.includes("(h) DOUBTS-PLACED") && gpr.includes("(i) BANNED-VOCAB"), "offering clause relettered, all four checks kept");
  assert(!gpr.includes("(e)–(h) OFFERING"), "the old offering lettering is gone");
  // the class is COMPUTED, never asked of the model: no generator prompt mentions a class field
  assert(!gpr.includes('"market_category_class"'), "the model is never asked for a class");
  assert(gpr.includes("const stamped = stampFieldClasses(p, classByRef);") && gpr.includes("fieldClasses[kind as Kind] = stamped;"), "classes stamped from the returned citations");
  assert(gpr.includes("&& verdict.accept === true && classGateOk(kind, verdict)"), "the class gate refuses where grounding refuses");
  // the tightening (2026-10-07): (b) deterministic and FIRST, the judge only on the fields it failed
  assert(gpr.includes("classDecisions[kind as Kind] = stamped.map((f) =>"), "(b) runs at generate time, before any judge call");
  assert(gpr.includes('const needJudgment = decs.filter((d) => d.branch === "judge_required");'), "only unsourced fields are put to the judge");
  assert(gpr.includes("A sentence that states a superlative, figure or exclusivity as fact is NOT an openly-held reading, whatever its citations say."), "the ordered judge sentence, verbatim");
  const gpg = await read("./publicReadGuards.ts");
  assert(!gpg.includes("export function classOkFromVerdict"), "the judge-alone roll-up is gone — one authority on the class rule");
  // the verbatim authority is REUSED, never re-implemented
  const cfc = await read("./classFactCheck.ts");
  assert(cfc.includes('import { verbatimProvable } from "./ownWordsExtract.ts";'), "classFactCheck reuses the Sep-18 verbatim guard");
  assert(!/function\s+verbatimProvable/.test(cfc), "and does not re-implement it");
  // the same function decides a SLOT line
  const slots2 = await read("../generate-read-slots/index.ts");
  assert(slots2.includes('import { decideFieldClass, fieldClassOk, type FieldClassDecision } from "../_shared/classFactCheck.ts";'), "slots use the same class function");
  assert(slots2.includes("entry.class_ok = fieldClassOk(d, entry.class_ok === true);"), "slot class_ok combines (b) with the judge");
  // the slots judge asks the same question
  const slots = await read("../generate-read-slots/index.ts");
  assert(slots.includes(") CLASS — each slot names its source class."), "the slots judge judges class too");
  assert(slots.includes('"class_ok":true|false,"accept":true|false'), "the slots verdict carries class_ok");
});
