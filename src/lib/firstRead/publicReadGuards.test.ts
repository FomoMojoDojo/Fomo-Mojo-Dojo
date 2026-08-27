// Gate 6a — the three public-read birth-guard vacuous-proofs (both directions). Each MUST fail if its
// guard is reverted. The module lives under supabase/functions/_shared (edge-mounted, pure); this test
// lives under src/** so the vitest suite (include: src/**) runs it.
import { describe, expect, it } from "vitest";
import {
  citationsLivePublic,
  framingViolations,
  unknownCitationRefs,
} from "../../../supabase/functions/_shared/publicReadGuards.ts";

// A clean, correctly-framed set of posits (hypothesis language, cited by ref token).
const CLEAN = {
  positioning: { market_category: "neighborhood specialty coffee roaster", market_category_citations: ["F1"], unique_attributes: [{ text: "small-batch, roaster-origin", citations: ["F2"] }] },
  strategy: { winning_aspiration: "the go-to Burbank roaster", where_to_play: "café partnership + DTC", how_to_win: "quality and provenance", how_to_win_citations: ["S1"] },
  promise: { promise: "small-batch, roaster-origin coffee", citations: ["O1"] },
};

describe("6a proof 1 — FRAMING GATE rejects verdict / UNDERSERVED vocabulary", () => {
  it("flags a planted UNDERSERVED posit (deterministically, independent of the judge)", () => {
    const bad = { ...CLEAN, positioning: { market_category: "the market is UNDERSERVED and ripe", market_category_citations: ["F1"] } };
    const v = framingViolations(bad);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].word).toBe("underserved");
  });
  it("flags each verdict-family word, case-insensitively", () => {
    for (const w of ["verdict", "Confirmed", "CONTRADICTED", "proven", "definitively", "certainly", "echoed", "unspoken"]) {
      expect(framingViolations({ promise: { promise: `this is ${w} by the record` } }).length).toBe(1);
    }
  });
  it("passes clean hypothesis posits — and does NOT false-positive on sub-word matches", () => {
    expect(framingViolations(CLEAN)).toEqual([]);
    // whole-word only: "reconfirmed" / "unproven" must NOT trip \bconfirmed\b / \bproven\b
    expect(framingViolations({ promise: { promise: "the partnership was reconfirmed" } })).toEqual([]);
  });
  it("ignores citation arrays — forbidden tokens there are ids, not prose", () => {
    expect(framingViolations({ positioning: { value_citations: ["proven", "verdict"] } })).toEqual([]);
  });
});

describe("6a proof 2 — CITATION GATE rejects a ref outside the ledger", () => {
  const valid = new Set(["S1", "F1", "F2", "O1"]);
  it("returns the bad ref when a posit cites outside the ledger", () => {
    const bad = { ...CLEAN, promise: { promise: "x", citations: ["O1", "Z9"] } };
    expect(unknownCitationRefs(bad, valid)).toEqual(["Z9"]);
  });
  it("returns none when every ref is a valid ledger token", () => {
    expect(unknownCitationRefs(CLEAN, valid)).toEqual([]);
  });
});

describe("6a proof 3 — LIVE+PUBLIC-AT-MINT GATE rejects non-public or non-live citations", () => {
  it("flags a non-public cited id", () => {
    const r = citationsLivePublic(["a", "b"], { a: "public_observed", b: "internal_declared" }, { a: "live", b: "live" });
    expect(r.ok).toBe(false);
    expect(r.bad).toEqual(["b"]);
  });
  it("flags a non-live (provisional/held) cited id", () => {
    const r = citationsLivePublic(["a"], { a: "public_observed" }, { a: "provisional" });
    expect(r.ok).toBe(false);
    expect(r.bad).toEqual(["a"]);
  });
  it("passes when every cited id is live + public", () => {
    const r = citationsLivePublic(["a", "b"], { a: "public_observed", b: "public_inferred" }, { a: "live", b: "live" });
    expect(r.ok).toBe(true);
    expect(r.bad).toEqual([]);
  });
});
