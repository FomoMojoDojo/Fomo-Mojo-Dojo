// ── E4 (operator ruling 2026-10-21): A RELATED ENTITY'S OWN SITE IS NAMED ON EVERY LINE ──────────────────────────────
//
// A `you` source on a CONFIRMED related entity's host (ownSite true because the one own-domain rule matched that entity —
// the adapter sets ownSiteEntity) renders under the signed venue string, right after "On your site"; the company's own
// seed host keeps "On your site"; a provisional relation trails "· date not confirmed". Render-time only — nothing stored.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CommitmentSource, venueOf } from "./primitives";

const CHARTER = { name: "Charter Communications", relation: "parent" as const, effective_from: null, basis: "cited" as const };
const COX = { name: "Cox Communications", relation: "merged_into" as const, effective_from: "2026-08-20", basis: "cited" as const };
const txt = (el: JSX.Element) => render(el).container.textContent ?? "";

describe("E4 venue strings (signed)", () => {
  it("Charter → \"On Charter Communications' site · your parent company\"", () => {
    expect(venueOf({ host: "corporate.charter.com", published: null, cls: "you", ownSite: true, ownSiteEntity: CHARTER }))
      .toBe("On Charter Communications' site · your parent company");
  });
  it("Cox → \"On Cox Communications' site · merged with your parent, Aug 2026\"", () => {
    expect(venueOf({ host: "cox.com", published: null, cls: "you", ownSite: true, ownSiteEntity: COX }))
      .toBe("On Cox Communications' site · merged with your parent, Aug 2026");
  });
  it("a provisional relation trails \"· date not confirmed\"", () => {
    expect(venueOf({ host: "charter.com", published: null, cls: "you", ownSite: true, ownSiteEntity: { ...CHARTER, basis: "crawl_date_provisional" } }))
      .toBe("On Charter Communications' site · your parent company · date not confirmed");
  });
  it("spectrum.com (the seed host, no entity) keeps \"On your site\"", () => {
    expect(venueOf({ host: "spectrum.com", published: null, cls: "you", ownSite: true, ownSiteEntity: null })).toBe("On your site");
    expect(venueOf({ host: "spectrum.com", published: null, cls: "you", ownSite: true })).toBe("On your site");
  });
  it("a record row on a related host stays \"In the record\" — class decides first", () => {
    expect(venueOf({ host: "cox.com", published: null, cls: "record", ownSite: true, ownSiteEntity: COX })).toBe("In the record");
  });
  it("the line groups the related venue right after \"On your site\", before the record", () => {
    expect(txt(<CommitmentSource sourceClass="you" sources={[
      { host: "en.wikipedia.org", published: "2025", cls: "record" },
      { host: "cox.com", published: "Aug 21, 2026", publishedAt: "2026-08-21", cls: "you", ownSite: true, ownSiteEntity: COX },
      { host: "spectrum.com", published: null, cls: "you", ownSite: true },
    ]} />)).toBe("On your site · spectrum.com · On Cox Communications' site · merged with your parent, Aug 2026 · cox.com · Aug 21, 2026 · In the record · en.wikipedia.org · 2025");
  });
});
