// "Who you serve" order (R1, 2026-09-22). The rule: lens-active first, then first-seen
// (MIN(created_at) per journey_key, retracted rows INCLUDED), then journey_key ascending.
//
// RED ON REVERT: before this rule the beat took PostgREST's heap order, so any UPDATE moved a row to
// the end. The shuffle test below is the proof — it is red the moment the sort stops being total.
import { describe, it, expect } from "vitest";
import { firstSeenByKey, orderWhoYouServe } from "./whoYouServeOrder";

const K = {
  fam: "pmk-families",         // first seen earliest; RETRACTED then REPLACED
  county: "pmk-county",
  ped: "pmk-pediatricians",
  clin: "pmk-new-clinicians",  // lens-DEFERRED ⇒ last whatever its age
};
// Every row on the company, retracted included — the order-only read.
const ALL = [
  { journey_key: K.fam, created_at: "2026-09-01T00:00:00Z" },                 // the RETRACTED original
  { journey_key: K.fam, created_at: "2026-09-22T00:00:00Z" },                 // its live REPLACEMENT, written today
  { journey_key: K.county, created_at: "2026-09-02T00:00:00Z" },
  { journey_key: K.ped, created_at: "2026-09-03T00:00:00Z" },
  { journey_key: K.clin, created_at: "2026-09-04T00:00:00Z" },
];
// What the beat renders: live rows only. The replacement is the live row on the families key.
const LIVE = [
  { id: "replacement", journey_key: K.fam },
  { id: "county", journey_key: K.county },
  { id: "ped", journey_key: K.ped },
  { id: "clin", journey_key: K.clin },
];
const ACTIVE = new Set<string | null>([K.fam, K.county, K.ped]); // clin is deferred
const order = (rows: typeof LIVE) => orderWhoYouServe(rows, ACTIVE, firstSeenByKey(ALL)).map((r) => r.id);

describe("Who you serve — the ruled order", () => {
  it("first-seen counts the RETRACTED row, so a replacement inherits the position it replaced", () => {
    // written today, but its key was first seen 2026-09-01 ⇒ it leads, not trails
    expect(order(LIVE)).toEqual(["replacement", "county", "ped", "clin"]);
  });

  it("a lens-deferred key sorts last however early it was first seen", () => {
    const early = [{ journey_key: K.clin, created_at: "2020-01-01T00:00:00Z" }, ...ALL];
    const out = orderWhoYouServe(LIVE, ACTIVE, firstSeenByKey(early)).map((r) => r.id);
    expect(out[out.length - 1]).toBe("clin");
  });

  it("SHUFFLE: the rendered order is identical whatever order the rows arrive in", () => {
    const expected = order(LIVE);
    const shuffles = [
      [LIVE[3], LIVE[2], LIVE[1], LIVE[0]],
      [LIVE[2], LIVE[0], LIVE[3], LIVE[1]],
      [LIVE[1], LIVE[3], LIVE[0], LIVE[2]],
      [LIVE[0], LIVE[3], LIVE[2], LIVE[1]],
    ];
    for (const s of shuffles) expect(order(s)).toEqual(expected);
  });

  it("equal first-seen times fall back to journey_key ascending — never to arrival order", () => {
    const same = [
      { journey_key: "pmk-b", created_at: "2026-09-01T00:00:00Z" },
      { journey_key: "pmk-a", created_at: "2026-09-01T00:00:00Z" },
      { journey_key: "pmk-c", created_at: "2026-09-01T00:00:00Z" },
    ];
    const rows = [{ id: "c", journey_key: "pmk-c" }, { id: "a", journey_key: "pmk-a" }, { id: "b", journey_key: "pmk-b" }];
    const active = new Set<string | null>(["pmk-a", "pmk-b", "pmk-c"]);
    expect(orderWhoYouServe(rows, active, firstSeenByKey(same)).map((r) => r.id)).toEqual(["a", "b", "c"]);
    // and from the other arrival order
    expect(orderWhoYouServe([...rows].reverse(), active, firstSeenByKey(same)).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("a key with no first-seen time sorts after keys that have one, deterministically", () => {
    const rows = [{ id: "unknown", journey_key: "pmk-zzz" }, { id: "known", journey_key: K.county }];
    const active = new Set<string | null>(["pmk-zzz", K.county]);
    expect(orderWhoYouServe(rows, active, firstSeenByKey(ALL)).map((r) => r.id)).toEqual(["known", "unknown"]);
  });

  it("firstSeenByKey takes the MINIMUM and ignores blank keys or timestamps", () => {
    const m = firstSeenByKey([
      { journey_key: K.fam, created_at: "2026-09-22T00:00:00Z" },
      { journey_key: K.fam, created_at: "2026-09-01T00:00:00Z" },
      { journey_key: "", created_at: "2020-01-01T00:00:00Z" },
      { journey_key: K.ped, created_at: null },
    ]);
    expect(m.get(K.fam)).toBe("2026-09-01T00:00:00Z");
    expect(m.has("")).toBe(false);
    expect(m.has(K.ped)).toBe(false);
  });
});
