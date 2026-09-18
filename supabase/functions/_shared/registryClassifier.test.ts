// Registry classifier (C1, 2026-09-17) — the page × section → class matrix on REAL stored Edgewood
// snapshots (fixtures/registry/*_edgewood*, copied verbatim from outside_page_snapshots 2026-09-14) plus two
// shaped fixtures: a live-shaped Charity Navigator page (the stored CN snapshot's clean_text is Elementor JSON,
// so the Mission/Beacon markers come from the live page read on 2026-09-17) and a foundation-shaped ProPublica
// page (990-PF; no Mithun registry snapshot is stored). Every class is reached at least once. Plus: fail-closed
// page defaults, URL rules, the mixed flag, the ingest stamp, the authorship-gate skip, the recurrence and
// own-words exclusions (each shown red when bypassed), and the source guard (no model, no network in the module).
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CN_DERIVED_METRIC_MARKERS, CN_RATING_MARKERS, CN_SELF_REPORTED_OPEN, GUIDESTAR_SELF_REPORTED_MARKER,
  MIN_SECTION_SCORE, PAGE_DEFAULT_CLASS, PROPUBLICA_MARKERS, REGISTRY_PATTERNS, markerlessClass,
  classifyRegistryRow, excludeRegistryFromOwnWords, isFilingClassRow, isRegistryUrl, ldPageHint, matchRegistryUrl,
  registryStamp, sectionSpans,
} from "./registryClassifier.ts";
import { registryUrlsInResult, stampRegistryInResult } from "./registryIngest.ts";
import { applyAuthorshipToEntries } from "./aggregatorAuthorship.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const snap = async (name: string) => ({
  clean_text: await read(`./fixtures/registry/${name}.txt`),
  structured: JSON.parse(await read(`./fixtures/registry/${name}.ld.json`).catch(() => '{"ld_json":[]}')),
});

const PP = "https://projects.propublica.org/nonprofits/organizations/941186168";
const GS = "https://www.guidestar.org/profile/94-1186168";
const CN = "https://www.charitynavigator.org/ein/941186168";
const ART = "https://www.propublica.org/article/uncommon-contract-holds-promise-california-group-homes-too-familiar-ills";

// The 21 Edgewood rows' texts (signals.claim_text, verbatim) — the re-class data act's expected outcomes.
const ROWS = {
  pp_filing_5fb27b85: "FY2024 990: Revenue $31,008,000; Expenses $26,697,319; Net Income $4,310,681; Net Assets -$2,098,877. Prior year (FY2023) ran a net loss of -$1,867,681.",
  pp_filing_23dd1f5e: "FY2023 net loss of -$1.87M; FY2024 net income of +$4.3M but cumulative negative net assets of -$2.1M indicate structural balance sheet weakness despite revenue recovery.",
  pp_filing_d93d25bd: "Most recent 990 filed May 2025: Revenue $57,009,649; Expenses $28,097,897; Net Income $28,911,752. Prior year revenue $31,008,000. EIN 94-1186168.",
  pp_meta_49bd7bd7: "ProPublica Nonprofit Explorer: EIN 941186168, designated 501(c)(3), NTEE category Mental Health Crisis Intervention/Group Home/Residential Treatment; Form 990s available for download.",
  pp_meta_e5144ff5: "501(c)(3) EIN confirmed; NTEE code: Mental Health / Crisis Intervention / Residential Treatment; 990 filings available 2001-present - public accountability record intact",
  pp_meta_eaf8434e: "501(c)(3) EIN 94-1186168; NTEE category: Mental Health, Crisis Intervention / Group Home, Residential Treatment Facility - Mental Health Related; IRS 990 filings publicly available from 2001 forward.",
  gs_self_e756386d: "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area; opened 2014 in conjunction with SF Department of Public Health.",
  gs_self_8ed60855: "GuideStar/Candid profile confirms CSU created in conjunction with SF Dept of Public Health; only CSU serving youth under 12 in the Bay Area; accepts Kaiser, most private insurance, and Medi-Cal of San Francisco.",
  gs_self_34405b08: "GuideStar/Candid profile confirms CSU created with SF DPH; accepts Kaiser and most private insurances and Medi-Cal SF; only CSU serving youth under 12 in Bay Area.",
  gs_self_a94f1427: "GuideStar/Candid profile (EIN 94-1186168) lists Edgewood as serving SF and San Mateo counties; Drop-in Centers in San Bruno and Redwood City; CSU created in conjunction with SF DPH; accepts Kaiser and most private insurances.",
  gs_mixed_ba7ee838: "GuideStar/Candid profile; EIN 94-1186168; CSU 'one of only a few CSUs designed to serve youth 5-17 in all of California and the only one serving youth under 12 in the Bay Area'; IRS Category: Mental Health, Crisis Intervention / Group Home, Residential Treatment Facility.",
  cn_rating_8eeaf11f: "4/4 Star rating; 84.07% program expense ratio; 100% independent board - strong accountability and financial governance",
  cn_rating_c57ba124: "Edgewood Center for Children and Families has earned a 4/4 Star rating on Charity Navigator, indicating solid performance in accountability, finance, and leadership.",
  cn_mixed_913ff9a5: "4/4 Star Charity Navigator rating; 84.07% program expense ratio; 100% independent board; mission: 'to be the place to begin for all Bay Area children, youth and families who need mental health, social services and academic support.'",
  art_ccd23dc2: "Workers cited 'notoriously high turnover rate' and wages below comparable SF nonprofits as reasons to unionize; multiple workers reported being injured on the job without adequate compensation.",
};

// ── URL rules ────────────────────────────────────────────────────────────────────────────────────
Deno.test("REGISTRY_PATTERNS: host × path → page type; non-registry and unknown-shape URLs are null", () => {
  assertEquals(matchRegistryUrl(PP)?.page_type, "filing_data");
  assertEquals(matchRegistryUrl(ART)?.page_type, "journalism");
  assertEquals(matchRegistryUrl(GS)?.page_type, "profile");
  assertEquals(matchRegistryUrl("https://www.candid.org/profile/94-1186168")?.page_type, "profile");
  assertEquals(matchRegistryUrl(CN)?.page_type, "rating");
  assertEquals(matchRegistryUrl("https://www.causeiq.com/organizations/edgewood-center-for-children-and-families,941186168/")?.page_type, "filing_data");
  assertEquals(matchRegistryUrl("https://www.propublica.org/"), null);                       // newsroom home: no rule
  assertEquals(matchRegistryUrl("https://www.guidestar.org/search?q=edgewood"), null);       // search page: no rule
  assertEquals(matchRegistryUrl("https://www.charitynavigator.org/"), null);
  assertEquals(matchRegistryUrl("https://edgewood.org/about"), null);
  assertEquals(matchRegistryUrl("not a url"), null);
  assert(REGISTRY_PATTERNS.every((r) => !/grantmakers/i.test(r.host.source)), "grantmakers.io stays out until a shape is verified");
  assert(isRegistryUrl(ART) && !isRegistryUrl("https://edgewood.org/"));
});

// ── ProPublica (real Edgewood snapshot) ─────────────────────────────────────────────────────────
Deno.test("ProPublica org page: ld_json Dataset → filing_data; Fiscal Year blocks are filing; Organization summary is registry_meta", async () => {
  const s = await snap("propublica_edgewood");
  assertEquals(ldPageHint(s.structured), "filing_data");
  const spans = sectionSpans("filing_data", s.clean_text);
  assert(spans.some((x) => x.section === "org_summary" && x.text.includes(PROPUBLICA_MARKERS.org_summary[0])));
  assert(spans.filter((x) => x.section === "filing_data").length >= 2, "one span per Fiscal Year Ending block");
  for (const k of ["pp_filing_5fb27b85", "pp_filing_23dd1f5e", "pp_filing_d93d25bd"] as const) {
    const c = classifyRegistryRow({ url: PP, text: ROWS[k], snapshot: s })!;
    assertEquals([c.section, c.class, c.host_rule], ["filing_data", "filing", "propublica_nonprofit_organization"], k);
    assertEquals(registryStamp(c), { evidence_class: "filing", voice_class: "client_voice" });
  }
  for (const k of ["pp_meta_49bd7bd7", "pp_meta_e5144ff5", "pp_meta_eaf8434e"] as const) {
    const c = classifyRegistryRow({ url: PP, text: ROWS[k], snapshot: s })!;
    assertEquals([c.section, c.class], ["org_summary", "registry_meta"], k);
    assertEquals(registryStamp(c), { evidence_class: "prose", voice_class: "outside_voice_about_client" });
  }
});

Deno.test("ProPublica foundation-shaped page (990-PF): same markers, same classes — filing vs registry_meta", async () => {
  const text = await read("./fixtures/registry/propublica_foundation_shaped.txt");
  const url = "https://projects.propublica.org/nonprofits/organizations/910000000";
  const filing = classifyRegistryRow({ url, text: "FY2024 990-PF: Total Revenue $412,300; Total Expenses $298,115; Net Income $114,185; Net Assets $6,812,440; grants paid $241,000.", snapshot: { clean_text: text } })!;
  assertEquals([filing.section, filing.class], ["filing_data", "filing"]);
  const meta = classifyRegistryRow({ url, text: "EIN 91-0000000, designated 501(c)(3); NTEE category Philanthropy, Voluntarism and Grantmaking Foundations / Private Grantmaking Foundations.", snapshot: { clean_text: text } })!;
  assertEquals([meta.section, meta.class], ["org_summary", "registry_meta"]);
});

// ── GuideStar (real Edgewood snapshot) ──────────────────────────────────────────────────────────
Deno.test("GuideStar: text under 'SOURCE: Self-reported by organization' is self_reported (filing / client_voice); the mixed row is flagged", async () => {
  const s = await snap("guidestar_edgewood");
  assertEquals(ldPageHint(s.structured), null); // GuideStar ships no ld_json — the marker decides
  const spans = sectionSpans("profile", s.clean_text);
  const self = spans.filter((x) => x.section === "self_reported");
  assert(self.length >= 5, `six marker blocks expected on the page, got ${self.length}`);
  // every self_reported block carries the marker — except the Mission block (C2: heading-bound, no marker)
  assert(self.every((x) => x.text.includes(GUIDESTAR_SELF_REPORTED_MARKER) || x.text.startsWith("Mission\n")));
  assert(self.some((x) => x.text.startsWith("Our programs")), "the heading before the marker names the block");
  // C2: the Mission heading block is the organization's own words → self_reported (ruling 2026-09-17)
  assert(spans.some((x) => x.section === "self_reported" && x.text.startsWith("Mission\nWe provide the people, place, and path")), "the Mission block is self_reported");
  assert(!spans.some((x) => x.section === "profile_meta" && x.text.startsWith("Mission")));
  const mission = classifyRegistryRow({ url: GS, text: "Mission: we provide the people, place, and path for exceptional youth mental healthcare.", snapshot: s })!;
  assertEquals([mission.section, mission.class], ["self_reported", "self_reported"]);
  for (const k of ["gs_self_e756386d", "gs_self_8ed60855", "gs_self_34405b08", "gs_self_a94f1427"] as const) {
    const c = classifyRegistryRow({ url: GS, text: ROWS[k], snapshot: s })!;
    assertEquals([c.section, c.class, c.basis.mixed], ["self_reported", "self_reported", false], k);
    assertEquals(registryStamp(c), { evidence_class: "filing", voice_class: "client_voice" });
  }
  // ba7ee838 (EIN / IRS-category tokens beside the CSU sentence): self_reported 14 vs profile_meta 6 — under C1 the
  // runner-up scored 7 (the Mission line's "mental health" tokens sat in profile_meta) and the row was flagged mixed;
  // with the Mission block self_reported (C2) it is 6, under the half-of-winner threshold. Class unchanged either way.
  const mixed = classifyRegistryRow({ url: GS, text: ROWS.gs_mixed_ba7ee838, snapshot: s })!;
  assertEquals([mixed.section, mixed.class, mixed.basis.mixed], ["self_reported", "self_reported", false]);
  assertEquals(mixed.basis.scores.map((x) => `${x.section}:${x.score}`), ["self_reported:14", "profile_meta:6"]);
});

// ── Charity Navigator ───────────────────────────────────────────────────────────────────────────
Deno.test("CN stored snapshot (Elementor JSON, no readable sections): ld_json Review → rating page default for every row", async () => {
  const s = await snap("charitynavigator_edgewood_stored");
  assertEquals(ldPageHint(s.structured), "rating");
  const spans = sectionSpans("rating", s.clean_text);
  assert(spans.every((x) => x.section === "profile_meta"), "no marker matched in the stored text");
  // C3a fold 2026-09-18: a markerless snapshot that names itself (ld_json Review) takes the hint's class — rating
  for (const k of ["cn_rating_8eeaf11f", "cn_rating_c57ba124", "cn_mixed_913ff9a5"] as const) {
    const c = classifyRegistryRow({ url: CN, text: ROWS[k], snapshot: s })!;
    assertEquals([c.section, c.class, c.basis.ld_hint], ["page_default", "rating", "rating"], k);
    assertEquals(registryStamp(c), { evidence_class: "prose", voice_class: "outside_voice_about_client" });
  }
});

Deno.test("CN live-shaped page: Mission→Vision→Goals is self_reported; beacons are rating; Financial Health metrics are derived_metric", async () => {
  const text = await read("./fixtures/registry/charitynavigator_live_shaped.txt");
  const spans = sectionSpans("rating", text);
  assert(spans.some((x) => x.section === "self_reported" && x.text.startsWith(CN_SELF_REPORTED_OPEN[0]) && x.text.includes("Goals")));
  assert(spans.some((x) => x.section === "rating" && CN_RATING_MARKERS.some((m) => x.text.includes(m))));
  assert(spans.some((x) => x.section === "derived_metric" && CN_DERIVED_METRIC_MARKERS.some((m) => x.text.includes(m))));
  const mission = classifyRegistryRow({ url: CN, text: "mission: 'to be the place to begin for all Bay Area children, youth and families who need mental health, social services and academic support.'", snapshot: { clean_text: text } })!;
  assertEquals([mission.section, mission.class], ["self_reported", "self_reported"]);
  const metric = classifyRegistryRow({ url: CN, text: "84.07% program expense ratio; 100% independent board members; liabilities to assets and working capital ratio scored", snapshot: { clean_text: text } })!;
  assertEquals([metric.section, metric.class], ["derived_metric", "derived_metric"]);
  const rating = classifyRegistryRow({ url: CN, text: "Three-Star Charity; beacon report: Accountability & Finance, Impact & Measurement, Leadership & Planning, Culture & Compensation", snapshot: { clean_text: text } })!;
  assertEquals([rating.section, rating.class], ["rating", "rating"]);
  // the mixed CN row (913ff9a5): rating tokens AND the mission quote — flagged, dominant section reported
  const mixed = classifyRegistryRow({ url: CN, text: ROWS.cn_mixed_913ff9a5, snapshot: { clean_text: text } })!;
  assert(mixed.basis.mixed, "rating + mission text is a mixed row");
});

// ── Journalism + fail-closed defaults ───────────────────────────────────────────────────────────
Deno.test("journalism: propublica.org/article/… is journalism (stamp null — the model's label stands)", () => {
  const c = classifyRegistryRow({ url: ART, text: ROWS.art_ccd23dc2, snapshot: null })!;
  assertEquals([c.page_type, c.section, c.class], ["journalism", "article", "journalism"]);
  assertEquals(registryStamp(c), null);
});
Deno.test("no matched marker, NO hint → registry_meta / outside voice on EVERY page type (never filing or self_reported by page type); one incidental token never places a row", async () => {
  assertEquals(classifyRegistryRow({ url: PP, text: ROWS.pp_meta_49bd7bd7, snapshot: null })!.class, "registry_meta");
  assertEquals(classifyRegistryRow({ url: GS, text: "anything", snapshot: null })!.class, "registry_meta");
  assertEquals(classifyRegistryRow({ url: CN, text: "anything", snapshot: null })!.class, "registry_meta");
  // Mithun's CauseIQ row: the 207-char lane text, structured null → no hint → registry_meta
  const mithun = classifyRegistryRow({ url: "https://www.causeiq.com/organizations/the-john-c-mithun-foundation,454228213/", text: "The John C Mithun Foundation. Santa Barbara, CA. EIN 45-4228213. Listed in Cause IQ nonprofit directory.", snapshot: { clean_text: "The John C Mithun Foundation | Cause IQ\nSanta Barbara, CA\nEIN 45-4228213", structured: null } })!;
  assertEquals([mithun.section, mithun.class, mithun.basis.ld_hint], ["page_default", "registry_meta", null]);
  assertEquals(PAGE_DEFAULT_CLASS, { filing_data: "registry_meta", profile: "registry_meta", rating: "registry_meta", journalism: "journalism" });
  // C3a fold: with a hint the markerless default is the hint's class — Review → rating; Dataset → filing_data's page
  // default (registry_meta); never filing / self_reported
  assertEquals(markerlessClass(null), "registry_meta");
  assertEquals(markerlessClass("rating"), "rating");
  assertEquals(markerlessClass("filing_data"), "registry_meta");
  const ds = classifyRegistryRow({ url: PP, text: "anything", snapshot: { clean_text: "nothing readable here", structured: { ld_json: [{ "@type": "Dataset" }] } } })!;
  assertEquals([ds.section, ds.class, ds.basis.ld_hint], ["page_default", "registry_meta", "filing_data"]);
  const rv = classifyRegistryRow({ url: CN, text: "anything", snapshot: { clean_text: "nothing readable here", structured: { ld_json: [{ "@type": "Review" }] } } })!;
  assertEquals([rv.section, rv.class], ["page_default", "rating"]);
  assertEquals(registryStamp(rv), { evidence_class: "prose", voice_class: "outside_voice_about_client" });
  for (const url of [PP, GS, CN]) assertEquals(registryStamp(classifyRegistryRow({ url, text: "x", snapshot: null })!), { evidence_class: "prose", voice_class: "outside_voice_about_client" });
  const s = await snap("propublica_edgewood");
  const one = classifyRegistryRow({ url: PP, text: "audits", snapshot: s })!; // a single word present in the boilerplate
  assert(one.basis.scores[0].score < MIN_SECTION_SCORE && one.section === "page_default" && one.class === "registry_meta");
  assertEquals(classifyRegistryRow({ url: "https://edgewood.org/", text: "x", snapshot: null }), null);
});

// ── Ingest stamp + authorship-gate skip ─────────────────────────────────────────────────────────
Deno.test("stampRegistryInResult: registry items carry `registry`; filing/self_reported override the model's voice; journalism untouched; non-registry untouched", async () => {
  const gs = await snap("guidestar_edgewood");
  const pp = await snap("propublica_edgewood");
  const result = {
    outside_voice_signals: [
      { url: GS, signal: ROWS.gs_self_e756386d, voice_class: "outside_voice_about_client" },
      { url: PP, signal: ROWS.pp_meta_49bd7bd7, voice_class: "client_voice" },   // the model got it backwards; the registry decides
      { url: ART, signal: ROWS.art_ccd23dc2, voice_class: "outside_voice_about_client" },
      { url: "https://www.yelp.com/biz/edgewood-san-francisco-2", signal: "3.7 stars", voice_class: "outside_voice_about_client" },
    ],
    evidence_ledger: [{ url: PP, snippet: ROWS.pp_filing_5fb27b85, bucket: "financial_signal", voice_class: "outside_voice_about_client" }],
  };
  assertEquals(registryUrlsInResult(result).sort(), [PP, GS, ART].sort());
  const snaps = new Map([[GS, gs], [PP, pp]]);
  const { result: out, stats } = stampRegistryInResult(result, (u) => snaps.get(u) ?? null);
  const ovs = out.outside_voice_signals as Array<Record<string, unknown>>;
  assertEquals([ovs[0].voice_class, ovs[0].evidence_class, (ovs[0].registry as { class: string }).class], ["client_voice", "filing", "self_reported"]);
  assertEquals([ovs[1].voice_class, ovs[1].evidence_class, (ovs[1].registry as { class: string }).class], ["outside_voice_about_client", "prose", "registry_meta"]);
  assertEquals([ovs[2].voice_class, ovs[2].evidence_class, (ovs[2].registry as { class: string }).class], ["outside_voice_about_client", undefined, "journalism"]);
  assertEquals([ovs[3].voice_class, ovs[3].registry], ["outside_voice_about_client", undefined]);
  const led = out.evidence_ledger as Array<Record<string, unknown>>;
  assertEquals([led[0].voice_class, led[0].evidence_class], ["client_voice", "filing"]);
  assertEquals(stats, { considered: 5, registry: 4, stamped_filing: 2, stamped_outside: 1, journalism: 1, page_default: 0, mixed: 0 });
});

Deno.test("authorship gate: a classified registry item is never sent to the judge (registry_skipped), an unclassified aggregator item still is", async () => {
  const judged: string[] = [];
  const judge = (i: { url: string }) => { judged.push(i.url); return Promise.resolve({ verdict: "subject_company" as const, entity: null, reason: "r", model: "m" }); };
  const entries = [
    { url: GS, text: ROWS.gs_self_e756386d, voice_class: "client_voice", registry: { class: "self_reported" } },
    { url: "https://www.linkedin.com/company/edgewoodcenter", text: "Edgewood is a nonprofit provider", voice_class: "outside_voice_about_client" },
  ];
  const { entries: out, stats } = await applyAuthorshipToEntries(entries, { subjectName: "Edgewood", subjectHost: "edgewood.org", getText: (e) => e.text, judge });
  assertEquals(judged, ["https://www.linkedin.com/company/edgewoodcenter"]);
  assertEquals([stats.registry_skipped, stats.gated, stats.judged], [1, 1, 1]);
  assertEquals(out[0].voice_class, "client_voice");
  assert(!("authorship_judge" in out[0]), "a classified row carries no judge stamp");
});

// ── Exclusions (each rail shown red when bypassed) ──────────────────────────────────────────────
const CORPUS = [
  { id: "own", source_url: "https://edgewood.org/about", voice_class: "client_voice", evidence_class: "prose" },
  { id: "gs", source_url: GS, voice_class: "client_voice", evidence_class: "filing" },           // re-classed self-reported
  { id: "pp", source_url: PP, voice_class: "outside_voice_about_client", evidence_class: "prose" }, // registry_meta, still a registry host
  { id: "art", source_url: ART, voice_class: "outside_voice_about_client", evidence_class: "prose" },
];
Deno.test("own-words corpus: every registry host is excluded regardless of voice_class (fail closed) — bypass keeps the GuideStar row", () => {
  const { kept, excluded } = excludeRegistryFromOwnWords(CORPUS);
  assertEquals(kept.map((s) => s.id), ["own"]);
  assertEquals(excluded.map((s) => s.id), ["gs", "pp", "art"]);
  // RED when bypassed: the pre-C1 corpus rule (voice_class === client_voice only) keeps the GuideStar row.
  const bypass = CORPUS.filter((s) => s.voice_class === "client_voice").map((s) => s.id);
  assert(bypass.includes("gs"), "without the rail the registry self-reported row would be minted as own words");
});
Deno.test("recurrence / provenance: isFilingClassRow excludes a filing row like own-domain; prose registry rows still count", () => {
  assert(isFilingClassRow({ evidence_class: "filing" }));
  assert(!isFilingClassRow({ evidence_class: "prose" }) && !isFilingClassRow({}) && !isFilingClassRow(null));
  const eligible = CORPUS.filter((s) => !isFilingClassRow(s)).map((s) => s.id);
  assertEquals(eligible, ["own", "pp", "art"]);
  const bypass = CORPUS.map((s) => s.id);
  assert(bypass.includes("gs"), "without the rail the filing row would inflate a finding's host count");
});

// ── Source guards ───────────────────────────────────────────────────────────────────────────────
Deno.test("source guard: the classifier module calls no model and no network; the wiring sites are in place", async () => {
  const mod = await read("./registryClassifier.ts");
  for (const bad of [/fetch\(/, /ollama/i, /openai/i, /anthropic/i, /callModel/, /judge\(/, /Deno\./, /supabase/i]) {
    assert(!bad.test(mod), `registryClassifier.ts must not contain ${bad}`);
  }
  const ingest = await read("./registryIngest.ts");
  assert(!/fetch\(|ollama|openai/i.test(ingest));
  const pb = await read("../public-baseline/index.ts");
  const stampAt = pb.indexOf("stampRegistryInResult(");
  const gateAt = pb.indexOf("demoteAggregatorSelfVoiceInResult(result");
  const overlayAt = pb.indexOf("const reclassify = (arr: unknown)");
  assert(stampAt > 0 && gateAt > 0 && overlayAt > 0);
  assert(overlayAt < stampAt && stampAt < gateAt, "override runs after the voice overlay and before the authorship judge");
  assertStringIncludes(pb, '"propublica.org", "candid.org", "causeiq.com", "grantmakers.io"]');
  const agg = await read("./aggregatorAuthorship.ts");
  assertStringIncludes(agg, "registry_skipped++");
  const rec = await read("./signalRecurrence.ts");
  assertStringIncludes(rec, "if (isFilingClassRow(row)) continue;");
  const ow = await read("../extract-own-words/index.ts");
  // C3b (2026-09-18): the blanket exclusion became the partition — site pages untouched, a registry URL admitted only by
  // the self_reported-span rule (registryOwnWords.ts); everything else on a registry host still fails closed.
  assertStringIncludes(ow, "partitionOwnWordsCorpus(sigsAll.filter((s) => !isRegistryUrl(s.source_url) || !s.superseded_at), isRegistryUrl)");
  const prov = await read("./claimProvenance.ts");
  assertStringIncludes(prov, 'if (String(entry?.evidence_class || "") === "filing") return true;');
  const phase1 = await read("./evidencePhase1.ts");
  assertStringIncludes(phase1, 'evidence_class: signal.evidence_class === "filing" ? "filing" : "prose",'); // explicit on EVERY row (bulk-insert NULL trap)
});

// ── Real-path bypass proofs (the function, not the predicate) ───────────────────────────────────
import { computeRecurrenceForCompany } from "./signalRecurrence.ts";
import { classifyVoice } from "./claimProvenance.ts";
import { fakeDb } from "./fakeSupabaseForTests.ts";

const CO = "co-registry";
const SIG = (id: string, url: string, voice: string, evidence_class: string, claim_text: string) =>
  ({ id, company_id: CO, signal_band: "outside", source_url: url, voice_class: voice, evidence_class, claim_text, syndicated_from_client: false, superseded_at: null, held_at: null });

Deno.test("recurrence (real path): a filing-class GuideStar row is not an eligible signal; the same row as prose would be", async () => {
  const rows = [
    SIG("s-own", "https://edgewood.org/about", "client_voice", "prose", "Edgewood provides youth mental health care in San Francisco"),
    SIG("s-gs", GS, "client_voice", "filing", "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area"),
    SIG("s-yelp", "https://www.yelp.com/biz/edgewood-san-francisco-2", "outside_voice_about_client", "prose", "The only crisis stabilization unit for kids under 12 in the Bay Area, run by Edgewood"),
    SIG("s-cn", CN, "outside_voice_about_client", "prose", "4/4 star rating; 84.07% program expense ratio"),
  ];
  const db = () => fakeDb({ companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org" }], signals: rows.map((r) => ({ ...r })), signal_recurrence_verdicts: [] });
  const railed = await computeRecurrenceForCompany({ supabase: db(), companyId: CO, ollamaUrl: "", nowIso: "2026-09-17T00:00:00Z", write: false, plan: true });
  assert(railed.ok && "eligible_signals" in railed);
  assertEquals(railed.eligible_signals, 2, "own-domain out, filing out: yelp + cn remain");
  assert(!railed.pairs.some((p) => p.signal_a_id === "s-gs" || p.signal_b_id === "s-gs"), "no candidate pair may touch the filing row");
  // BYPASS (the same rows with the class flipped to prose): the GuideStar row is eligible and pairs with Yelp —
  // exactly the host-count inflation the rail prevents.
  const bypassDb = fakeDb({ companies: [{ id: CO, name: "Edgewood", website: "https://edgewood.org" }], signals: rows.map((r) => ({ ...r, evidence_class: "prose" })), signal_recurrence_verdicts: [] });
  const bypass = await computeRecurrenceForCompany({ supabase: bypassDb, companyId: CO, ollamaUrl: "", nowIso: "2026-09-17T00:00:00Z", write: false, plan: true });
  assert(bypass.ok && "eligible_signals" in bypass);
  assertEquals(bypass.eligible_signals, 3);
  assert(bypass.pairs.some((p) => p.signal_a_id === "s-gs" || p.signal_b_id === "s-gs"), "bypassed, the filing row would pair (and count as a host)");
});

Deno.test("provenance (real path): classifyVoice treats a filing-class item as client_voice whatever the label; prose registry items keep the model's label", () => {
  assertEquals(classifyVoice({ url: GS, voice_class: "outside_voice_about_client", evidence_class: "filing" }, "edgewood.org"), "client_voice");
  assertEquals(classifyVoice({ url: PP, voice_class: "outside_voice_about_client", evidence_class: "filing" }, "edgewood.org"), "client_voice");
  assertEquals(classifyVoice({ url: CN, voice_class: "outside_voice_about_client", evidence_class: "prose" }, "edgewood.org"), "outside_voice_about_client");
  // BYPASS: the same item without the class (pre-C1 shape) is an independent outside voice → corroboration leak.
  assertEquals(classifyVoice({ url: GS, voice_class: "outside_voice_about_client" }, "edgewood.org"), "outside_voice_about_client");
});
