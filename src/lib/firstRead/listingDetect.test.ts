// LISTING DETECTOR (operator ruling 2026-09-04, shape (b)). Pure, deterministic, model-free. Proves:
// wineandeggs-shaped page (JSON-LD Product) → detected with the expected fields; the VACUOUS PROOFS —
// another brand on the same host → brand_not_anchored; the client's own host → own_host; a page with no
// product → no_listing; and the fallback ladder (og → vendor → text). RED before the module exists.
import { describe, expect, it } from "vitest";
import { detectListing, extractStructured } from "../../../supabase/functions/_shared/listingDetect";
import { buildAnchors } from "../../../supabase/functions/_shared/outsideRecrawlAnchors";

const ANCHORS = buildAnchors({ name: "Cafe Barra 2", website: "https://cafebarra.com", entityAnchors: ["Cafe Barra", "cafebarra.com", "Le French Rooster"] });
const HOST = "cafebarra.com";
const ld = (name: string, brand: string, price = "22.0") => `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name, brand: { "@type": "Thing", name: brand }, offers: { "@type": "Offer", price, priceCurrency: "USD", availability: "http://schema.org/InStock" } })}</script>`;
const WINEANDEGGS = `<html><head><title>Cafe Barra Machado de Assis Brazil – Wine + Eggs</title><meta property="og:type" content="product"><meta property="og:title" content="Cafe Barra Machado de Assis Brazil">${ld("Cafe Barra Machado de Assis Brazil", "Cafe Barra")}</head><body><div>Cafe Barra</div><h1>Cafe Barra Machado de Assis Brazil</h1><div>$22.00</div><p>This coffee is a roaster's dream.</p><script>var meta = {"product":{"vendor":"Cafe Barra"}}</script></body></html>`;
const URL = "https://wineandeggs.com/products/cafe-barra-machado-de-assis-brazil";

describe("extractStructured", () => {
  it("captures JSON-LD blocks, og product meta and the Shopify vendor from RAW html", () => {
    const s = extractStructured(WINEANDEGGS);
    expect(s.ld_json).toHaveLength(1);
    expect(s.og.type).toBe("product");
    expect(s.og.title).toBe("Cafe Barra Machado de Assis Brazil");
    expect(s.vendor).toBe("Cafe Barra");
  });
  it("a page with nothing structured → empty block", () => {
    const s = extractStructured("<html><body><p>hello</p></body></html>");
    expect(s.ld_json).toEqual([]); expect(s.og).toEqual({}); expect(s.vendor).toBeNull();
  });
});

describe("detectListing — wineandeggs shape", () => {
  it("JSON-LD Product with an anchored brand → detected, ld+json, 22.00 USD", () => {
    const r = detectListing({ structured: extractStructured(WINEANDEGGS), body: "Cafe Barra\nCafe Barra Machado de Assis Brazil\n$22.00\n", url: URL, anchors: ANCHORS, companyHost: HOST });
    expect(r).toEqual({ ok: true, listing: { product_name: "Cafe Barra Machado de Assis Brazil", price: 22, currency: "USD", attribution_text: "Cafe Barra", listing_url: URL, detected_from: "ld+json" } });
  });
});

describe("detectListing — vacuous proofs", () => {
  it("another brand on the SAME host → refused brand_not_anchored", () => {
    const html = `<html><head>${ld("Ritual Coffee Sweet Tooth", "Ritual Coffee")}</head><body>Ritual Coffee Sweet Tooth $21.00</body></html>`;
    const r = detectListing({ structured: extractStructured(html), body: "Ritual Coffee Sweet Tooth\n$21.00", url: "https://wineandeggs.com/products/ritual-sweet-tooth", anchors: ANCHORS, companyHost: HOST });
    expect(r).toEqual({ ok: false, reason: "brand_not_anchored" });
  });
  it("the client's own host → refused own_host even with an anchored brand", () => {
    const r = detectListing({ structured: extractStructured(WINEANDEGGS), body: "x", url: "https://www.cafebarra.com/products/machado", anchors: ANCHORS, companyHost: HOST });
    expect(r).toEqual({ ok: false, reason: "own_host" });
  });
  it("no product anywhere → refused no_listing", () => {
    const r = detectListing({ structured: extractStructured("<html><body><p>About us</p></body></html>"), body: "About us", url: "https://joe.coffee/locations/x", anchors: ANCHORS, companyHost: HOST });
    expect(r).toEqual({ ok: false, reason: "no_listing" });
  });
});

describe("detectListing — fallback ladder", () => {
  it("og product + price meta (no JSON-LD) → detected_from og", () => {
    const html = `<html><head><meta property="og:type" content="product"><meta property="og:title" content="Cafe Barra Machado de Assis Brazil"><meta property="og:price:amount" content="22.00"><meta property="og:price:currency" content="USD"></head><body></body></html>`;
    const r = detectListing({ structured: extractStructured(html), body: "", url: URL, anchors: ANCHORS, companyHost: HOST });
    expect(r.ok && r.listing.detected_from).toBe("og");
    expect(r.ok && r.listing.price).toBe(22);
  });
  it("vendor only (Shopify) with an og title → detected_from vendor; price null", () => {
    const html = `<html><head><meta property="og:title" content="Cafe Barra Machado de Assis Brazil"></head><body><script>{"vendor":"Cafe Barra"}</script></body></html>`;
    const r = detectListing({ structured: extractStructured(html), body: "", url: URL, anchors: ANCHORS, companyHost: HOST });
    expect(r.ok && r.listing.detected_from).toBe("vendor");
    expect(r.ok && r.listing.attribution_text).toBe("Cafe Barra");
  });
  it("text fallback: a title line immediately followed by a currency line", () => {
    const r = detectListing({ structured: extractStructured(""), body: "Coffee\nCafe Barra Machado de Assis Brazil\n$22.00\nFull City", url: URL, anchors: ANCHORS, companyHost: HOST });
    expect(r.ok && r.listing.detected_from).toBe("text");
    expect(r.ok && r.listing.product_name).toBe("Cafe Barra Machado de Assis Brazil");
    expect(r.ok && r.listing.price).toBe(22);
  });
});
