// DISPLAY CASING (operator ruling 2026-10-05): a slot line is capitalised at RENDER. The stored text
// stays byte-identical to its source read — that is what makes a verbatim differentiator verbatim,
// and what the deterministic verbatim_mismatch check compares. So this pins both halves:
//   * the screen shows a capitalised line
//   * nothing in the render path mutates the data it was handed
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActPositioning, ActStrategy } from "./acts";
import { EMPTY_FIRST_READ } from "./types";
import { checkSlotsDeterministic } from "../../../../supabase/functions/_shared/readSlots";

// lower-case first character, exactly as the reads store them
const D1 = "only youth-under-12 Crisis Stabilization Unit (CSU) in the Bay Area";
const D2 = "nationally pioneering kinship program with over 90% retention";
const CAT = "nonprofit youth mental healthcare provider";
const WTP = "San Francisco and San Mateo counties focusing on youth ages 3-25";
const HTW = "the only youth-under-12 CSU and level 14 residential facility";

const posRead = {
  ...EMPTY_FIRST_READ,
  positioning: { category: "a category", value: "a value", differentiators: [], sourceTag: { label: "Public read" } },
  positioningSlots: {
    differentiators: [{ text: D1, citations: [] }, { text: D2, citations: [] }],
    categoryContext: { text: CAT, citations: [] },
  },
};
const strRead = {
  ...EMPTY_FIRST_READ,
  strategy: { aspiration: "an aspiration", whereToPlay: "a where", howToWin: "a how", sourceTag: { label: "Public read" } },
  strategySlots: { whereToPlayLine: { text: WTP, citations: [] }, howToWinLine: { text: HTW, citations: [] } },
};

describe("slot lines are capitalised on screen", () => {
  it("positioning capitalises each differentiator and the category context", () => {
    render(<ActPositioning read={posRead as never} />);
    expect(screen.getByText(/^Only youth-under-12 Crisis Stabilization Unit/)).toBeTruthy();
    expect(screen.getByText(/^Nationally pioneering kinship program/)).toBeTruthy();
    expect(screen.getByText(/^Nonprofit youth mental healthcare provider/)).toBeTruthy();
  });

  it("strategy capitalises both rung lines", () => {
    render(<ActStrategy read={strRead as never} />);
    expect(screen.getByText(/^San Francisco and San Mateo counties/)).toBeTruthy();
    expect(screen.getByText(/^The only youth-under-12 CSU/)).toBeTruthy();
  });
});

describe("display casing never alters the stored text", () => {
  it("the data handed to the render is unchanged after rendering", () => {
    const before = JSON.stringify(posRead.positioningSlots);
    render(<ActPositioning read={posRead as never} />);
    expect(JSON.stringify(posRead.positioningSlots)).toBe(before);
    // still the raw lower-case source text, not the displayed form
    expect(posRead.positioningSlots.differentiators[0].text).toBe(D1);
    expect(posRead.positioningSlots.categoryContext.text).toBe(CAT);
  });

  it("the strategy slots are unchanged after rendering", () => {
    const before = JSON.stringify(strRead.strategySlots);
    render(<ActStrategy read={strRead as never} />);
    expect(JSON.stringify(strRead.strategySlots)).toBe(before);
    expect(strRead.strategySlots.whereToPlayLine.text).toBe(WTP);
  });

  it("a stored verbatim line still passes verbatim_mismatch — casing is display-only", () => {
    // the stored text must equal the SOURCE exactly; a capitalised stored line would fail here,
    // which is the regression this guards against.
    const payload = { unique_attributes: [{ text: D1, citations: ["a1"] }, { text: D2, citations: ["b1"] }], market_category: CAT, market_category_citations: ["m1"] };
    const stored = {
      differentiators: [
        { text: D1, citations: ["a1"], path: "verbatim" },
        { text: D2, citations: ["b1"], path: "verbatim" },
      ],
      category_context: { text: CAT, citations: ["m1"] },
    };
    expect(checkSlotsDeterministic("positioning", stored, payload)).toEqual([]);

    // and the capitalised form — what the screen shows — would NOT be accepted as stored text
    const capitalised = {
      ...stored,
      differentiators: [{ text: D1.charAt(0).toUpperCase() + D1.slice(1), citations: ["a1"], path: "verbatim" }, stored.differentiators[1]],
    };
    expect(checkSlotsDeterministic("positioning", capitalised, payload).map((v) => v.kind)).toContain("verbatim_mismatch");
  });
});
