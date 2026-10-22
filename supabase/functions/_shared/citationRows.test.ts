// Ruling 1 (2026-10-21): the web_search tool's citations become the rows — claim = the cited sentence, excerpt = the
// citation's cited_text VERBATIM, uncited sentences mint nothing, excluded hosts mint nothing, duplicates (in run, or by
// content identity against existing excerpts) are not re-minted; end to end the stored excerpt is byte-equal to the tool's.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capEvidenceLedger, citationEntries, citedSentences, isPlaceholderProfileSnippet, PROFILE_PLACEHOLDER_DEFAULT, rawCitationSnapshot } from "./citationRows.ts";
import { mapPublicBaselineOutputToSignals } from "../../../src/lib/evidenceMappers.ts";
import { applyMintExcerptGuard } from "./evidencePhase1.ts";
import { extractCitedSpans } from "../../../src/lib/firstRead/citationSource.ts";

const CT = "Spectrum’s Internet Assist  plan costs $30/mo — for qualifying\nhouseholds.";
const RESP = { model: "claude-sonnet-4-6", stop_reason: "end_turn", usage: { input_tokens: 1 }, content: [
  { type: "server_tool_use", name: "web_search", input: { query: "spectrum reviews" } },
  { type: "web_search_tool_result", content: [{ encrypted_content: "x" }] },
  { type: "text", text: "Spectrum offers a $30 low-income plan.", citations: [
    { type: "web_search_result_location", url: "https://www.highspeedinternet.com/spectrum", title: "Spectrum review", cited_text: CT },
    { type: "web_search_result_location", url: "https://www.highspeedinternet.com/spectrum", title: "Spectrum review", cited_text: CT },
  ] },
  { type: "text", text: "Spectrum is loved by everyone." },
  { type: "text", text: "Cox Enterprises owns many brands.", citations: [{ type: "web_search_result_location", url: "https://www.coxenterprises.com/about", title: "Cox Enterprises", cited_text: "Cox Enterprises is a family-owned company." }] },
  { type: "text", text: "BBB lists complaints.", citations: [{ type: "web_search_result_location", url: "https://www.bbb.org/x", title: "BBB", cited_text: "12,734 total complaints in the last 3 years." }] },
  { type: "text", text: "{\"top_hypotheses\":[]}" },
] };

Deno.test("sentences: every text block with its citations; uncited blocks have none", () => {
  const s = citedSentences(RESP);
  assertEquals(s.map((x) => x.citations.length), [2, 0, 1, 1, 0]);
});

Deno.test("entries: one per (url, cited_text); uncited mint nothing; excluded hosts mint nothing; existing excerpts not re-minted", () => {
  const { entries, stats } = citationEntries(RESP, { excludeHosts: ["coxenterprises.com"], existingExcerpts: new Set(["12,734 total complaints in the last 3 years."]) });
  assertEquals(stats, { text_blocks: 5, cited_blocks: 3, uncited_blocks: 2, citations: 4, excluded: 1, duplicate_in_run: 1, duplicate_existing: 1, entries: 1 });
  assertEquals([entries[0].url, entries[0].sentence, entries[0].title], ["https://www.highspeedinternet.com/spectrum", "Spectrum offers a $30 low-income plan.", "Spectrum review"]);
  assert(entries[0].cited_text === CT && entries[0].snippet === CT, "the tool's cited_text, verbatim");
});

Deno.test("end to end: entry → mapper → mint guard ⇒ the stored excerpt is byte-equal to the tool's cited_text (dash, curly quote, double space, newline)", async () => {
  const { entries } = citationEntries(RESP, { excludeHosts: [], existingExcerpts: new Set() });
  const drafts = mapPublicBaselineOutputToSignals({ companyId: "co", sourceId: 1, resultJson: { evidence_ledger: entries, outside_voice_signals: [] } });
  const quiet = console.log; console.log = () => {};
  await applyMintExcerptGuard({ supabase: { from: () => ({}) }, companyId: "co", runId: "r", signals: drafts, sourceTextByUrl: new Map(), webSearchCitedSpans: extractCitedSpans(RESP) });
  console.log = quiet;
  const d = drafts.find((x) => String(x.source_url).includes("highspeedinternet"))!;
  assert(d.evidence_excerpt === CT, `excerpt not byte-equal: ${JSON.stringify(d.evidence_excerpt)}`);
  assertEquals([d.claim_text, d.source_title], ["Spectrum offers a $30 low-income plan.", "Spectrum review"]);
  assertEquals(rawCitationSnapshot(RESP).text_blocks.length, 5);
});

Deno.test("ruling 1 (re-run 2): citation entries are never capped; the rest keep 24; no citations ⇒ exactly slice(0, 24)", () => {
  const cited = Array.from({ length: 42 }, (_, i) => ({ citation: true as const, i }));
  const other = Array.from({ length: 30 }, (_, i) => ({ i }));
  const kept = capEvidenceLedger([...cited, ...other]);
  assertEquals([kept.filter((e) => (e as { citation?: boolean }).citation).length, kept.length], [42, 66]);
  assertEquals(capEvidenceLedger(other), other.slice(0, 24));
});

Deno.test("ruling 2: a placeholder profile snippet is refused; page words are not", () => {
  for (const p of ["", "  ", PROFILE_PLACEHOLDER_DEFAULT, "Linked from company website (/about)", "Declared in page metadata (/)", "Referenced in script asset from company site", "Fallback social link discovered from https://x.test/", "Added manually from Public Source Controls.", "Generated from company name/domain because search engines can miss", "Site crawl (/)"]) assert(isPlaceholderProfileSnippet(p), p);
  assert(!isPlaceholderProfileSnippet("Spectrum Internet plans start at $30/mo."));
});
