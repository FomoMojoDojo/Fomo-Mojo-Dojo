// OWN-WORDS ADMISSION — render guards (operator ruling 2026-09-03). Under "In your words":
//   (a) a slogan (kept as record, client-visible) renders by default; an instruction (record only) does NOT,
//       and there is no operator node;
//   (b) under the operator context the record-only block renders with the instruction and its kind;
//   (c) the block's eyebrow is the single-homed proposed string.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { ActWhatYouSay } from "./acts";
import { OperatorControlsContext } from "./operatorControls";
import { OPERATOR_STRINGS } from "./operatorStrings";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FROwnWord } from "./types";

const w = (id: string, quote: string, kind: string, declaredEligible: boolean): FROwnWord => ({
  id, quote, pageUrl: "https://www.cafebarra.com/home", pageHost: "cafebarra.com", fidelity: "verbatim",
  sourceTag: { label: "cafebarra.com · read August 26, 2026" }, kind, declaredEligible,
});
const READ: FirstReadPreviewData = {
  ...EMPTY_FIRST_READ,
  company: { name: "Cafe Barra 2", website: "https://cafebarra.com" },
  ownWordsLooked: true,
  ownWords: [w("pos", "We roast for cafés that want a partner, not a vendor.", "positioning", true), w("slogan", "Science meets art meets commitment.", "slogan", false)],
  ownWordsRecordOnly: [w("instr", "Just add hot water.", "instruction", false)],
};

describe("(a) default: slogan visible as record, instruction absent, zero operator nodes", () => {
  it("renders the positioning claim and the slogan; not the instruction", () => {
    const { container } = render(<ActWhatYouSay read={READ} />);
    expect(container.textContent).toContain("We roast for cafés that want a partner, not a vendor.");
    expect(container.textContent).toContain("Science meets art meets commitment.");
    expect(container.textContent).not.toContain("Just add hot water.");
    expect(container.querySelectorAll("[data-fr-operator]")).toHaveLength(0);
  });
});

describe("(b) operator context: the record-only block renders with the kind", () => {
  it("block present, instruction inside it with 'Kind · instruction'; the block is not a client row", () => {
    const { container } = render(
      <OperatorControlsContext.Provider value={{ decide: vi.fn(async () => {}) }}>
        <ActWhatYouSay read={READ} />
      </OperatorControlsContext.Provider>,
    );
    const block = container.querySelector('[data-fr-operator="record-only"]')!;
    expect(block).not.toBeNull();
    expect(block.querySelector('[data-fr-record-only="instr"]')).not.toBeNull();
    expect(block.textContent).toContain("Just add hot water.");
    expect(block.textContent).toContain(`${OPERATOR_STRINGS.kindPrefix}instruction`);
    expect(block.querySelector(".fr-eyebrow")!.textContent).toBe(OPERATOR_STRINGS.recordOnlyEyebrow);
    expect(block.querySelectorAll(".fr-row")).toHaveLength(0);
  });
  it("empty record-only list ⇒ no block even under the context", () => {
    const { container } = render(
      <OperatorControlsContext.Provider value={{ decide: vi.fn(async () => {}) }}>
        <ActWhatYouSay read={{ ...READ, ownWordsRecordOnly: [] }} />
      </OperatorControlsContext.Provider>,
    );
    expect(container.querySelector('[data-fr-operator="record-only"]')).toBeNull();
  });
});
