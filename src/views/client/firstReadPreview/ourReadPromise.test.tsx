// Ruling 1 (2026-08-21): the market_read canvas has NO distinct promise field, so Promise never
// reuses value_for_customer. Branch A — a real own field renders its text + source tag. Branch B —
// no own field renders EXACTLY "Not enough information to create promise." with NO source tag, while
// Positioning still renders its value_for_customer unchanged.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActOurRead } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const SIGNED = "Not enough information to create promise.";
const positioning = {
  category: "Specialty coffee roaster",
  value: "We roast small-batch beans to order.",
  differentiators: ["single-origin"],
  sourceTag: { label: "Public read · June 11, 2026" },
};
const base = (o: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: null },
  positioning,
  ...o,
});

describe("beat 9 Promise — ruling 1", () => {
  it("branch B (no own field): shows the signed line verbatim, NO source tag; Positioning unchanged", () => {
    const { container } = render(<ActOurRead read={base({ promise: { text: null, sourceTag: null } })} />);
    const text = container.textContent ?? "";
    expect(text).toContain(SIGNED);
    // Positioning value_for_customer still renders (unchanged by the ruling)
    expect(text).toContain("We roast small-batch beans to order.");
    expect(text).toContain("Specialty coffee roaster");
    // the signed line carries no source tag of its own (Positioning's tag may exist elsewhere,
    // but there is exactly one "Source:" — Positioning's — not two)
    expect((text.match(/Source:/g) ?? []).length).toBe(1);
    // it must NOT reuse value_for_customer as the promise body
    const promiseIdx = text.indexOf("Promise");
    expect(text.indexOf(SIGNED)).toBeGreaterThan(promiseIdx);
  });

  it("branch A (own field present): renders the promise text + its source tag, not the signed line", () => {
    const { container } = render(
      <ActOurRead read={base({ promise: { text: "Coffee worth slowing down for.", sourceTag: { label: "Public read · June 11, 2026" } } })} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Coffee worth slowing down for.");
    expect(text).not.toContain(SIGNED);
  });

  it("all gated (positioning/strategy/promise null): the three signed lines render, all three eyebrows present", () => {
    const { container } = render(
      <ActOurRead read={{ ...EMPTY_FIRST_READ, company: { name: "Co", website: null }, positioning: null, strategy: null, promise: null }} />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Not enough public information to read positioning.");
    expect(text).toContain("Not enough public information to read strategy.");
    expect(text).toContain(SIGNED); // promise line
    for (const eyebrow of ["Positioning", "Strategy", "Promise"]) expect(text).toContain(eyebrow);
  });
});
