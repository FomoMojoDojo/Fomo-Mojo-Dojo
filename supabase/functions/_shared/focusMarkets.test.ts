// F-3/F-4: the focus a run is stamped with, what the generator is sent, and what a card's label means.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFocusStamp, focusForRun, focusMarketsInput, leadJourneyKey, resolveFocusParty, type FocusStampEntry } from "./focusMarkets.ts";

const DONORS = { id: "m-d", journey_key: "pmk-donors", job_executor: "Individual donors", jtbd: "support youth mental health", retracted_at: null };
const FAMILIES = { id: "m-f", journey_key: "customer", job_executor: "Families", jtbd: "", retracted_at: null };
const ROWS = [
  { domain: "focus_market_02", item_id: "m-f", item_key: "customer", chosen_at: "t2" },
  { domain: "focus_market_01", item_id: "m-d", item_key: "pmk-donors", chosen_at: "t1" },
  { domain: "job_step_set", item_id: null, item_key: "customer", chosen_at: "t0" },
];

Deno.test("F-3: the stamp is the signed set in rank order; other domains and retracted markets are left out", () => {
  const stamp = buildFocusStamp(ROWS, [DONORS, FAMILIES]);
  assertEquals(stamp.map((m) => [m.rank, m.journey_key]), [[1, "pmk-donors"], [2, "customer"]]);
  assertEquals(buildFocusStamp(ROWS, [{ ...DONORS, retracted_at: "x" }, FAMILIES]).map((m) => [m.rank, m.journey_key]), [[1, "customer"]]);
});

Deno.test("F-3: the generator gets a numbered list and the lead's journey; unfocused is empty and 'customer'", () => {
  const stamp = buildFocusStamp(ROWS, [DONORS, FAMILIES]);
  assertEquals(focusMarketsInput(stamp), "1. Individual donors — support youth mental health\n2. Families");
  assertEquals(leadJourneyKey(stamp), "pmk-donors");
  assertEquals(focusMarketsInput([]), "");
  assertEquals(leadJourneyKey([]), "customer");
});

// a fake client: records the stamp write, answers the reads
function fakeSb(existing: unknown) {
  const writes: unknown[] = [];
  const table = (t: string) => {
    const q: Record<string, unknown> = { _t: t };
    const self = new Proxy(q, {
      get(target, prop) {
        if (prop === "maybeSingle") return async () => ({ data: t === "companies" ? { name: "Edgewood" } : { focus_markets: existing } });
        if (prop === "update") return (v: unknown) => { writes.push(v); return self; };
        if (prop === "then") {
          const data = t === "operator_primary_selection" ? ROWS.filter((r) => r.domain.startsWith("focus_market_")) : t === "odi_market_definitions" ? [DONORS, FAMILIES] : null;
          return (res: (v: unknown) => void) => res({ data, error: null });
        }
        return () => self;
      },
    });
    return self;
  };
  return { sb: { from: table }, writes };
}

Deno.test("F-3: the first start stamps the signed set; a retry reads the stamp and writes nothing", async () => {
  const first = fakeSb(null);
  const a = await focusForRun(first.sb, "p1", "co");
  assertEquals(a.clientName, "Edgewood");
  assertEquals(a.stamp.map((m) => m.journey_key), ["pmk-donors", "customer"]);
  assertEquals(first.writes.length, 1);
  const stamped = (first.writes[0] as { focus_markets: FocusStampEntry[] }).focus_markets;
  const retry = fakeSb(stamped);
  const b = await focusForRun(retry.sb, "p1", "co");
  assertEquals(b.stamp, stamped);
  assertEquals(retry.writes.length, 0);
});

Deno.test("F-3: an unfocused run is stamped [] — it says it ran unfocused", async () => {
  const unf = fakeSb([]);
  assertEquals((await focusForRun(unf.sb, "p1", "co")).stamp, []);
  assertEquals(unf.writes.length, 0);
});

Deno.test("F-4: a card's label → what the queue does (decisions 4/5)", () => {
  const stamp = buildFocusStamp(ROWS, [DONORS, FAMILIES]);
  assertEquals(resolveFocusParty(stamp, "focus", 2), { party: "focus", journey_key: "customer" });
  assertEquals(resolveFocusParty(stamp, "focus", 1), { party: "focus", journey_key: "pmk-donors" });
  assertEquals(resolveFocusParty(stamp, "focus", 3).party, "focus_unresolved");
  assertEquals(resolveFocusParty(stamp, "FOCUS", 0).party, "focus_unresolved");
  assertEquals(resolveFocusParty(stamp, "company", 0).party, "company");
  assertEquals(resolveFocusParty(stamp, "other", 0).party, "other");
  // a workflow that emits no label never withholds a focused company's cards
  assertEquals(resolveFocusParty(stamp, undefined, undefined).party, "unlabelled");
  // unfocused: no filter at all, whatever the label
  assertEquals(resolveFocusParty([], "other", 0).party, "unfocused");
  assertEquals(resolveFocusParty(null, "company", 0).party, "unfocused");
});
