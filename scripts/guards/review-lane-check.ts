// review-lane-guard's pure half (V1, 2026-11-18). Reads { rows, calls } JSON on stdin (the stored lane rows and their
// calls' responses), prints one OK/FAIL line per check. r1 is the PLANTED CASE, r2 its CONTROL.
import { buildReviewLaneRows } from "../../supabase/functions/_shared/reviewHostLane.ts";
import { pageForUrl, REVIEW_LISTS, CHARTER_REVIEW_LIST as L } from "../../supabase/functions/_shared/reviewPages.ts";

const out: string[] = [];
const ok = (k: string, m: string) => out.push(`OK ${k}: ${m}`);
const bad = (k: string, m: string) => out.push(`FAIL ${k}: ${m}`);
const outside = () => ({ ok: true, voice_class: "outside_voice_about_client", authority: "extractor_label" });
const cite = (url: string, cited_text: string) => ({ type: "text", text: "A customer reports this.", citations: [{ url, title: "t", cited_text }] });

// r1 PLANTED CASE: a citation from an UNLISTED host, and an unlisted page on a listed host, both naming the company —
// kept (the words name it) but with NO brand.
{
  const unlistedTarget = { key: "guard-unlisted", host: "sitejabber.com", site: "Sitejabber", brand: "Spectrum", hint: "-" };
  const r = buildReviewLaneRows({ list: L, target: unlistedTarget, callId: "guard", fetchedAt: "t", excludeHosts: [], existingExcerpts: new Set(), decide: outside,
    response: { content: [cite("https://www.sitejabber.com/reviews/spectrum.net", "Spectrum charged me twice for the same month and nobody in support could explain why.")] } });
  const t = L.targets.find((x) => x.key === "cox-trustpilot")!;
  const r2 = buildReviewLaneRows({ list: L, target: t, callId: "guard", fetchedAt: "t", excludeHosts: [], existingExcerpts: new Set(), decide: outside,
    response: { content: [cite("https://www.trustpilot.com/categories/internet_service_provider", "Cox customers in my town say the outage credits never showed up on the bill.")] } });
  const rows = [...r.rows, ...r2.rows];
  if (rows.length !== 2) bad("r1", `expected 2 kept rows, got ${rows.length}`);
  else if (rows.some((x) => x.about_entity_id != null || x.about_entity_page != null)) bad("r1", "a citation off the reviewed list got a brand");
  else ok("r1", "a citation from an unlisted host, and from an unlisted page on a listed host, gets no brand");
}
// r2 CONTROL: the same words on a LISTED page get that page's brand (r1 is not vacuous)
{
  const t = L.targets.find((x) => x.key === "cox-trustpilot")!;
  const r = buildReviewLaneRows({ list: L, target: t, callId: "guard", fetchedAt: "t", excludeHosts: [], existingExcerpts: new Set(), decide: outside,
    response: { content: [cite("https://www.trustpilot.com/review/www.cox.com", "Cox customers in my town say the outage credits never showed up on the bill.")] } });
  if (r.rows.length === 1 && r.rows[0].about_entity_id === L.entities.cox && r.rows[0].about_entity_page === "cox-trustpilot") ok("r2", "the same words on a listed Cox page get the Cox entry");
  else bad("r2", `control did not get its brand: ${JSON.stringify(r.rows.map((x) => [x.about_entity_id, x.about_entity_page]))}`);
}

// r3/r5: every STORED lane row
const input = JSON.parse(await new Response(Deno.stdin.readable).text()) as {
  rows: Array<{ id: string; company_id: string; source_url: string; about_entity_id: string | null; about_entity_page: string | null; evidence_excerpt: string; review_lane_call_id: string }>;
  calls: Array<{ id: string; response: unknown }>;
};
{
  const wrong: string[] = [];
  for (const r of input.rows) {
    const list = REVIEW_LISTS[r.company_id];
    const page = list ? pageForUrl(list, r.source_url) : null;
    const want = page ? list!.entities[page.entity] : null;
    if ((page?.key ?? null) !== r.about_entity_page || want !== r.about_entity_id) wrong.push(r.id);
  }
  if (wrong.length) bad("r3", `${wrong.length} stored row(s) carry a brand their URL's listed page does not give: ${wrong.slice(0, 3).join(", ")}`);
  else ok("r3", `${input.rows.length} stored lane row(s): each brand is exactly what its URL's listed page gives (${input.rows.filter((r) => r.about_entity_id).length} branded)`);
}
{
  const cited = new Map<string, Set<string>>();
  for (const c of input.calls) {
    const s = new Set<string>();
    const walk = (o: unknown) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { const r = o as Record<string, unknown>; if (typeof r.cited_text === "string") s.add(r.cited_text); Object.values(r).forEach(walk); } };
    walk(c.response); cited.set(c.id, s);
  }
  const untraced = input.rows.filter((r) => !cited.get(r.review_lane_call_id)?.has(r.evidence_excerpt));
  if (untraced.length) bad("r5", `${untraced.length} stored row(s) whose excerpt is not a cited_text of their own call`);
  else ok("r5", `every stored lane row's excerpt is a cited_text of its own stored call`);
}
console.log(out.join("\n"));
