// GATE (2026-08-21): beat 9 "Our read" renders positioning/strategy substance ONLY from a confirmed
// public-only row. CB2's canvas 2486e31f + cascade 1e9d2da3 are UNRESOLVED provenance, so the data
// hook gates them to null and the beat shows signed not-enough-public-information lines. This pins
// the gated render (three exact lines, no "B2C SaaS") and the ungated render (substance, when a row
// with proof is passed directly to the component).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActOurRead } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const POS = "Not enough public information to read positioning.";
const STRAT = "Not enough public information to read strategy.";
const PROM = "Not enough information to create promise.";

const gated = (): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Cafe Barra", website: null },
  positioning: null, // data hook gated these to null (unresolved provenance)
  strategy: null,
  promise: null,
});

describe("beat 9 Our read — provenance gate", () => {
  it("GATED: exactly the three signed lines; no leaked substance (no 'B2C SaaS')", () => {
    const { container } = render(<ActOurRead read={gated()} />);
    const text = container.textContent ?? "";
    expect(text).toContain(POS);
    expect(text).toContain(STRAT);
    expect(text).toContain(PROM);
    // the unresolved canvas's wrong category must never reach the public surface
    expect(text).not.toContain("B2C SaaS");
    expect(text).not.toContain("SaaS");
    // no source tags on the gated lines
    expect(text).not.toContain("Source:");
  });

  it("UNGATED: a row with proof (passed directly) renders positioning + strategy substance", () => {
    const proven: FirstReadPreviewData = {
      ...EMPTY_FIRST_READ,
      company: { name: "Co", website: null },
      positioning: { category: "Specialty coffee roaster", value: "Small-batch, roasted to order.", differentiators: ["single-origin"], sourceTag: { label: "Public read · June 11, 2026" } },
      strategy: { aspiration: "Be the preferred local roaster.", whereToPlay: "Burbank + LA", howToWin: "Quality + freshness", sourceTag: { label: "Public read · June 11, 2026" } },
      promise: { text: "Coffee worth slowing down for.", sourceTag: { label: "Public read · June 11, 2026" } },
    };
    const { container } = render(<ActOurRead read={proven} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Specialty coffee roaster");
    expect(text).toContain("Be the preferred local roaster.");
    expect(text).toContain("Coffee worth slowing down for.");
    expect(text).not.toContain(POS);
    expect(text).not.toContain(STRAT);
  });

  it("PER-KIND: positioning present, strategy + promise absent → positioning substance + the other two signed lines", () => {
    // GATE 6a: each kind renders from its OWN public_reads row independently. A company can have a
    // confirmed positioning read while strategy/promise have none — the beat mixes substance + signed.
    const mixed: FirstReadPreviewData = {
      ...EMPTY_FIRST_READ,
      company: { name: "Co", website: null },
      positioning: { category: "Neighborhood cafe & roaster", value: "Coffee and pastries made on site.", differentiators: ["in-house roasting"], sourceTag: { label: "Public read · June 11, 2026" } },
      strategy: null,
      promise: null,
    };
    const { container } = render(<ActOurRead read={mixed} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Neighborhood cafe & roaster");
    expect(text).toContain("Source:"); // positioning's tag
    expect(text).toContain(STRAT); // strategy still gated
    expect(text).toContain(PROM); // promise still gated
    expect(text).not.toContain(POS); // positioning is NOT gated
  });
});
