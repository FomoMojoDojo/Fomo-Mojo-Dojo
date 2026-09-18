// C3a (ruling 2026-09-18) — span table with offsets + fiscal year per filing row. Real Edgewood snapshots
// (fixtures/registry/*_edgewood.txt = outside_page_snapshots.clean_text read 2026-09-14; the DB row's
// text_sha256 is sha256(normalizeForHash(clean_text)) = 81923a7a… / 7905f8a4…).
//
// Scenarios:
//   GuideStar / ProPublica: every span's offsets reproduce its text byte-exactly from the raw page (30/30, 6/6);
//     the persisted table is the spans minus text, keyed by the snapshot sha; section_count keeps the old number
//   fiscal year: 5fb27b85 → FYE June 2022 (its four figures sit in that block); d93d25bd → FYE June 2023;
//     23dd1f5e (rounded -$1.87M / +$4.3M / -$2.1M) → none; a two-block tie → a range; a bare year never places
//   fail closed: a page whose lines carry edge whitespace / CRLF is not byte-exact → spans_exact=false, table [];
//     a snapshot with no sha → table [] (unkeyed); classification itself unchanged in both cases
//   the fiscal year is a FILING row's attribute: a registry_meta row on the same page carries none
//   source guard: the chip reads basis.fiscal_year (registryFilingOrigin) — nothing else needs to change
// NON-VACUITY (run by hand, reported): merge the FYE blocks before scoring (the pre-C3a shape) → the 2022 case fails.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  attributeFiscalYear, classifyRegistryRow, figureTokens, fiscalYearOfBlock, REGISTRY_CLASSIFIER_VERSION,
  sectionSpans, spansAreExact, spanTable,
} from "./registryClassifier.ts";
import { normalizeForHash, sha256Hex } from "./contentIdentity.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
// the fixture files end with one newline the DB text does not carry — strip it so offsets/sha match the stored row
const snap = async (name: string) => {
  const clean_text = (await read(`./fixtures/registry/${name}.txt`)).replace(/\n$/, "");
  const structured = JSON.parse(await read(`./fixtures/registry/${name}.ld.json`).catch(() => '{"ld_json":[]}'));
  return { clean_text, structured, text_sha256: await sha256Hex(normalizeForHash(clean_text)) };
};
const PP = "https://projects.propublica.org/nonprofits/organizations/941186168";
const GS = "https://www.guidestar.org/profile/94-1186168";
const ROWS = {
  pp_filing_5fb27b85: "FY2024 990: Revenue $31,008,000; Expenses $26,697,319; Net Income $4,310,681; Net Assets -$2,098,877. Prior year (FY2023) ran a net loss of -$1,867,681.",
  pp_filing_23dd1f5e: "FY2023 net loss of -$1.87M; FY2024 net income of +$4.3M but cumulative negative net assets of -$2.1M indicate structural balance sheet weakness despite revenue recovery.",
  pp_filing_d93d25bd: "Most recent 990 filed May 2025: Revenue $57,009,649; Expenses $28,097,897; Net Income $28,911,752. Prior year revenue $31,008,000. EIN 94-1186168.",
  pp_meta_49bd7bd7: "ProPublica Nonprofit Explorer: EIN 941186168, designated 501(c)(3), NTEE category Mental Health Crisis Intervention/Group Home/Residential Treatment; Form 990s available for download.",
  gs_self_e756386d: "Edgewood CSU is the only crisis stabilization unit serving youth under 12 in the Bay Area; opened 2014 in conjunction with SF Department of Public Health.",
};

Deno.test("span table: every span on both real pages is byte-exact at its offsets; the table is keyed by the snapshot sha", async () => {
  for (const [name, pt, url, row, expectN] of [["guidestar_edgewood", "profile", GS, ROWS.gs_self_e756386d, 30], ["propublica_edgewood", "filing_data", PP, ROWS.pp_filing_5fb27b85, 6]] as const) {
    const s = await snap(name);
    const spans = sectionSpans(pt, s.clean_text);
    assertEquals(spans.length, expectN, name);
    for (const sp of spans) assertEquals(s.clean_text.slice(sp.start, sp.end), sp.text, `${name} ${sp.section}@${sp.start}`);
    assert(spansAreExact(s.clean_text, spans));
    // contiguous and ordered — a span never overlaps its neighbour
    for (let i = 1; i < spans.length; i++) assert(spans[i].start >= spans[i - 1].end, `${name} span ${i} overlaps`);
    const c = classifyRegistryRow({ url, text: row, snapshot: s })!;
    assertEquals(c.basis.snapshot_sha, s.text_sha256);
    assertEquals(c.basis.spans_exact, true);
    assertEquals(c.basis.section_count, expectN);
    assertEquals(c.basis.snapshot_sections, spanTable(spans));
    assert(c.basis.snapshot_sections.every((r) => !("text" in r)), "the table carries offsets, not text");
    assertEquals(c.basis.classifier_version, REGISTRY_CLASSIFIER_VERSION);
  }
  // the evidence rows the report cites: GuideStar self_reported #16 (Our programs) and ProPublica FYE 2022
  const gs = await snap("guidestar_edgewood");
  const our = sectionSpans("profile", gs.clean_text).filter((x) => x.section === "self_reported")[2];
  assertEquals([our.start, our.end], [1663, 6986]);
  assert(gs.clean_text.slice(our.start, our.end).startsWith("Our programs\nSOURCE: Self-reported by organization\n"));
  const pp = await snap("propublica_edgewood");
  const fy22 = sectionSpans("filing_data", pp.clean_text).filter((x) => x.section === "filing_data")[3];
  assertEquals(fiscalYearOfBlock(fy22.text), { month: "June", year: "2022" });
  assertEquals(pp.clean_text.slice(fy22.start, fy22.start + 28), "Fiscal Year Ending June\n2022");
});

Deno.test("fiscal year: the block whose exact figures the row carries — 5fb27b85 → FYE June 2022; d93d25bd → FYE June 2023; 23dd1f5e → none", async () => {
  const s = await snap("propublica_edgewood");
  const spans = sectionSpans("filing_data", s.clean_text);
  const a = attributeFiscalYear(ROWS.pp_filing_5fb27b85, spans);
  assertEquals(a.fiscal_year, "FYE June 2022");
  assertEquals(a.fiscal_blocks.map((b) => `${b.fiscal_year.slice(-4)}:${b.score}`), ["2025:0", "2024:0", "2023:0", "2022:4", "2021:1"]);
  const b = attributeFiscalYear(ROWS.pp_filing_d93d25bd, spans);
  assertEquals(b.fiscal_year, "FYE June 2023");
  assertEquals(b.fiscal_blocks.map((x) => `${x.fiscal_year.slice(-4)}:${x.score}`), ["2025:0", "2024:0", "2023:3", "2022:1", "2021:0"]);
  const c = attributeFiscalYear(ROWS.pp_filing_23dd1f5e, spans);
  assertEquals(c.fiscal_year, null, "rounded figures name no block");
  assert(c.fiscal_blocks.every((x) => x.score === 0));
  // through the classifier: filing rows carry it; the registry_meta row on the same page does not
  assertEquals(classifyRegistryRow({ url: PP, text: ROWS.pp_filing_5fb27b85, snapshot: s })!.basis.fiscal_year, "FYE June 2022");
  assertEquals(classifyRegistryRow({ url: PP, text: ROWS.pp_filing_d93d25bd, snapshot: s })!.basis.fiscal_year, "FYE June 2023");
  assertEquals(classifyRegistryRow({ url: PP, text: ROWS.pp_filing_23dd1f5e, snapshot: s })!.basis.fiscal_year, null);
  const meta = classifyRegistryRow({ url: PP, text: ROWS.pp_meta_49bd7bd7, snapshot: s })!;
  assertEquals([meta.class, meta.basis.fiscal_year], ["registry_meta", null]);
  // a GuideStar profile page never carries one
  const gs = await snap("guidestar_edgewood");
  assertEquals(classifyRegistryRow({ url: GS, text: ROWS.gs_self_e756386d, snapshot: gs })!.basis, { ...classifyRegistryRow({ url: GS, text: ROWS.gs_self_e756386d, snapshot: gs })!.basis, fiscal_year: null, fiscal_blocks: [] });
});

Deno.test("fiscal year: a two-block tie is a range (page order); a bare year or a label never places a row; figures are money / percent / comma-grouped", async () => {
  const s = await snap("propublica_edgewood");
  const spans = sectionSpans("filing_data", s.clean_text);
  // one figure from FYE 2023 + one from FYE 2022 → tie → range
  const tie = attributeFiscalYear("Revenue $57,009,649 then $31,008,000", spans);
  assertEquals(tie.fiscal_year, "FYE June 2023–2022");
  // a bare year is not a figure (it would match the block's own header line)
  assertEquals(attributeFiscalYear("filed in 2024 and 2025", spans).fiscal_year, null);
  // labels every block shares never place a row
  assertEquals(attributeFiscalYear("Revenue Expenses Net Income Net Assets Extracted Financial Data", spans).fiscal_year, null);
  assertEquals([...figureTokens("Revenue $31,008,000; 84.07% ratio; 1,867,681; year 2024; EIN 94-1186168")], ["$31,008,000", "84.07%", "1,867,681"]);
  assertEquals(fiscalYearOfBlock("Organization summary\nEIN"), null);
});

Deno.test("fail closed: a page that is not byte-exact (edge whitespace / CRLF) keeps its classification but omits the table; no sha ⇒ no table", async () => {
  const s = await snap("propublica_edgewood");
  const exact = classifyRegistryRow({ url: PP, text: ROWS.pp_filing_5fb27b85, snapshot: s })!;
  // CRLF endings: the joined text uses "\n" → slice ≠ text
  const crlf = { ...s, clean_text: s.clean_text.replace(/\n/g, "\r\n") };
  const c = classifyRegistryRow({ url: PP, text: ROWS.pp_filing_5fb27b85, snapshot: crlf })!;
  assertEquals([c.section, c.class, c.basis.fiscal_year], [exact.section, exact.class, exact.basis.fiscal_year], "classification unchanged");
  assertEquals(c.basis.spans_exact, false);
  assertEquals(c.basis.snapshot_sections, []);
  assertEquals(c.basis.section_count, exact.basis.section_count);
  // indented lines: same
  const indented = { ...s, clean_text: s.clean_text.split("\n").map((l) => "  " + l).join("\n") };
  const i = classifyRegistryRow({ url: PP, text: ROWS.pp_filing_5fb27b85, snapshot: indented })!;
  assertEquals([i.basis.spans_exact, i.basis.snapshot_sections.length, i.class], [false, 0, exact.class]);
  // no sha: exact, but unkeyed → omitted
  const noSha = classifyRegistryRow({ url: PP, text: ROWS.pp_filing_5fb27b85, snapshot: { ...s, text_sha256: null } })!;
  assertEquals([noSha.basis.spans_exact, noSha.basis.snapshot_sha, noSha.basis.snapshot_sections.length, noSha.basis.fiscal_year], [true, null, 0, "FYE June 2022"]);
});

Deno.test("source guard: the chip's origin reads basis.fiscal_year; the count survives as section_count; the ingest loader carries the sha", async () => {
  const mappers = await read("../../../src/lib/evidenceMappers.ts");
  assert(mappers.includes('typeof reg.basis?.fiscal_year === "string" ? reg.basis.fiscal_year : null'));
  const chip = await read("../../../src/views/client/workspace/InterviewOrigin.tsx");
  assert(chip.includes("`${withHost(FILING_FRAME_HEAD)} · ${o.fiscal_year}`"));
  const ingest = await read("./registryIngest.ts");
  assert(ingest.includes('.select("source_url, clean_text, structured, crawled_at, text_sha256")'));
  assert(ingest.includes("text_sha256: await sha256Hex(normalizeForHash(t))"));
  const cls = await read("./registryClassifier.ts");
  assert(cls.includes("section_count: spans.length"));
});
