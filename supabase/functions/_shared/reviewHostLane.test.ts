// V1 (2026-11-18): the review-host lane's pure half — brand from the listed page only, verbatim quotes, printed dates.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CHARTER_REVIEW_LIST as L, pageForUrl } from "./reviewPages.ts";
import {
  buildReviewLaneRows, clampReviewLaneCap, expandQuote, hasReviewSentence, locate, parseSpendSince, printedDates, projectReviewLaneUsd,
  REVIEW_LANE_CAP_CEILING_USD, reviewDate, reviewLaneTools,
} from "./reviewHostLane.ts";

Deno.test("brand: a listed page names its entity; the same host's other pages and unlisted hosts name none", () => {
  assertEquals(pageForUrl(L, "https://www.trustpilot.com/review/www.cox.com?page=2")?.entity, "cox");
  assertEquals(pageForUrl(L, "https://ca.trustpilot.com/review/spectrum.net")?.entity, "spectrum");
  assertEquals(pageForUrl(L, "https://www.trustpilot.com/review/www.xfinity.com"), null);          // another company's page
  assertEquals(pageForUrl(L, "https://www.trustpilot.com/categories/internet_service_provider"), null);
  assertEquals(pageForUrl(L, "https://www.reviews.io/company-reviews/store/cox-com"), null);     // unlisted host
  assertEquals(pageForUrl(L, "https://forums.cox.com/forum_home/internet_forum"), null);          // Cox's own community: excluded
  assertEquals(pageForUrl(L, "https://www.bbb.org/us/ga/atlanta/profile/cable-tv/cox-communications-0443-1234/reviews")?.entity, "cox");
  assertEquals(pageForUrl(L, "https://www.bbb.org/us/in/indianapolis/profile/electronics-and-technology/charter-communications-0382-90057134/complaints")?.entity, "spectrum");
  assertEquals(pageForUrl(L, "https://play.google.com/store/apps/details?id=com.TWCableTV")?.entity, "spectrum");
  assertEquals(pageForUrl(L, "https://play.google.com/store/apps/details?id=com.coxautoinc.app"), null);
  assertEquals(pageForUrl(L, "https://apps.apple.com/us/app/my-spectrum/id1004290386")?.entity, "spectrum");
  assertEquals(pageForUrl(L, "https://www.dslreports.com/forum/r33000000-Cox-outage"), null);     // a thread carries no brand
  assertEquals(pageForUrl(L, "not a url"), null);
});

Deno.test("a review sentence is required; a list of reviewer names and dates has none", () => {
  assert(!hasReviewSentence("JV 29 Aug 2024 NM NANCY MACKENZIE 28 Feb 2025 Jasper Johnsons 1 Jan 2023 TT Ttttt 9 Aug 2025 1.4"));
  assert(!hasReviewSentence("## All reviews 39 total"));
  assert(hasReviewSentence("I’ve had ongoing service issues for the past two years, but the past week has been unacceptable."));
});

Deno.test("printed dates: one date decides, several are ambiguous, none is null", () => {
  assertEquals(printedDates("Updated by user Mar 13, 2025 I don't know"), [{ date: "2025-03-13", precision: "day" }]);
  assertEquals(printedDates("Date of experience: 18 July 2025"), [{ date: "2025-07-18", precision: "day" }]);
  assertEquals(printedDates("since September 2026 the bill went up"), [{ date: "2026-09-01", precision: "month" }]);
  assertEquals(reviewDate("Jul 18, 2025 and Aug 3, 2025", null), null);
  assertEquals(reviewDate("no date here at all", "Posted Oct 2, 2026. The tech never came."), { date: "2026-10-02", precision: "day", basis: "page_paragraph" });
  assertEquals(reviewDate("no date here at all", null), null);
});

const PAGE = "Cox reviews\n\nRated 1 out of 5 stars\nNever again. The technician never showed up for the install, twice. I waited home all day. Date of experience: October 2, 2026\n\nRated 5 out of 5 stars\nFast internet and the bill is fair.";

Deno.test("quote: the whole sentence containing the fragment, verbatim from the fetched page; not found ⇒ null", () => {
  const at = locate(PAGE, "technician never showed up for the install");
  assert(at);
  const q = expandQuote([{ url: "https://www.trustpilot.com/review/www.cox.com", text: PAGE, retrieved_at: null }], "https://www.trustpilot.com/review/www.cox.com", "technician never showed up for the install");
  assertEquals(q?.quote, "The technician never showed up for the install, twice.");
  assert(q && q.quote_source_text.includes(q.quote) && PAGE.includes(q.quote_source_text));
  assertEquals(expandQuote([{ url: "u", text: PAGE, retrieved_at: null }], "u", "words that are not on this page at all"), null);
  // curly quotes and whitespace in the fragment still locate the page's own words
  assert(locate("He said “it’s  fixed” but it wasn’t.", "it's fixed\" but it"));
});

const resp = (blocks: unknown[]) => ({ content: blocks });
const fetchBlock = (url: string, text: string) => ({ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url, retrieved_at: "2026-11-18T00:00:00Z", content: { type: "document", source: { type: "text", data: text } } } });
const textBlock = (text: string, citations: unknown[]) => ({ type: "text", text, citations });
const T = L.targets.find((t) => t.key === "cox-trustpilot")!;
const outside = () => ({ ok: true, voice_class: "outside_voice_about_client", authority: "extractor_label" });
const build = (response: unknown, existing: string[] = []) => buildReviewLaneRows({ list: L, target: T, callId: "00000000-0000-4000-8000-0000000000c1", response, fetchedAt: "2026-11-18T00:00:00Z", excludeHosts: [], existingExcerpts: new Set(existing), decide: outside });

Deno.test("rows: brand from the cited page; unlisted page on the host kept only when it names the company, brand not recorded", () => {
  const cox = "https://www.trustpilot.com/review/www.cox.com";
  const r = build(resp([
    fetchBlock(cox, PAGE),
    textBlock("A customer says the technician missed the install.", [{ type: "web_search_result_location", url: cox, title: "Cox Reviews", cited_text: "The technician never showed up for the install, twice. I waited home…" }]),
    textBlock("Another praises speed.", [{ type: "char_location", document_index: 0, cited_text: "Fast internet and the bill is fair." }]),
    textBlock("A Comcast review.", [{ url: "https://www.trustpilot.com/review/www.xfinity.com", title: "Xfinity", cited_text: "Xfinity raised my price again and the support line is useless every time." }]),
    textBlock("A category page mentioning Cox.", [{ url: "https://www.trustpilot.com/categories/isp", title: "ISPs", cited_text: "Cox customers say the outage credits never arrived on the bill this year." }]),
    textBlock("Names only.", [{ url: cox, title: "Cox", cited_text: "JV 29 Aug 2024 NM NANCY MACKENZIE 28 Feb 2025" }]),
    textBlock("Off host.", [{ url: "https://www.yelp.com/biz/cox-communications-phoenix", title: "Yelp", cited_text: "The store staff were helpful and patient with my upgrade question." }]),
    textBlock("Uncited sentence.", []),
  ]));
  assertEquals(r.stats.minted, 3);
  assertEquals(r.stats.not_company, 1);
  assertEquals(r.stats.no_review_sentence, 1);
  assertEquals(r.stats.off_host, 1);
  const [a, b, c] = r.rows;
  assertEquals(a.about_entity_id, L.entities.cox);
  assertEquals(a.about_entity_page, "cox-trustpilot");
  assertEquals(a.evidence_excerpt, "The technician never showed up for the install, twice. I waited home…"); // the cited_text, verbatim
  assertEquals(a.quote, "The technician never showed up for the install, twice. I waited home all day.");
  assertEquals(a.event_date, "2026-10-02");
  assertEquals(b.source_url, cox);            // the fetched document's citation resolves to its page
  assertEquals(b.about_entity_id, L.entities.cox);
  assertEquals(c.about_entity_id, null);      // a page off the list: brand not recorded
  assertEquals(c.about_entity_basis, null);
  assertEquals((c.raw_payload as Record<string, unknown>).brand_basis, "brand_not_recorded");
  for (const row of r.rows) {
    assertEquals(row.voice_class, "outside_voice_about_client");
    assertEquals(row.source_type, "public_baseline_run");
    assert(!("reviewer" in row) && !("handle" in row));
  }
});

Deno.test("rows: duplicates in the call and against live excerpts mint once; a non-outside voice mints nothing", () => {
  const cox = "https://www.trustpilot.com/review/www.cox.com";
  const same = "My internet drops every evening and support keeps telling me to restart.";
  const r = build(resp([textBlock("x", [{ url: cox, cited_text: same }]), textBlock("y", [{ url: `${cox}?page=2`, cited_text: same }])]));
  assertEquals([r.stats.minted, r.stats.duplicate_in_run], [1, 1]);
  const r2 = build(resp([textBlock("x", [{ url: cox, cited_text: same }])]), ["my internet drops every evening and support keeps telling me to restart."]);
  assertEquals(r2.stats.duplicate_existing + r2.stats.minted, 1);
  const r3 = buildReviewLaneRows({ list: L, target: T, callId: "c", response: resp([textBlock("x", [{ url: cox, cited_text: same }])]), fetchedAt: "t", excludeHosts: [], existingExcerpts: new Set(), decide: () => ({ ok: true, voice_class: "client_voice" }) });
  assertEquals([r3.stats.minted, r3.stats.not_outside], [0, 1]);
});

Deno.test("cap: clamped to the $10 research ceiling; spend_since must be a recent past instant; tools stay on the host", () => {
  assertEquals(clampReviewLaneCap(25), REVIEW_LANE_CAP_CEILING_USD);
  assertEquals(clampReviewLaneCap(0), null);
  assertEquals(clampReviewLaneCap("10"), null);
  const now = Date.parse("2026-11-18T12:00:00Z");
  assertEquals(parseSpendSince("2026-11-18T10:00:00Z", now), "2026-11-18T10:00:00.000Z");
  assertEquals(parseSpendSince("2026-11-16T10:00:00Z", now), null);
  assertEquals(parseSpendSince("2026-11-18T13:00:00Z", now), null);
  const p = projectReviewLaneUsd({ input: 3, output: 15, web_search_per_1k: 10 }, 1000)!;
  assert(p > 0.6 && p < 0.7, `projection ${p}`);
  for (const t of reviewLaneTools("trustpilot.com")) assertEquals(t.allowed_domains, ["trustpilot.com"]);
});

Deno.test("pages added 2026-11-18: cox.net, charter.net, BBB's Spectrum NY profile, AllConnect and HighSpeedInternet", () => {
  assertEquals(pageForUrl(L, "https://www.trustpilot.com/review/cox.net?page=2")?.entity, "cox");
  assertEquals(pageForUrl(L, "https://ca.trustpilot.com/review/charter.net")?.entity, "spectrum");
  assertEquals(pageForUrl(L, "https://www.bbb.org/us/ny/new-york/profile/cable-tv/spectrum-0121-460/complaints")?.entity, "spectrum");
  assertEquals(pageForUrl(L, "https://www.bbb.org/us/ny/new-york/profile/cable-tv/spectrum-health-0121-999"), null);
  assertEquals(pageForUrl(L, "https://www.allconnect.com/providers/cox/customer-reviews")?.entity, "cox");
  assertEquals(pageForUrl(L, "https://www.highspeedinternet.com/providers/spectrum/reviews")?.entity, "spectrum");
  assertEquals(pageForUrl(L, "https://www.consumeraffairs.com/cell_phones/bright_house.html"), null);
});

Deno.test("summary sentence: the uncited lead-in is read with the cited words", () => {
  const cox = "https://www.trustpilot.com/review/www.cox.com";
  const r = build(resp([
    textBlock("Here are the reviews:\n\nOne customer described a drawn-out cancellation, reporting that ", []),
    textBlock("it took more than an hour to cancel via live chat.", [{ url: cox, cited_text: "It took more than an hour to cancel my service via a live chat. " }]),
  ]));
  assertEquals(r.rows[0].claim_text, "One customer described a drawn-out cancellation, reporting that it took more than an hour to cancel via live chat.");
});

const LIST_PAGE = [
  "Review summary", "Reviewers express profound dissatisfaction regarding customer service, highlighting long wait times and more.",
  "JR", "[Jennifer R. 7 days ago](https://www.trustpilot.com/users/1)", "![Rated 1 out of 5 stars](https://cdn/x.svg)",
  "Cox is the worst and they charge hundreds of dollars more than they promised me at signup.",
  "TW", "[Trecia Williams Jul 25, 2026](https://www.trustpilot.com/users/2)", "![Rated 1 out of 5 stars](https://cdn/x.svg)",
  "## [Never again](https://www.trustpilot.com/reviews/3)",
  "The customer service representatives do not want to talk to you when you call them at all.",
  "A second paragraph of the same review says the bill went up again in August without any notice.",
  "July 25, 2026",
  "DP", "[Diane Parker US•2 reviews](https://www.trustpilot.com/users/4)", "Jul 16, 2026", "![Rated 1 out of 5 stars](https://cdn/x.svg)",
  "Terrible company with hidden fees and bad customer service that never fixes the outages here.",
  "MA", "[Mo A. Jul 15, 2026](https://www.trustpilot.com/users/5)",
  "My internet and phone package costs eighty five dollars a month and drops every single night.",
].join("\n\n");

Deno.test("review header dates on a fetched list page: own header only; a relative age is undated; summaries and titles are not reviews", () => {
  const cox = "https://www.trustpilot.com/review/www.cox.com?page=7";
  const cite = (t: string) => textBlock("A customer says this.", [{ type: "char_location", document_index: 0, cited_text: t }]);
  const r = build(resp([
    fetchBlock(cox, LIST_PAGE),
    cite("Reviewers express profound dissatisfaction regarding customer service"),
    cite("Cox is the worst and they charge hundreds of dollars more"),
    cite("Never again"),
    cite("The customer service representatives do not want to talk to you"),
    cite("the bill went up again in August without any notice"),
    cite("Terrible company with hidden fees and bad customer service"),
    cite("costs eighty five dollars a month and drops every single night"),
  ]));
  const by = (s: string) => r.rows.find((x) => String(x.quote).includes(s));
  assertEquals(r.stats.not_review_block, 1);              // the site's own summary
  assertEquals(by("Cox is the worst")?.event_date, null);  // "7 days ago" — never turned into a date, never borrowed
  assertEquals(by("representatives do not want")?.event_date, "2026-07-25");
  assertEquals(by("bill went up again")?.event_date, "2026-07-25"); // the review's second paragraph keeps its header
  assertEquals(by("hidden fees")?.event_date, "2026-07-16");
  assertEquals(by("eighty five dollars")?.event_date, "2026-07-15");
  assert(!r.rows.some((x) => String(x.quote).startsWith("##")));
  for (const x of r.rows) assert(LIST_PAGE.includes(String(x.quote)), "every quote is on the fetched page");
});
