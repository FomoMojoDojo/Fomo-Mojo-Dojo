// ── Signed source-category map (operator-signed 2026-08-21) ──────────────────
//
// THE SINGLE SOURCE OF TRUTH for what public-source kind a host belongs to. Used by BOTH the
// outside Mojo Score scorer (coverage_breadth) and the beat-8 lever sub-line. No second copy.
//
// Client-facing labels are verbatim and their canonical order is fixed:
//   Your own site · Reviews & listings · Social · Press & articles · Directories · Other
//
// "Your own site" (client voice) and "Other" (cannot be placed with confidence) are EXCLUDED from
// coverage breadth. Breadth counts the four OUTSIDE kinds. Formula (unchanged) lives in the scorer:
//   min(outside kinds present − 1, 3) / 3.
//
// Pure module — no DB, no view, no React imports. Deterministic.

export type SourceCategory =
  | "Your own site"
  | "Reviews & listings"
  | "Social"
  | "Press & articles"
  | "Directories"
  | "Other";

/** Canonical display order for ALL categories. */
export const CATEGORY_ORDER: readonly SourceCategory[] = [
  "Your own site",
  "Reviews & listings",
  "Social",
  "Press & articles",
  "Directories",
  "Other",
];

/** The four OUTSIDE kinds that count toward coverage breadth, in canonical order. "Your own site"
 *  and "Other" are deliberately absent — they never count. */
export const OUTSIDE_KINDS: readonly SourceCategory[] = [
  "Reviews & listings",
  "Social",
  "Press & articles",
  "Directories",
];

/**
 * Signed host → category table for CB2's 40 distinct hosts. Keys are bare hosts (no scheme, no
 * www., no path). A signal's host is matched exactly first, then by stripping leftmost subdomain
 * labels (so m.yelp.com → yelp.com and any future subdomain of a listed base resolves). Anything
 * unmatched → Other.
 */
export const HOST_CATEGORY: Readonly<Record<string, SourceCategory>> = {
  // Your own site — client voice (excluded from breadth)
  "cafebarra.com": "Your own site",
  "order-cafebarra.square.site": "Your own site",

  // Reviews & listings — review platforms, place pages, order-ahead listings, retailer product listing
  "joe.coffee": "Reviews & listings",
  "yelp.com": "Reviews & listings",
  "m.yelp.com": "Reviews & listings",
  "wanderlog.com": "Reviews & listings",
  "ubereats.com": "Reviews & listings",
  "restaurantguru.com": "Reviews & listings",
  "corner.inc": "Reviews & listings",
  "maps.roadtrippers.com": "Reviews & listings",
  "postmates.com": "Reviews & listings",
  "restaurant.com": "Reviews & listings",
  "restaurantji.com": "Reviews & listings",
  "wineandeggs.com": "Reviews & listings",

  // Social
  "instagram.com": "Social",

  // Press & articles — industry blogs and market-research reports (all market-level, no client voice)
  "swell.is": "Press & articles",
  "mordorintelligence.com": "Press & articles",
  "beanandbrewtech.com": "Press & articles",
  "foodtruckempire.com": "Press & articles",
  "grandviewresearch.com": "Press & articles",
  "coffeebusiness.com": "Press & articles",
  "coffeecrafters.com": "Press & articles",
  "verifiedmarketresearch.com": "Press & articles",

  // Directories — business-directory / city / catalog listings
  "chamberofcommerce.com": "Directories",
  "restaurants-california.nears.me": "Directories",
  "themugsusa.lat": "Directories",
  "checkle.com": "Directories",
  "roaminghunger.com": "Directories",
  "bizprofile.net": "Directories",
  "local.yahoo.com": "Directories",
  "visitburbank.com": "Directories",

  // Other — third-party/partner sites, competitor sites, and unplaceable hosts (excluded from breadth)
  "lefrenchrooster.com": "Other", // partner café's own site — market-side, not a listing/review/press/directory
  "accio.com": "Other",
  "barrapicaresca.com": "Other",
  "cumbre.coffee": "Other",
  "facebook.com": "Other", // the one CB2 URL is a /2008/fbml namespace ref, not real social content
  "atly.com": "Other",
  "belli-fratelli-roasters.com-fnb.com": "Other",
  "brotherscoffeela.com": "Other",
  "izotecoffee.com": "Other",
};

/** Bare host from a URL: strips scheme, path/query/fragment, port, and a leading www. Null if empty. */
export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let h = url.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "");
  h = h.replace(/[/?#].*$/, "");
  h = h.replace(/:\d+$/, "");
  h = h.replace(/^www\./, "");
  return h || null;
}

/** Category for a URL/host. Exact host match, then strip leftmost subdomain labels (m.yelp.com →
 *  yelp.com), never past the registrable base. Unmatched → Other. */
export function categorizeHost(url: string | null | undefined): SourceCategory {
  const host = hostFromUrl(url);
  if (!host) return "Other";
  let h = host;
  for (;;) {
    const cat = HOST_CATEGORY[h];
    if (cat) return cat;
    const dot = h.indexOf(".");
    if (dot < 0) break;
    const rest = h.slice(dot + 1);
    if (!rest.includes(".")) break; // don't strip down to a bare TLD
    h = rest;
  }
  return "Other";
}

/**
 * Beat-8 coverage lever sub-line, in the SIGNED shape. `presentKinds` may be in any order; the
 * output always lists kinds in canonical order.
 *   n>0, some absent: "{n} of 4 outside source kinds represented: {present}. Missing: {absent}."
 *   n=4 (all present): "4 of 4 outside source kinds represented: {present}."   (no Missing clause)
 *   n=0:               "0 of 4 outside source kinds represented. Missing: {absent}."
 */
export function coverageSubline(presentKinds: readonly SourceCategory[]): string {
  const present = OUTSIDE_KINDS.filter((k) => presentKinds.includes(k));
  const absent = OUTSIDE_KINDS.filter((k) => !presentKinds.includes(k));
  const head = `${present.length} of ${OUTSIDE_KINDS.length} outside source kinds represented`;
  if (present.length === 0) return `${head}. Missing: ${absent.join(", ")}.`;
  const presentClause = `${head}: ${present.join(", ")}.`;
  return absent.length === 0 ? presentClause : `${presentClause} Missing: ${absent.join(", ")}.`;
}
