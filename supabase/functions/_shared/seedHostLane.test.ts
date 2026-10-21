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

Deno.test("rows: own-domain client voice; excerpt = the whole cited passage or blank; off-host items refused", () => {
  const spans = new Map([["spectrum.com/internet", ["Spectrum Internet® plans start at $30/mo with no data caps and no contracts."]]]);
  const decide = (url: string) => decideVoiceClassBeforeJudge({ url, item: null, labeledClass: "client_voice", pageText: null, judgedText: null, company: { name: "", host: "spectrum.com" }, registry: null, judge: null, gate: "profile", onJudgeFailure: "keep_label" } as never) as never;
  const { rows, stats } = buildSeedLaneRows({ companyId: "co", runId: 7, seedHost: "spectrum.com", captureDay: "2026-10-21", citedSpans: spans, decide, parsed: { items: [
    { url: "https://www.spectrum.com/internet", statement: "Internet plans start at $30 a month.", quote: "plans start at $30/mo with no data caps" },
    { url: "https://www.spectrum.com/mobile", statement: "Spectrum Mobile is included for a year.", quote: "Mobile is included" },
    { url: "https://www.forbes.com/spectrum", statement: "x", quote: "x" },
  ] } });
  assertEquals(stats, { items: 3, off_host: 1, not_own: 0, minted: 2, cited: 1, blanked: 1 });
  const [a, b] = rows as Array<Record<string, any>>;
  assertEquals([a.voice_class, a.raw_payload.voice_authority.authority, a.raw_payload.source_type, a.raw_payload.excerpt_guard.basis, a.evidence_excerpt], ["client_voice", "own_domain", "seed_host_cited_text", "websearch_cited_text", "Spectrum Internet® plans start at $30/mo with no data caps and no contracts."]);
  assertEquals([b.evidence_excerpt, b.claim_text, b.raw_payload.excerpt_guard.reason], ["", "Spectrum Mobile is included for a year.", "no_cited_text_for_url"]);
});
