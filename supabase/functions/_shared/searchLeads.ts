// ── THE LEAD STORE's pure half (V2, 2026-11-18; the Charter voice research, ruling 1) ───────────────────────────────────
//
// Forum threads the paid page fetch cannot read — Reddit (the fetcher's user agent is refused) and DSLReports
// (url_not_allowed), both measured 2026-11-18 — are found through SearXNG's keyed Brave engine and kept ONLY as leads: the
// engine's own summary (snippet), the URL, the engine's date for the page, labelled "search summary, not checked against
// the page". A lead is never a signal, never a quote, never cited by a verdict and never counted toward the
// 3-reviews-from-2-sites bar (search-lead-guard).
//   * QUERIES are built only from a brand word and fixed public topic words — no company text of any kind.
//   * BRAND by the review lane's rule: the reviewed page list (r/Spectrum, r/CoxCommunications); any other forum is
//     "brand not recorded", its name kept as `forum`.
//   * a result must be a THREAD on the lead site and must name the company (spectrum / charter / cox) in its title,
//     snippet or URL. One lead per URL.
// Pure — no I/O.
import { pageForUrl, type CompanyReviewList } from "./reviewPages.ts";

export const LEAD_BASIS = "search_summary_unchecked" as const;
export const LEAD_BASIS_LABEL = "search summary, not checked against the page" as const;
export const LEAD_TOPICS: readonly string[] = ["billing", "price increase", "outage", "installation", "technician", "customer service", "cancel", "mobile", "TV"];
export type LeadSite = "reddit" | "dslreports";
export const LEAD_SITES: Record<LeadSite, { host: string; thread: RegExp }> = {
  reddit: { host: "reddit.com", thread: /^\/r\/([A-Za-z0-9_]+)\/comments\/[a-z0-9]+/i },
  dslreports: { host: "dslreports.com", thread: /^\/forum\/(r\d+)-/i },
};
const BRAND_WORD: Record<"spectrum" | "cox", string> = { spectrum: "Spectrum", cox: "Cox" };

export function leadQueries(site: LeadSite, brand: "spectrum" | "cox"): string[] {
  return LEAD_TOPICS.map((t) => `site:${LEAD_SITES[site].host} ${BRAND_WORD[brand]} ${t}`);
}

export type SearxResult = { url?: string; title?: string; content?: string; publishedDate?: string | null; engine?: string; engines?: string[] };
export type LeadStats = { results: number; off_site: number; not_thread: number; not_company: number; duplicate: number; kept: number; branded: number };

/** The lead rows for one query's results. */
export function leadRows(a: { list: CompanyReviewList; site: LeadSite; query: string; results: SearxResult[]; seen: Set<string> }): { rows: Array<Record<string, unknown>>; stats: LeadStats } {
  const stats: LeadStats = { results: a.results.length, off_site: 0, not_thread: 0, not_company: 0, duplicate: 0, kept: 0, branded: 0 };
  const rows: Array<Record<string, unknown>> = [];
  const site = LEAD_SITES[a.site];
  for (const r of a.results) {
    let u: URL;
    try { u = new URL(String(r.url ?? "")); } catch { stats.off_site++; continue; }
    const host = u.hostname.toLowerCase().replace(/^(?:www|old)\./, "");
    if (host !== site.host) { stats.off_site++; continue; }
    const m = site.thread.exec(u.pathname);
    if (!m) { stats.not_thread++; continue; }
    const snippet = String(r.content ?? "").trim();
    const title = String(r.title ?? "").trim();
    if (!snippet || !a.list.names.test(`${title} ${snippet} ${u.pathname}`)) { stats.not_company++; continue; }
    const url = `${u.origin}${u.pathname}`;
    if (a.seen.has(url)) { stats.duplicate++; continue; }
    a.seen.add(url);
    const page = pageForUrl(a.list, url);
    const d = r.publishedDate ? new Date(r.publishedDate) : null;
    rows.push({
      company_id: a.list.companyId, url, title, snippet,
      published_date: d && Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null,
      about_entity_id: page ? a.list.entities[page.entity] : null,
      about_entity_page: page ? page.key : null,
      forum: a.site === "reddit" ? m[1] : null,
      basis: LEAD_BASIS, basis_label: LEAD_BASIS_LABEL,
      engine: (r.engines ?? [r.engine ?? ""]).filter(Boolean).join(","),
      query: a.query,
    });
    stats.kept++;
    if (page) stats.branded++;
  }
  return { rows, stats };
}
