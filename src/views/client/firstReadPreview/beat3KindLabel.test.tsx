// OPERATOR KIND LABEL (operator ruling 2026-09-04, strings signed): behind the glyph toggle, EVERY own-words row and
// EVERY channel row carries one "Kind · …" line; the default (client) render carries none. Byte-exact forms:
// "Kind · offer" (no reason), "Kind · instruction · usage copy" (audited reason), "Kind · untyped" (NULL kind).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ActWhatYouSay } from "./acts";
import { OperatorControlsContext } from "./operatorControls";
import { operatorKindLabel } from "./operatorStrings";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const READ: FirstReadPreviewData = {
  ...EMPTY_FIRST_READ, company: { name: "Co", website: "https://cafebarra.com" }, ownWordsLooked: true, ownWordsRun: true,
  ownWords: [
    { id: "o1", quote: "This is the Barra Method.", pageUrl: "https://cafebarra.com/", pageHost: "cafebarra.com", fidelity: "verbatim", sourceTag: { label: "cafebarra.com · read September 3, 2026" }, kind: "positioning", declaredEligible: true, reason: "why choose us" },
    { id: "o2", quote: "We roast to order", pageUrl: "https://cafebarra.com/", pageHost: "cafebarra.com", fidelity: "paraphrased", sourceTag: { label: "cafebarra.com · read September 3, 2026" }, kind: null, declaredEligible: true, reason: null },
  ],
  declared: [
    { id: "d1", topic: "market", facet: "Market", statement: "Cafe Barra Pour-Over packs let you take coffee anywhere.", sourceTag: { label: "cafebarra.com · read September 3, 2026" }, kind: "offer", declaredEligible: true, reason: null },
    { id: "d2", topic: "market", facet: "Market", statement: "Just add hot water.", sourceTag: { label: "cafebarra.com · read September 3, 2026" }, kind: "instruction", declaredEligible: false, reason: "usage copy" },
  ],
};
const withOperator = (ui: React.ReactElement) => <OperatorControlsContext.Provider value={{ decide: async () => {} }}>{ui}</OperatorControlsContext.Provider>;
const SEL = '[data-fr-operator="kind-label"]';

describe("operatorKindLabel — signed forms", () => {
  it("byte-exact", () => {
    expect(operatorKindLabel("offer", null)).toBe("Kind · offer");
    expect(operatorKindLabel("instruction", "usage copy")).toBe("Kind · instruction · usage copy");
    expect(operatorKindLabel(null, null)).toBe("Kind · untyped");
    expect(operatorKindLabel(null, "stray reason")).toBe("Kind · untyped · stray reason");
  });
});

describe("kind label renders behind the glyph only", () => {
  it("default render: zero kind labels, zero operator nodes", () => {
    const { container } = render(<ActWhatYouSay read={READ} />);
    expect(container.querySelectorAll(SEL)).toHaveLength(0);
    expect(container.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
    expect(container.textContent).not.toContain("Kind ·");
  });
  it("operator on: one label per own-words row and per channel row, in the row's tag line", () => {
    const { container } = render(withOperator(<ActWhatYouSay read={READ} />));
    const labels = [...container.querySelectorAll(SEL)].map((n) => n.textContent);
    expect(labels).toEqual(["Kind · positioning · why choose us", "Kind · untyped", "Kind · offer", "Kind · instruction · usage copy"]);
    // every label sits inside a .fr-row (the row's tag line), never floating
    for (const n of container.querySelectorAll(SEL)) expect(n.closest(".fr-row")).not.toBeNull();
  });
});
