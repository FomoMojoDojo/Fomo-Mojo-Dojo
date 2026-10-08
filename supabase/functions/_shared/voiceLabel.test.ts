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
  assert(gpr.includes("const stampAndDecide = async (kind: Kind, p: Record<string, unknown>)") && gpr.includes("const stamped = stampFieldClasses(p, classByRef);"), "classes stamped from the returned citations, by the one helper the re-ask reuses");
  assert(gpr.includes("&& verdict.accept === true && classGateOk(kind, verdict)"), "the class gate refuses where grounding refuses");
  // the tightening (2026-10-07): (b) deterministic and FIRST, the judge only on the fields it failed
  // (b) runs inside stampAndDecide, which generate calls before returning and the re-ask calls on
  // its rewrite — so both answers are decided by the same rule, and neither reaches the judge first.
  assert(gpr.includes("classDecisions[kind] = decs;") && gpr.includes("await stampAndDecide(kind as Kind, p);"), "(b) runs at generate time, before any judge call");
  assert(gpr.includes("await stampAndDecide(kind as Kind, payload);"), "and again on the re-asked answer");
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

// ── SPECIFICS (signed 2026-10-08): the generator is TOLD the rule the gate enforces ─────────────
Deno.test("source guard: every GEN_* and the slots shorten instruction carry the SPECIFICS rule", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  // one block, defined once
  assert(gpr.includes("const SPECIFICS_RULE = `SPECIFICS."), "the rule is one shared block");
  assert(gpr.includes("A specific is a superlative, an exclusivity word, a figure, or a reach claim"), "the definition");
  assert(gpr.includes("Never strengthen a source: 'one of the only' stays 'one of the only'"), "rule (3), verbatim");
  assert(gpr.includes("and CITE THAT ROW"), "rule (1) requires the citation, not just the words");
  // referenced from ALL FOUR generator prompts — count the references, not just their presence
  const refs = gpr.split("${SPECIFICS_RULE}").length - 1;
  assertEquals(refs, 4, "GEN_POSITIONING, GEN_STRATEGY, GEN_PROMISE and GEN_OFFERING each reference it");
  for (const g of ["const GEN_POSITIONING", "const GEN_STRATEGY", "const GEN_PROMISE", "const GEN_OFFERING"]) {
    const at = gpr.indexOf(g);
    assert(at > 0, `${g} exists`);
    const block = gpr.slice(at, gpr.indexOf("`;", at));
    assert(block.includes("${SPECIFICS_RULE}"), `${g} references SPECIFICS`);
  }
  // the example names NO ref token: tokens are assigned per run, so a static "S4" would teach the
  // model to cite a number rather than a row
  assert(!/EXAMPLE[\s\S]{0,400}\[S\d/.test(gpr), "the example names no ledger token");
  // the slots writer carries the same rule, and no longer shows "the only X" as a thing to keep
  const slots = await read("../generate-read-slots/index.ts");
  assert(slots.includes("`SPECIFICS. A specific is a superlative, an exclusivity word, a figure, or a reach claim.\\n`"), "the slots instruction carries SPECIFICS");
  assert(slots.includes("Never strengthen one while shortening"), "and the no-strengthening rule");
  assert(slots.includes("Keep the SCOPE attached to the specific"), "and the scope rule — a cap must not strip what made it sourceable");
  assert(!slots.includes('for example "the only X"'), "the unconditional 'the only X' example is gone");
  // the re-ask exists, is bounded, and names the row that carries a refused specific
  assert(gpr.includes("reaskOnClassRefusal: async (kind, payload, verdict) =>"), "the bounded re-ask is wired");
  assert(gpr.includes("if (!classOnly) return null;"), "it declines anything that is not a class-only refusal");
  assert(gpr.includes("IS carried by"), "it names the row that carries a refused specific");
  assert(gpr.includes("deleting that claim instead of restating it is a WRONG answer"), "and forbids deletion when a row carries the claim");
  // `accept` is deliberately excluded from the class-only test
  assert(gpr.includes("NOTE on `accept`: it is deliberately NOT part of this test"), "the accept exclusion is recorded where it is made");
  // THE GATE IS UNCHANGED by this brief
  const gate = await read("./classFactCheck.ts");
  assert(gate.includes("export function decideFieldClass") && gate.includes("export function fieldClassOk"), "the gate still owns the decision");
  assert(!gate.includes("SPECIFICS_RULE"), "the prompt rule did not leak into the gate");
});

// ── BRIEF 2b (signed 2026-10-08): wider sourcing, and a PER-FIELD re-ask ────────────────────────
Deno.test("source guard: (b) searches the pool FIRST and the live record on a miss, admitting what it finds", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  // two passes, in that order, and the second only for what the first could not source
  assert(gpr.includes("// PASS 1 — the pool, as before"), "pass 1 is the pool");
  assert(gpr.includes("// PASS 2 (ruling 2026-10-08) — the LIVE RECORD, only for what the pool could not source"), "pass 2 is the live record");
  assert(gpr.includes('if (d.branch !== "judge_required") continue;'), "a field the pool settled is not searched again");
  assert(gpr.includes("await searchLiveRecordForSpecifics(supabase, company_id, specifics, alreadyCited)"), "the search runs over the company's live rows");
  // a hit is ADMITTED: ledger + citations + the judge's catalogue, not a silent justification
  assert(gpr.includes("const admitSourcingRow = (row: SourcingRow): string =>"), "admission is one function");
  for (const part of ["ledger.ids.push(row.id)", "(ledger.provenances as Record<string, string>)[row.id]", "(ledger.liveness as Record<string, string>)[row.id]", "(ledger.classes as Record<string, string>)[row.id] = row.cls", "validRefs.add(ref)", "CAT_LIVE +="]) {
    assert(gpr.includes(part), `admission writes ${part}`);
  }
  assert(gpr.includes("f.obj[f.citeKey] = [...cites, ref];"), "and the row joins the FIELD's own citations");
  assert(gpr.includes("decs[i] = decideOne(f);"), "the field is re-decided on the widened evidence");
  // the scope module keeps the public-only invariant: no organization-band row can be admitted
  const scope = await read("./classSourcingScope.ts");
  assert(scope.includes('.eq("signal_band", "outside")'), "outside band only — an organization row is internal provenance");
  assert(scope.includes('.is("superseded_at", null).is("held_at", null)'), "live only");
  assert(scope.includes("if (isAnalysisRow(s)) return null;"), "our own analysis can never be sourcing evidence");
  assert(scope.includes('.eq("claim_type", "own_words").eq("status", "active")'), "own-words rows need an ACTIVE own_words claim, the same authority the pool uses");
  assert(scope.includes("const hit = candidates.find((c) => specificIsSourced(sp, [c.text]));"), "the search uses the GATE's own test, not a second one");
});

Deno.test("source guard: the re-ask is PER FIELD — only the refused are rewritten, siblings byte-identical", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  assert(gpr.includes("// PER-FIELD RE-ASK (ruling 2026-10-08) — the slots pattern"), "the per-field re-ask is the slots pattern");
  assert(gpr.includes("const askedFields = refused.map((d) => d.field);"), "only the refused fields are asked for");
  assert(gpr.includes("ACCEPTED and must not be rewritten"), "and the prompt says so");
  assert(gpr.includes('{"fixes":{'), "the model returns a fixes map, not a whole read");
  // the splice writes into the SAME object the field came from: an untouched field cannot change
  assert(gpr.includes("if (f.textKey) f.obj[f.textKey] = fix.text;"), "a fix is spliced into its own field");
  assert(gpr.includes("if (spliced === 0) return null;"), "nothing usable back ⇒ reject as before, no blind retry");
  // one per field: the driver still allows exactly one re-ask per kind, and every refused field is
  // rewritten in that single call — so no field is ever re-asked twice
  const per = await read("./publicReadPerKind.ts");
  assert(per.includes("if (!reasked && deps.reaskOnClassRefusal) {") && per.includes("reasked = true; continue;"), "one re-ask round per kind");
});

Deno.test("source guard: the stage gate refuses an unsupported specific WITHOUT asking the judge", async () => {
  const gpr = await read("../generate-public-read/index.ts");
  assert(gpr.includes("// PASS 3 (ruling 2026-10-08) — THE STAGE GATE"), "pass 3 exists and says what it is");
  assert(gpr.includes("await specificsCarriedByOurOwnRows(supabase, company_id, specifics)"), "it asks whether one of OUR rows carries the specific");
  assert(gpr.includes('decs[i] = { ...d, branch: "unsupported", unsourced: unsupported };'), "and marks the field unsupported when none does");
  // an unsupported field is never put to the judge as a question
  assert(gpr.includes('const needJudgment = decs.filter((d) => d.branch === "judge_required");'), "only judge_required is asked");
  assert(gpr.includes("ALREADY REFUSED (specifics found nowhere in the company's record — context only, your answer cannot clear these)"), "unsupported fields go to the judge as context, not as a question");
  const gate = await read("./classFactCheck.ts");
  assert(gate.includes('if (d.branch === "unsupported") return false;'), "and fieldClassOk refuses it whatever the judge said");
  // the probe is OUR rows only — analysis signals and open findings
  const scope = await read("./classSourcingScope.ts");
  assert(scope.includes("if (!isAnalysisRow(r)) continue;                       // ours ONLY"), "the probe reads only our own signals");
  assert(scope.includes('.eq("status", "open")'), "and our open findings");
});

Deno.test("source guard: a source line is ordered on the RAW date, never the rendered segment", async () => {
  const prim = await read("../../../src/views/client/firstReadPreview/primitives.tsx");
  assert(prim.includes("const sortKey = (s: FRCommitmentSource): string => String(s.publishedAt ?? s.published ?? \"\");"), "the sort key is the raw date");
  assert(prim.includes("sortKey(b).localeCompare(sortKey(a))"), "and the order uses it");
  assert(!prim.includes('(b.published ?? "").localeCompare(a.published ?? "")'), "the display-string sort is gone");
  const loader = await read("../../../src/views/client/firstReadPreview/useFirstReadPreviewData.ts");
  assert(loader.includes("published: publishedSegment(raw), publishedAt: raw,"), "the loader carries the raw date through");
});
