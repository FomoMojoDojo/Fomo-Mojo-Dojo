// 1a-4 (signed 2026-10-07) — SOURCE CLASS on a slot line.
//
// A slot inherits its source field's class and may never claim a STRONGER one. This is the class twin
// of the citation rule: a slot may say LESS than its source (a weaker class, or none), never more.
// Rulings 3A and 3B were refused, so there is NO deterministic phrase list and NO question form here —
// the WORDING is a judge judgment. What is deterministic is only the class comparison.
import { describe, it, expect } from "vitest";
import {
  attachSourceClasses, checkSlotsDeterministic, slotClassStrongerThan, sourceClassFor,
} from "../../../supabase/functions/_shared/readSlots";
import { slotAccepted } from "../../../supabase/functions/_shared/readSlotsRun";

const LINE = "a line comfortably over the twenty-four character floor";

// a positioning read carrying classes: the first attribute is OURS, the second is the record's
const positioningRead = {
  market_category: "a plain category",
  market_category_citations: ["S1"],
  market_category_class: "record",
  unique_attributes: [
    { text: "the sole level 14 facility in Northern California", citations: ["F1"], class: "our_read" },
    { text: "accepts Kaiser and most private insurance", citations: ["S1"], class: "record" },
  ],
};
const strategyRead = {
  where_to_play: "the arena the record implies",
  where_to_play_citations: ["S1"],
  where_to_play_class: "record",
  how_to_win: "the edge we read in the record",
  how_to_win_citations: ["F1", "S1"],
  how_to_win_class: "our_read",            // weakest-wins: one finding citation makes it ours
};

describe("slotClassStrongerThan", () => {
  it("orders our_read < you < record", () => {
    expect(slotClassStrongerThan("record", "our_read")).toBe(true);
    expect(slotClassStrongerThan("you", "our_read")).toBe(true);
    expect(slotClassStrongerThan("record", "you")).toBe(true);
    expect(slotClassStrongerThan("our_read", "record")).toBe(false);
    expect(slotClassStrongerThan("record", "record")).toBe(false);
  });
});

describe("sourceClassFor", () => {
  it("reads a scalar field's <field>_class and an array element's own class", () => {
    expect(sourceClassFor(strategyRead, "strategy", "how_to_win_line")).toBe("our_read");
    expect(sourceClassFor(strategyRead, "strategy", "where_to_play_line")).toBe("record");
    expect(sourceClassFor(positioningRead, "positioning", "differentiators", 0)).toBe("our_read");
    expect(sourceClassFor(positioningRead, "positioning", "differentiators", 1)).toBe("record");
    expect(sourceClassFor(positioningRead, "positioning", "category_context")).toBe("record");
  });
  it("returns null when the read carries no class (written before 1a-4) — nothing to compare", () => {
    expect(sourceClassFor({ how_to_win: "x", how_to_win_citations: ["S1"] }, "strategy", "how_to_win_line")).toBeNull();
    expect(sourceClassFor({ unique_attributes: [{ text: "x", citations: [] }] }, "positioning", "differentiators", 0)).toBeNull();
  });
});

describe("checkSlotsDeterministic — class_stronger_than_source", () => {
  it("REFUSES a slot that claims a stronger class than its source field", () => {
    const v = checkSlotsDeterministic("strategy", {
      where_to_play_line: { text: LINE, citations: ["S1"], source_class: "record" },
      how_to_win_line: { text: LINE, citations: ["F1"], source_class: "record" },   // source is our_read
    }, strategyRead);
    const hit = v.filter((x) => x.kind === "class_stronger_than_source");
    expect(hit).toHaveLength(1);
    expect(hit[0].field).toBe("how_to_win_line");
    expect(hit[0].detail).toContain("'record' asserts more than its source field's 'our_read'");
  });

  it("ADMITS a slot that inherits its source class exactly, or a weaker one, or none", () => {
    const exact = checkSlotsDeterministic("strategy", {
      where_to_play_line: { text: LINE, citations: ["S1"], source_class: "record" },
      how_to_win_line: { text: LINE, citations: ["F1"], source_class: "our_read" },
    }, strategyRead);
    expect(exact.filter((x) => x.kind === "class_stronger_than_source")).toHaveLength(0);

    const weaker = checkSlotsDeterministic("strategy", {
      where_to_play_line: { text: LINE, citations: ["S1"], source_class: "our_read" },  // weaker than record
      how_to_win_line: { text: LINE, citations: ["F1"], source_class: "our_read" },
    }, strategyRead);
    expect(weaker.filter((x) => x.kind === "class_stronger_than_source")).toHaveLength(0);

    const none = checkSlotsDeterministic("strategy", {
      where_to_play_line: { text: LINE, citations: ["S1"] },
      how_to_win_line: { text: LINE, citations: ["F1"] },
    }, strategyRead);
    expect(none.filter((x) => x.kind === "class_stronger_than_source")).toHaveLength(0);
  });

  it("refuses a stronger class per differentiator, not per field", () => {
    const v = checkSlotsDeterministic("positioning", {
      differentiators: [
        { text: LINE, citations: ["F1"], source_class: "record" },   // source[0] is our_read → refuse
        { text: LINE, citations: ["S1"], source_class: "record" },   // source[1] is record    → fine
      ],
      category_context: { text: LINE, citations: ["S1"], source_class: "record" },
    }, positioningRead);
    const hit = v.filter((x) => x.kind === "class_stronger_than_source");
    expect(hit).toHaveLength(1);
    expect(hit[0].field).toBe("differentiators[0]");
  });

  it("says nothing about class when the source read predates 1a-4", () => {
    const legacy = { how_to_win: "x", how_to_win_citations: ["S1"], where_to_play: "y", where_to_play_citations: ["S1"] };
    const v = checkSlotsDeterministic("strategy", {
      where_to_play_line: { text: LINE, citations: ["S1"], source_class: "record" },
      how_to_win_line: { text: LINE, citations: ["S1"], source_class: "record" },
    }, legacy);
    expect(v.filter((x) => x.kind === "class_stronger_than_source")).toHaveLength(0);
  });
});

describe("attachSourceClasses — the class is computed, never model-set", () => {
  it("attaches each line's inherited class and OVERWRITES anything the model volunteered", () => {
    const out = attachSourceClasses("strategy", {
      where_to_play_line: { text: LINE, citations: ["S1"], source_class: "record" },
      how_to_win_line: { text: LINE, citations: ["F1"], source_class: "record" },  // model lied
    }, strategyRead);
    expect((out.how_to_win_line as { source_class: string }).source_class).toBe("our_read");
    expect((out.where_to_play_line as { source_class: string }).source_class).toBe("record");
  });
  it("attaches per differentiator, and leaves a line unclassed when the read has no class to give", () => {
    const out = attachSourceClasses("positioning", {
      differentiators: [{ text: LINE, citations: ["F1"] }, { text: LINE, citations: ["S1"] }],
      category_context: { text: LINE, citations: ["S1"] },
    }, positioningRead);
    const d = out.differentiators as Array<{ source_class?: string }>;
    expect(d[0].source_class).toBe("our_read");
    expect(d[1].source_class).toBe("record");

    const legacy = attachSourceClasses("strategy", {
      where_to_play_line: { text: LINE, citations: ["S1"] },
      how_to_win_line: { text: LINE, citations: ["S1"] },
    }, { how_to_win: "x", how_to_win_citations: ["S1"], where_to_play: "y", where_to_play_citations: ["S1"] });
    expect((legacy.how_to_win_line as { source_class?: string }).source_class).toBeUndefined();
  });
  it("is a copy — the input object is not mutated", () => {
    const input = { where_to_play_line: { text: LINE, citations: ["S1"] }, how_to_win_line: { text: LINE, citations: ["F1"] } };
    attachSourceClasses("strategy", input, strategyRead);
    expect((input.how_to_win_line as { source_class?: string }).source_class).toBeUndefined();
  });
});

describe("slotAccepted — class_ok is required, fail-closed", () => {
  const base = { entailed: true, vocab_ok: true, accept: true };
  it("refuses a verdict that omits class_ok", () => {
    expect(slotAccepted("strategy", "how_to_win_line", base)).toBe(false);
  });
  it("refuses class_ok false and accepts class_ok true", () => {
    expect(slotAccepted("strategy", "how_to_win_line", { ...base, class_ok: false })).toBe(false);
    expect(slotAccepted("strategy", "how_to_win_line", { ...base, class_ok: true })).toBe(true);
  });
  it("still requires category sanity on the positioning category line", () => {
    expect(slotAccepted("positioning", "category_context", { ...base, class_ok: true })).toBe(false);
    expect(slotAccepted("positioning", "category_context", { ...base, class_ok: true, category_sanity_ok: true })).toBe(true);
  });
});
