// Slice 4 (2026-11-18, ruling R1): a lead resting on the search tool's cited_text is promoted only when the lane's own
// page fetch returns a page the existing rules take its quote from. The fetch is the lane's fetch with no search.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CHARTER_REVIEW_LIST as L } from "./reviewPages.ts";
import { buildReviewLaneRows, reviewLaneTools, reviewLaneVerifyTools, verifyFetchOutcome, verifyLead } from "./reviewHostLane.ts";
import { LEAD_BASIS_LABEL } from "./searchLeads.ts";

const outside = () => ({ ok: true, voice_class: "outside_voice_about_client", authority: "third_party_host" });
const t = L.targets.find((x) => x.key === "cox-trustpilot")!;
const URL_ = "https://www.trustpilot.com/review/www.cox.com";
const page = (data: string) => ({ content: [{ type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: URL_, content: { type: "document", source: { type: "text", data } } } }] });
const lead = (cited_text: string) => ({ url: URL_, title: "Cox reviews", sentence: "A customer reports this.", cited_text });
const REVIEW = "My bill went up again this month and nobody at Cox could tell me why the promotional rate ended early.";

Deno.test("verify tools: the lane's own page fetch, one use, and no search tool", () => {
  const v = reviewLaneVerifyTools("trustpilot.com");
  const fetch = reviewLaneTools("trustpilot.com").find((x) => x.name === "web_fetch")!;
  assertEquals(v.length, 1);
  assertEquals(v[0], { ...fetch, max_uses: 1 });
  assert(!v.some((x) => x.name === "web_search"));
});

Deno.test("a lead whose words are on the fetched page is promoted with the page's quote and paragraph", () => {
  const doc = `Reviews\n\nRated 1 out of 5 stars\n\nNov 2, 2026\n\n${REVIEW} I am looking at other providers now.\n\nDate of experience: November 1, 2026`;
  const v = verifyLead({ list: L, target: t, lead: lead(REVIEW), verifyResponse: page(doc), decide: outside });
  assert(v.promoted, JSON.stringify(v));
  if (v.promoted) {
    assert(v.quote.includes(REVIEW));
    assert(v.quote_source_text.includes(v.quote));
    assert(doc.includes(v.quote_source_text));
    assertEquals(v.page_url, URL_);
  }
});

Deno.test("a lead whose words are NOT on the fetched page stays a lead", () => {
  const v = verifyLead({ list: L, target: t, lead: lead(REVIEW), verifyResponse: page("Reviews\n\nSomeone else wrote a different review about the remote control being slow to pair."), decide: outside });
  assertEquals(v, { promoted: false, reason: "not_on_fetched_page" });
});

Deno.test("a refused fetch leaves the lead a lead and names the refusal", () => {
  const r = { content: [{ type: "web_fetch_tool_result", content: { type: "web_fetch_tool_result_error", error_code: "url_not_allowed" } }] };
  assertEquals(verifyFetchOutcome(r), { status: "error", code: "url_not_allowed" });
  assertEquals(verifyLead({ list: L, target: t, lead: lead(REVIEW), verifyResponse: r, decide: outside }), { promoted: false, reason: "fetch_error:url_not_allowed" });
  assertEquals(verifyLead({ list: L, target: t, lead: lead(REVIEW), verifyResponse: { content: [] }, decide: outside }), { promoted: false, reason: "no_fetch" });
});

Deno.test("the existing rules still apply on promotion: the company's own reply is never promoted", () => {
  const reply = "We apologize for the trouble with your bill, please DM us so we can review your account with you.";
  const v = verifyLead({ list: L, target: t, lead: lead(reply), verifyResponse: page(`Reply from Cox\n\n${reply}`), decide: outside });
  assertEquals(v, { promoted: false, reason: "rule:company_reply" });
});

// A2 (2026-11-18): at save, words the lane cannot quote from a page this call fetched are held as a lead.
Deno.test("save: a row with no fetched-page quote is saved held as a lead; a quoted row is saved live", () => {
  const onPage = REVIEW;
  const offPage = "Cox raised my bill twice this year and the support line kept me on hold for over an hour each time.";
  const response = { content: [...page(`Reviews\n\nNov 2, 2026\n\n${onPage}`).content,
    { type: "text", text: "A customer reports this.", citations: [{ type: "char_location", document_index: 0, cited_text: onPage }] },
    { type: "text", text: "Another customer reports this.", citations: [{ type: "web_search_result_location", url: URL_, title: "t", cited_text: offPage }] }] };
  const { rows, stats } = buildReviewLaneRows({ list: L, target: t, callId: "c", response, fetchedAt: "t", excludeHosts: [], existingExcerpts: new Set(), decide: outside, heldAt: "2026-11-18T00:00:00Z" });
  const quoted = rows.find((r) => r.evidence_excerpt === onPage)!, lead = rows.find((r) => r.evidence_excerpt === offPage)!;
  assert(quoted.quote != null);
  assertEquals([quoted.held_at, quoted.held_reason], [null, null]);
  assertEquals([lead.quote, lead.held_at, lead.held_reason], [null, "2026-11-18T00:00:00Z", LEAD_BASIS_LABEL]);
  assertEquals(stats.held_as_lead, 1);
});
