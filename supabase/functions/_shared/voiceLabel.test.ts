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
    { id: "S-about", source_url: "https://edgewood.org/about/", source_title: null, voice_class: "client_voice", raw_payload: {} },
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
  const fn = prov.slice(prov.indexOf("function classifyVoice("), prov.indexOf("function classifyVoice(") + 700);
  assert(fn.indexOf("isAnalysisLabelled(entry)") < fn.indexOf("isCompanySource(entry, companyHost)"), "server: label first");
  const mirror = await read("../../../src/hooks/useSignalLandscape.ts");
  const mf = mirror.slice(mirror.indexOf("function classifyOutsideRow("), mirror.indexOf("function classifyOutsideRow(") + 700);
  assert(mf.indexOf("isAnalysisLabelled(row)") < mf.indexOf("isCompanySource(row, companyHost)"), "mirror: label first");
  const pb = await read("../public-baseline/index.ts");
  assert(pb.includes("const voice_class = isAnalysisLabelled(e)\n        ? ANALYSIS_VOICE\n        : isCompanyHostUrl(url)"), "ingest overlay: label first");
  const ow = await read("../extract-own-words/index.ts");
  assert(ow.includes("const byUrl = pickPageSignals(sigs);") && !ow.includes("if (!byUrl.has(s.source_url!)) byUrl.set("), "the extractor keys on the shared pick");
  const ep = await read("./evidencePhase1.ts");
  assert(ep.includes("allSignals.filter((row) => isClaimCandidateSignal(row as ClaimCandidateSignalRow))") && ep.includes("if (isAnalysisRow(row)) {"));
});
