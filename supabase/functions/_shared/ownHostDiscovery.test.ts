// E3 (2026-10-21) — discovery over the own-host set: confirmed related entities in effect only; the seed alone changes
// nothing (every helper returns its no-change value). Ruling 2: a domain plan's fallback reads only own hosts, and a
// guessed profile counts only when it links to one.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { crawlEntityFor, crawlHostFilter, discoveryHostsFor, domainPlanFallbackAdmits, entityPromptLine, entityQueryPasses, guessedProfileLinksOwnHost, isRelatedOwnHost, relatedCrawlSeeds, relatedDomainBonus } from "./ownHostDiscovery.ts";
import type { RelatedEntityRow } from "./ownHosts.ts";

const CHARTER: RelatedEntityRow = { id: "e-charter", name: "Charter Communications", host: "charter.com", relation: "parent", effective_from: null, effective_basis: "cited", status: "confirmed" };
const COX: RelatedEntityRow = { id: "e-cox", name: "Cox Communications", host: "cox.com", relation: "merged_into", effective_from: "2026-08-20", effective_basis: "cited", status: "confirmed" };
const SPECTRUM = "https://www.spectrum.com/";

Deno.test("E3 parity: no confirmed entity ⇒ every helper returns its no-change value", () => {
  const d = discoveryHostsFor(SPECTRUM, [], "2026-10-21");
  assert(!d.hasRelated);
  const off = d.hasRelated ? d : null;
  assertEquals(crawlHostFilter(off), null);
  assertEquals(relatedCrawlSeeds(off), []);
  assertEquals(entityQueryPasses(off), []);
  assertEquals(entityPromptLine([]), "");
  assertEquals(entityPromptLine(null), "");
  assertEquals(relatedDomainBonus("https://www.spectrum.com/internet", off), null);
  assertEquals(crawlEntityFor("https://cox.com/", off), null);
  // a proposed / rejected row never reaches discovery
  assert(!discoveryHostsFor(SPECTRUM, [{ ...CHARTER, status: "proposed" }, { ...COX, status: "rejected" }], "2026-10-21").hasRelated);
});

Deno.test("E3: the set on the run's date — cox.com joins on 2026-08-20, never before", () => {
  assertEquals(discoveryHostsFor(SPECTRUM, [CHARTER, COX], "2026-10-21").set.hosts.map((h) => h.host), ["spectrum.com", "charter.com", "cox.com"]);
  assertEquals(discoveryHostsFor(SPECTRUM, [CHARTER, COX], "2026-08-19").set.hosts.map((h) => h.host), ["spectrum.com", "charter.com"]);
});

Deno.test("E3: crawl filter, seeds, entity per page, query passes, prompt line, bonus, policy", () => {
  const d = discoveryHostsFor(SPECTRUM, [CHARTER, COX], "2026-10-21");
  const f = crawlHostFilter(d)!;
  assert(f("corporate.charter.com") && f("cox.com") && f("spectrum.com") && !f("coxenterprises.com") && !f("spectrum.dev"));
  assertEquals(relatedCrawlSeeds(d).map((s) => s.startUrl), ["https://charter.com/", "https://cox.com/"]);
  assertEquals(crawlEntityFor("https://corporate.charter.com/about", d)?.name, "Charter Communications");
  assertEquals(crawlEntityFor("https://www.spectrum.com/", d), null);
  assertEquals(entityQueryPasses(d).map((p) => [p.query, p.count]), [['site:charter.com "Charter Communications"', 16], ['site:cox.com "Cox Communications"', 16]]);
  const line = entityPromptLine(d.related.map((r) => r.entity));
  assertEquals(line, "- Its confirmed related entities are the SAME business, not similarly-named organizations: Charter Communications (charter.com — the subject's parent company); Cox Communications (cox.com — merged with the subject's parent, Aug 2026). Results about these entities and from their sites are about THIS company.\n");
  assert(!/exclude/i.test(line));
  assertEquals(relatedDomainBonus("https://www.cox.com/residential/internet.html", d)?.reason, "domain_match_related");
  assert(isRelatedOwnHost("corporate.charter.com", d.set) && !isRelatedOwnHost("spectrum.com", d.set) && !isRelatedOwnHost("forbes.com", d.set));
});

Deno.test("ruling 2: a domain plan never crawls a guessed origin; a guessed profile counts only when it links an own host", () => {
  const seedOnly = discoveryHostsFor(SPECTRUM, [], "2026-10-21").set;
  const crawled = seedOnly.hosts.map((h) => h.host);
  assert(!domainPlanFallbackAdmits("spectrum.dev", seedOnly, crawled), "run 81's spectrum.dev");
  assert(!domainPlanFallbackAdmits("spectrum.com", seedOnly, crawled), "the seed is crawled directly, never again as a fallback");
  const full = discoveryHostsFor(SPECTRUM, [CHARTER, COX], "2026-10-21").set;
  assert(!domainPlanFallbackAdmits("cox.com", full, full.hosts.map((h) => h.host)), "an own host already crawled is not re-crawled");
  assert(domainPlanFallbackAdmits("cox.com", full, ["spectrum.com"]), "an own host not yet crawled may be read");
  assert(!guessedProfileLinksOwnHost(["http://spectrum.dev/"], seedOnly), "linkedin.com/company/spectrum-technology → spectrum.dev");
  assert(guessedProfileLinksOwnHost(["https://www.spectrum.com/"], seedOnly));
  assert(guessedProfileLinksOwnHost(["https://corporate.charter.com/"], full));
});

Deno.test("ruling 2 (fill brief): a guessed profile counts ZERO at the early ambiguous check on a domain plan; name-only unchanged", async () => {
  const { countsAtEarlyAmbiguousCheck } = await import("./ownHostDiscovery.ts");
  assert(!countsAtEarlyAmbiguousCheck({ engine: "linkedin_slug_guess" }, "domain"));
  assert(countsAtEarlyAmbiguousCheck({ engine: "linkedin_slug_guess" }, "name_only"));
  assert(countsAtEarlyAmbiguousCheck({ engine: "searx" }, "domain"));
  assert(countsAtEarlyAmbiguousCheck({ engine: "site_social_link" }, "domain"));
});
