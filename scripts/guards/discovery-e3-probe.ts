// E3 + rulings 1, 2, 4 probe (2026-10-21) — discovery over the own-host set, the web_search ledger, the domain-plan
// fallback rule and the cited_text excerpt rule. A SEEDED subject only (a guard checks invariants, never a live company's
// rows); every database step inside ONE rolled-back transaction; no network, no model. One JSON line out.
//   d1 parity: the seed alone ⇒ every E3 helper returns its no-change value; the domain prompt with no entity is the HEAD
//      ruling-1 citations fixture (2026-10-21) byte-for-byte; the query plan is A–H only
//   d2 the crawl's set filter admits the related hosts (and only them) when entities are in effect
//   d3 the site mint stamps raw_payload.entity + voice_authority own_domain_related on a related page; a seed page's row is
//      byte-identical to the mint with no entity resolver
//   d4 one `site:` pass per entity (16 each), none without an entity
//   d5 the prompt names the entities once, after the anchor line, as the same business
//   d6 the date rule: cox.com (merged_into 2026-08-20) is not own on 2026-08-01
//   d7 ruling 2: spectrum.dev is refused on a domain plan (fallback origin and guessed profile), and public-baseline gates both
//   d8 ruling 1: every web_search call site ledgers before parse, refuses unledgered; a real model_calls row (rolled back)
//      carries web_search_requests and usd
//   d9 ruling 4: a summary excerpt is blanked, an excerpt inside a cited span becomes the span, analysis keeps its text
//   d10 ruling 2 (fill brief): a guessed profile counts zero at the early ambiguous check on a domain plan (and public-baseline
//       filters the check through it)
//   d11 the spend cap: under a cap the routed external branch refuses an unpriced model (gpt-4.1) BEFORE any request (a
//       stubbed fetch counts 0); an affordable priced call passes; public-baseline checks the cap before each web_search
//       attempt, the seed lane and the OpenAI synthesis
//   d12 the seed-host lane runs only when the own-site crawl read 0 seed pages (public-baseline gates on that count)
//   d13 ruling 3: gpt-4.1 is priced — under a cap the routed beats call is SENT when it fits (stubbed fetch: 1 call)
//   d14 ruling 1: citations become the rows — an uncited sentence mints nothing, the excerpt is the citation's cited_text
//       byte-for-byte (end to end through mapper + mint guard), a citation on an excluded host mints nothing; both web_search
//       lanes are wired to it
//   d15 re-run 2 ruling 1: citation entries are never capped (42 kept with 30 others, which keep 24); public-baseline caps
//       through capEvidenceLedger
//   d16 ruling 2: a placeholder profile snippet is refused (helper), and public-baseline refuses it before appending
//   d17 ruling 4: the projection covers run 83's actual call ($1.4597) and refuses its seed lane after it under $1.50; a cap
//       above the ceiling is clamped to $2.25
//   d18 ruling 3: the lane-only entry runs the lane alone — its block calls executeSeedLane and no main call, crawl, search
//       or ingest, and it returns before the query plan is built
//   d19 ruling 1 (2026-10-22): own-words selection takes the seed host first, then each related host, round-robin within
//       the cap (a fixture of 30 older cox.com rows cannot crowd out 8 spectrum.com rows); no host order ⇒ identical;
//       the read's input gathering passes the order
//   d20 ruling 2: claim deltas ledger one row per model at its signed price (gpt-4.1 1M in + 100k out = $2.80, not $0.56)
import { lit, PsqlSession } from "../lib/psqlBlankingStore.ts";
import { crawlEntityFor, crawlHostFilter, discoveryHostsFor, domainPlanFallbackAdmits, entityPromptLine, entityQueryPasses, guessedProfileLinksOwnHost, relatedCrawlSeeds } from "../../supabase/functions/_shared/ownHostDiscovery.ts";
import type { RelatedEntityRow } from "../../supabase/functions/_shared/ownHosts.ts";
import { buildBaselineQueryPlan } from "../../supabase/functions/_shared/baselineQueryPlan.ts";
import { claudeWebSearchPrompt } from "../../supabase/functions/_shared/nameOnlyLane.ts";
import { mintSiteCrawlSignals } from "../../src/lib/siteCrawl/mint.ts";
import { ledgerOrRefuse, webSearchLedgerFor } from "../../supabase/functions/_shared/webSearchLedger.ts";
import { applyMintExcerptGuard } from "../../supabase/functions/_shared/evidencePhase1.ts";
import { extractCitedSpans } from "../../src/lib/firstRead/citationSource.ts";
import { countsAtEarlyAmbiguousCheck } from "../../supabase/functions/_shared/ownHostDiscovery.ts";
import { assertSpendable, makeSpendCap, SpendCapRefused } from "../../supabase/functions/_shared/spendCap.ts";
import { defaultBeatsRoutedModel } from "../../supabase/functions/_shared/findingBeats.ts";
import { makeRoutedModel } from "../../supabase/functions/_shared/modelRouter.ts";
import { projectOpenAIUsd } from "../../supabase/functions/_shared/spendCap.ts";
import { selectOwnWords } from "../../supabase/functions/_shared/publicReadSelection.ts";
import { openaiRecordsByModel } from "../../supabase/functions/_shared/recordModelCall.ts";
import { capEvidenceLedger, citationEntries, isPlaceholderProfileSnippet, PROFILE_PLACEHOLDER_DEFAULT } from "../../supabase/functions/_shared/citationRows.ts";
import { clampSpendCap, projectWebSearchUsd as projWS } from "../../supabase/functions/_shared/spendCap.ts";
import { buildSeedLaneRows } from "../../supabase/functions/_shared/seedHostLane.ts";
import { mapPublicBaselineOutputToSignals } from "../../src/lib/evidenceMappers.ts";
import { decideVoiceClassBeforeJudge } from "../../supabase/functions/_shared/voiceClassAtMint.ts";
import { seedLaneShouldRun, seedPagesRead } from "../../supabase/functions/_shared/seedHostLane.ts";

const ROOT = new URL("../../", import.meta.url);
const read = (p: string) => Deno.readTextFile(new URL(p, ROOT));
const PARENT: RelatedEntityRow = { id: "zz-parent", name: "ZZ Parent Holdings", host: "zz-parent.test", relation: "parent", effective_from: null, effective_basis: "cited", status: "confirmed" };
const MERGED: RelatedEntityRow = { id: "zz-merged", name: "ZZ Merged Cable", host: "zz-merged.test", relation: "merged_into", effective_from: "2026-08-20", effective_basis: "cited", status: "confirmed" };
const SITE = "https://www.zz-subject.test/";
const TODAY = "2026-10-21";

// d1 — parity on the seed alone
const seedOnly = discoveryHostsFor(SITE, [], TODAY);
const off = seedOnly.hasRelated ? seedOnly : null;
const pbSrc = await read("supabase/functions/public-baseline/index.ts");
const hintSrc = pbSrc.slice(pbSrc.indexOf("  const schemaHint =\n") + "  const schemaHint =\n".length, pbSrc.indexOf("`}`;", pbSrc.indexOf("  const schemaHint =\n")) + 3);
// eslint-disable-next-line no-new-func
const hint = new Function("return " + hintSrc.trim().replace(/;$/, ""))() as string;
const fixture = await read("supabase/functions/_shared/fixtures/lane/domain_prompt_citations_20261021.txt"); // ruling 1 (2026-10-21) snapshot
const baseOpts = { companyName: "Edgewood", website: "https://edgewood.org", domain: "edgewood.org", resolvedCategory: "youth mental health nonprofit", schemaHint: hint };
const promptNoEntity = claudeWebSearchPrompt({ ...baseOpts, ...(off ? { relatedEntities: off.related.map((r) => r.entity) } : {}) });
const planArgs = { planKind: "domain" as const, companyName: "ZZ Subject", domain: "zz-subject.test", stem: "zz-subject", variants: ["ZZ Subject"], spaced: "ZZ Subject" };
const d1 = {
  has_related: seedOnly.hasRelated, crawl_filter_null: crawlHostFilter(off) === null, related_seeds: relatedCrawlSeeds(off).length,
  entity_passes: entityQueryPasses(off).length, prompt_line_empty: entityPromptLine(off?.related.map((r) => r.entity) ?? null) === "" && entityPromptLine([]) === "",
  prompt_is_fixture: promptNoEntity + "\n" === fixture, plan_keys: Object.keys(buildBaselineQueryPlan(planArgs)).length,
};

// d2 / d4 / d5 / d6 — entities in effect
const full = discoveryHostsFor(SITE, [PARENT, MERGED], TODAY);
const f = crawlHostFilter(full);
const d2 = { filter_set: !!f, admits: f ? ["www.zz-parent.test", "news.zz-merged.test", "zz-subject.test"].map((h) => f(h)) : [], refuses: f ? ["zz-subject.dev", "evil.test", "zz-parent.test.evil.test"].map((h) => f(h)) : [] };
const d4 = { passes: entityQueryPasses(full).map((p) => [p.query, p.count]) };
const promptWith = claudeWebSearchPrompt({ ...baseOpts, relatedEntities: full.related.map((r) => r.entity) });
const anchor = "- Anchor every search to the exact entity: the name, the domain (edgewood.org), and the location and category you established from its own site.\n";
const line = entityPromptLine(full.related.map((r) => r.entity));
const d5 = { inserted_once_after_anchor: promptWith === fixture.slice(0, -1).replace(anchor, anchor + line) && promptWith.split(line).length === 2, says_same_business: /SAME business/.test(line), says_exclude: /exclude/i.test(line) };
const d6 = { before: discoveryHostsFor(SITE, [PARENT, MERGED], "2026-08-01").set.hosts.map((h) => h.host), on: discoveryHostsFor(SITE, [PARENT, MERGED], "2026-08-20").set.hosts.map((h) => h.host) };

// d3 — the site mint's entity stamp (a fake client: nothing written)
function fakeMint() {
  const inserts: Array<Record<string, any>> = [];
  const q: any = { select: () => q, eq: () => q, is: () => Promise.resolve({ data: [], error: null }) };
  return { inserts, client: { from: () => ({ ...q, insert: (r: Record<string, any>) => { inserts.push(r); return { select: () => ({ single: () => Promise.resolve({ data: { id: `n${inserts.length}` }, error: null }) }) }; } }) } };
}
const pages = [
  { url: "https://www.zz-subject.test/about", title: "About ZZ", meta: "", extracted: "ZZ Subject builds broadband networks for homes and small businesses across the region." },
  { url: "https://www.zz-parent.test/about", title: "About ZZ Parent", meta: "", extracted: "ZZ Parent Holdings operates the ZZ Subject brand and its broadband network across the region." },
];
const now = () => "2026-10-21T00:00:00.000Z";
const a = fakeMint(), b = fakeMint();
await mintSiteCrawlSignals({ supabase: a.client, companyId: "zz", runId: 1, pages, nowIso: now, entityFor: (u) => crawlEntityFor(u, full) as Record<string, unknown> | null });
await mintSiteCrawlSignals({ supabase: b.client, companyId: "zz", runId: 1, pages, nowIso: now });
const rel = a.inserts.find((r) => r.source_url.includes("zz-parent"));
const d3 = { minted: a.inserts.length, related_entity: rel?.raw_payload?.entity?.name ?? null, related_authority: rel?.raw_payload?.voice_authority?.authority ?? null,
  seed_row_identical: JSON.stringify(a.inserts.find((r) => r.source_url.includes("zz-subject"))) === JSON.stringify(b.inserts.find((r) => r.source_url.includes("zz-subject"))) };

// d7 — ruling 2
const dotDev = discoveryHostsFor("https://www.spectrum.com/", [], TODAY).set;
const d7 = {
  fallback_spectrum_dev: domainPlanFallbackAdmits("spectrum.dev", dotDev, dotDev.hosts.map((h) => h.host)),
  guessed_profile_spectrum_dev: guessedProfileLinksOwnHost(["http://spectrum.dev/"], dotDev),
  guessed_profile_own: guessedProfileLinksOwnHost(["https://www.spectrum.com/"], dotDev),
  gate_fallback: pbSrc.includes(`if (planKind === "domain" && !domainPlanFallbackAdmits(host, disc.set, crawledOwnHosts)) return "";`),
  gate_guess: pbSrc.includes(`const guessUnlinked = planKind === "domain" && s.engine === "linkedin_slug_guess" && got.ok && !guessedProfileLinksOwnHost(extractHttpUrlsFromText(got.text, s.url), disc.set);`) && pbSrc.includes(`extracted: got.ok && !guessUnlinked ? got.text : "",`),
};

// d8 — ruling 1: every web_search site ledgers before parse (source), and a real row (rolled back) carries the search count
const SITES = [["supabase/functions/public-baseline/index.ts", "public-baseline-search", "const blocks = Array.isArray((d as any)?.content)"], ["supabase/functions/competitor-discovery/index.ts", "competitor-discovery", "const blocks = Array.isArray((data as any)?.content)"], ["supabase/functions/generate-normative-jobmap/index.ts", "generate-normative-jobmap", "const blocks = Array.isArray((disc as any)?.content)"]] as const;
const sites: Record<string, unknown> = {};
for (const [file, site, parseMark] of SITES) {
  const src = await read(file);
  const tools = (src.match(/type: "web_search_20250305"/g) ?? []).length;
  const call = src.indexOf('fetch("https://api.anthropic.com/v1/messages"');
  const pre = src.indexOf("?.usage ?? null", call);
  const parse = src.indexOf(parseMark, call);
  sites[site] = { tools, required: src.includes(`requireWebSearchLedger(`), ledger_before_parse: call > 0 && pre > call && parse > pre, refuses_failed_http: (src.slice(call, parse).match(/await ledgerOrRefuse\(/g) ?? []).length >= 3 };
}
const s = new PsqlSession();
const before = async () => (await s.query<{ n: string }>(`select (select count(*) from model_calls)||'|'||(select count(*) from signals) n`))[0].n;
const B0 = await before();
await s.exec("begin;");
const Z = "00000000-0000-4000-8000-00000000e3a0";
await s.exec(`insert into companies (id, name, website, created_by) values (${lit(Z)}::uuid, 'ZZ E3 Probe', 'https://www.zz-e3-probe.test', (select id from auth.users order by created_at limit 1));`);
const shim = { from: (t: string) => ({ insert: async (r: Record<string, unknown>) => {
  const cols = Object.keys(r);
  try { await s.mutate(`insert into ${t} (${cols.join(",")}) values (${cols.map((c) => (r[c] == null ? "null" : lit(String(r[c])))).join(",")}) returning id`); return { error: null }; }
  catch (e) { return { error: { message: String((e as Error).message) } }; } } }) };
const USAGE = { input_tokens: 40_000, output_tokens: 6_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 9 } };
await ledgerOrRefuse(webSearchLedgerFor(shim, { companyId: Z, callSite: "public-baseline-search" }), { model: "claude-sonnet-4-6", usage: USAGE, attempt: 1, promptSha: "probe" }, "probe");
const [row] = await s.query<{ call_site: string; web_search_requests: number; usd: string; prompt_tokens: number }>(`select call_site, web_search_requests, usd::text usd, prompt_tokens from model_calls where company_id=${lit(Z)}::uuid`);
let refused = false;
try { await ledgerOrRefuse(webSearchLedgerFor({ from: () => ({ insert: () => Promise.resolve({ error: { message: "down" } }) }) }, { companyId: Z, callSite: "x" }), { model: "claude-sonnet-4-6", usage: USAGE, attempt: 1, promptSha: null }, "probe"); } catch { refused = true; }
await s.exec("rollback;");
const B1 = await before();
await s.close();
const d8 = { sites, row: row ?? null, refused_unledgered: refused };

// d9 — ruling 4
const RESP = { content: [{ type: "text", text: "x", citations: [{ url: "https://news.zz.test/a", cited_text: "ZZ Subject serves 41 towns and prices plans from $30 a month." }] }] };
const mk = (excerpt: string, voice_class: string) => ({ company_id: "zz", source_type: "public_baseline_run", source_url: "https://news.zz.test/a", signal_band: "outside", voice_class, claim_text: excerpt, evidence_excerpt: excerpt, raw_payload: {} }) as any;
const summary = mk("ZZ Subject is the biggest provider in the state after its merger.", "outside_voice_about_client");
const inSpan = mk("prices plans from $30 a month", "outside_voice_about_client");
const analysis = mk("Our reading: a price-led strategy.", "analysis");
const quiet = console.log; console.log = () => {};
await applyMintExcerptGuard({ supabase: { from: () => ({}) }, companyId: "zz", runId: "r", signals: [summary, inSpan, analysis], sourceTextByUrl: new Map(), webSearchCitedSpans: extractCitedSpans(RESP) });
console.log = quiet;
const d9 = { summary_excerpt: summary.evidence_excerpt, summary_claim_kept: summary.claim_text === "ZZ Subject is the biggest provider in the state after its merger.", summary_basis: summary.raw_payload.excerpt_guard?.basis ?? null,
  in_span: inSpan.evidence_excerpt, analysis_kept: analysis.evidence_excerpt === "Our reading: a price-led strategy.",
  wired: pbSrc.includes("...(claudeCitedSpans ? { webSearchCitedSpans: claudeCitedSpans } : {}),") };

// d10 — the early ambiguous check
const d10 = { guess_domain: countsAtEarlyAmbiguousCheck({ engine: "linkedin_slug_guess" }, "domain"), guess_name_only: countsAtEarlyAmbiguousCheck({ engine: "linkedin_slug_guess" }, "name_only"), searx_domain: countsAtEarlyAmbiguousCheck({ engine: "searx" }, "domain"),
  wired: pbSrc.includes("const earlyStrong = strong.filter((x: any) => countsAtEarlyAmbiguousCheck(x, planKind));") && pbSrc.includes("if (earlyStrong.length === 0 && earlyMedium.length === 0 && directEvidence.length === 0) {") };

// d11 — the spend cap (a stubbed fetch: nothing leaves the machine)
const ledgerOf = (rows: Array<{ provider: string; usd: number | null }>) => ({ from: () => ({ select: () => ({ eq: () => ({ gte: () => Promise.resolve({ data: rows, error: null }) }) }) }) });
const origFetch = globalThis.fetch; let fetches = 0;
globalThis.fetch = (() => { fetches++; return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }))); }) as typeof fetch;
let unpricedRefused = false;
// an UNPRICED model on the routed external branch (a model the price table does not name), checked by the same hook
const capZ = makeSpendCap({ capUsd: 1.5, companyId: "zz", since: "2026-10-21T00:00:00Z", supabase: ledgerOf([]) });
const unpricedRouted = makeRoutedModel({ callLocalGenerator: async () => "{}", callLocalJudge: async () => "{}", openaiKey: "sk-probe",
  beforeExternal: (c) => assertSpendable(capZ, { site: "finding-beats", model: "gpt-5-unpriced", projectedUsd: projectOpenAIUsd("gpt-5-unpriced", { promptChars: c.system.length + c.user.length, maxOutputTokens: 4096 }) }) });
try { await unpricedRouted({ role: "generator", provenances: ["public_observed"], system: "s", user: "u" }); }
catch (e) { unpricedRefused = e instanceof SpendCapRefused; }
const fetchesUnpriced = fetches;
// d13 — gpt-4.1 priced (ruling 3): the real beats routed caller is sent under the cap when it fits
await defaultBeatsRoutedModel("sk-probe", undefined, makeSpendCap({ capUsd: 1.5, companyId: "zz", since: "2026-10-21T00:00:00Z", supabase: ledgerOf([]) }))({ role: "generator", provenances: ["public_observed"], system: "s", user: "u" }).catch(() => null);
const fetchesPriced = fetches - fetchesUnpriced;
globalThis.fetch = origFetch;
let affordable = true, over = false;
try { await assertSpendable(makeSpendCap({ capUsd: 1.5, companyId: "zz", since: "x", supabase: ledgerOf([{ provider: "anthropic", usd: 0.4 }]) }), { site: "s", model: "claude-sonnet-4-6", projectedUsd: 0.96 }); } catch { affordable = false; }
try { await assertSpendable(makeSpendCap({ capUsd: 1.5, companyId: "zz", since: "x", supabase: ledgerOf([{ provider: "anthropic", usd: 0.6 }]) }), { site: "s", model: "claude-sonnet-4-6", projectedUsd: 0.96 }); } catch (e) { over = e instanceof SpendCapRefused; }
const d11 = { unpriced_refused: unpricedRefused, fetches_made: fetchesUnpriced, affordable_passes: affordable, over_refused: over,
  wired_search: pbSrc.includes(`await assertSpendable(opts.spendCap, { site: "public-baseline-search", model: opts.model, projectedUsd: projectWebSearchUsd(`),
  wired_lane: pbSrc.includes(`await assertSpendable(opts.spendCap, { site: SEED_LANE_CALL_SITE, model: opts.model, projectedUsd: projectWebSearchUsd(`),
  wired_openai: pbSrc.includes(`await assertSpendable(spendCap, { site: "public-baseline-synthesis", model: openaiModel, projectedUsd: null });`) };

// d12 — the seed-host lane's gate
const d12 = { zero_seed_pages: seedLaneShouldRun({ noPublicSite: false, seedHost: "zz-subject.test", seedPagesRead: seedPagesRead([{ url: "https://www.zz-parent.test/" }], "zz-subject.test") }),
  seed_page_read: seedLaneShouldRun({ noPublicSite: false, seedHost: "zz-subject.test", seedPagesRead: seedPagesRead([{ url: "https://www.zz-subject.test/about" }], "zz-subject.test") }),
  no_public_site: seedLaneShouldRun({ noPublicSite: true, seedHost: "zz-subject.test", seedPagesRead: 0 }),
  wired: pbSrc.includes("const seedRead = seedPagesRead(crawledSiteEvidence, seedHostForLane);") && pbSrc.includes(`if (synthesis_engine === "claude_websearch" && seedLaneShouldRun({ noPublicSite, seedHost: seedHostForLane, seedPagesRead: seedRead })) {`) };

const d13 = { gpt41_sent_under_cap: fetchesPriced };

// d14 — citations become the rows
const CT = "ZZ Subject’s plans start at $30/mo — no  contracts,\nno caps.";
const RESP14 = { content: [
  { type: "text", text: "ZZ Subject's plans start at $30 a month.", citations: [{ type: "web_search_result_location", url: "https://www.zz-review.test/a", title: "ZZ review", cited_text: CT }] },
  { type: "text", text: "ZZ Subject is beloved by every customer." },
  { type: "text", text: "ZZ Cousin Holdings shares the name.", citations: [{ type: "web_search_result_location", url: "https://www.zz-cousin.test/about", title: "ZZ Cousin", cited_text: "ZZ Cousin Holdings is a different company." }] },
] };
const ce = citationEntries(RESP14, { excludeHosts: ["zz-cousin.test"], existingExcerpts: new Set() });
const drafts14 = mapPublicBaselineOutputToSignals({ companyId: "zz", sourceId: 1, resultJson: { evidence_ledger: ce.entries, outside_voice_signals: [] } });
const quiet14 = console.log; console.log = () => {};
await applyMintExcerptGuard({ supabase: { from: () => ({}) }, companyId: "zz", runId: "r", signals: drafts14, sourceTextByUrl: new Map(), webSearchCitedSpans: extractCitedSpans(RESP14) });
console.log = quiet14;
const SEEDRESP = { content: [
  { type: "text", text: "ZZ Subject sells broadband.", citations: [{ type: "web_search_result_location", url: "https://www.zz-subject.test/internet", title: "Internet", cited_text: "ZZ Subject — broadband for every home." }] },
  { type: "text", text: "ZZ Subject is the best." },
] };
const lane14 = buildSeedLaneRows({ companyId: "zz", runId: 1, seedHost: "zz-subject.test", captureDay: "2026-10-21", response: SEEDRESP, excludeHosts: [], existingExcerpts: new Set(),
  decide: (url) => decideVoiceClassBeforeJudge({ url, item: null, labeledClass: "client_voice", pageText: null, judgedText: null, company: { name: "", host: "zz-subject.test" }, registry: null, judge: null, gate: "profile", onJudgeFailure: "keep_label" } as never) as never });
const d14 = {
  rows: drafts14.length,
  uncited_rows: drafts14.filter((d) => /beloved/.test(String(d.claim_text))).length + lane14.rows.filter((r: any) => /the best/.test(String(r.claim_text))).length,
  excluded_rows: drafts14.filter((d) => String(d.source_url).includes("zz-cousin")).length,
  byte_equal: drafts14.length === 1 && drafts14[0].evidence_excerpt === CT,
  lane_rows: lane14.rows.length, lane_byte_equal: lane14.rows.length === 1 && (lane14.rows[0] as any).evidence_excerpt === "ZZ Subject — broadband for every home.",
  wired_main: pbSrc.includes("const cit = citationEntries(data, { excludeHosts: blockedHosts, existingExcerpts });") && pbSrc.includes("(parsed as any).evidence_ledger = cit.entries;") && pbSrc.includes("(parsed as any).outside_voice_signals = [];"),
  wired_lane: pbSrc.includes("response: lane.response, excludeHosts: laneExcludes, existingExcerpts: laneExisting,"),
};

// d15 — citation entries uncapped
const c15 = capEvidenceLedger([...Array.from({ length: 42 }, (_, i) => ({ citation: true, i })), ...Array.from({ length: 30 }, (_, i) => ({ i }))]);
const d15 = { cited_kept: c15.filter((e: any) => e.citation).length, others_kept: c15.filter((e: any) => !e.citation).length, wired: pbSrc.includes("result.evidence_ledger = capEvidenceLedger(existingLedger);") && !pbSrc.includes("result.evidence_ledger = existingLedger.slice(0, 24);") };
// d16 — placeholder profile entries refused
const d16 = { default_refused: isPlaceholderProfileSnippet(PROFILE_PLACEHOLDER_DEFAULT), empty_refused: isPlaceholderProfileSnippet(""), linked_refused: isPlaceholderProfileSnippet("Linked from company website (/)"), page_words_kept: !isPlaceholderProfileSnippet("Plans start at $30/mo."),
  wired: pbSrc.includes("if (isPlaceholderProfileSnippet(source?.snippet)) continue;") && !pbSrc.includes(`"Discovered public profile/source. Direct content extraction may be restricted by platform controls.",`) };
// d17 — projection covers the measured call; the lane after it is refused under $1.50; ceiling clamp
const main83 = projWS("claude-sonnet-4-6", { promptChars: 6000, maxUses: 12, maxTokens: 32000 })!;
const lane83 = projWS("claude-sonnet-4-6", { promptChars: 700, maxUses: 5, maxTokens: 8000 })!;
let laneRefused = false;
try { await assertSpendable(makeSpendCap({ capUsd: 1.5, companyId: "zz", since: "x", supabase: ledgerOf([{ provider: "anthropic", usd: 1.4597 }]) }), { site: "lane", model: "claude-sonnet-4-6", projectedUsd: lane83 }); } catch (e) { laneRefused = e instanceof SpendCapRefused; }
let mainAllowedAt83 = false;
try { await assertSpendable(makeSpendCap({ capUsd: 1.5, companyId: "zz", since: "x", supabase: ledgerOf([]) }), { site: "main", model: "claude-sonnet-4-6", projectedUsd: main83 }); mainAllowedAt83 = true; } catch { mainAllowedAt83 = false; }
const d17 = { projection_covers_actual: main83 >= 1.4597, main_refused_under_1_50: !mainAllowedAt83, lane_refused_after_main: laneRefused, clamp: [clampSpendCap(5), clampSpendCap(0.5)] };
// d18 — the lane-only entry point runs the lane alone
const lo0 = pbSrc.indexOf("if (body?.seed_lane_only === true) {");
const lo1 = pbSrc.indexOf(`return json({ status: "seed_lane_only"`, lo0);
const block = lo0 > 0 && lo1 > lo0 ? pbSrc.slice(lo0, lo1) : "";
const d18 = { found: !!block, runs_lane: block.includes("await executeSeedLane({"), forbidden: ["callClaudeWebSearch(", "crawlWebsiteEvidence(", "searxSearch(", "runPass(", "ingestPublicBaselineSignals(", "mintSiteCrawlSignals("].filter((f) => block.includes(f)),
  before_plan: lo0 > 0 && lo0 < pbSrc.indexOf("const plan = buildBaselineQueryPlan({"), gate: block.includes("seed_pages_read !== 0"), cap_required: block.includes("if (spendCapUsd == null) return json(") };

// d19 — own-words host order
const owRow = (i: number, host: string, day: string) => ({ id: `${host}-${String(i).padStart(2, "0")}`, quote: `q ${i}`, judge_kind: null, content_identity: `ci-${host}-${i}`, created_at: `2026-10-${day}T00:00:00Z`, source_url: `https://www.${host}/p${i}` });
const owAll = [...Array.from({ length: 30 }, (_, i) => owRow(i, "zz-merged.test", "20")), ...Array.from({ length: 8 }, (_, i) => owRow(i, "zz-subject.test", "21"))];
const owActive = new Set(owAll.map((r) => r.content_identity));
const withOrder = selectOwnWords(owAll, 25, owActive, () => true, { seed: "zz-subject.test", related: ["zz-merged.test"] });
const without = selectOwnWords(owAll, 25, owActive, () => true);
const inputsSrc = await read("supabase/functions/_shared/publicReadInputs.ts");
const d19 = { seed_kept_with_order: withOrder.kept.filter((w) => w.id.startsWith("zz-subject")).length, seed_kept_without: without.kept.filter((w) => w.id.startsWith("zz-subject")).length,
  identical_without: JSON.stringify(without) === JSON.stringify(selectOwnWords(owAll, 25, owActive, () => true, null)),
  wired: inputsSrc.includes("const owSel = selectOwnWords(owRest, READ_CAP.own_word, activeIdentities, owEligible, owHostOrder);") };
// d20 — per-model pricing on the claim-deltas ledger path
const deltasSrc = await read("supabase/functions/generate-claim-deltas/index.ts");
const r20 = openaiRecordsByModel(new Map([["gpt-4.1", { prompt_tokens: 1_000_000, completion_tokens: 100_000 }]]));
const d20 = { gpt41_usd: Math.round((r20[0]?.usd ?? 0) * 1e6) / 1e6, wired: deltasSrc.includes("openaiRecordsByModel(usageByModel)") && deltasSrc.includes("usageByModel.set(k,") && !/usage: openaiRecord\(billedModel, usage\),\n\s*\}\);/.test(deltasSrc) };

console.log(JSON.stringify({ d1, d2, d3, d4, d5, d6, d7, d8, d9, d10, d11, d12, d13, d14, d15, d16, d17, d18, d19, d20, rolled_back: B0 === B1, before: B0, after: B1 }));
