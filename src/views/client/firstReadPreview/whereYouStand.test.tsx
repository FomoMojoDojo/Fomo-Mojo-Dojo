// W1 (2026-08-20): beat 8 "Where you stand" interprets the beat-7 score from the PERSISTED
// mojo_scores snapshot — band + band meaning + the five micro-moves (value / max + persisted
// explanation), ordered by headroom (max − value) desc. Rendered only from snapshot fields.
// Falsification: shuffling the input levers must NOT change the rendered order (the component
// sorts by headroom, it does not trust input order).
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActWhereYouStand } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRScoreLever } from "./types";

// CB2-shaped levers (distinct headrooms so the expected order is unambiguous).
const LEVERS: FRScoreLever[] = [
  { key: "echo_integrity", label: "Echo integrity", value: 1, max: 4, explanation: "1 confirmed vs 0 contradicted outside pairs." }, // headroom 3
  { key: "record_strength", label: "Record strength", value: 0.115, max: 2, explanation: "12 of 208 outside signals are strong." }, // headroom 1.885
  { key: "differentiation_echo", label: "Differentiation echo", value: 0, max: 2, explanation: "0 positioning/market statements confirmed." }, // headroom 2
  { key: "coverage_breadth", label: "Coverage breadth", value: 0, max: 1, explanation: "3 of 4 outside source kinds represented: Reviews & listings, Social, Directories. Missing: Press & articles." }, // headroom 1
  { key: "freshness", label: "Freshness", value: 0.26, max: 1, explanation: "54 of 208 signals dated within 18 months." }, // headroom 0.74
];

const HEADROOM_ORDER = [
  "Echo integrity", // 3
  "Differentiation echo", // 2
  "Record strength", // 1.885
  "Coverage breadth", // 1
  "Freshness", // 0.74
];

const scored = (levers: FRScoreLever[]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  company: { name: "Co", website: "https://co.com" },
  score: { value: 16, computedAt: "2026-08-20T00:00:00Z", methodologyVersion: "outside-v1.0.0" },
  scoreLooked: true,
  whereYouStand: {
    scoreValue: 16,
    band: "Running on guesses",
    bandMeaning: "Base untested; definitions unclear; decisions made without support.",
    levers,
    sourceTag: { label: "Public read · August 20, 2026" },
  },
});

// Rendered order of the lever labels, top to bottom.
function renderedLeverOrder(read: FirstReadPreviewData): string[] {
  const { container } = render(<ActWhereYouStand read={read} />);
  return [...container.querySelectorAll("li")].map((li) => li.querySelector("span")?.textContent ?? "");
}

describe("beat 8 — Where you stand (W1)", () => {
  it("renders band + meaning and all five levers with value / max + explanation", () => {
    const { container } = render(<ActWhereYouStand read={scored(LEVERS)} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Running on guesses");
    expect(text).toContain("16 of 100");
    expect(text).toContain("Base untested"); // band meaning (ladder copy)
    expect(text).toContain("Inferred from your public record."); // W1 label
    for (const l of LEVERS) {
      expect(text, `${l.label} present`).toContain(l.label);
      expect(text, `${l.label} explanation present`).toContain(l.explanation);
    }
    // value / max rendering (whole trimmed, fractional to one decimal)
    expect(text).toContain("1 / 4"); // echo_integrity
    expect(text).toContain("0.1 / 2"); // record_strength trimmed
    expect(text).toContain("0.3 / 1"); // freshness trimmed
    // source tag kept
    expect(text).toContain("Public read · August 20, 2026");
  });

  it("orders the five levers by headroom (max − value) desc", () => {
    expect(renderedLeverOrder(scored(LEVERS))).toEqual(HEADROOM_ORDER);
  });

  it("FALSIFICATION: a shuffled input still renders in headroom order", () => {
    const shuffled = [LEVERS[4], LEVERS[1], LEVERS[3], LEVERS[0], LEVERS[2]];
    // sanity: the shuffled input is NOT already in headroom order
    expect(shuffled.map((l) => l.label)).not.toEqual(HEADROOM_ORDER);
    expect(renderedLeverOrder(scored(shuffled))).toEqual(HEADROOM_ORDER);
  });

  it("record_strength NOT COMPUTED (no recurrence run) renders '—' + the signed line (2026-08-22)", () => {
    const notComputedLevers: FRScoreLever[] = [
      { key: "echo_integrity", label: "Echo integrity", value: 1, max: 4, explanation: "1 confirmed vs 0 contradicted." },
      { key: "record_strength", label: "Record strength", value: null, max: 2, notComputed: true, explanation: "Not yet computed — signal recurrence hasn't been run for this company." },
      { key: "coverage_breadth", label: "Coverage breadth", value: 0.333, max: 1, explanation: "1 of 4 kinds." },
    ];
    const { container } = render(<ActWhereYouStand read={scored(notComputedLevers)} />);
    const text = container.textContent ?? "";
    // record_strength lever present, value shown as "—", NOT "0"
    expect(text).toContain("Record strength");
    expect(text).toContain("— / 2");
    expect(text).toContain("Not yet computed — signal recurrence hasn't been run for this company.");
    // the computed levers still render their numbers
    expect(text).toContain("1 / 4"); // echo_integrity
    // record_strength did NOT render as "0 / 2"
    expect(text).not.toContain("0 / 2");
  });

  it("no score → the SAME honest empty state as beat 7 (scoreLooked-grounded)", () => {
    const looked: FirstReadPreviewData = { ...EMPTY_FIRST_READ, company: { name: "Co", website: null }, scoreLooked: true, whereYouStand: null };
    const notYet: FirstReadPreviewData = { ...EMPTY_FIRST_READ, company: { name: "Co", website: null }, scoreLooked: false, whereYouStand: null };
    expect(render(<ActWhereYouStand read={looked} />).container.textContent).toContain("Not enough public signal to score yet.");
    expect(render(<ActWhereYouStand read={notYet} />).container.textContent).toContain("No score snapshot yet.");
  });
});
