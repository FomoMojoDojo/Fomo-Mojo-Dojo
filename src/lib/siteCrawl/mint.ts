// Own-domain deterministic minting (design gate 2026-08-18, all five rulings).
//
// The baseline crawl already fetches the client's own pages every run
// (public-baseline crawlWebsiteEvidence); until this seam, that text became a
// signal only if the model chose to spend part of its bounded JSON on it. This
// module mints client_voice signals DETERMINISTICALLY from the crawl result —
// no model, no new fetches.
//
// Laws honored here:
//  - verbatim-or-nothing: claim_text = title+meta VERBATIM; the quote is cut
//    contiguously FROM the retained text, so the signals_quote_verbatim DB
//    CHECK passes by construction (quote_source_text = full extracted page).
//  - receipts-only (ruling 2): raw_payload marks these rows structurally;
//    the claim-rebuild path excludes them via isSiteCrawlReceiptRow below.
//  - supersession, never deletion (ruling 1): identity = normalized URL.
//    Re-crawl same URL: identical text → keep; changed text → insert new row
//    + stamp the old one (superseded_at, superseded_by). The (old → new)
//    pairs are the operator's "what changed on their site" report.
//  - self-voice by construction: voice_class='client_voice' FORCED — the
//    delta compute and First Read exclusions then apply automatically.
//
// Dependency-light on purpose: imported by BOTH the deno edge function
// (public-baseline) and vitest (src/** include), like quoteProducer.ts.

import { normalizeUrlKey } from "../firstRead/quoteProducer.ts";

export type SitePage = {
  url: string;
  title?: string | null;
  meta?: string | null;
  extracted: string;
};

export type SiteReadChange = { url: string; old_head: string; new_head: string };

export type SiteReadLedger = {
  pages_read: number;
  kept: number;
  added: number;
  superseded: number;
  changes: SiteReadChange[];
};

// Minimal client surface so tests can inject a mock and the edge fn can pass
// its service-role client unchanged.
type QueryResult = { data?: unknown; error?: { message?: string } | null };
export type MintClient = { from(table: string): any };

const HEAD_CHARS = 160;
const MIN_PAGE_CHARS = 80;
const QUOTE_MAX = 280;

export function pageHead(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, HEAD_CHARS);
}

// First quotable line, cut CONTIGUOUSLY from the retained text so it is a
// byte-exact substring (trim + slice + word-boundary backoff all preserve
// substring-ness). Returns null when no line has enough prose.
export function firstQuoteLine(extracted: string): string | null {
  for (const rawLine of String(extracted || "").split("\n")) {
    const line = rawLine.trim();
    if (line.length < 20) continue;
    if (line.length <= QUOTE_MAX) return line;
    const cut = line.slice(0, QUOTE_MAX);
    const backoff = cut.lastIndexOf(" ");
    return backoff > 40 ? cut.slice(0, backoff) : cut;
  }
  return null;
}

// Structural receipts-only read (ruling 2): the claim-rebuild path calls this
// on every signal row; site_crawl-minted rows never become claim candidates.
export function isSiteCrawlReceiptRow(row: { raw_payload?: unknown } | null | undefined): boolean {
  const rp = (row?.raw_payload ?? null) as { source_type?: unknown } | null;
  return String(rp?.source_type ?? "") === "site_crawl";
}

// Sitemap seed (ruling 4): parse <loc> URLs out of sitemap.xml text, keep
// same-domain http(s) pages only, capped. Pure text-in/urls-out so it is
// testable without any fetch.
export function parseSitemapUrls(xml: string, baseDomain: string, cap: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const domain = String(baseDomain || "").toLowerCase().replace(/^www\./, "");
  if (!domain) return out;
  const matches = String(xml || "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi);
  for (const m of matches) {
    if (out.length >= cap) break;
    try {
      const u = new URL(m[1]);
      if (u.protocol !== "http:" && u.protocol !== "https:") continue;
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      if (host !== domain && !host.endsWith(`.${domain}`)) continue;
      u.hash = "";
      const s = u.toString();
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    } catch {
      // ignore malformed loc entries
    }
  }
  return out;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return "/";
  }
}

export async function mintSiteCrawlSignals(args: {
  supabase: MintClient;
  companyId: string;
  runId: string | number | null;
  pages: SitePage[];
  /** Defense-in-depth (ruling: excluded domains stay excluded even if the
   *  client's own nav links them). Upstream policy filtering still applies. */
  excludeHosts?: string[];
  /** Injectable clock for tests. */
  nowIso?: () => string;
}): Promise<SiteReadLedger> {
  const now = args.nowIso ?? (() => new Date().toISOString());
  const captureDay = now().slice(0, 10);
  const excluded = (args.excludeHosts ?? []).map((h) => String(h || "").toLowerCase().replace(/^www\./, "")).filter(Boolean);

  const ledger: SiteReadLedger = { pages_read: 0, kept: 0, added: 0, superseded: 0, changes: [] };

  // Current (unsuperseded) site_crawl rows for this company, keyed by URL identity.
  const { data: existingRows, error: readErr }: QueryResult = await args.supabase
    .from("signals")
    .select("id, source_url, quote_source_text, raw_payload")
    .eq("company_id", args.companyId)
    .eq("raw_payload->>source_type", "site_crawl")
    .is("superseded_at", null);
  if (readErr) throw new Error(`site-mint: failed reading current site_crawl signals: ${readErr.message}`);

  const currentByKey = new Map<string, { id: string; text: string }>();
  for (const row of (Array.isArray(existingRows) ? existingRows : []) as Array<{ id: string; source_url?: string | null; quote_source_text?: string | null; raw_payload?: { site_text?: unknown } | null }>) {
    const key = normalizeUrlKey(String(row.source_url || ""));
    // compare basis: retained quote_source_text, else the raw_payload fallback
    const text = String(row.quote_source_text || row.raw_payload?.site_text || "");
    if (key && !currentByKey.has(key)) currentByKey.set(key, { id: String(row.id), text });
  }

  const seenKeys = new Set<string>();
  for (const page of args.pages) {
    const extracted = String(page.extracted || "");
    const key = normalizeUrlKey(String(page.url || ""));
    if (!key || seenKeys.has(key)) continue;
    if (extracted.trim().length < MIN_PAGE_CHARS) continue;
    const host = hostOf(page.url);
    if (excluded.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    seenKeys.add(key);
    ledger.pages_read++;

    const existing = currentByKey.get(key);
    if (existing && existing.text === extracted) {
      ledger.kept++;
      continue;
    }

    const title = String(page.title || "").trim();
    const meta = String(page.meta || "").trim();
    const path = pathOf(page.url);
    // claim_text = title+meta VERBATIM (ruling 3); the page-path label is the
    // fallback identity, not content.
    const claimText = [title, meta].filter(Boolean).join(" — ").slice(0, 600) || `Site page ${path}`;
    const quote = firstQuoteLine(extracted);

    const insertRow = {
      company_id: args.companyId,
      source_id: args.runId == null ? null : String(args.runId),
      source_type: "public_baseline_run",
      source_title: title || `Site page ${path}`,
      source_url: page.url,
      signal_band: "outside",
      evidence_type: "market_signal",
      claim_text: claimText,
      evidence_excerpt: pageHead(extracted),
      quote,
      // full retained page text AT MINT — the receipts easy case, and the
      // byte-compare basis for the next crawl's supersession decision
      quote_source_text: quote ? extracted : null,
      event_date: captureDay,
      event_date_precision: "day",
      topic: "company_own_site",
      framework: "public_baseline",
      directness: "direct",
      recency: "recent",
      framing_fit: "partial",
      structure_level: "extracted",
      validation_status: "directional",
      confidence_to_use: "medium",
      voice_class: "client_voice", // FORCED — own-domain is self-voice by construction
      raw_payload: {
        source_type: "site_crawl",
        receipts_only: true,
        path,
        // retained even when no quote lifts, so supersession compare never goes blind
        ...(quote ? {} : { site_text: extracted }),
      },
    };

    const { data: inserted, error: insErr }: QueryResult = await args.supabase
      .from("signals")
      .insert(insertRow)
      .select("id")
      .single();
    if (insErr) throw new Error(`site-mint: insert failed for ${page.url}: ${insErr.message}`);
    const newId = String((inserted as { id?: unknown } | null)?.id ?? "");

    if (existing) {
      // supersede, never delete (ruling 1)
      const { error: updErr }: QueryResult = await args.supabase
        .from("signals")
        .update({ superseded_at: now(), superseded_by: newId })
        .eq("id", existing.id);
      if (updErr) throw new Error(`site-mint: supersession stamp failed for ${page.url}: ${updErr.message}`);
      ledger.superseded++;
      ledger.changes.push({ url: page.url, old_head: pageHead(existing.text), new_head: pageHead(extracted) });
    } else {
      ledger.added++;
    }
  }

  return ledger;
}
