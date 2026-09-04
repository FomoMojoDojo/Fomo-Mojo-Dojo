// LISTING EVIDENCE CLASS surface (operator ruling 2026-09-04, shape (d), strings signed). Proves, on DOM structure:
// (a) a listing member on "What stands out" renders "Listed by wineandeggs.com" + "Cafe Barra Machado de Assis
//     Brazil, $22.00", NO quote mark, source tag as today; (b) the echo side of "Where you differ" renders the same
//     row in place of the record paragraph; (c) default render has ZERO operator nodes; (d) glyph on → "Kind · listing".
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ActFindings, ActGap } from "./acts";
import { OperatorControlsContext } from "./operatorControls";
import { formatListingPrice, LISTING_STRINGS } from "./listingStrings";
import { groupGapStatements, orderGapPairs } from "./mapping";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRGapPair, type FRListing } from "./types";

const LISTING: FRListing = { host: "wineandeggs.com", productName: "Cafe Barra Machado de Assis Brazil", price: 22, currency: "USD", attribution: "Cafe Barra", url: "https://wineandeggs.com/products/cafe-barra-machado-de-assis-brazil" };
const TAG = { label: "wineandeggs.com · read September 4, 2026" };
const withOperator = (ui: React.ReactElement) => <OperatorControlsContext.Provider value={{ decide: async () => {} }}>{ui}</OperatorControlsContext.Provider>;

const FINDINGS: FirstReadPreviewData = {
  ...EMPTY_FIRST_READ, company: { name: "Co", website: "https://cafebarra.com" }, findingsIntegrity: "looked_none",
  findings: [{ id: "f1", body: "Retailers carry the roaster's beans.", recurrence: 1, sourceTag: TAG, stale: false, ageMarker: "dated",
    quotes: [{ text: "Cafe Barra Machado de Assis Brazil", sourceTag: TAG, eventDate: "2026-09-04", provablyVerbatim: false, listing: LISTING }] }],
} as unknown as FirstReadPreviewData;

const pair = (over: Partial<FRGapPair>): FRGapPair => ({
  id: "p", statementId: "s1", verdict: "confirmed", declared: "Our beans are available at select retailers.", record: "Cafe Barra Machado de Assis Brazil",
  sourceTag: TAG, eventDate: "2026-09-04", evidenceRank: 2, contentIdentity: "ident", relevanceVerdict: "relevant", ...over,
});
const pairs = orderGapPairs([pair({ id: "listing-pair", listing: LISTING })]);
const GAP: FirstReadPreviewData = { ...EMPTY_FIRST_READ, company: { name: "Co", website: "https://cafebarra.com" }, gapPairs: pairs, gapStatements: groupGapStatements(pairs), gapCounts: { contradicted: 0, unechoed: 0, confirmed: 1, reverifying: 0 } } as unknown as FirstReadPreviewData;

describe("strings", () => {
  it("signed forms", () => {
    expect(LISTING_STRINGS.eyebrow("wineandeggs.com")).toBe("Listed by wineandeggs.com");
    expect(formatListingPrice(22, "USD")).toBe("$22.00");
    expect(formatListingPrice(22, "XYZ")).toBe("22.00 XYZ");
    expect(formatListingPrice(null, "USD")).toBeNull();
    expect(LISTING_STRINGS.body("Cafe Barra Machado de Assis Brazil", "$22.00")).toBe("Cafe Barra Machado de Assis Brazil, $22.00");
  });
});

describe("What stands out — listing member", () => {
  it("(a) listing row, no quote mark, source tag; (c) zero operator nodes by default", () => {
    const { container } = render(<ActFindings read={FINDINGS} />);
    const row = container.querySelector('[data-fr-listing="wineandeggs.com"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("Listed by wineandeggs.com");
    expect(row!.textContent).toContain("Cafe Barra Machado de Assis Brazil, $22.00");
    expect(row!.textContent).not.toContain("“"); // no “
    expect(row!.querySelector(".fr-quote-mark")).toBeNull();
    expect(row!.textContent).toContain(TAG.label);
    expect(container.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
  });
  it("(d) glyph on → Kind · listing on the listing row", () => {
    const { container } = render(withOperator(<ActFindings read={FINDINGS} />));
    const labels = [...container.querySelectorAll('[data-fr-operator="kind-label"]')].map((n) => n.textContent);
    expect(labels).toEqual(["Kind · listing"]);
  });
});

describe("Where you differ — listing observed side", () => {
  it("(b) the echo side renders the listing row in place of the record paragraph; zero operator nodes by default", () => {
    const { container } = render(<ActGap read={GAP} />);
    const row = container.querySelector('[data-fr-listing="wineandeggs.com"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain("Listed by wineandeggs.com");
    expect(row!.textContent).toContain("Cafe Barra Machado de Assis Brazil, $22.00");
    expect(container.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
    // the declared statement is still on screen (the pair is real)
    expect(container.textContent).toContain("Our beans are available at select retailers.");
  });
});
