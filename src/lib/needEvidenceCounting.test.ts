// SP-406 counting, computed from stored facts (SP-429). The property that matters: a quote's
// counted-ness is DERIVED, so the undated/pre-merger rules are testable without any stored verdict.
import { describe, expect, it } from "vitest";
import { COX_MERGER_DATE, isCounted, siteOf, tallyNeed, uncountedReason, type EvidenceRow } from "./needEvidenceCounting";

const row = (o: Partial<EvidenceRow> = {}): EvidenceRow =>
  ({ bears: true, polarity: "not working", brand: "spectrum", eventDate: "2026-09-01", sourceUrl: "https://www.trustpilot.com/review/spectrum.net", ...o });

describe("SP-406 — who counts", () => {
  it("counts Spectrum whether dated or not — one operator across the window", () => {
    expect(isCounted(row({ brand: "spectrum", eventDate: null }))).toBe(true);
    expect(isCounted(row({ brand: "spectrum", eventDate: "2025-01-01" }))).toBe(true);
  });
  it("does NOT count an undated Cox review — it cannot be placed either side of the merger", () => {
    expect(uncountedReason(row({ brand: "cox", eventDate: null }))).toBe("cox_undated");
    expect(uncountedReason(row({ brand: "cox", eventDate: "" }))).toBe("cox_undated");
  });
  it("does NOT count a Cox review from before the merger", () => {
    expect(uncountedReason(row({ brand: "cox", eventDate: "2026-08-19" }))).toBe("cox_pre_merger");
  });
  it("counts a Cox review ON or after the merger date", () => {
    expect(uncountedReason(row({ brand: "cox", eventDate: COX_MERGER_DATE }))).toBeNull();
    expect(uncountedReason(row({ brand: "cox", eventDate: "2026-10-21" }))).toBeNull();
  });
  it("counts brand_not_recorded — the rule names Cox, not 'unknown'", () => {
    expect(isCounted(row({ brand: "brand_not_recorded", eventDate: null }))).toBe(true);
  });
});

describe("SP-406 — sites", () => {
  it("keeps Google Play and the App Store APART", () => {
    expect(siteOf("https://play.google.com/store/apps/details?id=x")).toBe("Google Play");
    expect(siteOf("https://apps.apple.com/us/app/spectrum-tv/id1")).toBe("App Store");
  });
  it("folds every pissedconsumer brand sub-site into one site", () => {
    expect(siteOf("https://spectrum.pissedconsumer.com/review.html")).toBe("PissedConsumer");
    expect(siteOf("https://cox-communications.pissedconsumer.com/review.html")).toBe("PissedConsumer");
  });
  it("drops www. and survives a malformed url", () => {
    expect(siteOf("https://www.bbb.org/x")).toBe("BBB");
    expect(siteOf("not a url")).toBe("unknown");
    expect(siteOf(null)).toBe("unknown");
  });
});

describe("SP-406 — the bar is 3 counted from 2 sites", () => {
  const at = (n: number, sites: string[]) =>
    tallyNeed(Array.from({ length: n }, (_, i) => row({ sourceUrl: `https://${sites[i % sites.length]}/x` })));
  it("meets at exactly 3 from 2", () => expect(at(3, ["bbb.org", "trustpilot.com"]).meets).toBe(true));
  it("fails at 2 from 2", () => expect(at(2, ["bbb.org", "trustpilot.com"]).meets).toBe(false));
  it("fails at 4 from 1 — sites matter, not volume", () => expect(at(4, ["bbb.org"]).meets).toBe(false));
  it("ignores non-bearing rows entirely", () => {
    const t = tallyNeed([row(), row(), row(), row({ bears: false, polarity: null })]);
    expect(t.counted).toBe(3);
  });
  it("reports the uncounted Cox rows separately rather than hiding them", () => {
    const t = tallyNeed([
      row({ brand: "cox", eventDate: null }), row({ brand: "cox", eventDate: null }),
      row({ brand: "cox", eventDate: "2026-01-01" }), row(),
    ]);
    expect(t.counted).toBe(1);
    expect(t.coxUndated).toBe(2);
    expect(t.coxPreMerger).toBe(1);
    expect(t.meets).toBe(false);
  });
  it("tallies polarity per brand on the COUNTED rows only", () => {
    const t = tallyNeed([
      row({ brand: "spectrum", polarity: "working" }),
      row({ brand: "spectrum", polarity: "not working" }),
      row({ brand: "cox", eventDate: null, polarity: "not working" }),
    ]);
    expect(t.byBrandPolarity.spectrum).toEqual({ working: 1, "not working": 1, mixed: 0 });
    expect(t.byBrandPolarity.cox).toBeUndefined();
  });
});
