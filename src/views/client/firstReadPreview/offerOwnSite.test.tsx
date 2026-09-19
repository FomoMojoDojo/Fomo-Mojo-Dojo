// "Named on your own site" is EARNED (operator rule signed 2026-09-18) — render-side guards (g) and (h).
// Each has a by-hand planted failure reported in the gate: (g) map an unknown value to own-site; (h) restore
// the old outside eyebrow.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { ActWhatYouOffer } from "./acts";
import { offerOwnSiteState } from "./useFirstReadPreviewData";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FROfferItem } from "./types";

const SIGNED = { own: "Named on your own site", outside: "Seen outside your site", notRead: "Own site not yet read" } as const;
const item = (label: string, ownSite: FROfferItem["ownSite"]): FROfferItem => ({ label, statement: `${label} — what it is.`, ownSite, sourceCount: 1, earliestYear: null, latestYear: null });
const read = (items: FROfferItem[]): FirstReadPreviewData => ({ ...EMPTY_FIRST_READ, company: { name: "Co", website: null }, offering: { items } });

describe("(g) the adapter maps three explicit values; an unknown value is never own-site", () => {
  it("maps the three stored values", () => {
    expect(offerOwnSiteState("named_on_site")).toBe("named");
    expect(offerOwnSiteState("seen_outside")).toBe("seen_outside");
    expect(offerOwnSiteState("own_site_not_read")).toBe("not_read");
  });
  it("legacy and unknown values → not_read (absence is never claimed, own-site is never assumed)", () => {
    for (const v of ["own_site", "outside", "", null, undefined, 0, "NAMED_ON_SITE", "named"]) expect(offerOwnSiteState(v)).toBe("not_read");
  });
  it("an unknown value renders under the not-yet-read eyebrow, not under the own-site one", () => {
    const c = render(<ActWhatYouOffer read={read([item("Legacy item", offerOwnSiteState("own_site"))])} />).container;
    const t = c.textContent ?? "";
    expect(t).toContain(SIGNED.notRead);
    expect(t).not.toContain(SIGNED.own);
    expect(t).not.toContain(SIGNED.outside);
  });
});

describe("(h) the rendered eyebrows are exactly the three signed strings; the retired string is gone from src/", () => {
  it("renders the three groups in order with the signed strings", () => {
    const c = render(<ActWhatYouOffer read={read([item("A", "named"), item("B", "seen_outside"), item("C", "not_read")])} />).container;
    const eyebrows = Array.from(c.querySelectorAll(".fr-offer-group-label")).map((e) => e.textContent?.trim());
    expect(eyebrows).toEqual([SIGNED.own, SIGNED.outside, SIGNED.notRead]);
  });
  it("an empty group's eyebrow is omitted", () => {
    const c = render(<ActWhatYouOffer read={read([item("A", "named")])} />).container;
    expect(Array.from(c.querySelectorAll(".fr-offer-group-label")).map((e) => e.textContent?.trim())).toEqual([SIGNED.own]);
  });
  const RETIRED = ["Seen only", "from outside"].join(" "); // assembled so this file cannot match itself
  it("the retired outside eyebrow appears nowhere in src/", () => {
    const root = path.resolve(__dirname, "../../..");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); continue; }
        if (!/\.(tsx?|css|md)$/.test(e.name)) continue;
        if (fs.readFileSync(p, "utf8").includes(RETIRED)) hits.push(path.relative(root, p));
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
