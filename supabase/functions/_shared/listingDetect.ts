// LISTING DETECTOR — pure (no Deno, no DB, no model). Operator ruling 2026-09-04, shape (b).
//
// extractStructured(rawHtml): the raw structured block a crawl stores in outside_page_snapshots.structured —
// every application/ld+json script (parsed), og:* product meta, and a Shopify "vendor" field — captured from the
// RAW html BEFORE extractTextBasic (which strips scripts and attributes, losing all of it).
//
// detectListing(): the ladder JSON-LD Product → og product meta → vendor → text fallback (a title line
// immediately followed by a currency line). Then the two refusals, in this order: own_host (the client's own
// site never lists itself as evidence) and brand_not_anchored (brand / vendor / product name must carry a
// company entity anchor — the SAME buildAnchors set the review runner uses). Output: the listing fields
// exactly as signed; the verbatim text is the title line only.
import { isOwnDomainUrl } from "./firstReadProvenance.ts";
import { norm } from "./outsideRecrawlAnchors.ts";

export type StructuredBlock = { ld_json: unknown[]; og: Record<string, string>; vendor: string | null };
export type Listing = { product_name: string; price: number | null; currency: string | null; attribution_text: string | null; listing_url: string; detected_from: "ld+json" | "og" | "vendor" | "text" };
export type ListingRefusal = "own_host" | "brand_not_anchored" | "no_listing";
export type DetectResult = { ok: true; listing: Listing } | { ok: false; reason: ListingRefusal };

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").trim();

export function extractStructured(html: string): StructuredBlock {
  const src = html ?? "";
  const ld_json: unknown[] = [];
  for (const m of src.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { const parsed = JSON.parse(m[1].trim()); Array.isArray(parsed) ? ld_json.push(...parsed) : ld_json.push(parsed); } catch { /* unparsable block: skipped */ }
  }
  const og: Record<string, string> = {};
  for (const m of src.matchAll(/<meta\s+[^>]*property=["']og:([a-z:_]+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi)) {
    if (!(m[1] in og)) og[m[1]] = decode(m[2]);
  }
  for (const m of src.matchAll(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*property=["']og:([a-z:_]+)["'][^>]*>/gi)) {
    if (!(m[2] in og)) og[m[2]] = decode(m[1]);
  }
  const v = /"vendor"\s*:\s*"([^"]+)"/.exec(src);
  return { ld_json, og, vendor: v ? decode(v[1]) : null };
}

type Candidate = { product_name: string; price: number | null; currency: string | null; attribution_text: string | null; detected_from: Listing["detected_from"] };

const num = (x: unknown): number | null => { const n = Number(String(x ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) && String(x ?? "").trim() !== "" ? n : null; };
const nameOf = (x: unknown): string | null => typeof x === "string" ? x.trim() || null : x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string" ? String((x as { name: string }).name).trim() || null : null;

function fromLdJson(block: StructuredBlock): Candidate | null {
  const walk = (n: unknown): Record<string, unknown> | null => {
    if (!n || typeof n !== "object") return null;
    const o = n as Record<string, unknown>;
    const t = o["@type"]; const types = Array.isArray(t) ? t : [t];
    if (types.includes("Product")) return o;
    for (const k of ["@graph", "mainEntity", "itemListElement"]) { const v = o[k]; if (Array.isArray(v)) for (const c of v) { const r = walk(c); if (r) return r; } else { const r = walk(v); if (r) return r; } }
    return null;
  };
  for (const n of block.ld_json) {
    const p = walk(n); if (!p) continue;
    const product_name = nameOf(p.name); if (!product_name) continue;
    const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
    const o = (offers && typeof offers === "object" ? offers : {}) as Record<string, unknown>;
    return { product_name, price: num(o.price ?? o.lowPrice), currency: typeof o.priceCurrency === "string" ? o.priceCurrency : null, attribution_text: nameOf(p.brand) ?? nameOf(p.manufacturer), detected_from: "ld+json" };
  }
  return null;
}
function fromOg(block: StructuredBlock): Candidate | null {
  const og = block.og;
  if ((og.type ?? "").toLowerCase() !== "product" || !og.title) return null;
  return { product_name: og.title, price: num(og["price:amount"]), currency: og["price:currency"] ?? null, attribution_text: block.vendor ?? og.brand ?? null, detected_from: "og" };
}
function fromVendor(block: StructuredBlock): Candidate | null {
  if (!block.vendor || !block.og.title) return null;
  return { product_name: block.og.title, price: num(block.og["price:amount"]), currency: block.og["price:currency"] ?? null, attribution_text: block.vendor, detected_from: "vendor" };
}
const CURRENCY_LINE = /^\s*(?:(\$|€|£)\s?(\d{1,6}(?:[.,]\d{2})?)|(\d{1,6}(?:[.,]\d{2})?)\s?(USD|EUR|GBP))\s*$/;
function fromText(body: string): Candidate | null {
  const lines = (body ?? "").split(/\r?\n/).map((l) => l.trim());
  for (let i = 0; i + 1 < lines.length; i++) {
    const title = lines[i]; const m = CURRENCY_LINE.exec(lines[i + 1]);
    if (!m || title.split(/\s+/).length < 2 || title.length > 120 || CURRENCY_LINE.test(title)) continue;
    const price = num(m[2] ?? m[3]); const currency = m[4] ?? ({ "$": "USD", "€": "EUR", "£": "GBP" } as Record<string, string>)[m[1] ?? ""] ?? null;
    return { product_name: title, price, currency, attribution_text: null, detected_from: "text" };
  }
  return null;
}

export function detectListing(args: { structured: StructuredBlock | null | undefined; body: string | null | undefined; url: string; anchors: string[]; companyHost: string | null | undefined }): DetectResult {
  const block: StructuredBlock = args.structured ?? { ld_json: [], og: {}, vendor: null };
  const cand = fromLdJson(block) ?? fromOg(block) ?? fromVendor(block) ?? fromText(args.body ?? "");
  if (!cand) return { ok: false, reason: "no_listing" };
  if (args.companyHost && isOwnDomainUrl(args.url, args.companyHost)) return { ok: false, reason: "own_host" };
  const hay = [cand.attribution_text, cand.product_name].filter((x): x is string => !!x).map(norm);
  const anchored = args.anchors.some((a) => a && hay.some((h) => h.includes(a)));
  if (!anchored) return { ok: false, reason: "brand_not_anchored" };
  return { ok: true, listing: { product_name: cand.product_name, price: cand.price, currency: cand.currency, attribution_text: cand.attribution_text, listing_url: args.url, detected_from: cand.detected_from } };
}

/** Content identity input for a listing signal: host + product name + price (signed). */
export function listingIdentityInput(l: Listing): string {
  let host = l.listing_url; try { host = new URL(l.listing_url).hostname.replace(/^www\./, ""); } catch { /* keep url */ }
  return `listing|${norm(host)}|${norm(l.product_name)}|${l.price ?? ""}`;
}
