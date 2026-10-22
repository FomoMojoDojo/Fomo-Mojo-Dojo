// The seed-host cited-text lane (2026-10-21): only when the own-site crawl read 0 seed pages; rows are own-domain client
// voice, excerpt = a cited passage for that URL or blank, basis websearch_cited_text; off-host items never mint.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSeedLaneRows, seedLaneShouldRun, seedLaneTool, seedPagesRead } from "./seedHostLane.ts";
import { decideVoiceClassBeforeJudge } from "./voiceClassAtMint.ts";

Deno.test("gate: 0 seed pages ⇒ runs; any seed page ⇒ never; a related host's pages are not seed pages; no public site ⇒ never", () => {
  assertEquals(seedPagesRead([{ url: "https://corporate.charter.com/" }, { url: "https://www.cox.com/residential/home.html" }], "spectrum.com"), 0);
  assertEquals(seedPagesRead([{ url: "https://www.spectrum.com/internet" }], "spectrum.com"), 1);
  assert(seedLaneShouldRun({ noPublicSite: false, seedHost: "spectrum.com", seedPagesRead: 0 }));
  assert(!seedLaneShouldRun({ noPublicSite: false, seedHost: "spectrum.com", seedPagesRead: 1 }));
  assert(!seedLaneShouldRun({ noPublicSite: true, seedHost: "spectrum.com", seedPagesRead: 0 }));
  assert(!seedLaneShouldRun({ noPublicSite: false, seedHost: null, seedPagesRead: 0 }));
  assertEquals(seedLaneTool("spectrum.com").allowed_domains, ["spectrum.com"]);
});

Deno.test("rows (ruling 1): one per citation on the seed host; excerpt = the citation's cited_text verbatim; uncited sentences and off-host citations mint nothing", () => {
  const decide = (url: string) => decideVoiceClassBeforeJudge({ url, item: null, labeledClass: "client_voice", pageText: null, judgedText: null, company: { name: "", host: "spectrum.com" }, registry: null, judge: null, gate: "profile", onJudgeFailure: "keep_label" } as never) as never;
  const CT = "Spectrum Internet® plans start at $30/mo — with no data caps\nand no contracts.";
  const response = { content: [
    { type: "text", text: "Spectrum's internet plans start at $30 a month.", citations: [{ type: "web_search_result_location", url: "https://www.spectrum.com/internet", title: "Spectrum Internet", cited_text: CT }] },
    { type: "text", text: "Spectrum is the best provider in America." },
    { type: "text", text: "Forbes covers it.", citations: [{ type: "web_search_result_location", url: "https://www.forbes.com/spectrum", title: "F", cited_text: "Forbes text about Spectrum." }] },
  ] };
  const { rows, stats } = buildSeedLaneRows({ companyId: "co", runId: 7, seedHost: "spectrum.com", captureDay: "2026-10-21", response, excludeHosts: [], existingExcerpts: new Set(), decide });
  assertEquals([stats.citations, stats.cited_blocks, stats.uncited_blocks, stats.off_host, stats.minted], [2, 2, 1, 1, 1]);
  const [a] = rows as Array<Record<string, any>>;
  assertEquals([a.voice_class, a.raw_payload.voice_authority.authority, a.raw_payload.source_type, a.raw_payload.excerpt_guard.basis, a.source_title], ["client_voice", "own_domain", "seed_host_cited_text", "websearch_cited_text", "Spectrum Internet"]);
  assert(a.evidence_excerpt === CT, "byte-equal to the tool's cited_text (dash and newline kept)");
  assertEquals(a.claim_text, "Spectrum's internet plans start at $30 a month.");
});
