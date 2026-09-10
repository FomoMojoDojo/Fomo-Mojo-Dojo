// "Who you serve" relationship-kind chip restore (2026-08-31) — guards.
// AMENDED Gate 2 (2026-09-10): `funder` now reads "Funder", not "Donor".
//
// WHY THE 08-31 SIGNING CHANGED. The rename existed to give `funder` a warmer word, and on a
// nonprofit it read correctly. On Riverlane it printed DONOR over "Venture capitalists investing in
// quantum technology startups", whose own evidence line says "raised $127M from 12 investors" — the
// generator had no `investor` in its vocabulary and reached for the nearest thing. Gate 2 adds
// `investor` to the vocabulary and stops `funder` claiming to be something it is not. `communicator`
// → "Advocate" is UNCHANGED: that one is a rewording, not a category error.
//
// PLANTED DIFFERENCES (what makes each guard designed-to-fail):
//  - MAP: labels come from the ONE vocabulary authority (_shared/relationshipKinds.ts).
//    communicator→"Advocate" is the surviving rename; funder→"Funder" is the Gate 2 correction.
//    Reverting the map to the 08-31 version renders "Donor" and fails the label assertions.
//  - NOTE: a kind OUTSIDE the known set renders raw-capitalized AND carries the signed
//    NEW_KIND_NOTE. Before Gate 2 the First Read chip capitalized silently, so an emergent word
//    read exactly like house vocabulary. Removing the note fails the note assertions.
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
import {
  KNOWN_RELATIONSHIP_KINDS,
  RELATIONSHIP_KIND_LABELS,
  NEW_KIND_NOTE,
} from "../../../../supabase/functions/_shared/relationshipKinds.ts";
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
    expect(relationshipKindLabel("referrer")).toBe("Referrer");
    expect(relationshipKindLabel("recipient")).toBe("Recipient");
    expect(relationshipKindLabel("partner")).toBe("Partner");
    expect(relationshipKindLabel("buyer")).toBe("Buyer");
    expect(relationshipKindLabel("communicator")).toBe("Advocate");
  });
  // ── Gate 2 — RED ON REVERT ──────────────────────────────────────────────────────────────────────
  it("(g2) funder reads Funder, never Donor — a VC is not a charitable giver", () => {
    expect(relationshipKindLabel("funder")).toBe("Funder");
    expect(relationshipKindLabel("funder")).not.toBe("Donor");
  });
  it("(g2) the kinds that had no label now have one: investor, observer, user", () => {
    expect(relationshipKindLabel("investor")).toBe("Investor");
    expect(relationshipKindLabel("observer")).toBe("Observer");
    expect(relationshipKindLabel("user")).toBe("User");
  });
  it("(g2) every known kind has an EXPLICIT label — none relies on the capitalise fallback", () => {
    for (const kind of KNOWN_RELATIONSHIP_KINDS) {
      expect(RELATIONSHIP_KIND_LABELS, `no explicit label for "${kind}"`).toHaveProperty(kind);
    }
    // The one deliberate non-identity label, still signed.
    expect(relationshipKindLabel("communicator")).toBe("Advocate");
  });
  it("the surviving RENAME never leaks its stored value (the planted difference)", () => {
    expect(relationshipKindLabel("communicator")).not.toBe("Communicator");
  });
  it("unmapped kind → raw value, capitalized", () => {
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
    expect(container.textContent).toContain("Funder");
    expect(container.textContent).not.toContain("Donor"); // Gate 2: the rename is gone
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

  // ── Gate 2 — RED ON REVERT: the emergent-kind note on the FIRST READ chip ──────────────────────
  // competitor (Corestar) and employee (Sonos) are the live off-vocabulary kinds on the fleet today.
  it("(g2) an OFF-VOCABULARY kind renders raw AND carries the signed note", () => {
    for (const kind of ["competitor", "employee"]) {
      const { container } = render(
        <ActWhoYouServe read={readWith([party({ who: "Someone", relationshipKind: kind })])} />,
      );
      expect(container.textContent).toContain(kind.charAt(0).toUpperCase() + kind.slice(1));
      expect(container.textContent).toContain(NEW_KIND_NOTE);
    }
  });
  it("(g2) a KNOWN kind never carries the note — the mark means something", () => {
    for (const kind of ["funder", "investor", "observer", "buyer"]) {
      const { container } = render(
        <ActWhoYouServe read={readWith([party({ who: "Someone", relationshipKind: kind })])} />,
      );
      expect(container.textContent).not.toContain(NEW_KIND_NOTE);
    }
  });
  it("(g2) MOUNT — a funder + observer + competitor beat renders all three, note on one", () => {
    const { container } = render(
      <ActWhoYouServe read={readWith([
        party({ who: "Venture capitalists investing in quantum technology startups", relationshipKind: "funder" }),
        party({ who: "Industry analysts tracking the quantum computing market", relationshipKind: "observer" }),
        party({ who: "Culture consultants needing quantitative behavioral scoring", relationshipKind: "competitor" }),
      ])} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Funder");
    expect(text).toContain("Observer");
    expect(text).toContain("Competitor");
    expect(text).not.toContain("Donor");
    // exactly ONE note — only the off-vocabulary kind earns it
    expect(text.split(NEW_KIND_NOTE).length - 1).toBe(1);
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
