// Part F (operator ruling signed 2026-09-18) — stage stores exactly what direct write stores.
//
// Guard (with a by-hand planted failure, reported in the gate): for ONE fixed generated payload per kind, the
// STAGED payload equals the DIRECT-WRITE payload — offering items carry seen_on, source_count, source_domains and
// the date range; the strategy row additionally carries cascade_source (and nothing else differs). Text fields are
// byte-identical to the generated payload. Source guard: the generator inserts `built.stored` (write) and
// `built.staged` (stage) from the ONE builder.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildRefMeta, buildStoredPayloads, deriveOfferingSeenOn, translateCitations } from "./publicReadStorage.ts";
import { CASCADE_SOURCE_KEY } from "./publicReadPromote.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const U = { S1: "11111111-1111-4111-8111-111111111111", O1: "22222222-2222-4222-8222-222222222222", F1: "33333333-3333-4333-8333-333333333333", D1: "44444444-4444-4444-8444-444444444444" };
const uuidByRef = new Map(Object.entries(U));
const inputs = [
  { id: U.S1, source_url: "https://www.mightycause.com/organization/edgewood", event_date: "2026-03-01", own_site: false },
  { id: U.O1, own_site: true },
  { id: U.F1 },
  { id: U.D1 },
];
const ownHost = "edgewood.org";
const refMeta = buildRefMeta(inputs, ownHost);
const ownHosts = new Set([ownHost]);
const PAYLOADS: Record<string, Record<string, unknown>> = {
  positioning: { market_category: "nonprofit youth mental healthcare provider", market_category_citations: ["O1", "F1"], value_for_customer: "expert mental healthcare", value_citations: ["O1"], best_fit_customers: "youth and families", best_fit_citations: ["F1"], unique_attributes: [{ text: "only youth-under-12 CSU", citations: ["S1"] }] },
  strategy: { winning_aspiration: "Every youth in crisis gets a bed within a day.", winning_aspiration_citations: ["F1"], where_to_play: "SF and San Mateo counties.", where_to_play_citations: ["S1"], how_to_win: "The only 24/7 CSU for under-12s.", how_to_win_citations: ["O1"], must_have_capabilities: [{ text: "A staffed 24/7 crisis unit", citations: ["O1"] }], management_systems: [] },
  promise: { promise: "We see families within a week.", citations: ["O1"] },
  offering: { items: [
    { label: "24-hour crisis stabilization", statement: "Edgewood offers 24-hour crisis stabilization services to youth and families.", refs: ["O1", "D1"], kind_hint: "service" },
    { label: "Drop-in Centers", statement: "Edgewood operates Drop-in Centers in San Bruno and Redwood City.", refs: ["S1"], kind_hint: "program" },
  ], open_questions: [{ text: "Is the CSU fully operational?", refs: ["S1"], reason: "currency" }] },
};
const VERDICT = { accept: true, cascade_coherence: { how_to_win: { coherent: false, reason: "does not serve where-to-play" }, capabilities: [] } };

Deno.test("Part F: for every kind the staged payload equals the direct-write payload (strategy: plus cascade_source only); offering items carry the enrichment; text byte-identical", () => {
  for (const kind of ["positioning", "strategy", "promise", "offering"]) {
    const b = buildStoredPayloads({ kind, payload: PAYLOADS[kind], verdict: VERDICT, uuidByRef, refMeta, ownHosts });
    const { [CASCADE_SOURCE_KEY]: cs, ...stagedRest } = b.staged as Record<string, unknown>;
    assertEquals(stagedRest, b.stored, `${kind}: staged == stored apart from cascade_source`);
    if (kind === "strategy") {
      assert(cs && typeof cs === "object", "strategy staged row carries cascade_source");
      assertEquals((cs as Record<string, unknown>).how_to_win, "The only 24/7 CSU for under-12s.", "cascade_source keeps the RAW how_to_win");
      assertEquals(b.stored.how_to_win, "", "the stored spine blanks the incoherent how_to_win");
      assertEquals(b.cascadeItems.map((i) => i.question_identity).sort(), ["cascade_gap:management_systems", "cascade_tension:how_to_win"]);
    } else assertEquals(cs, undefined, `${kind}: no cascade_source`);
    // citations translated on both
    assertEquals(JSON.stringify(b.stored).includes("O1"), false, `${kind}: tokens translated`);
  }
  // offering enrichment on the STAGED payload
  const off = buildStoredPayloads({ kind: "offering", payload: PAYLOADS.offering, verdict: VERDICT, uuidByRef, refMeta, ownHosts });
  const items = off.staged.items as Array<Record<string, unknown>>;
  assertEquals(items.map((i) => [i.seen_on, i.source_count, i.source_domains, i.earliest_source, i.latest_source]), [
    ["own_site", 2, ["edgewood.org"], null, null],
    ["outside", 1, ["mightycause.com"], "2026-03-01", "2026-03-01"],
  ]);
  assertEquals(items.map((i) => [i.label, i.statement, i.kind_hint]), (PAYLOADS.offering.items as Array<Record<string, unknown>>).map((i) => [i.label, i.statement, i.kind_hint]), "text fields byte-identical");
  assertEquals(items[0].refs, [U.O1, U.D1]);
  assertEquals((off.staged.open_questions as Array<Record<string, unknown>>)[0].refs, [U.S1]);
  // the enrichment is a pure function of the payload + the ledger metadata — re-running it on the STORED payload
  // (refs already uuids) yields the same seen_on facts (what Part E relies on)
  const again = deriveOfferingSeenOn(off.stored, new Map(), refMeta, ownHosts);
  assertEquals(again.map((x) => [x.seen_on, x.source_count, x.domains]), [["own_site", 2, ["edgewood.org"]], ["outside", 1, ["mightycause.com"]]]);
  assertEquals(translateCitations({ refs: ["O1"] }, uuidByRef), { refs: [U.O1] });
});

Deno.test("source guard: the generator inserts built.stored on write and built.staged on stage, from the one builder", async () => {
  const gen = await read("../generate-public-read/index.ts");
  assert(gen.includes("company_id, kind, payload: built.stored, input_ledger: ledger,"), "direct write inserts built.stored");
  assert(gen.includes("company_id, kind, payload: built.staged, input_ledger: ledger,"), "stage inserts built.staged");
  assert(gen.includes("const built = buildStoredPayloads({ kind, payload, verdict, uuidByRef, refMeta, ownHosts });"), "one builder");
  assert(!gen.includes("function deriveOfferingSeenOn(") && !gen.includes("function translateCitations("), "moved, not copied");
  const sto = await read("./publicReadStorage.ts");
  assert(sto.includes("const stored = translateCitations(storage, uuidByRef) as Record<string, unknown>;") && sto.includes("? { ...stored, [CASCADE_SOURCE_KEY]:"), "staged = stored (+ cascade_source on strategy)");
});
