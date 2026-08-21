// A1 (2026-08-20): beat 4 orders by discussability — contradicted → unechoed → confirmed —
// and by evidence strength (desc) within each category. Falsification: dropping either sort key
// changes the order.
import { describe, it, expect } from "vitest";
import { orderGapPairs, GAP_VERDICT_ORDER } from "./mapping";

const p = (id: string, verdict: string, evidenceRank: number) => ({ id, verdict, evidenceRank });

// A deliberately scrambled input covering every category + mixed strengths.
const SCRAMBLED = [
  p("conf-weak", "confirmed", 1),
  p("contr-strong", "contradicted", 3),
  p("unech-mid", "unechoed", 2),
  p("conf-strong", "confirmed", 3),
  p("contr-weak", "contradicted", 1),
  p("unech-strong", "unechoed", 3),
];

describe("A1 — orderGapPairs by discussability then strength", () => {
  it("categories: contradicted → unechoed → confirmed", () => {
    const cats = orderGapPairs(SCRAMBLED).map((x) => x.verdict);
    // no confirmed before any unechoed, no unechoed before any contradicted
    expect(cats).toEqual(["contradicted", "contradicted", "unechoed", "unechoed", "confirmed", "confirmed"]);
  });

  it("strength desc WITHIN each category", () => {
    const ids = orderGapPairs(SCRAMBLED).map((x) => x.id);
    expect(ids).toEqual(["contr-strong", "contr-weak", "unech-strong", "unech-mid", "conf-strong", "conf-weak"]);
  });

  it("FALSIFICATION: without the category key, order collapses to pure strength (wrong)", () => {
    const byStrengthOnly = [...SCRAMBLED].sort((a, b) => b.evidenceRank - a.evidenceRank).map((x) => x.verdict);
    // pure strength interleaves categories (a confirmed-3 sits among contradicted rows) — NOT the
    // discussability order, which groups all contradicted first regardless of strength.
    expect(byStrengthOnly).not.toEqual(orderGapPairs(SCRAMBLED).map((x) => x.verdict));
    // proof it interleaves: a confirmed appears before a contradicted somewhere in the strength-only run
    const firstConfirmed = byStrengthOnly.indexOf("confirmed");
    const lastContradicted = byStrengthOnly.lastIndexOf("contradicted");
    expect(firstConfirmed).toBeLessThan(lastContradicted);
  });

  it("FALSIFICATION: without the strength key, within-category order is input order (wrong)", () => {
    const catOnly = [...SCRAMBLED].sort((a, b) => (GAP_VERDICT_ORDER[a.verdict] ?? 9) - (GAP_VERDICT_ORDER[b.verdict] ?? 9));
    // input had conf-weak before conf-strong; category-only keeps that (weak first) — the real order flips it
    const catConfirmed = catOnly.filter((x) => x.verdict === "confirmed").map((x) => x.id);
    expect(catConfirmed).toEqual(["conf-weak", "conf-strong"]);
    const realConfirmed = orderGapPairs(SCRAMBLED).filter((x) => x.verdict === "confirmed").map((x) => x.id);
    expect(realConfirmed).toEqual(["conf-strong", "conf-weak"]);
  });
});
