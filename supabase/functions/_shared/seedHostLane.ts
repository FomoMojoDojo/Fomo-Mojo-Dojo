// ── THE SEED-HOST CITED-TEXT LANE (operator ruling 2026-10-21, ruling 4 + fill brief step 3) ─────────────────────────────
//
// When a domain plan's own-site crawl read ZERO pages on the company's seed host (spectrum.com resets the crawler's
// connection — bot protection), one Claude web_search call restricted to that host (allowed_domains = [seed]) reads the
// company's own site through the search tool instead. Its rows are the subject's own voice by the one own-domain rule
// (decideVoiceClassBeforeJudge → own_domain), and each row's evidence_excerpt is a cited_text passage the tool returned for
// that URL, or blank (citedTextExcerpt) — basis websearch_cited_text, never our fetch, never the model's summary. The call
// is ledgered (public-baseline-seed-lane) and, on a capped run, checked against the cap before it is sent.
//
// Receipts-only like the crawl's own rows (raw_payload.source_type "seed_host_cited_text"; isSiteCrawlReceiptRow): own-site
// words are evidence, not claim candidates. A crawl that read ANY seed page never runs the lane.
import { citedTextExcerpt, WEBSEARCH_CITED_TEXT } from "./citedTextExcerpt.ts";
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
  return `Read the company "${companyName}" from its OWN website, ${seedHost}, using web search (results are limited to that site).\n` +
    `Find what the company itself says on its own pages: what it offers, who it serves, plans and prices, where it operates, and how it describes itself.\n` +
    `Then output a SINGLE JSON object — and NOTHING else — of this shape:\n` +
    `{ "items": [ { "url": "<a page on ${seedHost} returned by a search>", "statement": "<one short neutral sentence: what the page says>", "quote": "<the page's own words, copied exactly from the search result>" } ] }\n` +
    `Rules:\n- Use ONLY pages on ${seedHost} returned by your searches. Do NOT invent URLs or words.\n- At most 12 items. Emit the JSON object only — no markdown fences, no prose.`;
}

export type SeedLaneRowStats = { items: number; off_host: number; not_own: number; minted: number; cited: number; blanked: number };

/** The rows to insert, from the lane's parsed answer and the tool's cited passages. `decide` is the one voice authority
 *  (the caller passes decideVoiceClassBeforeJudge bound to the company's seed host). */
export function buildSeedLaneRows(args: {
  companyId: string;
  runId: string | number | null;
  seedHost: string;
  parsed: unknown;
  citedSpans: ReadonlyMap<string, readonly string[]>;
  decide: (url: string) => { ok: boolean; voice_class?: string; authority?: string } | Record<string, unknown>;
  captureDay: string;
}): { rows: Array<Record<string, unknown>>; stats: SeedLaneRowStats } {
  const items = Array.isArray((args.parsed as { items?: unknown })?.items) ? (args.parsed as { items: unknown[] }).items : [];
  const stats: SeedLaneRowStats = { items: items.length, off_host: 0, not_own: 0, minted: 0, cited: 0, blanked: 0 };
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const it of items as Array<{ url?: unknown; statement?: unknown; quote?: unknown }>) {
    const url = String(it?.url ?? "").trim();
    if (!url || !isOwnDomainUrl(url, args.seedHost)) { stats.off_host++; continue; }
    const d = args.decide(url) as { ok?: boolean; voice_class?: string; authority?: string };
    if (!d?.ok || d.voice_class !== "client_voice") { stats.not_own++; continue; }
    const statement = String(it?.statement ?? "").trim();
    const quote = String(it?.quote ?? "").trim();
    const v = citedTextExcerpt(quote || statement, url, args.citedSpans);
    const excerpt = v.kind === "cited" ? v.evidence_excerpt : "";
    const key = `${url}\n${excerpt || statement}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let path = "/";
    try { path = new URL(url).pathname || "/"; } catch { /* kept "/" */ }
    rows.push({
      company_id: args.companyId,
      source_id: args.runId == null ? null : String(args.runId),
      source_type: "public_baseline_run",
      source_title: `Own site via web search (${path})`,
      source_url: url,
      signal_band: "outside",
      evidence_type: "market_signal",
      claim_text: (statement || excerpt).slice(0, 600) || `Own site page ${path}`,
      evidence_excerpt: excerpt,
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
        url,
        voice_authority: { authority: d.authority ?? "own_domain" },
        excerpt_guard: v.kind === "cited"
          ? { basis: WEBSEARCH_CITED_TEXT, traced: true }
          : { basis: WEBSEARCH_CITED_TEXT, traced: false, reason: v.kind === "blanked" ? v.reason : "no_excerpt", ...(v.kind === "blanked" ? { unverified_excerpt: v.unverified_excerpt } : {}) },
      },
    });
    stats.minted++;
    if (excerpt) stats.cited++; else stats.blanked++;
  }
  return { rows, stats };
}
