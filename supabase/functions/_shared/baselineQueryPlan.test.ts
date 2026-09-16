// Gate B (2026-09-16) — the baseline query plan. Flagged (name_only): zero queries carry the domain,
// the stem or a `site:` term; every query carries a name variant; none blank. Unflagged (domain): the
// eight queries are byte-identical to the pre-gate strings (snapshot). Plus the wiring guards:
// crawl + mint skipped only when flagged; the two thin classes recorded.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildBaselineQueryPlan, QUERY_KEYS, queryCarriesDomainTerm } from "./baselineQueryPlan.ts";

const args = { companyName: "Acme Coffee Roasters", domain: "acmecoffee.com", stem: "acmecoffee", variants: ["Acme Coffee Roasters", "acmecoffee", "acme coffee"], spaced: "Acme Coffee Roasters" };

// The pre-gate strings, verbatim (public-baseline/index.ts :2341-2361 at HEAD e3ac8615).
const SNAPSHOT = {
  queryA: `"Acme Coffee Roasters" (site:acmecoffee.com OR "acmecoffee.com" OR "acmecoffee") ("about" OR "company" OR "press" OR "investor" OR "careers")`,
  queryB: `"Acme Coffee Roasters" "acmecoffee.com" (company OR product OR services OR platform) (competitors OR pricing OR reviews OR news OR investors)`,
  queryC: `acmecoffee.com Acme Coffee Roasters OR acmecoffee OR acme coffee (about OR company OR pricing OR reviews OR news)`,
  queryD: `"Acme Coffee Roasters" "acmecoffee.com" (glassdoor OR indeed OR g2 OR capterra OR trustpilot OR reddit OR forum OR complaints)`,
  queryE: `"Acme Coffee Roasters" "acmecoffee.com" (customer reviews OR employee reviews OR testimonials OR ratings OR reddit OR community OR nonprofit)`,
  queryF: `site:linkedin.com/company ("Acme Coffee Roasters" OR "Acme Coffee Roasters" OR "acmecoffee.com" OR "acmecoffee")`,
  queryG: `site:linkedin.com/posts ("Acme Coffee Roasters" OR "Acme Coffee Roasters" OR "acmecoffee.com" OR "acmecoffee")`,
  queryH: `"Acme Coffee Roasters" ("Acme Coffee Roasters" OR "acmecoffee") (company OR platform OR product OR services OR leadership OR funding OR linkedin OR crunchbase OR newsroom)`,
};

Deno.test("unflagged (domain): the eight queries are byte-identical to the pre-gate strings", () => {
  assertEquals(buildBaselineQueryPlan({ planKind: "domain", ...args }), SNAPSHOT);
});

Deno.test("flagged (name_only): zero domain/stem/site: terms, every query names the company, none blank, F/G dropped", () => {
  const plan = buildBaselineQueryPlan({ planKind: "name_only", companyName: "The John C Mithun Foundation", domain: "", stem: "", variants: ["The John C Mithun Foundation"], spaced: "The John C Mithun Foundation" });
  const sent = QUERY_KEYS.filter((k) => plan[k] !== null);
  assertEquals(sent, ["queryA", "queryB", "queryC", "queryD", "queryE", "queryH"]);
  for (const k of sent) {
    const q = plan[k]!;
    assert(q.trim().length > 0, `${k} blank`);
    assert(!queryCarriesDomainTerm(q, "example.com", "example"), `${k} carries a domain term: ${q}`);
    assert(!/\bsite:/i.test(q), `${k} carries site:`);
    assertStringIncludes(q, "John C Mithun Foundation");
  }
  assertEquals(plan.queryF, null); assertEquals(plan.queryG, null);
});

Deno.test("flagged with a stale domain/stem in variants: they are stripped, never sent", () => {
  const plan = buildBaselineQueryPlan({ planKind: "name_only", ...args });
  for (const k of QUERY_KEYS) {
    const q = plan[k]; if (q === null) continue;
    assert(!queryCarriesDomainTerm(q, args.domain, args.stem), `${k}: ${q}`);
  }
});

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
Deno.test("public-baseline: crawl + mint skipped only when flagged; plan stamped; the two thin classes recorded", async () => {
  const src = await read("../public-baseline/index.ts");
  assertStringIncludes(src, 'const planKind: PlanKind = noPublicSite ? "name_only" : "domain";');
  assertStringIncludes(src, "const crawlResult = noPublicSite ? null : await crawlWebsiteEvidence({");
  assertStringIncludes(src, 'site_crawl: noPublicSite ? "skipped_no_public_site" : "ran"');
  assertStringIncludes(src, "siteRead = noPublicSite ? null : await mintSiteCrawlSignals({");
  assertStringIncludes(src, "const plan = buildBaselineQueryPlan({ planKind,");
  assert(!/const queryA =\s*\n?\s*`\$\{quoted\} \(site:/.test(src), "the inline domain query strings are gone (the plan module is the authority)");
  assertStringIncludes(src, 'runLedger.thin_reason = "no_results"');
  assertStringIncludes(src, 'runLedger.thin_reason = "fallback_only"');
  // the 422 for flagged companies is gone from public-baseline — the read runs by name
  assert(!src.includes('return json({ error: "no_public_site", message: NO_PUBLIC_SITE_MESSAGE }, 422);'), "no 422 by name remains");
  // every run-row insert carries plan_kind
  const inserts = src.match(/\.from\("public_baseline_runs"\)\s*\n\s*\.insert\(\{/g) ?? [];
  const stamped = src.match(/\n\s*website,\n\s*plan_kind: planKind,/g) ?? [];
  assertEquals(stamped.length, inserts.length, `every public_baseline_runs insert stamps plan_kind (${stamped.length}/${inserts.length})`);
});
