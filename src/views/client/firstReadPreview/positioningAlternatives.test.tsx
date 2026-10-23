// Rulings 20 + 49 (2026-10-22): beat 09 renders each alternative the record names in the signed string, with the cited
// row's venue line beneath; an empty alternatives field asks the signed open question; a read written before ruling 15
// (no `alternatives` key) renders exactly as before.
//   P49-R  the render drops the venue line → the alternative renders with no source beneath it → RED
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActPositioning } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const CLAUSE = "The two primary competitive threats to Charter's broadband business are fiber overbuilders and wireless FWA";
const base = {
  category: "broadband, TV, and mobile service provider",
  value: "reliable and affordable services plus 24/7 customer service",
  differentiators: ["the nation's fastest-growing mobile provider"],
  sourceTag: { label: "Public read · October 22, 2026" },
};
const read = (extra: Record<string, unknown>): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Spectrum", website: "https://www.spectrum.com/" },
  positioning: { ...base, ...extra } as FirstReadPreviewData["positioning"],
});
const SOURCE = { cls: "record" as const, sources: [{ host: "nazymaltbridge.substack.com", published: "2026", cls: "record" as const }] };

describe("beat 09 — the alternatives (rulings 20, 49)", () => {
  it("each alternative in the signed string, its venue line directly beneath (P49-R)", () => {
    const { getByTestId } = render(<ActPositioning read={read({ alternatives: [{ name: "fiber overbuilders and wireless FWA", text: CLAUSE, source: SOURCE }], alternativesGap: false })} />);
    const block = getByTestId("positioning-alternatives").textContent ?? "";
    // ruling 54: the clause in curly quotes (the quote plant P54 removes them → RED)
    expect(block).toContain(`Your customers could choose fiber overbuilders and wireless FWA instead — \u201c${CLAUSE}\u201d`);
    expect(block).toContain("In the record · nazymaltbridge.substack.com · 2026");
    expect(block.indexOf("In the record")).toBeGreaterThan(block.indexOf(CLAUSE));
  });
  it("an empty field asks the signed open question, and names no alternative", () => {
    const { getByTestId, container } = render(<ActPositioning read={read({ alternatives: [], alternativesGap: true })} />);
    expect(getByTestId("positioning-alternative-gap").textContent).toBe("When customers choose you, what are they choosing you over?");
    expect(container.textContent).not.toContain("Your customers could choose");
  });
  it("a read written before ruling 15 (no alternatives key) renders neither", () => {
    const { container, queryByTestId } = render(<ActPositioning read={read({})} />);
    expect(queryByTestId("positioning-alternatives")).toBeNull();
    expect(queryByTestId("positioning-alternative-gap")).toBeNull();
    expect(container.textContent).not.toContain("choosing you over");
  });
});
