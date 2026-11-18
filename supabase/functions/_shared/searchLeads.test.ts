// V2 (2026-11-18): leads — queries from a brand word and fixed topics only; threads only; brand from the forum.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CHARTER_REVIEW_LIST as L } from "./reviewPages.ts";
import { LEAD_BASIS_LABEL, LEAD_TOPICS, leadQueries, leadRows } from "./searchLeads.ts";

Deno.test("queries carry only the brand word and the fixed public topics", () => {
  const q = leadQueries("reddit", "cox");
  assertEquals(q.length, LEAD_TOPICS.length);
  for (const x of q) assert(/^site:reddit\.com Cox (billing|price increase|outage|installation|technician|customer service|cancel|mobile|TV)$/.test(x), x);
  assertEquals(leadQueries("dslreports", "spectrum")[0], "site:dslreports.com Spectrum billing");
});

Deno.test("lead rows: threads only, naming the company; brand from r/Spectrum or r/CoxCommunications; other forums unbranded", () => {
  const seen = new Set<string>();
  const { rows, stats } = leadRows({ list: L, site: "reddit", query: "site:reddit.com Cox outage", seen, results: [
    { url: "https://www.reddit.com/r/CoxCommunications/comments/1srza5x/is_cox_internet_down/", title: "Is Cox internet down?", content: "Cox services 18 states and most outages are local.", publishedDate: "2026-04-01T00:00:00", engines: ["braveapi"] },
    { url: "https://www.reddit.com/r/tulsa/comments/1nnl3dc/cox_internet_outage/?x=1", title: "Cox internet outage", content: "Cox says there is an outage in my area again.", publishedDate: null, engines: ["braveapi"] },
    { url: "https://www.reddit.com/r/tulsa/comments/1nnl3dc/cox_internet_outage/", title: "dup", content: "Cox again", engines: ["braveapi"] },
    { url: "https://www.reddit.com/r/Spectrum/", title: "r/Spectrum", content: "Spectrum subreddit", engines: ["braveapi"] },
    { url: "https://www.reddit.com/r/homelab/comments/abc123/router/", title: "my router", content: "my router keeps rebooting", engines: ["braveapi"] },
    { url: "https://www.trustpilot.com/review/www.cox.com", title: "Cox", content: "Cox reviews", engines: ["braveapi"] },
  ] });
  assertEquals([stats.kept, stats.duplicate, stats.not_thread, stats.not_company, stats.off_site], [2, 1, 1, 1, 1]);
  assertEquals(rows[0].about_entity_id, L.entities.cox);
  assertEquals(rows[0].published_date, "2026-04-01");
  assertEquals(rows[1].about_entity_id, null);             // a city subreddit: brand not recorded
  assertEquals(rows[1].forum, "tulsa");                    // its name kept, uninterpreted
  assertEquals(rows[1].url, "https://www.reddit.com/r/tulsa/comments/1nnl3dc/cox_internet_outage/");
  for (const r of rows) { assertEquals(r.basis_label, LEAD_BASIS_LABEL); assert(!("quote" in r) && !("evidence_excerpt" in r)); }
});
