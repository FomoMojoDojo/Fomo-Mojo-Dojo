// "Named on your own site" is EARNED (operator rule signed 2026-09-18). Guards (a)–(f); each has a by-hand
// planted failure reported in the gate. Fixtures are non-empty on both sides (a named item and an unnamed
// item in every world).
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EMPTY_OWN_SITE_RECORD, findNamedOnSite, labelClauses, ownSiteStateFor, type OwnSiteRecord } from "./offeringNamedOnSite.ts";
import { buildRefMeta, buildStoredPayloads } from "./publicReadStorage.ts";

const PAGE = { url: "https://edgewood.org/", fetched_at: "2026-08-21T00:12:03Z", text: "How We Help\nCrisis Stabilization Unit\nPartial Hospitalization Program\nNon-Public High School (NPS)\nEnhanced Care Management\nKinship Program" };
const CLAIM = { url: "https://edgewood.org/about/", fetched_at: "2026-08-26", text: "Our comprehensive services include 24-hour crisis stabilization." };
const SIGNAL = { url: "https://edgewood.org/about/", fetched_at: "2026-09-11", text: "TAY drop-in centers; family resource center" };
const RECORD: OwnSiteRecord = { pages: [PAGE], claims: [CLAIM], signals: [SIGNAL] };
const NO_CITATION = { cited: false, url: null };

const U = { S_KAISER: "11111111-1111-4111-8111-111111111111", O_GUIDESTAR: "22222222-2222-4222-8222-222222222222", O_OWN: "33333333-3333-4333-8333-333333333333", S_FINDHELP: "44444444-4444-4444-8444-444444444444" };
const uuidByRef = new Map(Object.entries({ S1: U.S_KAISER, O1: U.O_GUIDESTAR, O2: U.O_OWN, S2: U.S_FINDHELP }));
const inputs = [
  { id: U.S_KAISER, source_url: "https://healthy.kaiserpermanente.org/facilities/edgewood", event_date: "2026-05-01" },
  { id: U.O_GUIDESTAR, source_url: "https://www.guidestar.org/profile/94-1186168", own_site: true }, // an own_word hosted on a registry
  { id: U.O_OWN, source_url: "https://edgewood.org/partners-providers/", own_site: true },
  { id: U.S_FINDHELP, source_url: "https://www.findhelp.org/provider/edgewood" },
];
const ownHost = "edgewood.org";
const refMeta = buildRefMeta(inputs, ownHost);
const ownHosts = new Set([ownHost]);
const refUrl = (id: string) => inputs.find((r) => r.id === id)?.source_url ?? null;
const OFFERING = { items: [
  { label: "Crisis Stabilization Unit (CSU)", statement: "A 24/7 unit.", refs: ["S2"] },                       // outside-cited, named on the page
  { label: "Behavioral Health Outpatient Program", statement: "Outpatient care.", refs: ["O2"] },               // own-host cited, name nowhere
  { label: "Affiliated Residential Treatment and Mental Health Services", statement: "Kaiser's phrase.", refs: ["S1"] }, // neither
  { label: "Drop-in Centers", statement: "TAY centers.", refs: ["O1"] },                                        // guidestar-cited; named via the signal
] };
const build = (record: OwnSiteRecord | null) => buildStoredPayloads({ kind: "offering", payload: OFFERING, verdict: {}, uuidByRef, refMeta, ownHosts, ownSiteRecord: record, refUrl });
const states = (record: OwnSiteRecord | null) => (build(record).stored.items as Array<Record<string, unknown>>).map((i) => i.seen_on);

Deno.test("(a) an outside-cited item whose name is on a saved own page → named (evidence: clause, url, fetched_at)", () => {
  const items = build(RECORD).stored.items as Array<Record<string, unknown>>;
  assertEquals(items[0].seen_on, "named_on_site");
  assertEquals(items[0].own_host_cited, false, "it cites no own-host input");
  assertEquals(items[0].named_on_site, { clause: "full", url: PAGE.url, fetched_at: PAGE.fetched_at });
  assertEquals(items[2].seen_on, "seen_outside", "the Kaiser item stays outside");
  assertEquals(items.map((i) => [i.label, i.statement]), OFFERING.items.map((i) => [i.label, i.statement]), "text fields byte-identical");
});

Deno.test("(b) an own-host-cited item whose name is nowhere in the record → still named (union rule), with the citation as evidence", () => {
  const items = build(RECORD).stored.items as Array<Record<string, unknown>>;
  assertEquals(items[1].seen_on, "named_on_site");
  assertEquals(items[1].named_on_site, { clause: "own_host_citation", url: "https://edgewood.org/partners-providers/", fetched_at: null });
  assertEquals(items[2].seen_on, "seen_outside");
});

Deno.test("(c) not named with ZERO saved own pages → own_site_not_read, never seen_outside; with 1+ pages → seen_outside", () => {
  assertEquals(states(null)[2], "own_site_not_read");
  assertEquals(states({ ...EMPTY_OWN_SITE_RECORD, claims: [CLAIM] })[2], "own_site_not_read", "claims alone do not make the site 'read'");
  assertEquals(states(RECORD)[2], "seen_outside");
  assertEquals(ownSiteStateFor("Anything", NO_CITATION, EMPTY_OWN_SITE_RECORD).state, "own_site_not_read");
  assertEquals(ownSiteStateFor("Anything", NO_CITATION, RECORD).state, "seen_outside");
});

Deno.test("(d) suffix and acronym clauses: 'Therapeutic Behavioral Services (TBS) program' by suffix; 'Non-Public School (NPS) program' by acronym; a bare acronym never matches inside a word", () => {
  const rec: OwnSiteRecord = { ...EMPTY_OWN_SITE_RECORD, pages: [{ ...PAGE, text: "San Francisco Therapeutic Behavioral Services\nNon-Public High School (NPS)\ntransparency" }] };
  assertEquals(findNamedOnSite("Therapeutic Behavioral Services (TBS) program", rec)?.clause, "suffix");
  assertEquals(findNamedOnSite("Non-Public School (NPS) program", rec)?.clause, "acronym");
  assertEquals(findNamedOnSite("Something (ARE) team", rec), null, "'are' inside 'transparency' is not a whole-word hit");
  assertEquals(labelClauses("Enhanced Care Management (ECM) Team").map((c) => c.clause), ["full", "suffix", "acronym"]);
  assertEquals(findNamedOnSite("Enhanced Care Management (ECM) Team", RECORD)?.clause, "suffix");
});

Deno.test("(e) a guidestar-hosted own_word never counts as own site: with an empty record the item is not named", () => {
  const items = build(null).stored.items as Array<Record<string, unknown>>;
  assertEquals(items[3].own_host_cited, false, "own_word on guidestar is not an own-host citation");
  assertEquals(items[3].seen_on, "own_site_not_read");
  assertEquals(refMeta.get(U.O_GUIDESTAR)?.own_site, false);
  assertEquals(refMeta.get(U.O_OWN)?.own_site, true);
  // with the record, the same item is named — by the client_voice signal, not by the citation
  const named = build(RECORD).stored.items as Array<Record<string, unknown>>;
  assertEquals(named[3].seen_on, "named_on_site");
  assertEquals((named[3].named_on_site as { clause: string }).clause, "full");
});

Deno.test("(f) a shuffled record gives the same verdicts and the same evidence (clause, url, fetched_at)", () => {
  // two pages and two signals carry the same names — the evidence must not depend on arrival order
  const PAGE2 = { url: "https://edgewood.org/about/", fetched_at: "2026-08-21T00:12:10Z", text: PAGE.text };
  const SIGNAL2 = { url: "https://edgewood.org/", fetched_at: "2026-09-11", text: SIGNAL.text };
  const rec: OwnSiteRecord = { pages: [PAGE2, PAGE], claims: [CLAIM], signals: [SIGNAL2, SIGNAL] };
  const shuffled: OwnSiteRecord = { pages: [PAGE, PAGE2], claims: [CLAIM], signals: [SIGNAL, SIGNAL2] };
  const a = build(rec).stored.items as Array<Record<string, unknown>>;
  const b = build(shuffled).stored.items as Array<Record<string, unknown>>;
  assertEquals(a.map((i) => [i.seen_on, i.named_on_site]), b.map((i) => [i.seen_on, i.named_on_site]), "verdict + evidence identical under shuffle");
  assertEquals(a[0].named_on_site, { clause: "full", url: PAGE.url, fetched_at: PAGE.fetched_at }, "the canonical (url-ordered) row is the evidence");
  assertEquals(states(RECORD), ["named_on_site", "named_on_site", "seen_outside", "named_on_site"]);
  assert(states(RECORD).every((s) => ["named_on_site", "seen_outside", "own_site_not_read"].includes(String(s))), "three explicit values only");
});
