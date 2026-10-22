// Rulings 12 + 13 (2026-10-22) — related-entity filings and page dates at mint. Pure: no I/O, no model.
//   F1  a sec.gov EDGAR URL under a confirmed PARENT's signed CIK (with or without leading zeros) → client_voice,
//       authority own_filing_related, the entity stamped; the venue is the signed template over the stored name + relation
//   F2  a CIK of an unrelated filer → stays outside (the extractor's label)
//   F3  a guessed / unconfirmed entity's CIK → stays outside
//   F4  a non-parent entity's CIK → today's class (no signed venue yet), unstamped
//   D1  a page dated before the relation's start → not the company's own voice (before_effective, the later stages)
//   D2  an undated page → own voice, basis page_undated, the venue trails "· date not confirmed"
//   D3  a page on or after the start → own voice, the entity's own basis; no pageDate → the E2 rule, byte-identical
//   D4  published dates: og / ld+json on a snapshot, page_age on a search result; a relative age is not a date
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideVoiceClassBeforeJudge, relatedFilingOf, type PreJudgeInput } from "./voiceClassAtMint.ts";
import { publishedDayOf, publishedDayOfSnapshot, relatedFilingVenueLabel, relatedVenueLabel, type RelatedEntityRow } from "./ownHosts.ts";
import { edgarCikOf, FILER_CIKS, filerCikOfHost } from "./filerCiks.ts";
import { pageAgesByUrl } from "./citationRows.ts";
import { crawlEntityFor } from "./ownHostDiscovery.ts";

const PARENT: RelatedEntityRow = { id: "e-parent", name: "Charter Communications", host: "charter.com", relation: "parent", effective_from: null, effective_basis: "cited", status: "confirmed" };
const MERGED: RelatedEntityRow = { id: "e-merged", name: "Cox Communications", host: "cox.com", relation: "merged_into", effective_from: "2026-08-20", effective_basis: "cited", status: "confirmed" };
const base = (url: string, related: RelatedEntityRow[], extra: Partial<PreJudgeInput> = {}): PreJudgeInput => ({
  url, item: null, labeledClass: "outside_voice_about_client", pageText: null, judgedText: null,
  company: { name: "", host: "spectrum.com", related }, registry: null, judge: null, gate: "profile", onJudgeFailure: "keep_label", ...extra,
});
const decide = (i: PreJudgeInput) => decideVoiceClassBeforeJudge(i) as { ok?: boolean; voice_class?: string | null; authority?: string; entity?: { basis: string; name: string } };
const TENK = "https://www.sec.gov/Archives/edgar/data/1091667/000109166726000010/chtr-20251231.htm";
const TENK_ZEROS = "https://www.sec.gov/Archives/edgar/data/0001091667/000114036126033909/ef20080687_ex99-1.htm";

Deno.test("F1 a confirmed parent's own filing (leading zeros or not) is own voice, authority own_filing_related, entity stamped", () => {
  for (const url of [TENK, TENK_ZEROS]) {
    const d = decide(base(url, [PARENT, MERGED]));
    assertEquals(d.voice_class, "client_voice", url);
    assertEquals(d.authority, "own_filing_related", url);
    assertEquals(d.entity?.name, "Charter Communications");
  }
  assertEquals(edgarCikOf(TENK_ZEROS), 1091667);
  assertEquals(filerCikOfHost("www.charter.com"), FILER_CIKS["charter.com"]);
});
Deno.test("F1b the venue is the signed template over the entity's stored name and relation — never a literal", () => {
  const e = relatedFilingOf(base(TENK, [PARENT]))!;
  assertEquals(relatedFilingVenueLabel(e), "In Charter Communications' filing · your parent company");
  assertEquals(relatedFilingVenueLabel({ ...e, name: "Acme Holdings Group" }), "In Acme Holdings Group's filing · your parent company");
});
Deno.test("F2 a CIK of an unrelated filer stays outside", () => {
  const d = decide(base("https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm", [PARENT]));
  assertEquals(d.voice_class, "outside_voice_about_client");
  assertEquals(d.authority, "extractor_label");
  assertEquals(decide(base("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1091667", [PARENT])).voice_class, "outside_voice_about_client", "not an EDGAR archive path");
});
Deno.test("F3 a guessed or unconfirmed entity's CIK stays outside", () => {
  assertEquals(decide(base(TENK, [{ ...PARENT, status: "proposed" }])).voice_class, "outside_voice_about_client", "proposed, not confirmed");
  // the mint path passes a page date — the status test must hold there too (the E2 asOf path re-checks status itself)
  for (const date of [null, "2026-01-15"]) assertEquals(decide(base(TENK, [{ ...PARENT, status: "proposed" }], { pageDate: { date } })).voice_class, "outside_voice_about_client", `proposed, page date ${date}`);
  assertEquals(decide(base(TENK, [])).voice_class, "outside_voice_about_client", "no related entity at all");
  assertEquals(decide(base(TENK, [{ ...PARENT, host: "chartercomms.example" }])).voice_class, "outside_voice_about_client", "an entity whose host carries no signed CIK");
});
Deno.test("F4 a non-parent entity's CIK keeps today's class, unstamped (no signed venue yet)", () => {
  const d = decide(base(TENK, [{ ...PARENT, relation: "merged_into" }]));
  assertEquals(d.voice_class, "outside_voice_about_client");
  assertEquals(d.authority, "extractor_label");
  assertEquals(d.entity, undefined);
});
Deno.test("D1 an entity page dated before the relation's start is not the company's own voice", () => {
  const d = decide(base("https://www.cox.com/residential/internet.html", [PARENT, MERGED], { pageDate: { date: "2025-03-01" } }));
  assertEquals(d.voice_class, "outside_voice_about_client");
  assertEquals(d.entity?.basis, "before_effective");
});
Deno.test("D2 an undated entity page keeps own voice, basis page_undated, the venue trails '· date not confirmed'", () => {
  const d = decide(base("https://www.cox.com/residential/internet.html", [PARENT, MERGED], { pageDate: { date: null } }));
  assertEquals(d.voice_class, "client_voice");
  assertEquals(d.authority, "own_domain_related");
  assertEquals(d.entity?.basis, "page_undated");
  assertEquals(relatedVenueLabel(d.entity as never), "On Cox Communications' site · merged with your parent, Aug 2026 · date not confirmed");
  // a crawled page carries no published date: on an entity with a start date it is undated
  const disc = { hasRelated: true, related: [], set: { kind: "own_host_set", seed: "spectrum.com", hosts: [{ host: "spectrum.com", entity: null }, { host: "cox.com", entity: { id: "e-merged", name: "Cox Communications", host: "cox.com", relation: "merged_into", basis: "cited", effective_from: "2026-08-20" } }] } };
  assertEquals(crawlEntityFor("https://www.cox.com/contactus.html", disc as never)?.basis, "page_undated");
});
Deno.test("D3 a page on or after the start is own voice with the entity's basis; a parent with no start date is never dated out", () => {
  const on = decide(base("https://www.cox.com/residential/internet.html", [PARENT, MERGED], { pageDate: { date: "2026-08-20" } }));
  assertEquals([on.voice_class, on.entity?.basis], ["client_voice", "cited"]);
  const parentOld = decide(base("https://corporate.charter.com/newsroom/x", [PARENT, MERGED], { pageDate: { date: "2001-01-01" } }));
  assertEquals([parentOld.voice_class, parentOld.entity?.basis], ["client_voice", "cited"]);
  assertEquals(relatedVenueLabel(parentOld.entity as never), "On Charter Communications' site · your parent company", "no suffix for a parent");
  // no pageDate ⇒ the E2 asOf rule, byte-identical (asOf absent ⇒ today ⇒ in effect, basis cited)
  const e2 = decide(base("https://www.cox.com/residential/internet.html", [PARENT, MERGED]));
  assertEquals([e2.voice_class, e2.entity?.basis], ["client_voice", "cited"]);
});
Deno.test("D4 published dates: snapshot og / ld+json, search-result page_age; a relative age is not a published date", () => {
  assertEquals(publishedDayOf("April 30, 2025"), "2025-04-30");
  assertEquals(publishedDayOf("Apr 3, 2025"), "2025-04-03");
  assertEquals(publishedDayOf("30 April 2025"), "2025-04-30");
  assertEquals(publishedDayOf("2026-05-20T05:05:00+00:00"), "2026-05-20");
  for (const x of ["3 days ago", "", null, "2025-02-30", "Smarch 1, 2025"]) assertEquals(publishedDayOf(x as never), null, String(x));
  assertEquals(publishedDayOfSnapshot({ og: { "article:published_time": "2026-05-20T05:05:00Z" }, ld_json: [] }), "2026-05-20");
  assertEquals(publishedDayOfSnapshot({ og: {}, ld_json: [{ "@graph": [{ "@type": "WebPage" }, { "@type": "NewsArticle", datePublished: "2024-11-02" }] }] }), "2024-11-02");
  assertEquals(publishedDayOfSnapshot({ og: { title: "x" }, ld_json: [] }), null);
  const resp = { content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://www.cox.com/a", page_age: "March 1, 2025" }, { type: "web_search_result", url: "https://x.example/b" }] }] };
  const ages = pageAgesByUrl(resp);
  assertEquals(ages.size, 1);
  assertEquals(publishedDayOf([...ages.values()][0]), "2025-03-01");
});
Deno.test("W wiring: the mint overlay passes the page date and stamps the filing authority; regen reads the snapshot date", async () => {
  const pb = await Deno.readTextFile(new URL("../public-baseline/index.ts", import.meta.url));
  assert(pb.includes("const pageAges = pageAgesByUrl(data);"), "page ages read from the response");
  assert(pb.includes("...(relatedForGuard.length ? { pageDate: { date: pageDay } } : {})"), "the overlay passes the page date");
  assert(pb.includes('d.authority === "own_filing_related" ? { voice_authority: { authority: "own_filing_related" } } : {}'), "a filing row names its authority");
  const rg = await Deno.readTextFile(new URL("./outsideRegenHandler.ts", import.meta.url));
  assert(rg.includes("pageDate: { date: publishedDayOfSnapshot(structured) }"), "the regen write reads the snapshot's published date");
  assert(rg.includes("publishedDayOfSnapshot(snap.structured)"), "and so does its plan");
  const vc = await Deno.readTextFile(new URL("./voiceClassAtMint.ts", import.meta.url));
  assert(/const filing = relatedFilingOf\(input\);\s*if \(filing && filing\.relation === "parent" && filing\.basis !== "before_effective"\)/.test(vc), "the filing stage: parent only, dated rule");
});
