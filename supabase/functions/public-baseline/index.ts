// supabase/functions/public-baseline/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ingestPublicBaselineSignals } from "../_shared/evidencePhase1.ts";
import { normalizeUrlKey } from "../../../src/lib/firstRead/quoteProducer.ts";
import { extractCitationSourceText, mergeCitationSourceText } from "../../../src/lib/firstRead/citationSource.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addMinutesIso(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

async function acquireCompanyRunLock(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  userId: string;
  operation: string;
  ttlMinutes?: number;
}) {
  const ttlMinutes = args.ttlMinutes ?? 30;

  await args.supabase
    .from("company_run_locks")
    .delete()
    .eq("company_id", args.companyId)
    .lt("expires_at", new Date().toISOString());

  const { error } = await args.supabase
    .from("company_run_locks")
    .insert({
      company_id: args.companyId,
      operation: args.operation,
      started_by: args.userId,
      expires_at: addMinutesIso(ttlMinutes),
    });

  if (!error) return null;

  const { data: existing } = await args.supabase
    .from("company_run_locks")
    .select("operation, started_at, expires_at")
    .eq("company_id", args.companyId)
    .maybeSingle();

  return { error, existing };
}

async function releaseCompanyRunLock(supabase: ReturnType<typeof createClient>, companyId: string) {
  const { error } = await supabase.from("company_run_locks").delete().eq("company_id", companyId);
  if (error) {
    console.log("[baseline] lock release error", error.message);
  }
}

function waitUntil(promise: Promise<unknown>) {
  const edgeRuntime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(promise);
}

async function triggerMojoAnalysis(companyId: string, supabaseUrl: string, serviceRoleKey: string) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/run-mojo-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ company_id: companyId, trigger_type: "baseline_complete" }),
    });
    console.log("[baseline] triggered mojo analysis, status:", res.status);
  } catch (err) {
    console.error("[baseline] failed to trigger mojo analysis:", err);
  }
}

// RB-1 Stage 4: fire the claim reconcile in its OWN invocation (fresh request
// budget), so it no longer runs in this request's overtime where it could be cut
// off mid-run (Edgewood: 21 claims / 0 refs). The reconcile is idempotent, so this
// is safe alongside the inline rebuild ingest already ran: whichever finishes, the
// pool converges to the same fixed point; if the inline one was cut, this one (with
// a full budget) completes it.
async function triggerRebuildClaims(companyId: string, supabaseUrl: string, serviceRoleKey: string) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/rebuild-claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceRoleKey}` },
      body: JSON.stringify({ company_id: companyId }),
    });
    console.log("[baseline] triggered rebuild-claims, status:", res.status);
  } catch (err) {
    console.error("[baseline] failed to trigger rebuild-claims:", err);
  }
}

function startCompanyRunLockHeartbeat(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  ttlMinutes: number;
  intervalMs?: number;
}) {
  const intervalMs = args.intervalMs ?? 5 * 60_000;

  const timer = setInterval(async () => {
    const { error } = await args.supabase
      .from("company_run_locks")
      .update({ expires_at: addMinutesIso(args.ttlMinutes) })
      .eq("company_id", args.companyId);

    if (error) {
      console.log("[baseline] lock heartbeat error", error.message);
    }
  }, intervalMs);

  return () => clearInterval(timer);
}

function extractTextBasic(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|br|li|h1|h2|h3|h4|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function fetchWithTimeout(url: string, ms: number, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const headers = new Headers(init.headers || {});
    if (!headers.has("User-Agent")) {
      headers.set("User-Agent", "Mozilla/5.0 (compatible; MojoBaselineBot/1.0; +https://fomomojodojo.com)");
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    }
    if (!headers.has("Accept-Language")) {
      headers.set("Accept-Language", "en-US,en;q=0.8");
    }

    return await fetch(url, {
      ...init,
      signal: controller.signal,
      redirect: init.redirect || "follow",
      headers,
    });
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseModelList(raw: string) {
  return Array.from(
    new Set(
      String(raw || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function buildOpenAIModelCandidates(primaryModel: string, extraFallbacks: string[] = []) {
  const envFallbacks = parseModelList(
    Deno.env.get("OPENAI_FALLBACK_MODELS") ||
    Deno.env.get("OPENAI_FALLBACK_MODEL") ||
    "",
  );
  const defaultFallbacks = ["gpt-4.1-mini", "gpt-4.1-nano"];
  return Array.from(
    new Set(
      [primaryModel, ...extraFallbacks, ...envFallbacks, ...defaultFallbacks]
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function isTransientOpenAIHttpStatus(status: number, errText: string) {
  if ([408, 409, 429, 500, 502, 503, 504].includes(status)) return true;
  const text = String(errText || "").toLowerCase();
  return text.includes("temporarily unavailable") ||
    text.includes("request timed out") ||
    text.includes("timeout") ||
    text.includes("capacity") ||
    text.includes("overloaded") ||
    text.includes("rate limit");
}

function isTransientOpenAIError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("capacity") ||
    message.includes("overloaded") ||
    message.includes("rate limit") ||
    message.includes("429");
}

function isModelFailoverEligibleError(error: unknown) {
  const message = String(error instanceof Error ? error.message : error).toLowerCase();
  return message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("capacity") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable") ||
    message.includes("service unavailable") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("upstream");
}

function getDomain(rawUrl: string): string {
  try {
    return new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`)
      .hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function hostMatchesAnyDomain(host: string, domains: string[]) {
  const normalizedHost = String(host || "").trim().toLowerCase().replace(/^www\./, "");
  if (!normalizedHost) return false;
  return domains.some((domain) => {
    const d = String(domain || "").trim().toLowerCase().replace(/^www\./, "");
    if (!d) return false;
    return normalizedHost === d || normalizedHost.endsWith(`.${d}`);
  });
}

function domainStem(domain: string): string {
  const d = (domain || "").replace(/^www\./, "");
  return d.split(".")[0] || "";
}

function normalizeText(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(
    normalizeText(s)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

function splitCamelCase(name: string): string {
  return (name || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function toSlug(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .trim();
}

function inferLinkedInCompanyUrls(companyName: string, website: string) {
  const generic = new Set(["inc", "llc", "ltd", "co", "company", "corp", "corporation"]);
  const stem = domainStem(getDomain(website));
  const nameTokens = splitCamelCase(companyName)
    .split(/\s+/)
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean)
    .filter((t) => !generic.has(t));
  const nameSlug = toSlug(nameTokens.join("-"));
  const candidates = Array.from(
    new Set(
      [
        nameSlug,
        stem ? toSlug(stem) : "",
        nameSlug ? `${nameSlug}-technology` : "",
        nameSlug ? `${nameSlug}-tech` : "",
        stem ? `${toSlug(stem)}-technology` : "",
      ].filter(Boolean),
    ),
  )
    .slice(0, 6)
    .map((slug) => `https://www.linkedin.com/company/${slug}/`);

  return candidates;
}

function buildNameVariants(companyName: string, website: string): string[] {
  const d = getDomain(website);
  const stem = domainStem(d);

  const v1 = (companyName || "").trim();
  const v2 = splitCamelCase(v1);
  const v3 = stem ? stem : "";
  const v4 = stem ? splitCamelCase(stem) : "";

  const variants = [v1, v2, v3, v4]
    .map((x) => (x || "").trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of variants) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

const GENERIC_TOKENS = new Set([
  "inc",
  "llc",
  "ltd",
  "co",
  "company",
  "corp",
  "corporation",
  "group",
  "labs",
  "lab",
  "systems",
  "system",
  "platform",
  "solutions",
  "solution",
  "services",
  "service",
  "technologies",
  "technology",
  "the",
  "and",
  "for",
]);

const EDUCATION_MISMATCH_TERMS = [
  "school",
  "teacher",
  "teaching",
  "classroom",
  "curriculum",
  "students",
  "academy",
  "k-12",
  "kindergarten",
  "college",
  "university",
];

/**
 * Soft-match scoring:
 * - We keep ALL search results, but assign match_score + match_reason.
 * - We then pick evidence candidates from best matches.
 */
function scoreCompanyMatch(args: {
  companyName: string;
  website: string;
  url: string;
  title?: string;
  snippet?: string;
}) {
  const { companyName, website, url, title = "", snippet = "" } = args;

  const domain = getDomain(website);
  const stem = domainStem(domain);
  const u = (url || "").toLowerCase();
  const hay = normalizeText(`${title} ${snippet}`);

  const reasons: string[] = [];
  let score = 0;

  // 1) Domain match is strongest
  if (domain && u.includes(domain)) {
    score += 90;
    reasons.push("domain_match");
  }

  // 2) Domain stem match (fomomojodojo)
  if (stem && (u.includes(stem) || hay.includes(stem))) {
    score += 20;
    reasons.push("domain_stem");
  }

  // 3) Company name token overlap
  const variants = buildNameVariants(companyName, website);
  const nameTokens = new Set<string>();
  for (const v of variants) for (const t of tokenSet(v)) nameTokens.add(t);
  for (const g of GENERIC_TOKENS) nameTokens.delete(g);

  let hits = 0;
  let longHit = false;
  for (const t of nameTokens) {
    if (hay.includes(t)) {
      hits++;
      if (t.length >= 5) longHit = true;
    }
  }

  if (hits >= 3) {
    score += 40;
    reasons.push("name_tokens_strong");
  } else if (hits === 2) {
    score += 25;
    reasons.push("name_tokens_medium");
  } else if (hits === 1) {
    score += 10;
    reasons.push("name_tokens_weak");
  }

  // Slight confidence bump if we hit at least one longer token
  if (longHit) {
    score += 5;
    reasons.push("rare_token");
  }

  // 4) Mismatch penalty for likely education-focused results unless evidence strongly matches domain/name.
  const educationHit = EDUCATION_MISMATCH_TERMS.some((term) => hay.includes(term));
  const strongIdentityMatch =
    (domain && u.includes(domain)) ||
    (stem && (u.includes(stem) || hay.includes(stem))) ||
    hits >= 2;
  if (educationHit && !strongIdentityMatch) {
    score -= 35;
    reasons.push("possible_education_mismatch");
  }

  if (nameTokens.size === 0) reasons.push("no_name_tokens");

  score = Math.min(100, score);
  score = Math.max(0, score);
  return { score, reasons, variants, domain, stem };
}

// SRCH-1 — search-health accumulator. A suspended SearXNG answers HTTP 200 with
// results:[] and names the fault in unresponsive_engines, so "the search backend is
// blocked" was indistinguishable from "this company has thin public evidence": a
// couldn't-check was persisted as a looked-and-found-nothing. This collects, across
// every query in a run, what the backend actually reported so the refusal can be
// classified honestly instead of guessed at.
type SearchDiag = {
  queriesRun: number;
  queriesWithResults: number;
  totalRawResults: number;
  /** engine name → the reason SearXNG gave (e.g. "Suspended: too many requests"). */
  unresponsive: Map<string, string>;
};

function newSearchDiag(): SearchDiag {
  return { queriesRun: 0, queriesWithResults: 0, totalRawResults: 0, unresponsive: new Map() };
}

/**
 * Unambiguous-outage rule (deliberately conservative — see SRCH-1). Only claim the
 * backend was unusable when BOTH hold:
 *   1. every query in the run came back with ZERO raw results, and
 *   2. SearXNG itself named at least one unresponsive engine.
 * If ANY query returned anything, search was working and a thin verdict is the honest
 * one. If nothing came back but no engine reported a fault, that is a genuine
 * looked-and-found-nothing (or a query problem) and also stays thin. Only the
 * both-conditions case is reported as a couldn't-check.
 */
function isUnambiguousSearchOutage(diag: SearchDiag): boolean {
  return diag.queriesRun > 0 && diag.totalRawResults === 0 && diag.unresponsive.size > 0;
}

function describeUnresponsive(diag: SearchDiag): string {
  return [...diag.unresponsive.entries()].map(([engine, why]) => `${engine}: ${why}`).join("; ");
}

async function searxSearch(searxUrl: string, query: string, count: number, diag?: SearchDiag) {
  console.log("[baseline] starting search", { searxUrl, query, count });

  const u = new URL("/search", searxUrl);
  u.searchParams.set("q", query);
  u.searchParams.set("format", "json");
  u.searchParams.set("language", "en");
  u.searchParams.set("safesearch", "0");

  const resp = await fetchWithTimeout(u.toString(), 20_000);
  if (!resp.ok) throw new Error(`SearxNG error ${resp.status}`);

  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];

  // SRCH-1: record what the backend said about itself. Shape per SearXNG:
  // "unresponsive_engines": [["brave","Suspended: too many requests"], ...]
  if (diag) {
    diag.queriesRun += 1;
    diag.totalRawResults += results.length;
    if (results.length > 0) diag.queriesWithResults += 1;
    const unresponsive = Array.isArray(data?.unresponsive_engines) ? data.unresponsive_engines : [];
    for (const entry of unresponsive) {
      const engine = Array.isArray(entry) ? String(entry[0] ?? "") : String((entry as any)?.engine ?? "");
      const why = Array.isArray(entry) ? String(entry[1] ?? "") : String((entry as any)?.error ?? "");
      if (engine && !diag.unresponsive.has(engine)) diag.unresponsive.set(engine, why || "unresponsive");
    }
  }

  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of results) {
    const url = r?.url;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: r?.title ?? "",
      snippet: r?.content ?? "",
      engine: r?.engine ?? "",
    });
    if (out.length >= count) break;
  }

  console.log("[baseline] search results", {
    rawCount: results.length,
    outCount: out.length,
    first: out[0]?.url ?? null,
  });

  return out;
}

async function fetchAndExtract(url: string) {
  try {
    const resp = await fetchWithTimeout(url, 20_000);
    const ct = resp.headers.get("content-type") || "";
    if (!resp.ok) return { url, ok: false, status: resp.status, text: "" };

    if (ct.includes("application/pdf")) return { url, ok: false, status: 415, text: "" };

    const html = await resp.text();
    const text = extractTextBasic(html);
    const capped = text.slice(0, 12_000);
    return { url, ok: true, status: 200, text: capped };
  } catch {
    return { url, ok: false, status: 0, text: "" };
  }
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeCandidateUrl(value: string, baseUrl: string) {
  try {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:") ||
      raw.startsWith("javascript:") ||
      raw.startsWith("#")
    ) {
      return null;
    }

    const url = new URL(raw, baseUrl);
    url.hash = "";
    url.search = "";

    const path = url.pathname.toLowerCase();
    if (
      path.endsWith(".png") ||
      path.endsWith(".jpg") ||
      path.endsWith(".jpeg") ||
      path.endsWith(".gif") ||
      path.endsWith(".svg") ||
      path.endsWith(".webp") ||
      path.endsWith(".css") ||
      path.endsWith(".js") ||
      path.endsWith(".json") ||
      path.endsWith(".xml") ||
      path.endsWith(".pdf") ||
      path.endsWith(".zip")
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function extractTitleFromHtml(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return "";
  return decodeHtmlEntities(match[1].replace(/\s+/g, " ").trim());
}

function extractMetaDescriptionFromHtml(html: string) {
  const candidates = [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];
  for (const regex of candidates) {
    const match = html.match(regex);
    if (!match) continue;
    const text = decodeHtmlEntities(String(match[1] || "").replace(/\s+/g, " ").trim());
    if (text) return text;
  }
  return "";
}

function extractSocialLinksFromHtmlMetadata(html: string, baseUrl: string) {
  const out: string[] = [];
  const pushUrl = (candidate: string) => {
    const normalized = normalizeCandidateUrl(candidate, baseUrl);
    if (!normalized) return;
    const host = getDomain(normalized);
    if (!isKnownSocialHost(host)) return;
    out.push(normalized);
  };

  const twitterSiteMatch = html.match(/<meta[^>]+name=["']twitter:site["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const twitterSite = String(twitterSiteMatch?.[1] || "").trim();
  if (twitterSite.startsWith("@") && twitterSite.length > 1) {
    pushUrl(`https://x.com/${twitterSite.slice(1)}`);
  } else if (twitterSite.startsWith("http")) {
    pushUrl(twitterSite);
  }

  const metaContentRegex = /<meta[^>]+content=["']([^"']+)["'][^>]*>/gi;
  let metaMatch: RegExpExecArray | null = null;
  while ((metaMatch = metaContentRegex.exec(html)) !== null) {
    const content = String(metaMatch[1] || "").trim();
    if (!content.startsWith("http")) continue;
    pushUrl(content);
  }

  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonMatch: RegExpExecArray | null = null;
  while ((jsonMatch = jsonLdRegex.exec(html)) !== null) {
    const raw = String(jsonMatch[1] || "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const visit = (node: unknown) => {
        if (!node) return;
        if (Array.isArray(node)) {
          for (const item of node) visit(item);
          return;
        }
        if (typeof node !== "object") return;
        const record = node as Record<string, unknown>;
        const sameAs = record.sameAs;
        if (Array.isArray(sameAs)) {
          for (const value of sameAs) {
            pushUrl(String(value || ""));
          }
        } else if (typeof sameAs === "string") {
          pushUrl(sameAs);
        }
        for (const value of Object.values(record)) {
          if (value && typeof value === "object") visit(value);
        }
      };
      visit(parsed);
    } catch {
      // ignore malformed JSON-LD blobs
    }
  }

  return Array.from(new Set(out));
}

function extractLinksFromHtml(html: string, baseUrl: string) {
  const links: string[] = [];
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(html)) !== null) {
    const normalized = normalizeCandidateUrl(match[1], baseUrl);
    if (!normalized) continue;
    links.push(normalized);
  }
  return links;
}

function extractScriptUrlsFromHtml(html: string, baseUrl: string) {
  const links: string[] = [];
  const regex = /<script[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(html)) !== null) {
    try {
      const raw = String(match[1] || "").trim();
      if (!raw || raw.startsWith("data:")) continue;
      const url = new URL(raw, baseUrl);
      url.hash = "";
      links.push(url.toString());
    } catch {
      // ignore malformed script src
    }
  }
  return Array.from(new Set(links));
}

function extractSocialUrlsFromText(value: string, baseUrl: string) {
  const out: string[] = [];
  const push = (candidate: string) => {
    const normalized = normalizeCandidateUrl(candidate, baseUrl);
    if (!normalized) return;
    if (!isKnownSocialHost(getDomain(normalized))) return;
    out.push(normalized);
  };

  const text = String(value || "");
  const plainMatches = text.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];
  for (const match of plainMatches) push(match);

  const escapedMatches = text.match(/https?:\\\/\\\/[^\s"'<>\\)]+/gi) || [];
  for (const match of escapedMatches) {
    push(match.replace(/\\\//g, "/"));
  }

  return Array.from(new Set(out));
}

function extractHttpUrlsFromText(value: string, baseUrl: string) {
  const out: string[] = [];
  const push = (candidate: string) => {
    const normalized = normalizeCandidateUrl(candidate, baseUrl);
    if (!normalized) return;
    out.push(normalized);
  };

  const text = String(value || "");
  const plainMatches = text.match(/https?:\/\/[^\s"'<>\\)]+/gi) || [];
  for (const match of plainMatches) push(match);

  const escapedMatches = text.match(/https?:\\\/\\\/[^\s"'<>\\)]+/gi) || [];
  for (const match of escapedMatches) {
    push(match.replace(/\\\//g, "/"));
  }

  return Array.from(new Set(out));
}

function isKnownSocialHost(host: string) {
  return hostMatchesAnyDomain(host, [
    "linkedin.com",
    "x.com",
    "twitter.com",
    "facebook.com",
    "instagram.com",
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "threads.net",
  ]);
}

function socialSourceTypeForHost(host: string) {
  if (hostMatchesAnyDomain(host, ["linkedin.com"])) return "profile_or_company_page";
  if (hostMatchesAnyDomain(host, ["reddit.com", "quora.com"])) return "community_discussion";
  return "profile_or_company_page";
}

async function crawlWebsiteEvidence(args: {
  startUrl: string;
  baseDomain: string;
  maxPages?: number;
  maxDepth?: number;
}) {
  const maxPages = Math.max(1, Number(args.maxPages || 8));
  const maxDepth = Math.max(0, Number(args.maxDepth || 2));
  const start = new URL(args.startUrl);
  const COMMON_PATHS = [
    "/",
    "/about",
    "/about-us",
    "/company",
    "/solutions",
    "/services",
    "/products",
    "/pricing",
    "/contact",
    "/blog",
    "/news",
    "/faq",
    "/team",
    "/careers",
  ];
  const seededUrls = Array.from(
    new Set(
      COMMON_PATHS.map((path) => {
        const next = new URL(start.toString());
        next.pathname = path;
        next.search = "";
        next.hash = "";
        return next.toString();
      }),
    ),
  );
  const queue: Array<{ url: string; depth: number }> = [
    { url: args.startUrl, depth: 0 },
    ...seededUrls.filter((url) => url !== args.startUrl).map((url) => ({ url, depth: 1 })),
  ];
  const visited = new Set<string>();
  const evidence: Array<{ url: string; title: string; snippet: string; extracted: string; source_type: string }> = [];
  const socialSources: Array<{ url: string; title: string; snippet: string; source_type: string; discovered_from: string }> = [];
  const seenSocial = new Set<string>();

  while (queue.length > 0 && visited.size < maxPages) {
    const next = queue.shift();
    if (!next) break;
    if (visited.has(next.url)) continue;
    visited.add(next.url);

    try {
      const resp = await fetchWithTimeout(next.url, 8_000);
      if (!resp.ok) continue;
      const contentType = String(resp.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/html")) continue;

      const finalUrl = String(resp.url || next.url);
      const finalHost = getDomain(finalUrl);
      if (!domainMatches(finalHost, args.baseDomain)) continue;

      const html = await resp.text();
      const text = extractTextBasic(html);
      const title = extractTitleFromHtml(html);
      const metaDescription = extractMetaDescriptionFromHtml(html);
      const metadataSocialLinks = extractSocialLinksFromHtmlMetadata(html, finalUrl);
      const inlineSocialLinks = extractSocialUrlsFromText(html, finalUrl);
      const mergedStaticSocialLinks = Array.from(new Set([...metadataSocialLinks, ...inlineSocialLinks]));
      for (const link of mergedStaticSocialLinks) {
        if (seenSocial.has(link)) continue;
        seenSocial.add(link);
        const host = getDomain(link);
        socialSources.push({
          url: link,
          title: `Social profile metadata (${host})`,
          snippet: `Declared in page metadata (${new URL(finalUrl).pathname || "/"})`,
          source_type: socialSourceTypeForHost(host),
          discovered_from: finalUrl,
        });
      }

      // Some sites render footer/social links via JS bundles only; inspect a few same-domain scripts on the home page.
      if (next.depth === 0 && socialSources.length < 8) {
        const scriptUrls = extractScriptUrlsFromHtml(html, finalUrl)
          .filter((scriptUrl) => domainMatches(getDomain(scriptUrl), args.baseDomain))
          .slice(0, 4);

        for (const scriptUrl of scriptUrls) {
          try {
            const scriptResp = await fetchWithTimeout(scriptUrl, 6_000);
            if (!scriptResp.ok) continue;
            const scriptContentType = String(scriptResp.headers.get("content-type") || "").toLowerCase();
            if (!scriptContentType.includes("javascript") && !scriptContentType.includes("text/plain")) continue;
            const scriptText = (await scriptResp.text()).slice(0, 600_000);
            const discoveredFromScript = extractSocialUrlsFromText(scriptText, finalUrl);
            for (const link of discoveredFromScript) {
              if (seenSocial.has(link)) continue;
              seenSocial.add(link);
              const host = getDomain(link);
              socialSources.push({
                url: link,
                title: `Social profile in script (${host})`,
                snippet: `Referenced in script asset from company site`,
                source_type: socialSourceTypeForHost(host),
                discovered_from: scriptUrl,
              });
            }
          } catch {
            // ignore script fetch failures
          }
        }
      }

      const pageSignal = [title, metaDescription, text]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join("\n");
      const capped = pageSignal.slice(0, 12_000);

      if (capped.length >= 80) {
        const path = new URL(finalUrl).pathname || "/";
        evidence.push({
          url: finalUrl,
          title: title || `Site page ${path}`,
          snippet: `Site crawl (${path})`,
          extracted: capped,
          source_type: "public_web",
        });
      }

      if (next.depth < maxDepth) {
        const links = extractLinksFromHtml(html, finalUrl);
        for (const link of links) {
          const host = getDomain(link);
          if (isKnownSocialHost(host) && !seenSocial.has(link)) {
            seenSocial.add(link);
            socialSources.push({
              url: link,
              title: `Social profile link (${host})`,
              snippet: `Linked from company website (${new URL(finalUrl).pathname || "/"})`,
              source_type: socialSourceTypeForHost(host),
              discovered_from: finalUrl,
            });
          }
          if (visited.has(link)) continue;
          if (!domainMatches(host, args.baseDomain)) continue;
          if (queue.length >= maxPages * 6) break;
          queue.push({ url: link, depth: next.depth + 1 });
        }
      }
    } catch {
      // skip transient crawl failures
    }
  }

  return {
    siteEvidence: evidence.slice(0, maxPages),
    socialSources: socialSources.slice(0, 20),
  };
}

function inferSourceType(url: string, title = "", snippet = ""): string {
  const host = getDomain(url);
  const text = `${title} ${snippet}`.toLowerCase();

  if (hostMatchesAnyDomain(host, ["glassdoor.com", "indeed.com"])) return "employee_review";
  if (hostMatchesAnyDomain(host, ["g2.com", "capterra.com", "trustpilot.com", "yelp.com", "homeadvisor.com", "angi.com", "angieslist.com", "thumbtack.com", "bbb.org", "houzz.com", "porch.com"])) return "customer_review";
  if (hostMatchesAnyDomain(host, ["reddit.com", "quora.com"])) return "community_discussion";
  if (hostMatchesAnyDomain(host, ["linkedin.com"])) return "profile_or_company_page";
  if (hostMatchesAnyDomain(host, ["x.com", "twitter.com", "facebook.com", "instagram.com", "youtube.com", "youtu.be", "tiktok.com", "threads.net"])) return "profile_or_company_page";
  if (hostMatchesAnyDomain(host, ["crunchbase.com", "pitchbook.com", "zoominfo.com", "guidestar.org", "charitynavigator.org"])) return "third_party_profile";
  if (text.includes("review") || text.includes("rating")) return "review_signal";
  if (text.includes("news") || text.includes("press")) return "news_signal";
  return "public_web";
}

const TRACKED_SOURCE_TYPES = [
  "public_web",
  "employee_review",
  "customer_review",
  "community_discussion",
  "profile_or_company_page",
  "third_party_profile",
  "review_signal",
  "news_signal",
] as const;

function countBySourceType(items: Array<{ source_type?: unknown }>) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = String(item?.source_type || "public_web").trim().toLowerCase() || "public_web";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function mergeEvidenceByUrl<T extends { url?: string }>(items: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeUrlForMatch(item?.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

type PublicSourceFilters = {
  exclude_source_types: string[];
  exclude_domains: string[];
  include_domains: string[];
  seed_urls: string[];
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeDomainValue(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .trim();
}

function normalizeSeedUrlValue(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizePublicSourceFilters(value: unknown): PublicSourceFilters {
  const record = asObject(value) ?? {};
  const excludeTypesRaw = Array.isArray(record.exclude_source_types) ? record.exclude_source_types : [];
  const excludeDomainsRaw = Array.isArray(record.exclude_domains) ? record.exclude_domains : [];
  const includeDomainsRaw = Array.isArray(record.include_domains) ? record.include_domains : [];
  const seedUrlsRaw = Array.isArray(record.seed_urls) ? record.seed_urls : [];

  const exclude_source_types = Array.from(
    new Set(
      excludeTypesRaw
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item) => Boolean(item) && item !== "public_web"),
    ),
  );
  const exclude_domains = Array.from(
    new Set(
      excludeDomainsRaw
        .map((item) => normalizeDomainValue(String(item || "")))
        .filter(Boolean),
    ),
  );
  const include_domains = Array.from(
    new Set(
      includeDomainsRaw
        .map((item) => normalizeDomainValue(String(item || "")))
        .filter(Boolean),
    ),
  );
  const seed_urls = Array.from(
    new Set(
      seedUrlsRaw
        .map((item) => normalizeSeedUrlValue(String(item || "")))
        .filter(Boolean),
    ),
  );

  return {
    exclude_source_types,
    exclude_domains,
    include_domains,
    seed_urls,
  };
}

function domainMatches(host: string, domain: string) {
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

function isSourceAllowedByPolicy(args: {
  url: string;
  sourceType: string;
  companyDomain: string;
  filters: PublicSourceFilters;
}) {
  const host = getDomain(args.url);
  const sourceType = String(args.sourceType || "").trim().toLowerCase();
  const companyDomain = normalizeDomainValue(args.companyDomain || "");
  const inExcludeDomains = args.filters.exclude_domains.some((domain) => domainMatches(host, domain));
  const inIncludeDomains = args.filters.include_domains.some((domain) => domainMatches(host, domain));
  const includeWhitelistEnabled = args.filters.include_domains.length > 0;
  const isCompanyDomain = companyDomain ? domainMatches(host, companyDomain) : false;

  if (inExcludeDomains) return false;
  if (args.filters.exclude_source_types.includes(sourceType)) return false;
  if (includeWhitelistEnabled && !inIncludeDomains && !isCompanyDomain) return false;
  return true;
}

function isUrlBlockedByDomainPolicy(url: string, filters: PublicSourceFilters) {
  if (!url || filters.exclude_domains.length === 0) return false;
  const host = getDomain(url);
  if (!host) return false;
  return filters.exclude_domains.some((domain) => domainMatches(host, domain));
}

function stringContainsBlockedDomain(value: string, filters: PublicSourceFilters) {
  if (!value || filters.exclude_domains.length === 0) return false;
  const lower = String(value).toLowerCase();
  return filters.exclude_domains.some((domain) => {
    const normalized = normalizeDomainValue(domain);
    if (!normalized) return false;
    return lower.includes(normalized) || lower.includes(`www.${normalized}`);
  });
}

function pruneBlockedReferencesFromPayload(value: unknown, filters: PublicSourceFilters): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    const candidate = value.trim();
    if (/^https?:\/\//i.test(candidate) && isUrlBlockedByDomainPolicy(candidate, filters)) {
      return undefined;
    }
    if (stringContainsBlockedDomain(candidate, filters)) {
      return undefined;
    }
    return value;
  }

  if (Array.isArray(value)) {
    const cleaned = value
      .map((entry) => pruneBlockedReferencesFromPayload(entry, filters))
      .filter((entry) => entry !== undefined);
    return cleaned;
  }

  const record = asObject(value);
  if (!record) return value;

  const urlCandidate = typeof record.url === "string" ? record.url.trim() : "";
  if (urlCandidate && isUrlBlockedByDomainPolicy(urlCandidate, filters)) {
    return undefined;
  }

  const sourceUrlCandidate = typeof record.source_url === "string" ? record.source_url.trim() : "";
  if (sourceUrlCandidate && isUrlBlockedByDomainPolicy(sourceUrlCandidate, filters)) {
    return undefined;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    const cleaned = pruneBlockedReferencesFromPayload(entry, filters);
    if (cleaned !== undefined) output[key] = cleaned;
  }
  return output;
}

async function scrubHistoricalBlacklistedReferences(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  filters: PublicSourceFilters;
}) {
  if (!args.companyId || args.filters.exclude_domains.length === 0) return 0;

  const { data: runs, error } = await args.supabase
    .from("public_baseline_runs")
    .select("id,sources_json,result_json")
    .eq("company_id", args.companyId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.log("[baseline] historical scrub fetch error:", error.message);
    return 0;
  }

  let updated = 0;
  const runRows = Array.isArray(runs) ? runs : [];
  for (const run of runRows) {
    const cleanedSources = pruneBlockedReferencesFromPayload(run?.sources_json ?? null, args.filters);
    const cleanedResult = pruneBlockedReferencesFromPayload(run?.result_json ?? null, args.filters);

    const sourcesChanged = JSON.stringify(cleanedSources ?? null) !== JSON.stringify(run?.sources_json ?? null);
    const resultChanged = JSON.stringify(cleanedResult ?? null) !== JSON.stringify(run?.result_json ?? null);
    if (!sourcesChanged && !resultChanged) continue;

    const { error: updateError } = await args.supabase
      .from("public_baseline_runs")
      .update({
        sources_json: cleanedSources ?? {},
        result_json: cleanedResult ?? {},
      })
      .eq("id", run.id);

    if (updateError) {
      console.log("[baseline] historical scrub update error:", {
        run_id: run?.id ?? null,
        message: updateError.message,
      });
      continue;
    }

    updated += 1;
  }

  return updated;
}

// CONTAM-1: a public run treats an excluded domain as a HARD DELETE of the
// matching public_baseline_run signals (not a display-filter / status-flag).
// Extends the historical scrub (which only cleans run payloads) to the signals
// table. Matches the excluded domain in the signal's URL (host) OR anywhere in
// its claim_text / raw_payload (snippet) — so it also catches reads tagged to a
// different host whose provenance text references the excluded domain (e.g. a
// LinkedIn-tagged "fallback social link discovered from http://iaqm.co.uk/").
async function deleteBlockedPublicSignals(args: {
  supabase: ReturnType<typeof createClient>;
  companyId: string;
  filters: PublicSourceFilters;
}): Promise<number> {
  if (!args.companyId || args.filters.exclude_domains.length === 0) return 0;

  const { data: sigs, error } = await args.supabase
    .from("signals")
    .select("id, source_url, claim_text, raw_payload")
    .eq("company_id", args.companyId)
    .eq("source_type", "public_baseline_run");

  if (error) {
    console.log("[baseline] blocked-signal fetch error:", error.message);
    return 0;
  }

  const domainsLower = args.filters.exclude_domains.map((d) => String(d || "").toLowerCase());
  const idsToDelete: string[] = [];
  for (const s of (Array.isArray(sigs) ? sigs : [])) {
    const row = s as { id?: unknown; source_url?: unknown; claim_text?: unknown; raw_payload?: unknown };
    const rawUrl = String((row.raw_payload as { url?: unknown } | null)?.url ?? "");
    const url = String(row.source_url ?? "") || rawUrl;
    const urlBlocked = url ? isUrlBlockedByDomainPolicy(url, args.filters) : false;
    const text = `${String(row.claim_text ?? "")} ${JSON.stringify(row.raw_payload ?? "")}`.toLowerCase();
    const textBlocked = domainsLower.some((d) => d.length > 0 && text.includes(d));
    if (urlBlocked || textBlocked) idsToDelete.push(String(row.id));
  }

  if (idsToDelete.length === 0) return 0;

  const { error: delErr } = await args.supabase.from("signals").delete().in("id", idsToDelete);
  if (delErr) {
    console.log("[baseline] blocked-signal delete error:", delErr.message);
    return 0;
  }
  console.log(`[baseline] deleted ${idsToDelete.length} public_baseline_run signal(s) matching exclude_domains for company=${args.companyId}`);
  return idsToDelete.length;
}

function extractResponsesOutputText(data: any): string | null {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;

  const msg = Array.isArray(data?.output)
    ? data.output.find((o: any) => o?.type === "message" && Array.isArray(o?.content))
    : null;

  const outText =
    msg?.content?.find((c: any) => c?.type === "output_text" && typeof c?.text === "string")?.text ?? null;

  if (typeof outText === "string" && outText.trim()) return outText;
  return null;
}

async function callOpenAI(opts: {
  apiKey: string;
  model: string;
  fallbackModels?: string[];
  companyName: string;
  companyUrl: string;
  evidence: { url: string; title: string; snippet: string; extracted: string; source_type?: string }[];
  requestTimeoutMs?: number;
  transientRetries?: number;
}) {
  const {
    apiKey,
    model,
    fallbackModels = [],
    companyName,
    companyUrl,
    evidence,
    requestTimeoutMs = 180_000,
    transientRetries = 2,
  } = opts;

  const modelCandidates = buildOpenAIModelCandidates(model, fallbackModels);
  console.log("[baseline] calling openai", {
    primaryModel: model,
    modelCandidates,
    evidenceCount: evidence.length,
  });

  const format = {
    type: "json_schema",
    name: "public_baseline",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        category_archetype: { type: "string" },
        lens_card: {
          type: "object",
          additionalProperties: false,
          properties: {
            primary_buyer: { type: "string" },
            chooser: { type: "string" },
            user: { type: "string" },
            switching_costs: { type: "string" },
            adoption_constraints: { type: "string" },
            value_chain: { type: "string" },
            risk_surface: { type: "string" },
            economic_engine: { type: "string" },
          },
          required: [
            "primary_buyer",
            "chooser",
            "user",
            "switching_costs",
            "adoption_constraints",
            "value_chain",
            "risk_surface",
            "economic_engine",
          ],
        },
        evidence_ledger: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              url: { type: "string" },
              source_type: { type: "string" },
              date: { type: "string" },
              snippet: { type: "string" },
              bucket: { type: "string" },
              signal_strength: { type: "string" },
              confidence: { type: "integer" },
            },
            required: ["url", "source_type", "date", "snippet", "bucket", "signal_strength", "confidence"],
          },
        },
        top_hypotheses: { type: "array", items: { type: "string" } },
        open_questions: { type: "array", items: { type: "string" } },
        // FR-FLOW-2a — per-question dependency on a finding, BY EXACT TEXT, so the link
        // resolves by content identity at persistence. Return [] when a question depends
        // on no specific finding (linkless is honest — never invent a dependency).
        open_question_links: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              question: { type: "string" },
              depends_on: { type: "string" },
            },
            required: ["question", "depends_on"],
          },
        },
        market_initiative_success: {
          type: "object",
          additionalProperties: false,
          properties: {
            proven: { type: "boolean" },
            low_pct: { type: "integer" },
            typical_pct: { type: "integer" },
            high_pct: { type: "integer" },
            source: { type: "string" },
            as_of: { type: "string" },
            confidence: { type: "integer" },
            evidence_urls: {
              type: "array",
              items: { type: "string" },
            },
            evidence_snippets: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "proven",
            "low_pct",
            "typical_pct",
            "high_pct",
            "source",
            "as_of",
            "confidence",
            "evidence_urls",
            "evidence_snippets",
          ],
        },
        message_alignment: {
          type: "object",
          additionalProperties: false,
          properties: {
            company_claim_posture: { type: "string" },
            outside_voice_posture: { type: "string" },
            alignment_status: { type: "string" },
            alignment_summary: { type: "string" },
          },
          required: ["company_claim_posture", "outside_voice_posture", "alignment_status", "alignment_summary"],
        },
        outside_voice_signals: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              perspective: { type: "string" },
              source_type: { type: "string" },
              signal: { type: "string" },
              sentiment: { type: "string" },
              alignment: { type: "string" },
              url: { type: "string" },
              confidence: { type: "integer" },
            },
            required: ["perspective", "source_type", "signal", "sentiment", "alignment", "url", "confidence"],
          },
        },
      },
      required: [
        "category_archetype",
        "lens_card",
        "evidence_ledger",
        "top_hypotheses",
        "open_questions",
        "open_question_links",
        "market_initiative_success",
        "message_alignment",
        "outside_voice_signals",
      ],
    },
  };

  const buildBody = (activeModel: string) => ({
    model: activeModel,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are an outside-in strategy analyst. Use ONLY the evidence provided. " +
              "Do not assume private info. If uncertain, say unknown. " +
              "If evidence appears to describe a different company, note it as ambiguous in open_questions. " +
              "For market initiative success rates, only mark proven=true when explicit numeric market data appears in the evidence. " +
              "If not proven, use low_pct=0, typical_pct=12, high_pct=20 and source='unproven'. " +
              "When proven=true, include source name plus evidence_urls and short evidence_snippets that support the numbers. " +
              "Use clear, plain language. Avoid consulting jargon, business cliches, and buzzwords unless the source evidence explicitly uses those terms. " +
              "For ODI-style needs or outcomes, keep one clear idea per sentence and use plain wording (for example: 'tracked decision results'). " +
              "Do not infer company type from name alone (for example, do not assume education/school context unless evidence explicitly supports it). " +
              "If the evidence includes direct quotes, preserve them verbatim. " +
              "If clearer wording is helpful, keep the original wording and add a separate optional line starting with 'Suggested clearer version:'.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Company: ${companyName}\nWebsite: ${companyUrl}\n\n` +
              `TASK: Build a public baseline from provided evidence.\n` +
              `- Infer category archetype\n- Produce a lens card\n- Build an evidence ledger tied to buckets/signals\n- Compare company claims against employee/customer/market signals when outside sources exist\n- Provide top hypotheses + open questions\n\n` +
              `Use only evidence. If unknown, say unknown.\n` +
              `Treat review, community, employee, news, and profile sources as outside voices rather than company claims.\n`,
          },
          { type: "input_text", text: JSON.stringify({ evidence }) },
        ],
      },
    ],
    text: { format },
  });

  let lastModelError: unknown = null;
  for (let modelIndex = 0; modelIndex < modelCandidates.length; modelIndex++) {
    const activeModel = modelCandidates[modelIndex];
    let modelError: unknown = null;

    for (let transientAttempt = 0; transientAttempt <= transientRetries; transientAttempt++) {
      try {
        const resp = await fetchWithTimeout(
          "https://api.openai.com/v1/responses",
          requestTimeoutMs,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(buildBody(activeModel)),
          },
        );

        if (!resp.ok) {
          const errText = await resp.text();
          if (transientAttempt < transientRetries && isTransientOpenAIHttpStatus(resp.status, errText)) {
            const backoffMs = 1200 * (transientAttempt + 1);
            console.log("[baseline] transient OpenAI HTTP error; retrying", {
              model: activeModel,
              status: resp.status,
              attempt: transientAttempt + 1,
              retries: transientRetries,
              backoffMs,
            });
            await sleep(backoffMs);
            continue;
          }
          throw new Error(`OpenAI error ${resp.status}: ${errText}`);
        }

        const data = await resp.json();
        const text = extractResponsesOutputText(data);
        if (!text) throw new Error("OpenAI response missing output_text");
        return JSON.parse(text);
      } catch (error) {
        modelError = error;
        if (transientAttempt < transientRetries && isTransientOpenAIError(error)) {
          const backoffMs = 1200 * (transientAttempt + 1);
          console.log("[baseline] transient OpenAI request failure; retrying", {
            model: activeModel,
            attempt: transientAttempt + 1,
            retries: transientRetries,
            backoffMs,
            message: String(error instanceof Error ? error.message : error),
          });
          await sleep(backoffMs);
          continue;
        }
        break;
      }
    }

    lastModelError = modelError;
    if (modelIndex < modelCandidates.length - 1 && isModelFailoverEligibleError(modelError)) {
      console.log("[baseline] switching OpenAI model after capacity-like failure", {
        fromModel: activeModel,
        toModel: modelCandidates[modelIndex + 1],
        message: String(modelError instanceof Error ? modelError.message : modelError),
      });
      continue;
    }
    throw modelError instanceof Error ? modelError : new Error(String(modelError || "Unknown OpenAI error"));
  }

  throw lastModelError instanceof Error
    ? lastModelError
    : new Error(String(lastModelError || "OpenAI call failed after retries and model fallback."));
}

// OE-1: defensively extract a JSON object from model text (strip fences, slice braces).
function parseJsonObjectDefensive(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try {
    const o = JSON.parse(t);
    if (o && typeof o === "object") return o as Record<string, unknown>;
  } catch (_) { /* fall through */ }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      const o = JSON.parse(t.slice(first, last + 1));
      if (o && typeof o === "object") return o as Record<string, unknown>;
    } catch (_) { /* give up */ }
  }
  return null;
}

// OE-1: Claude web-search synthesis. Collapses discovery+synthesis — Claude runs its
// own web_search to surface GENUINE outside voices (employee/customer reviews, community)
// that the searx→crawl→OpenAI path yields at zero today. Returns the SAME result_json
// schema the OpenAI path emits. External cloud model only (api.anthropic.com) → PUBLIC
// boundary preserved; no local/Dify touch. Deliberately NOT handed the crawl evidence —
// isolates the outside-voice yield test.
async function callClaudeWebSearch(opts: {
  apiKey: string;
  model: string;
  companyName: string;
  website: string;
  domain: string;
  resolvedCategory?: string;
  excludeDomains?: string[];
}): Promise<{ parsed: Record<string, unknown>; citationSourceTextByUrl: Map<string, string> }> {
  const schemaHint =
    `{\n` +
    `  "category_archetype": "<string>",\n` +
    `  "lens_card": { "primary_buyer","chooser","user","switching_costs","adoption_constraints","value_chain","risk_surface","economic_engine": "<string each>" },\n` +
    `  "evidence_ledger": [ { "url":"<real url>","source_type":"<type>","voice_class":"<class>","date":"YYYY-MM-DD","snippet":"<string>","bucket":"<string>","signal_strength":"weak|medium|strong","confidence":<0-100 int> } ],\n` +
    `  "top_hypotheses": ["<string>"],\n` +
    `  "open_questions": ["<string>"],\n` +
    `  "open_question_links": [ { "question":"<exact open_questions entry>","depends_on":"<the exact finding text this question hinges on>" } ],\n` +
    `  "market_initiative_success": { "proven":<bool>,"low_pct":<int>,"typical_pct":<int>,"high_pct":<int>,"source":"<string>","as_of":"<string>","confidence":<0-100 int>,"evidence_urls":["<url>"],"evidence_snippets":["<string>"] },\n` +
    `  "message_alignment": { "company_claim_posture","outside_voice_posture","alignment_status","alignment_summary": "<string each>" },\n` +
    `  "outside_voice_signals": [ { "perspective":"<string>","source_type":"<type>","voice_class":"<class>","signal":"<string>","sentiment":"<string>","alignment":"<string>","url":"<real url>","confidence":<0-100 int> } ]\n` +
    `}`;

  const prompt =
    `You are an outside-in strategy analyst. Research the company "${opts.companyName}" ` +
    `(website: ${opts.website || opts.domain}) comprehensively using web search.\n` +
    (opts.resolvedCategory ? `Likely category: ${opts.resolvedCategory}.\n` : "") +
    `First, establish from the company's own site what kind of business this is — category, ` +
    `offering, geography. Then discover its REAL PUBLIC FOOTPRINT: the places where outside ` +
    `voices actually talk about THIS kind of business. Cover each footprint class below, ` +
    `choosing the platforms that genuinely serve this company's category and locale — the ` +
    `named sites are illustrations, not a checklist; skip any that don't fit and find the ` +
    `ones that do:\n` +
    `1. Customer reviews — wherever this category is actually reviewed (e.g. Google/Yelp for local service and retail; G2/Capterra/Trustpilot for software; HomeAdvisor/Angi for home services; TripAdvisor for hospitality).\n` +
    `2. Employee reviews, where the company is large enough to have them (e.g. Glassdoor, Indeed).\n` +
    `3. Local and trade press — local news outlets and the category's trade publications.\n` +
    `4. Social presence — the company's actual profiles, with audience-size and engagement signals.\n` +
    `5. Marketplace, retail, and ordering listings — wherever its products or services are sold or listed.\n` +
    `6. Partner and customer mentions — other businesses' sites that reference this company.\n` +
    `7. Directories and registries — BBB, chambers of commerce, licensing bodies, as applicable.\n` +
    `Prioritise genuine third-party sentiment over the company's own claims.\n\n` +
    `DISAMBIGUATION LAW (precision over coverage):\n` +
    `- Anchor every search to the exact entity: the name, the domain (${opts.domain}), and the location and category you established from its own site.\n` +
    `- If you cannot be confident a result refers to THIS company, EXCLUDE it. Same-named or similarly-named organizations elsewhere are contamination, not coverage.\n\n` +
    `Then output a SINGLE JSON object — and NOTHING else — matching exactly this shape:\n${schemaHint}\n\n` +
    `Rules:\n` +
    `- Use ONLY facts found via your web searches. Do NOT fabricate reviews, quotes, ratings, or URLs.\n` +
    `- Every outside_voice_signals[].url and evidence_ledger[].url MUST be a real URL returned by a search.\n` +
    `- source_type ∈ {employee_review, customer_review, community_discussion, third_party_profile, profile_or_company_page, news_signal, review_signal, public_web}.\n` +
    `- voice_class ∈ {client_voice, outside_voice_about_client, market_context}: client_voice = the company speaking about itself (its site, its profiles, its posts); outside_voice_about_client = a genuine third party speaking ABOUT this company (reviews, press about them, partner/customer mentions, registries attesting them); market_context = category/market information not about this company specifically (industry stats, category coverage). When unsure between outside_voice_about_client and market_context, ask: does this source attest something about THIS company? If not, it is market_context.\n` +
    `- For genuine third-party voices set bucket="outside_voice_signal".\n` +
    `- Include ≥1 employee_review, ≥1 customer_review, and ≥1 community_discussion IF such public sources exist; ` +
    `if a type genuinely has no public source, omit it rather than inventing one.\n` +
    `- confidence is 0-100. Emit the JSON object only — no markdown fences, no prose before or after.`;

  // Honor the company's exclude_domains: tell web_search not to search those hosts.
  // OE-2: 12 = one search per footprint class plus disambiguation/follow-up headroom.
  const webSearchTool: Record<string, unknown> = { type: "web_search_20250305", name: "web_search", max_uses: 12 };
  if (Array.isArray(opts.excludeDomains) && opts.excludeDomains.length > 0) {
    webSearchTool.blocked_domains = opts.excludeDomains;
  }
  console.log(`[baseline] claude web_search tool config: ${JSON.stringify(webSearchTool)}`);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      // 32000: big-footprint companies (SIAA: 17-19 content blocks, 25-29KB of
      // final text) blew the old 8000 cap MID-JSON — the truncated object then
      // failed the defensive parse and misreported as a parse error. Sonnet-tier
      // output ceiling is 128K; output tokens bill only what is produced.
      max_tokens: 32000,
      tools: [webSearchTool],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Anthropic web-search call failed: HTTP ${res.status} ${errText.slice(0, 500)}`);
  }
  const data = await res.json();
  // stop_reason honesty (require_model law): a max_tokens truncation cuts the
  // final JSON mid-object — without this check it misreports downstream as
  // "could not parse JSON". Name the real failure.
  const stopReason = String((data as any)?.stop_reason ?? "");
  if (stopReason === "max_tokens") {
    throw new Error(`Anthropic web-search: output hit the max_tokens cap (stop_reason=max_tokens) — synthesis truncated mid-JSON; the footprint needs a higher cap`);
  }
  const blocks = Array.isArray((data as any)?.content) ? (data as any).content : [];
  // Multiple content blocks (text / server_tool_use / web_search_tool_result). The JSON
  // answer is in the FINAL text block, after the tool calls — not block[0].
  const textBlocks = blocks.filter((b: any) => b?.type === "text" && typeof b?.text === "string");
  const finalText = textBlocks.length > 0 ? String(textBlocks[textBlocks.length - 1].text) : "";
  const parsed = parseJsonObjectDefensive(finalText);
  if (!parsed) {
    throw new Error(`Anthropic web-search: could not parse JSON from final text block (len=${finalText.length}, blocks=${blocks.length})`);
  }
  // Normalize each discovered URL's source_type — NON-DESTRUCTIVELY. inferSourceType is
  // authoritative only when it confidently matches a known domain (returns a non-public_web
  // bucket); when it returns the public_web fallback, KEEP Claude's own page-level label
  // (Claude read the page; it out-classifies a bare domain match for sites the list misses).
  // Empty/missing Claude label → public_web. No fabrication either way.
  //
  // B1: same overlay pattern for voice_class. Claude labels each item
  // (client_voice | outside_voice_about_client | market_context); the deterministic guard
  // CORRECTS, never discards: any item on the company's own domain is client_voice
  // regardless of the model's label. competitor_voice is in the enum but unreachable
  // until B2's competitor discovery exists. Unknown/missing label → null (legacy fallback
  // semantics downstream in _shared/claimProvenance.ts classifyVoice).
  const VOICE_CLASSES = new Set(["client_voice", "outside_voice_about_client", "competitor_voice", "market_context"]);
  const companyHostForGuard = (() => {
    try {
      return new URL(opts.website || `https://${opts.domain}`).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return String(opts.domain || "").replace(/^www\./, "").toLowerCase();
    }
  })();
  const isCompanyHostUrl = (url: string) => {
    try {
      const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      return !!companyHostForGuard && (h === companyHostForGuard || h.endsWith(`.${companyHostForGuard}`));
    } catch {
      return false;
    }
  };
  const reclassify = (arr: unknown) =>
    (Array.isArray(arr) ? arr : []).map((e: any) => {
      const url = String(e?.url || "").trim();
      if (!url) return e;
      const inferred = inferSourceType(url, String(e?.perspective || e?.bucket || ""), String(e?.signal || e?.snippet || ""));
      const claudeLabel = String(e?.source_type || "").trim();
      const source_type = inferred !== "public_web" ? inferred : (claudeLabel || "public_web");
      const labeledClass = String(e?.voice_class || "").trim();
      const voice_class = isCompanyHostUrl(url)
        ? "client_voice"
        : (VOICE_CLASSES.has(labeledClass) ? labeledClass : null);
      return { ...e, source_type, voice_class };
    });
  if (Array.isArray((parsed as any).outside_voice_signals)) {
    (parsed as any).outside_voice_signals = reclassify((parsed as any).outside_voice_signals);
  }
  if (Array.isArray((parsed as any).evidence_ledger)) {
    (parsed as any).evidence_ledger = reclassify((parsed as any).evidence_ledger);
  }
  // V2-6c — surface the per-citation cited source text (keyed by normalized URL) from
  // the raw web_search response, so the ok-synthesis branch can hand the producer a
  // basis keyed to the URLs the minted signals actually carry. Reads `data` (raw
  // blocks + citations), independent of the reclassified `parsed`. Empty when the
  // model cited nothing — honest absence, no lift.
  const citationSourceTextByUrl = extractCitationSourceText(data);
  return { parsed, citationSourceTextByUrl };
}

const QUALITY_PROMPTS: Record<"no_results" | "thin" | "ambiguous" | "search_unavailable", string> = {
  no_results: "No public data found for this company. Upload internal documents to establish a starting baseline — strategy, positioning, or customer research.",
  thin: "Public evidence is too thin to infer a complete baseline. Upload internal documents to improve signal quality.",
  ambiguous: "Search results don't clearly match this company. Verify the company name and domain, or upload internal documents to supplement.",
  // SRCH-1: a couldn't-check, NOT a finding about the company. The prompt must not
  // suggest the company lacks public evidence — nothing was actually looked at.
  search_unavailable: "The search backend returned nothing for any query and reported its engines as blocked, so no public evidence could be checked. This is not a finding about this company. Re-run once search recovers.",
};

function buildInsufficientResult(args: {
  companyName: string;
  website: string;
  domain: string;
  variants: string[];
  reason: string;
  debug: Record<string, any>;
  qualityType: "no_results" | "thin" | "search_unavailable";
  /** SRCH-1: defaults to the evidence verdict; a search outage overrides it so a
   *  couldn't-check is never persisted as a looked-and-found-nothing. */
  status?: string;
}) {
  const { companyName, website, domain, variants, reason, debug, qualityType } = args;

  return {
    status: args.status ?? "insufficient_public_evidence",
    reason,
    company: { name: companyName, website, domain, variants },
    debug,
    data_quality_flag: {
      type: qualityType,
      prompt: QUALITY_PROMPTS[qualityType],
    },
    category_archetype: "unknown",
    lens_card: {
      primary_buyer: "unknown",
      chooser: "unknown",
      user: "unknown",
      switching_costs: "unknown",
      adoption_constraints: "unknown",
      value_chain: "unknown",
      risk_surface: "unknown",
      economic_engine: "unknown",
    },
    evidence_ledger: [],
    top_hypotheses: [],
    open_questions: [
      "Not enough public sources to establish a baseline. Add more sources (press, docs, profiles) or upload internal docs.",
    ],
    market_initiative_success: {
      proven: false,
      low_pct: 0,
      typical_pct: 12,
      high_pct: 20,
      source: "unproven",
      as_of: "unknown",
      confidence: 0,
      evidence_urls: [],
      evidence_snippets: [],
    },
    message_alignment: {
      company_claim_posture: "unknown",
      outside_voice_posture: "unknown",
      alignment_status: "unknown",
      alignment_summary: "No reliable outside-voice evidence was available to compare company claims against the market.",
    },
    outside_voice_signals: [],
  };
}

function buildAmbiguousResult(args: {
  companyName: string;
  website: string;
  domain: string;
  variants: string[];
  reason: string;
  debug: Record<string, any>;
  closest_sources: any[];
}) {
  const { companyName, website, domain, variants, reason, debug, closest_sources } = args;

  return {
    status: "ambiguous_public_evidence",
    reason,
    company: { name: companyName, website, domain, variants },
    debug,
    closest_sources,
    data_quality_flag: {
      type: "ambiguous" as const,
      prompt: QUALITY_PROMPTS.ambiguous,
    },
    category_archetype: "unknown",
    lens_card: {
      primary_buyer: "unknown",
      chooser: "unknown",
      user: "unknown",
      switching_costs: "unknown",
      adoption_constraints: "unknown",
      value_chain: "unknown",
      risk_surface: "unknown",
      economic_engine: "unknown",
    },
    evidence_ledger: [],
    top_hypotheses: [],
    open_questions: [
      "Search results look like they may refer to a different company. Review closest_sources and adjust name/domain if needed.",
      "If this company has a small footprint, add a LinkedIn page, press mention, or upload internal docs for baseline.",
    ],
    market_initiative_success: {
      proven: false,
      low_pct: 0,
      typical_pct: 12,
      high_pct: 20,
      source: "unproven",
      as_of: "unknown",
      confidence: 0,
      evidence_urls: [],
      evidence_snippets: [],
    },
    message_alignment: {
      company_claim_posture: "unknown",
      outside_voice_posture: "ambiguous",
      alignment_status: "ambiguous",
      alignment_summary: "Outside-voice evidence is too ambiguous to compare against the company's narrative with confidence.",
    },
    outside_voice_signals: [],
  };
}

function withRunLedger(
  result: Record<string, unknown>,
  ledger: Record<string, unknown>,
) {
  return {
    ...result,
    run_ledger: {
      ...(typeof result?.run_ledger === "object" && result?.run_ledger !== null
        ? (result.run_ledger as Record<string, unknown>)
        : {}),
      ...ledger,
    },
  };
}

function normalizeUrlForMatch(value: unknown) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    if ((url.pathname || "") !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return String(value || "").trim();
  }
}

function mergeDiscoveredEvidenceIntoLedger(args: {
  result: Record<string, unknown>;
  discoveredEvidence: Array<{ url?: string; source_type?: string; snippet?: string }>;
}) {
  const result = { ...(args.result || {}) };
  const existingLedger = Array.isArray(result.evidence_ledger) ? [...result.evidence_ledger] : [];
  const existingUrls = new Set(
    existingLedger
      .map((entry: any) => normalizeUrlForMatch(entry?.url))
      .filter(Boolean),
  );

  let appended = 0;
  for (const source of args.discoveredEvidence) {
    const url = normalizeUrlForMatch(source?.url);
    if (!url || existingUrls.has(url)) continue;
    existingUrls.add(url);
    existingLedger.push({
      url,
      source_type: String(source?.source_type || "public_web"),
      date: new Date().toISOString().slice(0, 10),
      snippet:
        String(source?.snippet || "").trim() ||
        "Discovered public profile/source. Direct content extraction may be restricted by platform controls.",
      bucket: "outside_voice_signal",
      signal_strength: "weak",
      confidence: 35,
    });
    appended++;
  }

  result.evidence_ledger = existingLedger.slice(0, 24);
  const openQuestions = Array.isArray(result.open_questions) ? [...result.open_questions] : [];
  if (appended > 0) {
    openQuestions.unshift(
      `Auto-discovered ${appended} public profile/social source(s); some may need manual verification if platform access is restricted.`,
    );
  }
  result.open_questions = Array.from(new Set(openQuestions)).slice(0, 10);
  return result;
}

Deno.serve(async (req) => {
  console.log(`[baseline] HIT method=${req.method} url=${req.url}`);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const searxUrl = Deno.env.get("SEARXNG_URL") || "http://host.docker.internal:8888";
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const openaiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
    const openaiFallbackModels = parseModelList(
      Deno.env.get("OPENAI_FALLBACK_MODELS") ||
      Deno.env.get("OPENAI_FALLBACK_MODEL") ||
      "",
    );
    // OE-1: Claude web-search synthesis (flagged alternative). External cloud model only.
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const anthropicModel = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-6";
    const runLedger: {
      provider: string;
      model: string;
      fallback_models: string[];
      endpoint: string;
      path: string;
      local_only: boolean;
      generated_at: string;
      degraded_default?: string;
    } = {
      provider: "openai_public",
      model: openaiModel,
      fallback_models: openaiFallbackModels,
      endpoint: "https://api.openai.com/v1/responses",
      path: "public_web_research",
      local_only: false,
      generated_at: new Date().toISOString(),
    };

    console.log(
      `[baseline] env supabaseUrl=${!!supabaseUrl} serviceRole=${!!serviceRoleKey} anonKey=${!!anonKey} searxUrl=${searxUrl} openaiKey=${!!openaiKey} model=${openaiModel} fallbacks=${openaiFallbackModels.join(",") || "default"}`,
    );

    if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "Missing Supabase env vars" }, 500);
    if (!openaiKey) return json({ error: "Missing OPENAI_API_KEY" }, 500);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "No auth header" }, 401);

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userRes, error: authError } = await anonClient.auth.getUser();
    if (authError || !userRes?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const company_id = String(body?.company_id || "").trim();
    if (!company_id) {
      return json({ error: "company_id required" }, 400);
    }

    const { data: companyRow, error: companyFetchError } = await supabase
      .from("companies")
      .select("name,website,public_source_filters_json")
      .eq("id", company_id)
      .maybeSingle();

    if (companyFetchError) {
      console.log("[baseline] company fetch error:", companyFetchError.message);
    }

    const company_name = String(body?.company_name || companyRow?.name || "").trim();
    const website = String(body?.website || companyRow?.website || "").trim();
    // When true, run the outside baseline as a pure MONITOR — do not chain into
    // run-mojo-analysis (which would delete+regenerate the 'customer' journey).
    // Default false → cold-start/bootstrap callers still chain as before.
    const skip_mojo_analysis = body?.skip_mojo_analysis === true;
    // OE-2: claude_websearch is the DEFAULT engine (council 2026-06-10 — searx discovery
    // produced 0 independent items across 3 companies; claude_websearch produced 7 on the
    // same company the same day). The searx→crawl→OpenAI path stays reachable by explicit
    // synthesis_engine: "openai".
    const requestedEngine = String(body?.synthesis_engine || "").toLowerCase();
    let synthesis_engine = requestedEngine || "claude_websearch";
    if (synthesis_engine === "claude_websearch" && !anthropicKey) {
      if (requestedEngine === "claude_websearch") {
        // Explicitly requested by name — missing key is a hard error, never a silent swap.
        return json({ error: "Missing ANTHROPIC_API_KEY (required for synthesis_engine=claude_websearch)" }, 500);
      }
      // DEFAULT resolution without a key: degrade LOUDLY to the openai path. The ledger
      // stamps the engine ACTUALLY used plus a degraded-default marker — a silently
      // downgraded run is the failure mode this makes impossible.
      console.warn(
        "[baseline] ⚠ ANTHROPIC_API_KEY missing — default engine claude_websearch DEGRADED to openai path for this run",
      );
      synthesis_engine = "openai";
      runLedger.degraded_default = "claude_websearch_unavailable_no_key";
    }
    // OE-1: stamp the ledger for the engine actually used (the literal above is the
    // openai default; override for claude so a claude run is traceable as such).
    if (synthesis_engine === "claude_websearch") {
      runLedger.provider = "anthropic_websearch";
      runLedger.model = anthropicModel;
      runLedger.fallback_models = [];
      runLedger.endpoint = "https://api.anthropic.com/v1/messages";
      runLedger.path = "claude_web_search";
    }
    const sourceFilters = normalizePublicSourceFilters(
      body?.public_source_filters_json ?? companyRow?.public_source_filters_json ?? null,
    );

    if (sourceFilters.exclude_domains.length > 0) {
      const scrubbedCount = await scrubHistoricalBlacklistedReferences({
        supabase,
        companyId: company_id,
        filters: sourceFilters,
      });
      if (scrubbedCount > 0) {
        console.log("[baseline] historical reference scrub applied", {
          company_id,
          scrubbed_runs: scrubbedCount,
          exclude_domains: sourceFilters.exclude_domains,
        });
      }
      // CONTAM-1: also HARD DELETE matching public_baseline_run signals (the scrub
      // above only cleans run payloads, not the signals table the panels read).
      const deletedSignals = await deleteBlockedPublicSignals({
        supabase,
        companyId: company_id,
        filters: sourceFilters,
      });
      if (deletedSignals > 0) {
        console.log("[baseline] blocked public signals deleted", {
          company_id,
          deleted_signals: deletedSignals,
          exclude_domains: sourceFilters.exclude_domains,
        });
      }
    }

    if (!company_name || !website) {
      return json({ error: "company_name and website are required (via request or company record)" }, 400);
    }

    const lockTtlMinutes = 30;
    const lockResult = await acquireCompanyRunLock({
      supabase,
      companyId: company_id,
      userId: userRes.user.id,
      operation: "baseline",
      ttlMinutes: lockTtlMinutes,
    });

    if (lockResult) {
      return json({
        error: "Another run is already in progress for this company",
        status: "company_locked",
        operation: lockResult.existing?.operation ?? "unknown",
        started_at: lockResult.existing?.started_at ?? null,
        expires_at: lockResult.existing?.expires_at ?? null,
      }, 409);
    }

    const stopLockHeartbeat = startCompanyRunLockHeartbeat({
      supabase,
      companyId: company_id,
      ttlMinutes: lockTtlMinutes,
    });

    // Self-owned durable run-status row (long_runner_runs). Written AFTER the lock is
    // acquired — the lock-conflict 409 above returns before this, so a re-click never
    // orphans a second `running` row (the lock is the per-invocation dedup). Updated to
    // completed/failed in the finally below on EVERY return path and on throw, so all
    // callers (the 5 direct client callers and both wrappers) get a durable terminal
    // state even when the 150s wall cut the browser and the isolate landed its write
    // behind the cut. Non-fatal: a ledger write failure never breaks a paid baseline run.
    let ledgerRowId: string | null = null;
    {
      const { data: ledgerRow, error: ledgerStartErr } = await supabase
        .from("long_runner_runs")
        .insert({ run_kind: "public_baseline", company_id, status: "running", target_count: 1 })
        .select("id")
        .single();
      if (ledgerStartErr) {
        console.log("[baseline] long_runner_runs start insert error", ledgerStartErr.message);
      } else {
        ledgerRowId = (ledgerRow as { id?: unknown } | null)?.id ? String((ledgerRow as { id: unknown }).id) : null;
      }
    }
    let ledgerOutcome: "completed" | "failed" = "failed";
    let ledgerErrText: string | null = null;
    // SRCH-1: when a refusal path has already determined the honest terminal reason,
    // it wins over whatever exception surfaces afterwards. Zero-evidence runs still
    // throw out of ingestPublicBaselineSignals ("produced zero signals"), which is a
    // symptom of the refusal, not its cause — that generic text is exactly what made
    // the Sonos outage read as thin evidence in the ledger.
    let ledgerRefusalText: string | null = null;

    try {
      const resp: Response = await (async (): Promise<Response> => {
    const domain = getDomain(website);
    const stem = domainStem(domain);
    const variants = buildNameVariants(company_name, website);
    const spaced = splitCamelCase(company_name);
    const quoted = `"${company_name}"`;

    // Search passes (general-purpose + works for many companies)
    const queryA =
      `${quoted} (site:${domain} OR "${domain}" OR "${stem}") ` +
      `("about" OR "company" OR "press" OR "investor" OR "careers")`;

    const queryB =
      `"${spaced}" "${domain}" (company OR product OR services OR platform) ` +
      `(competitors OR pricing OR reviews OR news OR investors)`;

    const queryC =
      `${domain} ${variants.join(" OR ")} (about OR company OR pricing OR reviews OR news)`;
    const queryD =
      `"${spaced}" "${domain}" (glassdoor OR indeed OR g2 OR capterra OR trustpilot OR reddit OR forum OR complaints)`;
    const queryE =
      `${quoted} "${domain}" (customer reviews OR employee reviews OR testimonials OR ratings OR reddit OR community OR nonprofit)`;
    const queryF =
      `site:linkedin.com/company ("${company_name}" OR "${spaced}" OR "${domain}" OR "${stem}")`;
    const queryG =
      `site:linkedin.com/posts ("${company_name}" OR "${spaced}" OR "${domain}" OR "${stem}")`;
    const queryH =
      `"${spaced}" ("${company_name}" OR "${stem}") (company OR platform OR product OR services OR leadership OR funding OR linkedin OR crunchbase OR newsroom)`;

    const mergeUnique = (a: any[], b: any[]) => {
      const seen = new Set<string>();
      const out: any[] = [];
      for (const r of [...a, ...b]) {
        if (!r?.url || seen.has(r.url)) continue;
        seen.add(r.url);
        out.push(r);
      }
      return out;
    };

    // SRCH-1: one accumulator across every query in this run — the outage rule is a
    // whole-run judgement, never a per-query one.
    const searchDiag = newSearchDiag();
    const sourcesA = await searxSearch(searxUrl, queryA, 20, searchDiag);
    const sourcesB = await searxSearch(searxUrl, queryB, 20, searchDiag);
    const sourcesC = await searxSearch(searxUrl, queryC, 20, searchDiag);
    const sourcesD = await searxSearch(searxUrl, queryD, 16, searchDiag);
    const sourcesE = await searxSearch(searxUrl, queryE, 16, searchDiag);
    const sourcesF = await searxSearch(searxUrl, queryF, 16, searchDiag);
    const sourcesG = await searxSearch(searxUrl, queryG, 16, searchDiag);
    const sourcesH = await searxSearch(searxUrl, queryH, 20, searchDiag);
    console.log("[baseline] search health", {
      queriesRun: searchDiag.queriesRun,
      queriesWithResults: searchDiag.queriesWithResults,
      totalRawResults: searchDiag.totalRawResults,
      unresponsive: describeUnresponsive(searchDiag) || "none",
    });
    const inferredLinkedInUrls = inferLinkedInCompanyUrls(company_name, website);
    const inferredLinkedInSources = inferredLinkedInUrls.map((url) => ({
      url,
      title: "Inferred LinkedIn company URL",
      snippet: "Generated from company name/domain because search engines can miss or block LinkedIn results.",
      engine: "linkedin_slug_guess",
      source_type: "profile_or_company_page",
    }));

    const rawSearchSources = mergeUnique(
      mergeUnique(
        mergeUnique(mergeUnique(sourcesA, sourcesB), mergeUnique(sourcesC, sourcesD)),
        mergeUnique(sourcesE, sourcesF),
      ),
      mergeUnique(sourcesG, sourcesH),
    );
    // Always attempt same-domain website crawl (helps tiny footprints / thin homepages)
    const directUrl = website.startsWith("http") ? website : `https://${website}`;
    const crawlResult = await crawlWebsiteEvidence({
      startUrl: directUrl,
      baseDomain: domain,
      maxPages: 14,
      maxDepth: 2,
    });
    const crawledSiteEvidence = Array.isArray(crawlResult?.siteEvidence) ? crawlResult.siteEvidence : [];
    const discoveredSocialSources = Array.isArray(crawlResult?.socialSources) ? crawlResult.socialSources : [];

    const socialCandidatesFromSite = discoveredSocialSources.map((source) => ({
      url: source.url,
      title: source.title,
      snippet: source.snippet,
      engine: "site_social_link",
      source_type: source.source_type,
    }));
    const manualSeedSources = (sourceFilters.seed_urls || []).map((url) => ({
      url,
      title: "Manual public source URL",
      snippet: "Added manually from Public Source Controls.",
      engine: "manual_seed_url",
      source_type: inferSourceType(url, "manual source", "manual seed"),
    }));

    const rawSources = mergeUnique(
      mergeUnique(mergeUnique(rawSearchSources, socialCandidatesFromSite), manualSeedSources),
      inferredLinkedInSources,
    );
    const queryRuns = [
      { key: "queryA", label: "domain identity", query: queryA, raw_count: sourcesA.length, sample_urls: sourcesA.slice(0, 3).map((x: any) => String(x?.url || "")).filter(Boolean) },
      { key: "queryB", label: "market + alternatives", query: queryB, raw_count: sourcesB.length, sample_urls: sourcesB.slice(0, 3).map((x: any) => String(x?.url || "")).filter(Boolean) },
      { key: "queryC", label: "domain variants", query: queryC, raw_count: sourcesC.length, sample_urls: sourcesC.slice(0, 3).map((x: any) => String(x?.url || "")).filter(Boolean) },
      { key: "queryD", label: "outside voice", query: queryD, raw_count: sourcesD.length, sample_urls: sourcesD.slice(0, 3).map((x: any) => String(x?.url || "")).filter(Boolean) },
      { key: "queryE", label: "reviews + community", query: queryE, raw_count: sourcesE.length, sample_urls: sourcesE.slice(0, 3).map((x: any) => String(x?.url || "")).filter(Boolean) },
      { key: "queryF", label: "linkedin company", query: queryF, raw_count: sourcesF.length, sample_urls: sourcesF.slice(0, 3).map((x: any) => String(x?.url || "")).filter(Boolean) },
      { key: "queryG", label: "linkedin posts", query: queryG, raw_count: sourcesG.length, sample_urls: sourcesG.slice(0, 3).map((x: any) => String(x?.url || "")).filter(Boolean) },
      { key: "queryH", label: "broad company web", query: queryH, raw_count: sourcesH.length, sample_urls: sourcesH.slice(0, 3).map((x: any) => String(x?.url || "")).filter(Boolean) },
      {
        key: "site_social_links",
        label: "social links from company site",
        query: "outbound social/profile URLs discovered while crawling company pages",
        raw_count: socialCandidatesFromSite.length,
        sample_urls: socialCandidatesFromSite.slice(0, 5).map((x) => String(x?.url || "")).filter(Boolean),
      },
      {
        key: "manual_seed_urls",
        label: "manual seeded URLs",
        query: "public source URLs provided in source controls",
        raw_count: manualSeedSources.length,
        sample_urls: manualSeedSources.slice(0, 8).map((x) => String(x?.url || "")).filter(Boolean),
      },
      {
        key: "inferred_linkedin_urls",
        label: "inferred linkedin URLs",
        query: "heuristic LinkedIn company URLs generated from company name/domain",
        raw_count: inferredLinkedInSources.length,
        sample_urls: inferredLinkedInSources.slice(0, 8).map((x) => String(x?.url || "")).filter(Boolean),
      },
    ];

    // Annotate ALL sources with soft match scores (keep even if wrong — useful for review)
    const annotated = rawSources
      .map((r: any) => {
        const m = scoreCompanyMatch({
          companyName: company_name,
          website,
          url: r?.url,
          title: r?.title,
          snippet: r?.snippet,
        });
        return {
          ...r,
          source_type: inferSourceType(r?.url, r?.title, r?.snippet),
          match_score:
            r?.engine === "manual_seed_url"
              ? Math.max(88, m.score)
              : r?.engine === "linkedin_slug_guess"
                ? Math.max(68, m.score)
              : r?.engine === "site_social_link"
                ? Math.max(70, m.score)
                : m.score,
          match_reason:
            r?.engine === "manual_seed_url"
              ? Array.from(new Set([...(Array.isArray(m.reasons) ? m.reasons : []), "manual_seed_url"]))
              : r?.engine === "linkedin_slug_guess"
                ? Array.from(new Set([...(Array.isArray(m.reasons) ? m.reasons : []), "linkedin_slug_guess"]))
              : r?.engine === "site_social_link"
                ? Array.from(new Set([...(Array.isArray(m.reasons) ? m.reasons : []), "linked_from_company_site"]))
                : m.reasons,
        };
      })
      .sort((a: any, b: any) => (b.match_score ?? 0) - (a.match_score ?? 0));

    const filteredAnnotated = annotated.filter((x: any) =>
      isSourceAllowedByPolicy({
        url: String(x?.url || ""),
        sourceType: String(x?.source_type || "public_web"),
        companyDomain: domain,
        filters: sourceFilters,
      }),
    );

    const strong = filteredAnnotated.filter((x: any) => (x.match_score ?? 0) >= 80);
    const medium = filteredAnnotated.filter((x: any) => (x.match_score ?? 0) >= 50 && (x.match_score ?? 0) < 80);

    // Candidates: best matches first. If nothing strong, we still keep a few “closest” for an ambiguous run.
    const candidates =
      strong.length ? strong.slice(0, 12) :
      medium.length ? medium.slice(0, 10) :
      filteredAnnotated.slice(0, 6);

    const excludedTypeSet = new Set(
      sourceFilters.exclude_source_types.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean),
    );
    const annotatedByType = countBySourceType(annotated);
    const filteredByType = countBySourceType(filteredAnnotated);
    const candidateByType = countBySourceType(candidates);

    const directEvidence = crawledSiteEvidence.filter((item) =>
      isSourceAllowedByPolicy({
        url: item.url,
        sourceType: item.source_type,
        companyDomain: domain,
        filters: sourceFilters,
      }),
    );
    const socialLinkEvidence = discoveredSocialSources
      .filter((item) =>
        isSourceAllowedByPolicy({
          url: item.url,
          sourceType: item.source_type,
          companyDomain: domain,
          filters: sourceFilters,
        })
      )
      .slice(0, 6)
      .map((item) => ({
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        source_type: item.source_type,
        extracted: `Social/profile source linked from company website: ${item.url}\nDiscovered on: ${item.discovered_from}\nDirect scraping may be limited due to platform anti-bot or login controls.`,
      }));
    const manualSeedEvidence = manualSeedSources
      .filter((item) =>
        isSourceAllowedByPolicy({
          url: item.url,
          sourceType: item.source_type,
          companyDomain: domain,
          filters: sourceFilters,
        })
      )
      .slice(0, 8)
      .map((item) => ({
        url: item.url,
        title: item.title,
        snippet: item.snippet,
        source_type: item.source_type,
        extracted: `Manual public source URL provided by user: ${item.url}\nDirect scraping may be unavailable due to platform anti-bot/login restrictions.`,
      }));
    const directByType = countBySourceType(directEvidence);
    const baseSourceCoverage = TRACKED_SOURCE_TYPES.map((sourceType) => ({
      source_type: sourceType,
      enabled: !excludedTypeSet.has(sourceType),
      excluded: excludedTypeSet.has(sourceType),
      annotated_count: annotatedByType[sourceType] || 0,
      policy_allowed_count: filteredByType[sourceType] || 0,
      candidate_count: candidateByType[sourceType] || 0,
      direct_evidence_count: directByType[sourceType] || 0,
      extracted_count: 0,
      final_evidence_count: directByType[sourceType] || 0,
    }));
    const baseDiagnostics = {
      query_runs: queryRuns,
      search: {
        total_results: queryRuns.reduce((sum, run) => sum + Number(run.raw_count || 0), 0),
        unique_search_results: rawSearchSources.length,
        unique_results_including_site_social: rawSources.length,
      },
      policy: {
        include_domains: sourceFilters.include_domains,
        exclude_domains: sourceFilters.exclude_domains,
        exclude_source_types: sourceFilters.exclude_source_types,
      },
      crawl: {
        attempted: true,
        site_pages_found: crawledSiteEvidence.length,
        site_pages_eligible: directEvidence.length,
        site_social_links_found: discoveredSocialSources.length,
        site_social_links_eligible: socialLinkEvidence.length,
        manual_seed_urls: manualSeedSources.length,
        manual_seed_urls_eligible: manualSeedEvidence.length,
      },
      source_type_coverage: baseSourceCoverage,
    };

    console.log("[baseline] source scoring", {
      domain,
      variants,
      rawCount: rawSources.length,
      annotatedCount: annotated.length,
      policyFilteredCount: filteredAnnotated.length,
      top1: annotated[0]?.url ?? null,
      top1Score: annotated[0]?.match_score ?? null,
      strong: strong.length,
      medium: medium.length,
      candidates: candidates.length,
      directCrawlPages: crawledSiteEvidence.length,
      directEvidencePages: directEvidence.length,
      sourceFilters,
    });

    // If nothing at all and no direct evidence -> insufficient (200, not 500)
    if (annotated.length === 0 && directEvidence.length === 0) {
      const resultJson = buildInsufficientResult({
        companyName: company_name,
        website,
        domain,
        variants,
        qualityType: "no_results",
        reason: "No public sources returned by search; website crawl also failed or too thin.",
        debug: {
          queryA,
          queryB,
          queryC,
          queryD,
          queryE,
          queryF,
          queryG,
          queryH,
          rawA: sourcesA.length,
          rawB: sourcesB.length,
          rawC: sourcesC.length,
          rawD: sourcesD.length,
          rawE: sourcesE.length,
          rawF: sourcesF.length,
          rawG: sourcesG.length,
          rawH: sourcesH.length,
          crawled_site_pages: crawledSiteEvidence.length,
          source_filters: sourceFilters,
        },
      });

      const { data: inserted, error: insErr } = await supabase
        .from("public_baseline_runs")
        .insert({
          company_id,
          company_name,
          website,
          sources_json: {
            note: "no-results",
            queryA,
            queryB,
            queryC,
            queryD,
            queryE,
            queryF,
            queryG,
            queryH,
            raw_sources: rawSources,
            source_filters: sourceFilters,
            diagnostics: baseDiagnostics,
          },
          result_json: withRunLedger(resultJson, runLedger),
        })
        .select("id")
        .single();

      if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);
      await ingestPublicBaselineSignals({
        supabase,
        companyId: company_id,
        runId: inserted?.id ?? "",
        companyName: company_name,
        website,
        resultJson: withRunLedger(resultJson, runLedger),
      });

      return json({
        message: "Public baseline: insufficient public evidence",
        status: "insufficient_public_evidence",
        run_id: inserted?.id,
      });
    }

    if (filteredAnnotated.length === 0 && annotated.length > 0 && directEvidence.length === 0) {
      const closest = annotated.slice(0, 10).map((x: any) => ({
        url: x.url,
        title: x.title,
        snippet: x.snippet,
        engine: x.engine,
        source_type: x.source_type,
        match_score: x.match_score,
        match_reason: x.match_reason,
      }));

      const resultJson = buildInsufficientResult({
        companyName: company_name,
        website,
        domain,
        variants,
        qualityType: "thin",
        reason: "All matching public sources were filtered out by source controls.",
        debug: {
          queryA,
          queryB,
          queryC,
          queryD,
          queryE,
          queryF,
          queryG,
          queryH,
          rawCount: rawSources.length,
          annotatedCount: annotated.length,
          filteredCount: filteredAnnotated.length,
          source_filters: sourceFilters,
          closest_sources: closest,
        },
      });

      const { data: inserted, error: insErr } = await supabase
        .from("public_baseline_runs")
        .insert({
          company_id,
          company_name,
          website,
          sources_json: {
            note: "filtered-by-policy",
            queryA,
            queryB,
            queryC,
            queryD,
            queryE,
            queryF,
            queryG,
            queryH,
            source_filters: sourceFilters,
            annotated_top: closest,
            diagnostics: baseDiagnostics,
          },
          result_json: withRunLedger(resultJson, runLedger),
        })
        .select("id")
        .single();

      if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);
      await ingestPublicBaselineSignals({
        supabase,
        companyId: company_id,
        runId: inserted?.id ?? "",
        companyName: company_name,
        website,
        resultJson: withRunLedger(resultJson, runLedger),
      });

      return json({
        message: "Public baseline: insufficient public evidence",
        status: "insufficient_public_evidence",
        run_id: inserted?.id,
      });
    }

    // If there are results but none match well (and no direct site), record ambiguous (200) and include closest sources
    if (strong.length === 0 && medium.length === 0 && directEvidence.length === 0) {
      const closest = filteredAnnotated.slice(0, 10).map((x: any) => ({
        url: x.url,
        title: x.title,
        snippet: x.snippet,
        engine: x.engine,
        source_type: x.source_type,
        match_score: x.match_score,
        match_reason: x.match_reason,
      }));

      const resultJson = buildAmbiguousResult({
        companyName: company_name,
        website,
        domain,
        variants,
        reason: "Search results did not strongly match provided company/domain.",
        debug: {
          queryA,
          queryB,
          queryC,
          queryD,
          queryE,
          queryF,
          queryG,
          queryH,
          rawCount: rawSources.length,
          annotatedCount: annotated.length,
          filteredCount: filteredAnnotated.length,
          strong: strong.length,
          medium: medium.length,
          source_filters: sourceFilters,
        },
        closest_sources: closest,
      });

      const { data: inserted, error: insErr } = await supabase
        .from("public_baseline_runs")
        .insert({
          company_id,
          company_name,
          website,
          sources_json: {
            note: "ambiguous",
            queryA,
            queryB,
            queryC,
            queryD,
            queryE,
            queryF,
            queryG,
            queryH,
            source_filters: sourceFilters,
            annotated_top: closest,
            diagnostics: baseDiagnostics,
          },
          result_json: withRunLedger(resultJson, runLedger),
        })
        .select("id")
        .single();

      if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);
      await ingestPublicBaselineSignals({
        supabase,
        companyId: company_id,
        runId: inserted?.id ?? "",
        companyName: company_name,
        website,
        resultJson: withRunLedger(resultJson, runLedger),
      });

      return json({
        message: "Public baseline: ambiguous evidence (possible different company)",
        status: "ambiguous_public_evidence",
        run_id: inserted?.id,
      });
    }

    // Fetch & extract only candidates (faster + avoids trash)
    const extracted: any[] = [];
    for (const s of candidates) {
      const got = await fetchAndExtract(s.url);
      extracted.push({
        url: s.url,
        title: s.title,
        snippet: s.snippet,
        engine: s.engine,
        source_type: s.source_type,
        match_score: s.match_score,
        match_reason: s.match_reason,
        extracted: got.ok ? got.text : "",
        ok: got.ok,
      });
    }

    const discoveredFallbackOrigins = Array.from(
      new Set(
        extracted
          .flatMap((entry) => extractHttpUrlsFromText(String(entry?.extracted || ""), String(entry?.url || directUrl)))
          .map((candidateUrl) => {
            const host = getDomain(candidateUrl);
            if (!host) return "";
            if (isKnownSocialHost(host)) return "";
            if (domainMatches(host, domain)) return "";
            if (sourceFilters.exclude_domains.some((blocked) => domainMatches(host, blocked))) return "";
            if (
              !isSourceAllowedByPolicy({
                url: candidateUrl,
                sourceType: "public_web",
                companyDomain: domain,
                filters: sourceFilters,
              })
            ) return "";
            const hasStemMatch = stem ? host.includes(stem) : false;
            const variantMatches = variants.some((variant) => {
              const token = toSlug(variant);
              return token.length >= 4 && host.includes(token);
            });
            if (!hasStemMatch && !variantMatches) return "";
            try {
              const candidate = new URL(candidateUrl);
              return `${candidate.protocol}//${candidate.host}/`;
            } catch {
              return "";
            }
          })
          .filter(Boolean),
      ),
    ).slice(0, 3);

    const fallbackSiteEvidence: Array<{ url: string; title: string; snippet: string; extracted: string; source_type: string }> = [];
    const fallbackSocialEvidence: Array<{ url: string; title: string; snippet: string; source_type: string; extracted: string }> = [];
    for (const originUrl of discoveredFallbackOrigins) {
      try {
        const fallbackDomain = getDomain(originUrl);
        if (!fallbackDomain) continue;
        const fallbackCrawl = await crawlWebsiteEvidence({
          startUrl: originUrl,
          baseDomain: fallbackDomain,
          maxPages: 10,
          maxDepth: 2,
        });
        const fallbackSitePages = Array.isArray(fallbackCrawl?.siteEvidence) ? fallbackCrawl.siteEvidence : [];
        const fallbackSocial = Array.isArray(fallbackCrawl?.socialSources) ? fallbackCrawl.socialSources : [];

        for (const page of fallbackSitePages) {
          if (
            !isSourceAllowedByPolicy({
              url: page.url,
              sourceType: "public_web",
              companyDomain: domain,
              filters: sourceFilters,
            })
          ) continue;
          fallbackSiteEvidence.push({
            ...page,
            snippet: `Fallback site crawl (${fallbackDomain})`,
            source_type: "public_web",
          });
        }

        for (const social of fallbackSocial.slice(0, 6)) {
          if (
            !isSourceAllowedByPolicy({
              url: social.url,
              sourceType: social.source_type,
              companyDomain: domain,
              filters: sourceFilters,
            })
          ) continue;
          fallbackSocialEvidence.push({
            url: social.url,
            title: social.title,
            snippet: `Fallback social link discovered from ${originUrl}`,
            source_type: social.source_type,
            extracted: `Social/profile source linked from fallback site crawl: ${social.url}\nDiscovered from: ${originUrl}\nDirect scraping may be limited due to platform controls.`,
          });
        }
      } catch {
        // ignore fallback crawl failures
      }
    }

    const evidenceFromSearch = extracted
      .filter((e) => e.ok && e.extracted && e.extracted.length > 500)
      .slice(0, 12)
      .map((e) => ({
        url: e.url,
        title: e.title,
        snippet: e.snippet,
        source_type: e.source_type,
        extracted: e.extracted,
      }));

    const directEvidenceMerged = mergeEvidenceByUrl([...directEvidence, ...fallbackSiteEvidence]).slice(0, 12);
    const socialEvidenceMerged = mergeEvidenceByUrl([...socialLinkEvidence, ...fallbackSocialEvidence]).slice(0, 8);
    // Combine (direct + website/social/manual evidence first so they are represented)
    const evidence = [...directEvidenceMerged, ...socialEvidenceMerged, ...manualSeedEvidence, ...evidenceFromSearch]
      .filter((entry) =>
        isSourceAllowedByPolicy({
          url: String(entry?.url || ""),
          sourceType: String(entry?.source_type || "public_web"),
          companyDomain: domain,
          filters: sourceFilters,
        })
      )
      .slice(0, 14);
    const extractedByType = countBySourceType(evidenceFromSearch);
    const socialByType = countBySourceType(socialEvidenceMerged);
    const manualByType = countBySourceType(manualSeedEvidence);
    const finalByType = countBySourceType(evidence);
    const diagnosticsWithExtraction = {
      ...baseDiagnostics,
      extraction: {
        candidates: candidates.length,
        extracted_ok: evidenceFromSearch.length,
        direct_evidence: directEvidenceMerged.length,
        social_link_evidence: socialEvidenceMerged.length,
        manual_seed_evidence: manualSeedEvidence.length,
        fallback_site_origins: discoveredFallbackOrigins.length,
        fallback_site_evidence: fallbackSiteEvidence.length,
        final_evidence: evidence.length,
      },
      fallback_crawl: {
        discovered_origins: discoveredFallbackOrigins,
      },
      source_type_coverage: baseSourceCoverage.map((entry) => ({
        ...entry,
        extracted_count:
          (extractedByType[entry.source_type] || 0) +
          (socialByType[entry.source_type] || 0) +
          (manualByType[entry.source_type] || 0),
        final_evidence_count: finalByType[entry.source_type] || 0,
      })),
    };

    console.log("[baseline] evidence ready", {
      evidenceCount: evidence.length,
      fromDirect: directEvidenceMerged.length,
      fromSiteSocial: socialEvidenceMerged.length,
      fromManualSeed: manualSeedEvidence.length,
      fromSearchOk: evidenceFromSearch.length,
      fromFallbackSite: fallbackSiteEvidence.length,
      fallbackOrigins: discoveredFallbackOrigins.length,
      candidateCount: candidates.length,
    });

    // If evidence is too thin, record insufficient (200) and include top sources for debugging
    const hasBootstrapEvidence =
      (directEvidenceMerged.length + socialEvidenceMerged.length + manualSeedEvidence.length) >= 1 &&
      evidenceFromSearch.length === 0;
    if (evidence.length < 2 && !hasBootstrapEvidence) {
      const closest = filteredAnnotated.slice(0, 10).map((x: any) => ({
        url: x.url,
        title: x.title,
        snippet: x.snippet,
        engine: x.engine,
        source_type: x.source_type,
        match_score: x.match_score,
        match_reason: x.match_reason,
      }));

      // SRCH-1 — classify the refusal before recording it. If the search backend was
      // unusable for this entire run, "not enough extractable evidence" is a lie: we
      // never got to look. Distinct status, distinct reason naming the engines.
      const searchOutage = isUnambiguousSearchOutage(searchDiag);
      const outageDetail = describeUnresponsive(searchDiag);
      if (searchOutage) {
        ledgerRefusalText = `Search backend unavailable — no engine returned results for any of ${searchDiag.queriesRun} queries (${outageDetail}). No public evidence could be checked; this is not a finding about the company.`;
      }

      const resultJson = buildInsufficientResult({
        companyName: company_name,
        website,
        domain,
        variants,
        qualityType: searchOutage ? "search_unavailable" : "thin",
        status: searchOutage ? "search_unavailable" : undefined,
        reason: searchOutage
          ? `Search backend unavailable — no engine returned results for any of ${searchDiag.queriesRun} queries (${outageDetail}). No public evidence could be checked; this is not a finding about the company.`
          : "Not enough extractable evidence (need at least 2 sources with meaningful text).",
        debug: {
          search_health: {
            queries_run: searchDiag.queriesRun,
            queries_with_results: searchDiag.queriesWithResults,
            total_raw_results: searchDiag.totalRawResults,
            unresponsive_engines: [...searchDiag.unresponsive.entries()].map(([engine, why]) => ({ engine, why })),
            classified_outage: searchOutage,
          },
          queryA,
          queryB,
          queryC,
          queryD,
          queryE,
          queryF,
          queryG,
          queryH,
          filteredStrong: strong.length,
          filteredMedium: medium.length,
          candidates: candidates.length,
          extractedOk: evidenceFromSearch.length,
          directIncluded: directEvidence.length,
          source_filters: sourceFilters,
          closest_sources: closest,
        },
      });

      const { data: inserted, error: insErr } = await supabase
        .from("public_baseline_runs")
        .insert({
          company_id,
          company_name,
          website,
          sources_json: {
            note: "thin-evidence",
            queryA,
            queryB,
            queryC,
            queryD,
            queryE,
            queryF,
            queryG,
            queryH,
            source_filters: sourceFilters,
            annotated_top: closest,
            extracted_meta: extracted.map((x) => ({
              url: x.url,
              ok: x.ok,
              len: (x.extracted || "").length,
              match_score: x.match_score,
              source_type: x.source_type,
            })),
            diagnostics: diagnosticsWithExtraction,
          },
          result_json: withRunLedger(resultJson, runLedger),
        })
        .select("id")
        .single();

      if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);
      await ingestPublicBaselineSignals({
        supabase,
        companyId: company_id,
        runId: inserted?.id ?? "",
        companyName: company_name,
        website,
        resultJson: withRunLedger(resultJson, runLedger),
      });

      return json({
        message: searchOutage
          ? "Public baseline: search backend unavailable"
          : "Public baseline: insufficient public evidence",
        status: searchOutage ? "search_unavailable" : "insufficient_public_evidence",
        run_id: inserted?.id,
      });
    }

    // Synthesis: OpenAI baseline (DEFAULT, unchanged) OR flagged Claude web-search (OE-1).
    // claude_websearch bypasses the assembled `evidence` (Claude runs its own web_search);
    // the parsed object is handed to the SAME downstream below, unchanged.
    // B1: revive resolvedCategory from the latest prior run's PUBLIC-derived archetype.
    // Boundary note: this adds only prior-public-run content to the outbound prompt —
    // category_archetype was itself produced from public discovery. First-ever run ⇒
    // no prior row ⇒ param absent ⇒ prompt unchanged.
    let priorCategoryArchetype: string | undefined;
    if (synthesis_engine === "claude_websearch") {
      const { data: priorRun } = await supabase
        .from("public_baseline_runs")
        .select("id, result_json")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const archetype = String((priorRun as any)?.result_json?.category_archetype || "").trim();
      if (archetype) {
        priorCategoryArchetype = archetype;
        console.log("[baseline] resolvedCategory from prior run", {
          prior_run_id: (priorRun as any)?.id ?? null,
          category: archetype,
        });
      }
    }
    // V2-6c — claudeCitationSourceText carries the per-citation cited source text
    // (normalized URL → verbatim snippet) on the claude_websearch path; it stays empty
    // on the OpenAI path (that producer already lifts from the crawl map).
    let claudeCitationSourceText = new Map<string, string>();
    let result: unknown;
    if (synthesis_engine === "claude_websearch") {
      const claudeOut = await callClaudeWebSearch({
        apiKey: anthropicKey ?? "",
        model: anthropicModel,
        companyName: company_name,
        website,
        domain,
        resolvedCategory: priorCategoryArchetype,
        excludeDomains: sourceFilters.exclude_domains,
      });
      result = claudeOut.parsed;
      claudeCitationSourceText = claudeOut.citationSourceTextByUrl;
    } else {
      result = await callOpenAI({
        apiKey: openaiKey,
        model: openaiModel,
        fallbackModels: openaiFallbackModels,
        companyName: company_name,
        companyUrl: website,
        evidence,
      });
    }
    const discoveredProfileEvidence = [...socialEvidenceMerged, ...manualSeedEvidence]
      .filter((entry) => String(entry?.url || "").trim().length > 0)
      .filter((entry) =>
        isSourceAllowedByPolicy({
          url: String(entry?.url || ""),
          sourceType: String(entry?.source_type || "profile_or_company_page"),
          companyDomain: domain,
          filters: sourceFilters,
        })
      )
      .map((entry) => ({
        url: String(entry.url || "").trim(),
        source_type: String(entry.source_type || "profile_or_company_page").trim(),
        snippet: String(entry.snippet || "").trim(),
      }));
    const resultWithDiscoveredSources = {
      ...mergeDiscoveredEvidenceIntoLedger({
        result: typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {},
        // OE-1: claude runs its own web_search; injecting searx-discovered profile evidence
        // would commingle searx sources into a "pure claude" result_json. Skip the inject
        // for claude (the merge is inject-only, so [] is a no-op). OpenAI path unchanged.
        discoveredEvidence: synthesis_engine === "claude_websearch" ? [] : discoveredProfileEvidence,
      }),
      status: "ok" as const,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("public_baseline_runs")
      .insert({
        company_id,
        company_name,
        website,
        // Save full annotated sources for later review (includes “wrong company” candidates like CiboGlobal)
        sources_json: {
          queries: { queryA, queryB, queryC, queryD, queryE, queryF, queryG },
          // queryH is a broad fallback query not constrained by the submitted domain.
          queries_fallback: { queryH },
          source_filters: sourceFilters,
          annotated_sources: annotated.slice(0, 60),
          selected_sources: filteredAnnotated.slice(0, 40),
          diagnostics: diagnosticsWithExtraction,
        },
        result_json: withRunLedger(
          resultWithDiscoveredSources,
          runLedger,
        ),
      })
      .select("id")
      .single();

    if (insErr) return json({ error: "DB insert failed", details: insErr }, 500);
    // V2-6 — hand the crawl's REAL retained source text (evidence[].extracted) to ingest,
    // keyed by normalized URL, so the quote producer can lift a verbatim line per signal.
    // Only real fetched text is included; synthetic-label evidence carries none to lift.
    const sourceTextByUrl = new Map<string, string>();
    for (const e of evidence) {
      const key = normalizeUrlKey(String((e as { url?: unknown })?.url || ""));
      const extracted = String((e as { extracted?: unknown })?.extracted || "");
      if (key && extracted.trim().length >= 40) sourceTextByUrl.set(key, extracted);
    }
    // V2-6c — on the claude_websearch (default) engine the minted signals carry the
    // URLs Claude's own web_search returned, NOT the searx-crawl URLs, so the crawl
    // map above never joins (the V2-6b-D miss class). Merge the per-citation cited
    // source text — keyed to those same URLs — as the basis the producer lifts from.
    // Crawl entries win on key collision (a full page beats a snippet). Empty on the
    // OpenAI path → net-zero.
    const citationMerge = mergeCitationSourceText(sourceTextByUrl, claudeCitationSourceText);
    console.log("[baseline] V2-6c citation basis", {
      engine: synthesis_engine,
      citation_urls: claudeCitationSourceText.size,
      added: citationMerge.added,
      crawl_collisions: citationMerge.collisions,
      source_text_urls: sourceTextByUrl.size,
    });
    await ingestPublicBaselineSignals({
      supabase,
      companyId: company_id,
      runId: inserted?.id ?? "",
      companyName: company_name,
      website,
      resultJson: withRunLedger(
        resultWithDiscoveredSources,
        runLedger,
      ),
      sourceTextByUrl,
    });

    console.log("[baseline] DONE", { run_id: inserted?.id, sources: filteredAnnotated.length, raw_sources: annotated.length });

    // RB-1 Stage 4: complete the claim reconcile off this request's budget (idempotent).
    waitUntil(triggerRebuildClaims(
      company_id,
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    ));

    if (skip_mojo_analysis) {
      console.log("[baseline] skip_mojo_analysis=true — monitor-only run, not chaining run-mojo-analysis");
    } else {
      waitUntil(triggerMojoAnalysis(
        company_id,
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      ));
    }

    return json({
      message: "Public baseline complete",
      status: "ok",
      run_id: inserted?.id,
      sources: filteredAnnotated.length,
      raw_sources: annotated.length,
      strong_matches: strong.length,
      medium_matches: medium.length,
    });
      })();
      // Terminal outcome derived from the actual HTTP status the body computed: 2xx =
      // the run reached a durable determinate result (ok / insufficient / ambiguous — all
      // legitimate completions); any other status = failed.
      ledgerOutcome = resp.status >= 200 && resp.status < 300 ? "completed" : "failed";
      return resp;
    } catch (bodyErr) {
      ledgerOutcome = "failed";
      // SRCH-1: prefer the refusal's own honest text; fall back to the exception.
      ledgerErrText = ledgerRefusalText ?? String((bodyErr as { message?: unknown })?.message ?? bodyErr);
      throw bodyErr;
    } finally {
      stopLockHeartbeat();
      await releaseCompanyRunLock(supabase, company_id);
      if (ledgerRowId) {
        const { error: ledgerFinErr } = await supabase
          .from("long_runner_runs")
          .update({
            status: ledgerOutcome,
            done_count: ledgerOutcome === "completed" ? 1 : 0,
            error_text: ledgerErrText,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", ledgerRowId);
        if (ledgerFinErr) console.log("[baseline] long_runner_runs terminal update error", ledgerFinErr.message);
      }
    }
  } catch (err) {
    console.error("[baseline] error:", err);
    return json({ error: String((err as any)?.message || err) }, 500);
  }
});
