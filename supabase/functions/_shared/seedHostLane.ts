// ── THE SEED-HOST CITED-TEXT LANE (operator ruling 2026-10-21, ruling 4 + fill brief step 3) ─────────────────────────────
//
// When a domain plan's own-site crawl read ZERO pages on the company's seed host (spectrum.com resets the crawler's
// connection — bot protection), one Claude web_search call restricted to that host (allowed_domains = [seed]) reads the
// company's own site through the search tool instead. Its rows are the subject's own voice by the one own-domain rule
// (decideVoiceClassBeforeJudge → own_domain). Rows come from the tool's CITATIONS only (ruling 1, 2026-10-21): each row's
// evidence_excerpt is a citation's cited_text, verbatim — basis websearch_cited_text, never our fetch, never the model's
// summary; an uncited sentence mints nothing. The call
// is ledgered (public-baseline-seed-lane) and, on a capped run, checked against the cap before it is sent.
//
// Receipts-only like the crawl's own rows (raw_payload.source_type "seed_host_cited_text"; isSiteCrawlReceiptRow): own-site
// words are evidence, not claim candidates. A crawl that read ANY seed page never runs the lane.
import { WEBSEARCH_CITED_TEXT } from "./citedTextExcerpt.ts";
import { citationEntries } from "./citationRows.ts";
import { isOwnDomainUrl } from "./firstReadProvenance.ts";

export const SEED_LANE_SOURCE_TYPE = "seed_host_cited_text" as const;
export const SEED_LANE_CALL_SITE = "public-baseline-seed-lane" as const;
export const SEED_LANE_MAX_USES = 5;
export const SEED_LANE_MAX_TOKENS = 8000;

/** How many crawled pages are on the seed host (a related host's page is not the seed's). */
export function seedPagesRead(pages: ReadonlyArray<{ url: string }>, seedHost: string | null): number {
  if (!seedHost) return 0;
  return pages.filter((p) => isOwnDomainUrl(String(p.url || ""), seedHost)).length;
}

/** The lane runs ONLY on a domain plan whose own-site crawl read zero seed pages. */
export function seedLaneShouldRun(args: { noPublicSite: boolean; seedHost: string | null; seedPagesRead: number }): boolean {
  return !args.noPublicSite && !!args.seedHost && args.seedPagesRead === 0;
}

export function seedLaneTool(seedHost: string): Record<string, unknown> {
  return { type: "web_search_20250305", name: "web_search", max_uses: SEED_LANE_MAX_USES, allowed_domains: [seedHost] };
}

export function seedLanePrompt(companyName: string, seedHost: string): string {
  // RULING 1 (2026-10-21): rows are built from the tool's citations, which attach only to prose — so the lane asks for
  // cited sentences, not JSON.
  return `Read the company "${companyName}" from its OWN website, ${seedHost}, using web search (results are limited to that site).\n` +
    `Find what the company itself says on its own pages: what it offers, who it serves, plans and prices, where it operates, and how it describes itself.\n` +
    `Write each thing the site says as its own short sentence of prose, citing the page it comes from. Every sentence must carry a citation; ` +
    `a sentence you cannot cite, do not write. At most 15 sentences. No headings, no lists, no JSON.`;
}

export type SeedLaneRowStats = { citations: number; cited_blocks: number; uncited_blocks: number; excluded: number; duplicate_in_run: number; duplicate_existing: number; off_host: number; not_own: number; minted: number };

/** The rows to insert, from the lane's raw response: one per citation of a cited sentence on the seed host (citationEntries
 *  — uncited sentences, excluded hosts and duplicates mint nothing). claim_text = the sentence, evidence_excerpt = the
 *  citation's cited_text verbatim, url/title from the citation. `decide` is the one voice authority (the caller binds
 *  decideVoiceClassBeforeJudge to the company's seed host). */
export function buildSeedLaneRows(args: {
  companyId: string;
  runId: string | number | null;
  seedHost: string;
  response: unknown;
  excludeHosts: readonly string[];
  existingExcerpts: ReadonlySet<string>;
  decide: (url: string) => { ok: boolean; voice_class?: string; authority?: string } | Record<string, unknown>;
  captureDay: string;
}): { rows: Array<Record<string, unknown>>; stats: SeedLaneRowStats } {
  const { entries, stats: c } = citationEntries(args.response, { excludeHosts: args.excludeHosts, existingExcerpts: args.existingExcerpts });
  const stats: SeedLaneRowStats = { citations: c.citations, cited_blocks: c.cited_blocks, uncited_blocks: c.uncited_blocks, excluded: c.excluded, duplicate_in_run: c.duplicate_in_run, duplicate_existing: c.duplicate_existing, off_host: 0, not_own: 0, minted: 0 };
  const rows: Array<Record<string, unknown>> = [];
  for (const e of entries) {
    if (!isOwnDomainUrl(e.url, args.seedHost)) { stats.off_host++; continue; }
    const d = args.decide(e.url) as { ok?: boolean; voice_class?: string; authority?: string };
    if (!d?.ok || d.voice_class !== "client_voice") { stats.not_own++; continue; }
    let path = "/";
    try { path = new URL(e.url).pathname || "/"; } catch { /* kept "/" */ }
    rows.push({
      company_id: args.companyId,
      source_id: args.runId == null ? null : String(args.runId),
      source_type: "public_baseline_run",
      source_title: e.title || `Own site via web search (${path})`,
      source_url: e.url,
      signal_band: "outside",
      evidence_type: "market_signal",
      claim_text: e.sentence.slice(0, 600),
      evidence_excerpt: e.cited_text,
      event_date: args.captureDay,
      event_date_precision: "day",
      topic: "company_own_site",
      framework: "public_baseline",
      directness: "direct",
      recency: "recent",
      framing_fit: "partial",
      structure_level: "extracted",
      validation_status: "directional",
      confidence_to_use: "medium",
      voice_class: "client_voice",
      raw_payload: {
        source_type: SEED_LANE_SOURCE_TYPE,
        receipts_only: true,
        path,
        url: e.url,
        title: e.title,
        sentence: e.sentence,
        cited_text: e.cited_text,
        citation: true,
        voice_authority: { authority: d.authority ?? "own_domain" },
        excerpt_guard: { basis: WEBSEARCH_CITED_TEXT, traced: true },
      },
    });
    stats.minted++;
  }
  return { rows, stats };
}
