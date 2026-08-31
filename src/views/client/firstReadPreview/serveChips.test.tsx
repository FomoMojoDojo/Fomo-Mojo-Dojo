// "Who you serve" relationship-kind chip restore (2026-08-31) — guards.
//
// PLANTED DIFFERENCES (what makes each guard designed-to-fail):
//  - MAP: the operator-signed display map renames two stored kinds (funder→"Donor",
//    communicator→"Advocate"). A reverted or identity map renders "Funder"/"Communicator"
//    instead — the label assertions below fail on exactly that.
//  - FILTER: the chip's data must ride the ONE register-filtered odi_market_definitions
//    query. The source guard asserts relationship_kind appears in a select that is followed
//    by the register .in(...) filter, and that the file still contains exactly ONE
//    odi_market_definitions read. A second/unfiltered read (or moving relationship_kind out
//    of the filtered select) fails it.
//  - NULL: a null kind must render NO chip (silent) — asserted by absence.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ActWhoYouServe, relationshipKindLabel } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRMarketDef } from "./types";

const party = (over: Partial<FRMarketDef>): FRMarketDef => ({
  id: Math.random().toString(36).slice(2),
  who: "Someone served",
  job: null,
  relationshipKind: null,
  sourceTag: { label: "Public read · Aug 31, 2026" },
  ...over,
});

const readWith = (markets: FRMarketDef[]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: "https://co.com" },
  observedMarkets: markets,
});

describe("display map — operator-signed labels (revert of the map fails here)", () => {
  it("maps every signed kind to its signed label", () => {
    expect(relationshipKindLabel("funder")).toBe("Donor");
    expect(relationshipKindLabel("referrer")).toBe("Referrer");
    expect(relationshipKindLabel("recipient")).toBe("Recipient");
    expect(relationshipKindLabel("partner")).toBe("Partner");
    expect(relationshipKindLabel("buyer")).toBe("Buyer");
    expect(relationshipKindLabel("communicator")).toBe("Advocate");
  });
  it("the two RENAMED kinds never leak their stored value (the planted difference)", () => {
    expect(relationshipKindLabel("funder")).not.toBe("Funder");
    expect(relationshipKindLabel("communicator")).not.toBe("Communicator");
  });
  it("unmapped kind → raw value, capitalized", () => {
    expect(relationshipKindLabel("user")).toBe("User");
    expect(relationshipKindLabel("distributor")).toBe("Distributor");
  });
  it("null/empty → null (no chip)", () => {
    expect(relationshipKindLabel(null)).toBeNull();
    expect(relationshipKindLabel("")).toBeNull();
    expect(relationshipKindLabel("  ")).toBeNull();
  });
});

describe("render — one chip per card where earned; null silent", () => {
  it("renders the mapped chip label on the card", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith([party({ who: "Philanthropic orgs", relationshipKind: "funder" })])} />,
    );
    expect(container.textContent).toContain("Donor");
    expect(container.textContent).not.toContain("Funder"); // renamed, never raw
  });
  it("null kind → NO chip markup for that card (silent)", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith([party({ who: "Kindless party", relationshipKind: null })])} />,
    );
    // the neutral chip idiom renders a rounded-full uppercase span — none must exist
    expect(container.querySelector("span.rounded-full")).toBeNull();
  });
  it("unmapped kind renders capitalized raw", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith([party({ relationshipKind: "distributor" })])} />,
    );
    expect(container.textContent).toContain("Distributor");
  });
});

describe("source guard — the chip reads ONLY the register-filtered query", () => {
  const src = readFileSync(resolve(process.cwd(), "src/views/client/firstReadPreview/useFirstReadPreviewData.ts"), "utf8");
  it("exactly ONE odi_market_definitions read exists in the data hook", () => {
    expect(src.split('.from("odi_market_definitions")').length - 1).toBe(1);
  });
  it("relationship_kind is selected inside that read, and the register filter follows it", () => {
    const at = src.indexOf('.from("odi_market_definitions")');
    expect(at).toBeGreaterThan(-1);
    const stmt = src.slice(at, at + 400);
    expect(stmt).toContain("relationship_kind");
    expect(stmt).toContain('.in("market_register", ["public_inferred", "publicly_declared"])');
  });
  it("acts.tsx introduces no odi_market_definitions read of its own", () => {
    const acts = readFileSync(resolve(process.cwd(), "src/views/client/firstReadPreview/acts.tsx"), "utf8");
    expect(acts.includes("odi_market_definitions")).toBe(false);
  });
});
