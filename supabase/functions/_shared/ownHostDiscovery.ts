// ── E3 (operator ruling 2026-10-21) — DISCOVERY OVER THE OWN-HOST SET, confirmed related entities only ───────────────
//
// public-baseline discovered from ONE host (getDomain(website)). E3 widens discovery to the own-host set ownHostsFor
// returns — the seed plus every CONFIRMED related entity IN EFFECT on the run's date — and nothing else:
//   crawl      one crawl per own host; the crawler's three host filters (redirect target, home-page scripts, link
//              following) test membership in the set, so a seed → related-host redirect is kept
//   mint       a page on a related host mints with raw_payload.entity and voice_authority own_domain_related
//   queries    one extra pass per entity — `site:<host> "<name>"` — ENTITY_PASS_COUNT (16) results each
//   prompt     the web_search prompt names each entity as the same business (never "exclude similarly named")
//   scoring    a URL on a related host earns the domain bonus (+90, domain_match_related)
//   policy     a related host bypasses an include-list whitelist exactly as the company host does
// PARITY (E5): with no confirmed entity in effect every helper returns its "no change" value (null / [] / ""), and the
// caller keeps its single-host code path byte-identical.
//
// DOMAIN-PLAN FALLBACK RULE (ruling 2, 2026-10-21): a domain plan never crawls a guessed origin. The fallback crawl reads
// only hosts in the own-host set (not already crawled), and a guessed social profile (the LinkedIn slug guess) counts only
// if its page links to an own host. Spectrum's run 81 opened its gate on spectrum.dev (Spectrum Technology) through the
// slug guess `spectrum-technology` and the name-in-host fallback test. Name-only plans are unchanged (filed).
import { ownHostMatch, ownHostMatchHost, ownHostsFor, PAGE_UNDATED, relationPhrase, type EntityStamp, type OwnHostSet, type RelatedEntityRow } from "./ownHosts.ts";

export const ENTITY_PASS_COUNT = 16;

export type RelatedOwnHost = { host: string; entity: EntityStamp };
export type DiscoveryHosts = { set: OwnHostSet; related: RelatedOwnHost[]; hasRelated: boolean };

/** The run's own-host set ON THE RUN'S DATE (asOf): a related entity whose effective_from is after it is not own yet. */
export function discoveryHostsFor(website: string | null | undefined, related: readonly RelatedEntityRow[], asOf: string | Date): DiscoveryHosts {
  const set = ownHostsFor({ website: website ?? null }, related, asOf);
  const rel = set.hosts.filter((h): h is RelatedOwnHost => !!h.entity).map((h) => ({ host: h.host, entity: h.entity }));
  return { set, related: rel, hasRelated: rel.length > 0 };
}

/** The crawl's host filter — null when the set is the seed alone (the caller keeps domainMatches(host, baseDomain)). */
export function crawlHostFilter(d: DiscoveryHosts | null | undefined): ((host: string) => boolean) | null {
  if (!d?.hasRelated) return null;
  return (host: string) => !!ownHostMatchHost(host, d.set);
}

/** One extra crawl per related host in effect (the seed crawl stays the caller's own, unchanged). */
export function relatedCrawlSeeds(d: DiscoveryHosts | null | undefined): Array<{ startUrl: string; baseDomain: string; entity: EntityStamp }> {
  if (!d?.hasRelated) return [];
  return d.related.map((r) => ({ startUrl: `https://${r.host}/`, baseDomain: r.host, entity: r.entity }));
}

/** The entity a crawled page's URL belongs to (a related host in the set), else null — the seed host is never an entity.
 *  Ruling 13 (2026-10-22): the related-entity rule reads the PAGE's published date. A crawled page carries none (the
 *  snapshot holds url, title, meta description and text), so on an entity WITH a relation start date it is an undated
 *  page: own voice, basis page_undated ("· date not confirmed"). An entity with no start date keeps its own basis. */
export function crawlEntityFor(url: string, d: DiscoveryHosts | null | undefined): EntityStamp | null {
  if (!d?.hasRelated) return null;
  const e = ownHostMatch(url, d.set)?.entity ?? null;
  return e && e.effective_from ? { ...e, basis: PAGE_UNDATED } : e;
}

/** One `site:<host> "<name>"` pass per related entity in effect, ENTITY_PASS_COUNT results each; [] for the seed alone. */
export function entityQueryPasses(d: DiscoveryHosts | null | undefined): Array<{ key: string; label: string; query: string; count: number; entity: EntityStamp }> {
  if (!d?.hasRelated) return [];
  return d.related.map((r, i) => ({ key: `entity${i + 1}`, label: `related entity: ${r.entity.name}`, query: `site:${r.host} "${r.entity.name}"`, count: ENTITY_PASS_COUNT, entity: r.entity }));
}

/** The prompt's entity line — "" for the seed alone (the domain prompt stays byte-identical). Entities are named as the
 *  SAME business; the disambiguation law against similarly-named organizations is untouched. */
export function entityPromptLine(entities: ReadonlyArray<Pick<EntityStamp, "name" | "host" | "relation" | "effective_from">> | null | undefined): string {
  if (!entities || entities.length === 0) return "";
  const each = entities.map((e) => `${e.name} (${e.host} — ${relationPhrase(e, "subject")})`).join("; ");
  return `- Its confirmed related entities are the SAME business, not similarly-named organizations: ${each}. Results about these entities and from their sites are about THIS company.\n`;
}

/** The scorer's related-host bonus: +90 domain_match_related when the URL is on a related host in the set. */
export function relatedDomainBonus(url: string, d: DiscoveryHosts | null | undefined): { score: number; reason: string; entity: EntityStamp } | null {
  const e = crawlEntityFor(url, d);
  return e ? { score: 90, reason: "domain_match_related", entity: e } : null;
}

/** The policy filter's own-host test for a related host (the company host keeps its own test). */
export function isRelatedOwnHost(host: string, set: OwnHostSet | null | undefined): boolean {
  return !!set && !!ownHostMatchHost(host, set)?.entity;
}

/** Ruling 2 — a DOMAIN plan's fallback origin: only a host in the own-host set that the run did not already crawl. */
export function domainPlanFallbackAdmits(host: string, set: OwnHostSet, crawledHosts: readonly string[]): boolean {
  const m = ownHostMatchHost(host, set);
  if (!m) return false;
  return !crawledHosts.some((c) => m.host === c);
}

/** Ruling 2 — a guessed social profile counts on a domain plan only when its page links to an own host. */
export function guessedProfileLinksOwnHost(linkedUrls: readonly string[], set: OwnHostSet): boolean {
  return linkedUrls.some((u) => !!ownHostMatch(u, set));
}

/** Ruling 2 (fill brief step 1) — the early "ambiguous" check: on a domain plan a GUESSED social profile (the LinkedIn slug
 *  guess) counts ZERO until its fetched page links to an own host; every other candidate counts as before. */
export function countsAtEarlyAmbiguousCheck(candidate: { engine?: unknown } | null | undefined, planKind: string): boolean {
  return !(planKind === "domain" && candidate?.engine === "linkedin_slug_guess");
}
