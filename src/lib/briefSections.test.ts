// SP-445 (2026-11-19): the band predicates. The first assertion is the bug the acceptance comparison
// caught: "at the bar" WITHOUT the `meets` term marked N6 and N8 — both 2 counted from 2 sites, i.e.
// failures of the quote floor — as sitting at the bar, when they are thin spots.
import { describe, expect, it } from "vitest";
import { brandTotals, hotspots, isAtTheBar, polarityTotals, thinFloors, thinSpots, whatWorks, type NeedWithTally } from "./briefSections";
import { tallyNeed, type EvidenceRow } from "./needEvidenceCounting";

const CA = "https://www.consumeraffairs.com/internet/spectrum.html";
const APP = "https://apps.apple.com/us/app/spectrum-tv/id1";
const PLAY = "https://play.google.com/store/apps/details?id=x";
const row = (site: string, polarity: string | null = "not working", brand = "spectrum"): EvidenceRow =>
  ({ bears: true, polarity, brand, eventDate: "2026-09-30", sourceUrl: site });

const t = (rows: EvidenceRow[]) => tallyNeed(rows);
const need = (name: string, rows: EvidenceRow[]): NeedWithTally<{ name: string }> => ({ need: { name }, tally: t(rows) });

describe("at the bar (SP-445)", () => {
  it("3 counted from 2 sites IS at the bar — it clears the bar and sits on the quote floor", () => {
    expect(isAtTheBar(t([row(CA), row(APP), row(APP)]))).toBe(true);
  });
  it("4 counted from exactly 2 sites IS at the bar — on the site floor", () => {
    expect(isAtTheBar(t([row(CA), row(CA), row(APP), row(APP)]))).toBe(true);
  });
  it("2 counted from 2 sites is NOT at the bar — it FAILS the quote floor (the N6 / N8 case)", () => {
    const tally = t([row(CA), row(APP)]);
    expect(tally.meets).toBe(false);
    expect(isAtTheBar(tally)).toBe(false);
  });
  it("1 counted from 1 site is not at the bar either", () => {
    expect(isAtTheBar(t([row(CA)]))).toBe(false);
  });
  it("well past the bar is not AT it", () => {
    expect(isAtTheBar(t([row(CA), row(CA), row(APP), row(APP), row(PLAY)]))).toBe(false);
  });
});

describe("the bands partition the needs", () => {
  const rows = [
    need("past", [row(CA), row(CA), row(APP), row(APP), row(PLAY)]),
    need("at-bar", [row(CA), row(APP), row(APP)]),
    need("thin-2", [row(CA), row(APP)]),
    need("thin-1", [row(CA)]),
  ];
  it("hotspots are the needs that clear the bar, most-evidenced first", () => {
    expect(hotspots(rows).map((r) => r.need.name)).toEqual(["past", "at-bar"]);
  });
  it("thin spots are the rest, least-evidenced first", () => {
    expect(thinSpots(rows).map((r) => r.need.name)).toEqual(["thin-1", "thin-2"]);
  });
  it("every need is in exactly one of the two", () => {
    const all = [...hotspots(rows), ...thinSpots(rows)].map((r) => r.need.name).sort();
    expect(all).toEqual(["at-bar", "past", "thin-1", "thin-2"]);
  });
});

describe("what works (SP-449)", () => {
  const rows = [
    need("mostly-bad", [row(CA), row(APP), row(PLAY)]),
    need("some-good", [row(CA, "working"), row(APP, "working"), row(PLAY)]),
    need("one-good", [row(CA, "working"), row(APP), row(PLAY)]),
    need("thin-but-good", [row(CA, "working")]),
  ];
  it("only the needs with a working quote, ranked by how many say so", () => {
    expect(whatWorks(rows).map((r) => [r.need.name, r.working])).toEqual([
      ["some-good", 2], ["one-good", 1], ["thin-but-good", 1],
    ]);
  });
  it("a need can be a hotspot AND in what works — the same outcome can be met for some and missed for others", () => {
    const both = whatWorks(rows).map((r) => r.need.name).filter((n) => hotspots(rows).some((h) => h.need.name === n));
    expect(both).toContain("some-good");
  });
  it("a thin need with a working quote still appears — the band is about polarity, not the bar", () => {
    expect(whatWorks(rows).map((r) => r.need.name)).toContain("thin-but-good");
  });
});

describe("which floor a thin spot missed, and the polarity totals", () => {
  it("both floors, the site floor alone, the quote floor alone", () => {
    expect(thinFloors(t([row(CA)]))).toEqual({ fewQuotes: true, fewSites: true });
    expect(thinFloors(t([row(CA), row(CA), row(CA)]))).toEqual({ fewQuotes: false, fewSites: true });
    expect(thinFloors(t([row(CA), row(APP)]))).toEqual({ fewQuotes: true, fewSites: false });
  });
  it("SP-674: brand totals are each brand's counted quotes, most first, and add up to the need's count", () => {
    const tally = t([row(CA, "working"), row(APP, "not working"), row(PLAY, "mixed"), row(CA, "not working", "cox"), row(APP, "not working", "brand_not_recorded")]);
    expect(brandTotals(tally)).toEqual([{ brand: "spectrum", counted: 3 }, { brand: "brand_not_recorded", counted: 1 }, { brand: "cox", counted: 1 }]);
    expect(brandTotals(tally).reduce((n, b) => n + b.counted, 0)).toBe(tally.counted);
    expect(brandTotals(t([]))).toEqual([]);
  });
  it("polarity totals sum across brands", () => {
    expect(polarityTotals(t([row(CA, "working"), row(APP, "not working", "cox"), row(PLAY, "mixed")])))
      .toEqual({ working: 1, notWorking: 1, mixed: 1 });
  });
});
