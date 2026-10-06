// The DETERMINISTIC slot check (R5, signed 2026-10-05) — it runs BEFORE any judge call, so a slot
// that invents a citation or breaks a cap never costs a model call. The rule it enforces is one
// directional: a slot may cite FEWER refs than its source field, never one the source does not hold.
import { describe, it, expect } from "vitest";
import {
  checkSlotsDeterministic, sourceCitationsFor, slotFieldPaths, judgeVisibleFields,
  SLOT_CAPS, SLOT_MIN_CHARS,
} from "../../../supabase/functions/_shared/readSlots";

const PAD = (n: number) => "x".repeat(n);

const strategyRead = {
  where_to_play: "the long full read sentence about where to play",
  where_to_play_citations: ["c1", "c2", "c3"],
  how_to_win: "the long full read sentence about how to win",
  how_to_win_citations: ["c4", "c5"],
};
const okLine = (cits: string[]) => ({ text: `a line of real length ${PAD(10)}`, citations: cits });

describe("checkSlotsDeterministic — strategy", () => {
  it("passes a slot that carries its source citations", () => {
    const v = checkSlotsDeterministic("strategy", {
      where_to_play_line: okLine(["c1", "c2"]),
      how_to_win_line: okLine(["c4"]),
    }, strategyRead);
    expect(v).toEqual([]);
  });

  it("passes a slot that carries FEWER citations than its source (it may say less)", () => {
    const v = checkSlotsDeterministic("strategy", {
      where_to_play_line: okLine([]),
      how_to_win_line: okLine([]),
    }, strategyRead);
    expect(v).toEqual([]);
  });

  it("rejects a citation the source field does not hold", () => {
    const v = checkSlotsDeterministic("strategy", {
      where_to_play_line: okLine(["c1", "c9"]),
      how_to_win_line: okLine(["c4"]),
    }, strategyRead);
    expect(v.map((x) => [x.field, x.kind])).toEqual([["where_to_play_line", "unknown_citation"]]);
  });

  it("rejects a citation borrowed from the OTHER rung — fields do not share citations", () => {
    const v = checkSlotsDeterministic("strategy", {
      where_to_play_line: okLine(["c4"]),   // c4 belongs to how_to_win
      how_to_win_line: okLine(["c4"]),
    }, strategyRead);
    expect(v.map((x) => x.field)).toEqual(["where_to_play_line"]);
    expect(v[0].kind).toBe("unknown_citation");
  });

  it("rejects a line over its cap", () => {
    const over = { text: PAD(SLOT_CAPS.strategy.where_to_play_line + 1), citations: [] };
    const v = checkSlotsDeterministic("strategy", { where_to_play_line: over, how_to_win_line: okLine([]) }, strategyRead);
    expect(v.map((x) => x.kind)).toContain("over_cap");
  });

  it("rejects a fragment under the floor", () => {
    const tiny = { text: PAD(SLOT_MIN_CHARS - 1), citations: [] };
    const v = checkSlotsDeterministic("strategy", { where_to_play_line: tiny, how_to_win_line: okLine([]) }, strategyRead);
    expect(v.map((x) => x.kind)).toContain("under_floor");
  });

  it("rejects empty text", () => {
    const v = checkSlotsDeterministic("strategy", { where_to_play_line: { text: "  ", citations: [] }, how_to_win_line: okLine([]) }, strategyRead);
    expect(v.map((x) => x.kind)).toContain("empty_text");
  });

  it("refuses when the source field is absent — never treats that as no citations required", () => {
    const v = checkSlotsDeterministic("strategy", {
      where_to_play_line: okLine([]), how_to_win_line: okLine([]),
    }, { where_to_play: "only this rung exists", where_to_play_citations: [] });
    expect(v.map((x) => [x.field, x.kind])).toEqual([["how_to_win_line", "missing_source_field"]]);
  });
});

const positioningRead = {
  market_category: "what the business is",
  market_category_citations: ["m1", "m2"],
  unique_attributes: [
    { text: "first differentiator in full", citations: ["a1", "a2"] },
    { text: "second differentiator in full", citations: ["b1"] },
  ],
};

describe("checkSlotsDeterministic — positioning", () => {
  it("passes differentiators that each carry their OWN entry's citations", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [okLine(["a1"]), okLine(["b1"])],
      category_context: okLine(["m1"]),
    }, positioningRead);
    expect(v).toEqual([]);
  });

  it("rejects a differentiator citing a SIBLING entry's citation", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [okLine(["b1"]), okLine(["b1"])],   // index 0 may not cite b1
      category_context: okLine(["m1"]),
    }, positioningRead);
    expect(v.map((x) => x.field)).toEqual(["differentiators[0]"]);
  });

  it("rejects too few differentiators", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [okLine(["a1"])],
      category_context: okLine(["m1"]),
    }, positioningRead);
    expect(v.map((x) => x.kind)).toContain("count_out_of_range");
  });

  it("rejects more differentiators than the read has entries", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [okLine(["a1"]), okLine(["b1"]), okLine([])],
      category_context: okLine(["m1"]),
    }, positioningRead);
    // the third has no source entry to inherit from
    expect(v.map((x) => [x.field, x.kind])).toContainEqual(["differentiators[2]", "missing_source_field"]);
  });
});

describe("sourceCitationsFor", () => {
  it("maps a scalar slot field to its <field>_citations array", () => {
    expect(sourceCitationsFor(strategyRead, "strategy", "where_to_play_line")).toEqual(["c1", "c2", "c3"]);
  });
  it("maps a differentiator to its own array element", () => {
    expect(sourceCitationsFor(positioningRead, "positioning", "differentiators", 1)).toEqual(["b1"]);
  });
  it("returns null for an out-of-range differentiator", () => {
    expect(sourceCitationsFor(positioningRead, "positioning", "differentiators", 5)).toBeNull();
  });
  it("returns null for an unknown slot field", () => {
    expect(sourceCitationsFor(strategyRead, "strategy", "not_a_slot")).toBeNull();
  });
});

describe("slotFieldPaths / judgeVisibleFields", () => {
  it("names one path per slot, in render order", () => {
    expect(slotFieldPaths("positioning", { differentiators: [1, 2] })).toEqual(["differentiators[0]", "differentiators[1]", "category_context"]);
    expect(slotFieldPaths("strategy", {})).toEqual(["where_to_play_line", "how_to_win_line"]);
  });
  it("shows the judge the read's own fields and NOT the raw ledger", () => {
    const v = judgeVisibleFields("strategy", { ...strategyRead, input_ledger: { ids: ["S1"] }, cascade_source: {} });
    expect(Object.keys(v).sort()).toEqual(["how_to_win", "must_have_capabilities", "where_to_play", "winning_aspiration"]);
    expect(JSON.stringify(v)).not.toContain("S1");
  });
});

// ── THE VERBATIM PATH (operator ruling 2026-10-05, fourth set) ──────────────────────────────────
// A positioning differentiator whose SOURCE is <= 140 chars is COPIED, not written: no generator
// call, no judge call. The judge had rejected a generated differentiator for merging two places the
// read keeps apart, and the fix that restored the distinction broke the cap — for that source there
// was no faithful 110-char rewrite. A copy cannot say more than its source.
import {
  VERBATIM_MAX_CHARS, verbatimDifferentiatorIndices, sourceTextFor,
} from "../../../supabase/functions/_shared/readSlots";

const SHORT_A = "x".repeat(133);          // Edgewood's real differentiator lengths
const SHORT_B = "y".repeat(111);
const LONG = "z".repeat(141);             // one over the threshold

describe("verbatimDifferentiatorIndices", () => {
  it("selects every source item at or under the threshold", () => {
    expect(verbatimDifferentiatorIndices({
      unique_attributes: [{ text: SHORT_A }, { text: SHORT_B }],
    })).toEqual([0, 1]);
  });
  it("leaves an over-threshold item to the generator path", () => {
    expect(verbatimDifferentiatorIndices({
      unique_attributes: [{ text: SHORT_A }, { text: LONG }],
    })).toEqual([0]);
  });
  it("is inclusive at exactly the threshold", () => {
    expect(verbatimDifferentiatorIndices({ unique_attributes: [{ text: "q".repeat(VERBATIM_MAX_CHARS) }] })).toEqual([0]);
    expect(verbatimDifferentiatorIndices({ unique_attributes: [{ text: "q".repeat(VERBATIM_MAX_CHARS + 1) }] })).toEqual([]);
  });
  it("skips an empty source item", () => {
    expect(verbatimDifferentiatorIndices({ unique_attributes: [{ text: "   " }, { text: SHORT_B }] })).toEqual([1]);
  });
});

describe("a verbatim slot passes the deterministic gate above the generated cap", () => {
  const payload = {
    market_category: "what the business is", market_category_citations: ["m1"],
    unique_attributes: [{ text: SHORT_A, citations: ["a1"] }, { text: SHORT_B, citations: ["b1"] }],
  };
  it("accepts a 133-char copied line even though the GENERATED cap is 110", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [
        { text: SHORT_A, citations: ["a1"], path: "verbatim" },
        { text: SHORT_B, citations: ["b1"], path: "verbatim" },
      ],
      category_context: { text: "a category context line of real length", citations: ["m1"] },
    }, payload);
    expect(v).toEqual([]);
    expect(SHORT_A.length).toBeGreaterThan(SLOT_CAPS.positioning.differentiators);  // 133 > 110
  });

  it("REFUSES a line that claims verbatim but is not its source — the marker buys nothing", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [
        { text: "x".repeat(130), citations: ["a1"], path: "verbatim" },   // 130 chars, but NOT the source
        { text: SHORT_B, citations: ["b1"], path: "verbatim" },
      ],
      category_context: { text: "a category context line of real length", citations: ["m1"] },
    }, payload);
    expect(v.map((x) => [x.field, x.kind])).toContainEqual(["differentiators[0]", "verbatim_mismatch"]);
  });

  it("still holds a GENERATED line to the 110 cap", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [
        { text: "g".repeat(120), citations: ["a1"], path: "generated" },
        { text: SHORT_B, citations: ["b1"], path: "verbatim" },
      ],
      category_context: { text: "a category context line of real length", citations: ["m1"] },
    }, payload);
    expect(v.map((x) => [x.field, x.kind])).toContainEqual(["differentiators[0]", "over_cap"]);
  });

  it("still refuses a citation the source item does not hold, verbatim or not", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [
        { text: SHORT_A, citations: ["a1", "NOPE"], path: "verbatim" },
        { text: SHORT_B, citations: ["b1"], path: "verbatim" },
      ],
      category_context: { text: "a category context line of real length", citations: ["m1"] },
    }, payload);
    expect(v.map((x) => x.kind)).toContain("unknown_citation");
  });
});

describe("sourceTextFor", () => {
  it("reads an indexed differentiator and a scalar field", () => {
    const payload = { where_to_play: "the rung text", unique_attributes: [{ text: SHORT_A }] };
    expect(sourceTextFor(payload, "strategy", "where_to_play_line")).toBe("the rung text");
    expect(sourceTextFor(payload, "positioning", "differentiators", 0)).toBe(SHORT_A);
    expect(sourceTextFor(payload, "positioning", "differentiators", 9)).toBeNull();
  });
});
