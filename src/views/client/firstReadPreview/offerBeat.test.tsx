// Gate-C Stage B — "What you offer" beat guards. DOM structure + byte-exact string identity, not
// loose text regex. Each block fails if its guard is reverted; step-5 proves (a) and (d) can fail by
// planting a one-char headline change and an item into the earned-empty render.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActWhatYouOffer, ActQuestions } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FROfferItem } from "./types";

// Byte-exact signed strings (the beat's authority; a drift here is a real defect).
const S = {
  eyebrow: "FROM THE RECORD",
  headline: "What you offer, as the market can see it.",
  subhead: "Products, services, programs — as they appear in public. Not what you intend. What's visible.",
  why: "Your base is what you intend. Your offering is what people actually meet. The gap between them is where the next phase starts.",
  groupOwn: "Named on your own site",
  groupOutside: "Seen only from outside",
  earnedEmpty: "The record doesn't yet show what you offer.",
  closing: "Next, we lay this against what your market needs.",
  rationale: "The offering is what the base produces — it has to be on the table before needs-vs-offer.",
  notYet: "The record hasn't been read for this yet.",
  couldnt: "We couldn't produce a grounded read from the record this time.",
} as const;

const item = (o: Partial<FROfferItem> & Pick<FROfferItem, "label" | "seenOn">): FROfferItem => ({
  statement: `${o.label} — what it is.`,
  sourceCount: 2,
  earliestYear: null,
  latestYear: null,
  ...o,
});

// 3 own-site + 1 outside — the shape both live companies have (own-heavy, one outside).
const ITEMS: FROfferItem[] = [
  item({ label: "Roasted coffee in bags", seenOn: "own_site", sourceCount: 2 }),
  item({ label: "Wholesale partnerships", seenOn: "own_site", sourceCount: 5, earliestYear: "2024", latestYear: "2024" }),
  item({ label: "Roasting service", seenOn: "own_site", sourceCount: 3, earliestYear: "2023", latestYear: "2025" }),
  item({ label: "DTC online sales", seenOn: "outside", sourceCount: 6, earliestYear: "2025", latestYear: "2025" }),
];

const withOffering = (items: FROfferItem[]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: null },
  offering: { items },
});

const earnedEmpty = (
  state: FirstReadPreviewData["offeringIntegrity"],
  extra: Partial<FirstReadPreviewData> = {},
): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: null },
  offering: null,
  offeringIntegrity: state,
  ...extra,
});

const renderOffer = (read: FirstReadPreviewData) => render(<ActWhatYouOffer read={read} />).container;

describe("(a) one offer beat, signed strings byte-exact", () => {
  it("renders exactly one offer headline", () => {
    const text = renderOffer(withOffering(ITEMS)).textContent ?? "";
    expect((text.match(/What you offer, as the market can see it\./g) ?? []).length).toBe(1);
  });
  it("carries every signed header/why/closing/group label byte-exact", () => {
    const text = renderOffer(withOffering(ITEMS)).textContent ?? "";
    for (const key of ["eyebrow", "headline", "subhead", "why", "groupOwn", "groupOutside", "closing"] as const) {
      expect(text, key).toContain(S[key]);
    }
  });
  it("does NOT render the internal placement rationale line (operator ruling 2026-09-01)", () => {
    expect(renderOffer(withOffering(ITEMS)).textContent ?? "").not.toContain(S.rationale);
  });
});

describe("(b) item count = payload count, grouped correctly, source line per item", () => {
  it("one <li> per payload item", () => {
    const lis = renderOffer(withOffering(ITEMS)).querySelectorAll("ol li");
    expect(lis.length).toBe(ITEMS.length);
  });
  it("own-site group precedes the outside group; counts match seen_on", () => {
    const container = renderOffer(withOffering(ITEMS));
    const text = container.textContent ?? "";
    const iOwn = text.indexOf(S.groupOwn);
    const iOut = text.indexOf(S.groupOutside);
    expect(iOwn).toBeGreaterThan(-1);
    expect(iOut).toBeGreaterThan(iOwn);
    const lis = Array.from(container.querySelectorAll("ol li"));
    expect(lis.slice(0, 3).every((li) => li.textContent?.includes("what it is."))).toBe(true);
    expect(lis[3].textContent).toContain("DTC online sales");
  });
  it("every item carries a code-derived source line", () => {
    const lis = Array.from(renderOffer(withOffering(ITEMS)).querySelectorAll("ol li"));
    expect(lis.every((li) => /\d+ source/.test(li.textContent ?? ""))).toBe(true);
  });
  it("source line format: plural, single-year, range, and no-year", () => {
    const text = renderOffer(withOffering(ITEMS)).textContent ?? "";
    expect(text).toContain("2 sources");            // no years
    expect(text).toContain("5 sources · 2024");     // single year
    expect(text).toContain("3 sources · 2023–2025"); // range
    expect(text).toContain("6 sources · 2025");     // outside, single year
  });
});

describe("(c) no chips, no § icons, exactly one vertical rule (the Why-this divider)", () => {
  it("zero chip/verdict pill elements", () => {
    expect(renderOffer(withOffering(ITEMS)).querySelectorAll(".rounded-full").length).toBe(0);
  });
  it("zero § section icons", () => {
    expect(renderOffer(withOffering(ITEMS)).textContent ?? "").not.toContain("§");
  });
  it("the only left-border (vertical rule) element is the BeatWhy divider", () => {
    expect(renderOffer(withOffering(ITEMS)).querySelectorAll('[class*="border-l"]').length).toBe(1);
  });
});

describe("(d) earned-empty: integrity-derived line in all three states, ZERO items", () => {
  it("looked-and-none → the counted line, no items", () => {
    const c = renderOffer(earnedEmpty("looked_none", { offeringExamined: 85, offeringThroughDate: "September 1, 2026" }));
    expect(c.textContent).toContain(S.earnedEmpty);
    expect(c.textContent).toContain("Across 85 public sources through September 1, 2026, nothing spoke to it.");
    expect(c.querySelectorAll("ol li").length).toBe(0);
  });
  it("not-yet → the not-read line, no items", () => {
    const c = renderOffer(earnedEmpty("not_yet"));
    expect(c.textContent).toContain(S.earnedEmpty);
    expect(c.textContent).toContain(S.notYet);
    expect(c.querySelectorAll("ol li").length).toBe(0);
  });
  it("couldn't-check → the failed-read line, no items", () => {
    const c = renderOffer(earnedEmpty("couldnt_check"));
    expect(c.textContent).toContain(S.earnedEmpty);
    expect(c.textContent).toContain(S.couldnt);
    expect(c.querySelectorAll("ol li").length).toBe(0);
  });
});

describe("(e) open questions render on the Questions beat, never on the offer beat", () => {
  const OQ = "Is the El Pescadero Baja CA MX location an active commercial channel or a personal/secondary location?";
  it("the Questions beat renders the routed open question via the shared list", () => {
    const read: FirstReadPreviewData = { ...EMPTY_FIRST_READ, questions: [OQ] };
    expect(render(<ActQuestions read={read} />).container.textContent).toContain(OQ);
  });
  it("the offer beat does NOT render the open question (routing, not a verdict here)", () => {
    const read: FirstReadPreviewData = { ...withOffering(ITEMS), questions: [OQ], offeringOpenQuestions: [OQ] };
    expect(renderOffer(read).textContent).not.toContain(OQ);
  });
});
