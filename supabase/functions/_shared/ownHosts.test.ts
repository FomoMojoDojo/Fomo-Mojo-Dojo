// E2 — the own-host resolver: the seed host plus CONFIRMED related hosts in effect; a single host string is the pre-E1
// argument and reads exactly as before.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isOwnDomainUrl } from "./firstReadProvenance.ts";
import { ownHostMatch, ownHostsFor, relatedEntityFor, relatedInEffect, relatedVenueLabel, seedHostOf, type RelatedEntityRow } from "./ownHosts.ts";

const row = (host: string, over: Partial<RelatedEntityRow> = {}): RelatedEntityRow =>
  ({ id: `id-${host}`, name: `Entity ${host}`, host, relation: "parent", effective_from: null, effective_basis: "cited", status: "confirmed", ...over });

Deno.test("E2: no related entity ⇒ the seed alone, and the set agrees with the single host on every URL shape", () => {
  const set = ownHostsFor({ website: "https://www.spectrum.com/" });
  assertEquals(set.hosts.map((h) => h.host), ["spectrum.com"]);
  for (const u of ["https://spectrum.com/x", "https://www.spectrum.com/", "https://shop.spectrum.com/a", "https://notspectrum.com/", "https://spectrum.com.evil.test/", "not a url"]) {
    assertEquals(isOwnDomainUrl(u, set), isOwnDomainUrl(u, seedHostOf("https://www.spectrum.com/")), u);
  }
});

Deno.test("E2: only status = confirmed joins the set", () => {
  const set = ownHostsFor({ website: "https://spectrum.com" }, [row("a.test", { status: "proposed" }), row("b.test", { status: "rejected" }), row("c.test", { status: "retired" }), row("charter.com")]);
  assertEquals(set.hosts.map((h) => h.host), ["spectrum.com", "charter.com"]);
});

Deno.test("E2: the effective date — dated rows from effective_from (by day), undated always", () => {
  const cox = row("cox.com", { relation: "merged_into", effective_from: "2026-08-20" });
  assert(!relatedInEffect(cox, "2026-08-19"));
  assert(relatedInEffect(cox, "2026-08-20T00:00:01Z"));
  assert(relatedInEffect(row("charter.com"), "1990-01-01"));
  assertEquals(ownHostsFor({ website: "https://spectrum.com" }, [cox], "2026-08-01").hosts.length, 1);
  assertEquals(relatedEntityFor("https://newsroom.cox.com/x", [cox], "2026-08-01")?.basis, "before_effective");
  assertEquals(relatedEntityFor("https://newsroom.cox.com/x", [cox], "2026-09-01")?.basis, "cited");
});

Deno.test("E2: a subdomain falls under its related host; the most specific host wins; the seed is never an entity", () => {
  const set = ownHostsFor({ website: "https://spectrum.com" }, [row("charter.com"), row("corporate.charter.com", { name: "Charter Corporate" })]);
  assertEquals(ownHostMatch("https://corporate.charter.com/news", set)?.entity?.name, "Charter Corporate");
  assertEquals(ownHostMatch("https://www.charter.com/", set)?.entity?.name, "Entity charter.com");
  assertEquals(ownHostMatch("https://spectrum.com/", set)?.entity, null);
  assertEquals(ownHostMatch("https://example.com/", set), null);
});

Deno.test("E4: the signed venue strings", () => {
  assertEquals(relatedVenueLabel({ name: "Charter Communications", relation: "parent", effective_from: null, basis: "cited" }), "On Charter Communications' site · your parent company");
  assertEquals(relatedVenueLabel({ name: "Cox Communications", relation: "merged_into", effective_from: "2026-08-20", basis: "cited" }), "On Cox Communications' site · merged with your parent, Aug 2026");
  assertEquals(relatedVenueLabel({ name: "Charter Communications", relation: "parent", effective_from: null, basis: "crawl_date_provisional" }), "On Charter Communications' site · your parent company · date not confirmed");
});
