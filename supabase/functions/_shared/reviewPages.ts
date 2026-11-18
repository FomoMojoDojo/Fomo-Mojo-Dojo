// ── THE REVIEWED PAGE LIST (V1, 2026-11-18; the Charter voice research plan, decision 3) ──────────────────────────────────
//
// Which review page means which brand — a STORED FACT the review-host lane reads off the cited URL. A citation whose URL
// matches an entry here is about that entry's confirmed related entity (company_related_entities: Charter's Spectrum brand
// and Cox); a citation whose URL matches NO entry is "brand not recorded" (about_entity_id NULL). The quote's text never
// decides the brand, and no model does. Every entry is matched on the URL's host AND path (and, for Google Play, the app
// id), so an unlisted page on a listed host — another company's Trustpilot page, a category page — gets no brand.
//
// REVIEW NOTES (for the operator):
//   * pages named for "Charter Communications" (Charter's own BBB, Yelp and PissedConsumer pages) are mapped to the
//     Spectrum brand: Spectrum is the only consumer brand Charter sold under before 2026-08-20.
//   * Cox's own community (forums.cox.com, any cox.com page) is NOT a target and NOT listed (decision 6): cox.com is a
//     confirmed Charter-related host, so the voice rule would read a customer's post there as Charter's own words.
//   * DSLReports threads carry no brand in their path, so a thread citation is "brand not recorded" by construction.
//   * Reddit: only r/Spectrum and r/CoxCommunications name a brand. Any other subreddit (a city's, a general one) is
//     "brand not recorded"; its name is kept as `forum`, uninterpreted. Reddit and DSLReports are LEADS only
//     (searchLeads.ts): the paid page fetch cannot read them (measured 2026-11-18).
//   * pages added 2026-11-18 from the source URLs behind the "Spectrum" company record's customer reviews (used as LEADS
//     only — nothing copied): Trustpilot charter.net, BBB's New York "spectrum-0121-460" profile, AllConnect and
//     HighSpeedInternet.com (and the same two sites' Cox pages). Left OFF the list: editorial reviews (Forbes,
//     reviews.org, Yahoo), Glassdoor (employees), and ConsumerAffairs' Bright House page (a predecessor brand, neither
//     Spectrum nor Cox).
//
// TARGETS are the calls, in run order (Cox first — decision 2). One web_search call per target.

export type ReviewEntity = "spectrum" | "cox";
export type ReviewPage = { key: string; entity: ReviewEntity; label: string; host: RegExp; path: RegExp; appId?: RegExp };
export type ReviewTarget = { key: string; host: string; site: string; brand: string; hint: string };
export type CompanyReviewList = { companyId: string; entities: Record<ReviewEntity, string>; names: RegExp; pages: ReviewPage[]; targets: ReviewTarget[] };

const TRUSTPILOT = /^(?:[a-z]{2}\.|www\.)?trustpilot\.com$/;
const CONSUMERAFFAIRS = /^(?:www\.)?consumeraffairs\.com$/;
const BBB = /^(?:www\.)?bbb\.org$/;
const YELP = /^(?:www\.)?yelp\.com$/;
const APPLE = /^apps\.apple\.com$/;
const PLAY = /^play\.google\.com$/;
const DSL = /^(?:www\.)?dslreports\.com$/;

export const CHARTER_COMPANY_ID = "dd40ce2f-ff67-4111-bd3c-67943dde6717";

export const CHARTER_REVIEW_LIST: CompanyReviewList = {
  companyId: CHARTER_COMPANY_ID,
  entities: { spectrum: "68476083-0e1b-453d-947d-40e9699c6b83", cox: "e2c1c984-0d9b-4936-9afc-6b6f355559f2" },
  names: /\b(?:spectrum|charter|cox)\b/i,
  pages: [
    // ── Cox ──
    { key: "cox-trustpilot", entity: "cox", label: "Trustpilot — Cox", host: TRUSTPILOT, path: /^\/review\/(?:www\.)?cox\.(?:com|net)\/?$/i },
    { key: "cox-consumeraffairs", entity: "cox", label: "ConsumerAffairs — Cox", host: CONSUMERAFFAIRS, path: /^\/(?:cable_tv|internet|homeowners|cell_phones)\/cox(?:_[a-z_]+)?\.html$/i },
    { key: "cox-bbb", entity: "cox", label: "BBB — Cox Communications", host: BBB, path: /^\/us\/[a-z]{2}\/[a-z0-9-]+\/profile\/[a-z0-9-]+\/cox-communications-[0-9-]+(?:\/.*)?$/i },
    { key: "cox-yelp", entity: "cox", label: "Yelp — Cox", host: YELP, path: /^\/(?:biz\/cox-(?:communications|solutions-store)[a-z0-9-]*|brands\/cox-communications)\/?$/i },
    { key: "cox-pissedconsumer", entity: "cox", label: "PissedConsumer — Cox", host: /^cox(?:-communications)?\.pissedconsumer\.com$/, path: /^\/.*/ },
    { key: "cox-appstore", entity: "cox", label: "App Store — Cox apps", host: APPLE, path: /^\/[a-z]{2}\/app\/(?:cox-app|cox-mobile|cox-panoramic-wifi|contour[a-z0-9-]*)\/id[0-9]+\/?$/i },
    { key: "cox-googleplay", entity: "cox", label: "Google Play — Cox apps", host: PLAY, path: /^\/store\/apps\/details\/?$/, appId: /^com\.cox\.(?!.*(?:auto|manheim|kbb|kelley))[a-z0-9._]+$/i },
    { key: "cox-allconnect", entity: "cox", label: "AllConnect — Cox customer reviews", host: /^(?:www\.)?allconnect\.com$/, path: /^\/providers\/cox\/customer-reviews\/?$/i },
    { key: "cox-highspeedinternet", entity: "cox", label: "HighSpeedInternet.com — Cox reviews", host: /^(?:www\.)?highspeedinternet\.com$/, path: /^\/providers\/cox\/reviews\/?$/i },
    { key: "cox-dslreports", entity: "cox", label: "DSLReports — Cox forum", host: DSL, path: /^\/forum\/cox[a-z0-9]*\/?$/i },
    { key: "cox-reddit", entity: "cox", label: "Reddit — r/CoxCommunications", host: /^(?:www\.|old\.)?reddit\.com$/, path: /^\/r\/coxcommunications(?:\/.*)?$/i },
    // ── Spectrum (and Charter-named pages) ──
    { key: "spectrum-reddit", entity: "spectrum", label: "Reddit — r/Spectrum", host: /^(?:www\.|old\.)?reddit\.com$/, path: /^\/r\/spectrum(?:\/.*)?$/i },
    { key: "spectrum-trustpilot", entity: "spectrum", label: "Trustpilot — Spectrum", host: TRUSTPILOT, path: /^\/review\/(?:www\.)?(?:spectrum\.net|spectrum\.com|charterspectrum\.com|charter\.com|charter\.net)\/?$/i },
    { key: "spectrum-consumeraffairs", entity: "spectrum", label: "ConsumerAffairs — Spectrum / Charter", host: CONSUMERAFFAIRS, path: /^\/(?:cable_tv|internet|cell_phones)\/(?:charter|spectrum)(?:_[a-z_]+)?\.html$/i },
    { key: "spectrum-bbb", entity: "spectrum", label: "BBB — Charter Communications", host: BBB, path: /^\/us\/[a-z]{2}\/[a-z0-9-]+\/profile\/[a-z0-9-]+\/(?:charter-communications|charter-spectrum)-[0-9-]+(?:\/.*)?$/i },
    { key: "spectrum-bbb-ny", entity: "spectrum", label: "BBB — Spectrum (New York profile)", host: BBB, path: /^\/us\/ny\/new-york\/profile\/cable-tv\/spectrum-0121-460(?:\/.*)?$/i },
    { key: "spectrum-yelp", entity: "spectrum", label: "Yelp — Spectrum / Charter", host: YELP, path: /^\/(?:brands\/(?:charter-communications|spectrum)|biz\/spectrum-(?:store|mobile-store|internet)[a-z0-9-]*)\/?$/i },
    { key: "spectrum-pissedconsumer", entity: "spectrum", label: "PissedConsumer — Spectrum / Charter", host: /^(?:spectrum|charter-communications|charter-spectrum)\.pissedconsumer\.com$/, path: /^\/.*/ },
    { key: "spectrum-appstore", entity: "spectrum", label: "App Store — Spectrum apps", host: APPLE, path: /^\/[a-z]{2}\/app\/(?:my-spectrum|spectrum-tv|spectrum-tv-app|spectrum-mobile|spectrum-access)\/id[0-9]+\/?$/i },
    { key: "spectrum-googleplay", entity: "spectrum", label: "Google Play — Spectrum apps", host: PLAY, path: /^\/store\/apps\/details\/?$/, appId: /^(?:com\.TWCableTV|com\.charter\.[a-z0-9._]+)$/i },
    { key: "spectrum-allconnect", entity: "spectrum", label: "AllConnect — Spectrum customer reviews", host: /^(?:www\.)?allconnect\.com$/, path: /^\/providers\/spectrum\/customer-reviews\/?$/i },
    { key: "spectrum-highspeedinternet", entity: "spectrum", label: "HighSpeedInternet.com — Spectrum reviews", host: /^(?:www\.)?highspeedinternet\.com$/, path: /^\/providers\/spectrum\/reviews\/?$/i },
    { key: "spectrum-dslreports", entity: "spectrum", label: "DSLReports — Charter/Spectrum forum", host: DSL, path: /^\/forum\/(?:charter|spectrum)[a-z0-9]*\/?$/i },
  ],
  targets: [
    { key: "cox-trustpilot", host: "trustpilot.com", site: "Trustpilot", brand: "Cox Communications (cox.com)", hint: "the Trustpilot review page for cox.com (trustpilot.com/review/www.cox.com)" },
    { key: "cox-trustpilot-net", host: "trustpilot.com", site: "Trustpilot", brand: "Cox Communications (cox.net)", hint: "the Trustpilot review page for cox.net (trustpilot.com/review/cox.net)" },
    { key: "cox-consumeraffairs", host: "consumeraffairs.com", site: "ConsumerAffairs", brand: "Cox Communications", hint: "the ConsumerAffairs reviews page for Cox Communications" },
    { key: "cox-bbb", host: "bbb.org", site: "the Better Business Bureau", brand: "Cox Communications", hint: "the BBB customer reviews and complaints pages for Cox Communications" },
    { key: "cox-yelp", host: "yelp.com", site: "Yelp", brand: "Cox Communications", hint: "Yelp review pages for Cox Communications or Cox stores" },
    { key: "cox-pissedconsumer", host: "pissedconsumer.com", site: "PissedConsumer", brand: "Cox Communications", hint: "the PissedConsumer review pages for Cox Communications" },
    { key: "cox-appstore", host: "apps.apple.com", site: "the Apple App Store", brand: "Cox Communications", hint: "the App Store listing and customer reviews of the Cox App or Cox Contour app" },
    { key: "cox-googleplay", host: "play.google.com", site: "Google Play", brand: "Cox Communications", hint: "the Google Play listing and customer reviews of the Cox App or Cox Contour app" },
    { key: "cox-allconnect", host: "allconnect.com", site: "AllConnect", brand: "Cox Communications", hint: "the AllConnect customer reviews page for Cox (allconnect.com/providers/cox/customer-reviews)" },
    { key: "cox-highspeedinternet", host: "highspeedinternet.com", site: "HighSpeedInternet.com", brand: "Cox Communications", hint: "the HighSpeedInternet.com customer reviews page for Cox (highspeedinternet.com/providers/cox/reviews)" },
    { key: "spectrum-trustpilot-net", host: "trustpilot.com", site: "Trustpilot", brand: "Spectrum (spectrum.net)", hint: "the Trustpilot review page for spectrum.net (trustpilot.com/review/spectrum.net)" },
    { key: "spectrum-trustpilot-charter", host: "trustpilot.com", site: "Trustpilot", brand: "Charter Spectrum (charterspectrum.com)", hint: "the Trustpilot review page for charterspectrum.com or spectrum.com" },
    { key: "spectrum-consumeraffairs", host: "consumeraffairs.com", site: "ConsumerAffairs", brand: "Spectrum (Charter Communications)", hint: "the ConsumerAffairs reviews page for Spectrum / Charter" },
    { key: "spectrum-bbb", host: "bbb.org", site: "the Better Business Bureau", brand: "Charter Communications (Spectrum)", hint: "the BBB customer reviews and complaints pages for Charter Communications" },
    { key: "spectrum-yelp", host: "yelp.com", site: "Yelp", brand: "Spectrum (Charter Communications)", hint: "Yelp review pages for Spectrum or Charter Communications" },
    { key: "spectrum-pissedconsumer", host: "pissedconsumer.com", site: "PissedConsumer", brand: "Spectrum (Charter Communications)", hint: "the PissedConsumer review pages for Spectrum or Charter Communications" },
    { key: "spectrum-appstore", host: "apps.apple.com", site: "the Apple App Store", brand: "Spectrum", hint: "the App Store listing and customer reviews of the My Spectrum app or the Spectrum TV app" },
    { key: "spectrum-googleplay", host: "play.google.com", site: "Google Play", brand: "Spectrum", hint: "the Google Play listing and customer reviews of the My Spectrum app or the Spectrum TV app" },
    { key: "spectrum-allconnect", host: "allconnect.com", site: "AllConnect", brand: "Spectrum", hint: "the AllConnect customer reviews page for Spectrum (allconnect.com/providers/spectrum/customer-reviews)" },
    { key: "spectrum-highspeedinternet", host: "highspeedinternet.com", site: "HighSpeedInternet.com", brand: "Spectrum", hint: "the HighSpeedInternet.com customer reviews page for Spectrum (highspeedinternet.com/providers/spectrum/reviews)" },
    { key: "dslreports-probe", host: "dslreports.com", site: "DSLReports", brand: "Charter / Spectrum or Cox", hint: "DSLReports forum threads where Charter / Spectrum or Cox customers describe their service" },
  ],
};

export const REVIEW_LISTS: Record<string, CompanyReviewList> = { [CHARTER_COMPANY_ID]: CHARTER_REVIEW_LIST };

/** The listed page a URL is on, or null ("brand not recorded"). Host, path and (Google Play) app id must all match. */
export function pageForUrl(list: CompanyReviewList, url: string): ReviewPage | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  for (const p of list.pages) {
    if (!p.host.test(host) || !p.path.test(u.pathname)) continue;
    if (p.appId && !p.appId.test(u.searchParams.get("id") ?? "")) continue;
    return p;
  }
  return null;
}
