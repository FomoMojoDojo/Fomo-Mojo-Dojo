// R2 (2026-09-04, operator ruling): the "Your channels, as we read them" block renders ONLY when an
// own-words run exists for the company (a COMPLETED first_read_own_words integrity record → read.ownWordsRun).
// The former "not read yet" client line is RETIRED. A company with no run shows NO channel block and NO copy
// for that state on the default (client) render; behind the operator toggle, ONE operator-only line names it.
// Each proof fails without the gate: (a) is RED on the pre-R2 code (the block rendered from declared alone).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ActWhatYouSay } from "./acts";
import { OperatorControlsContext } from "./operatorControls";
import { OPERATOR_STRINGS } from "./operatorStrings";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const DECLARED = [{ id: "d1", topic: "market", facet: "Market" as const, statement: "Just add hot water.", sourceTag: { label: "cafebarra.com · read September 3, 2026" } }];
const base = (over: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ, company: { name: "Co", website: "https://example.com" }, ...over,
});
const withOperator = (ui: React.ReactElement) => (
  <OperatorControlsContext.Provider value={{ decide: async () => {} }}>{ui}</OperatorControlsContext.Provider>
);
const SEL_BLOCK = '[data-fr-block="channels"]';
const SEL_OP = "[data-fr-operator]";
const SEL_NOTE = '[data-fr-operator="not-meeting-ready"]';

describe("R2 — channel block gated on an own-words run", () => {
  it("(a) no run + inference rows present → NO block, no retired line, zero operator nodes (client render)", () => {
    const { container } = render(<ActWhatYouSay read={base({ ownWordsRun: false, ownWordsLooked: false, declared: DECLARED })} />);
    expect(container.querySelector(SEL_BLOCK)).toBeNull();
    expect(container.textContent).not.toContain("Just add hot water.");
    expect(container.textContent).not.toContain("Your channels, as we read them");
    expect(container.textContent).not.toContain("read your own channels");
    expect(container.querySelectorAll(SEL_OP)).toHaveLength(0);
  });

  it("(b) no run + operator toggle on → exactly one operator line, the signed string, still no block", () => {
    const { container } = render(withOperator(<ActWhatYouSay read={base({ ownWordsRun: false, ownWordsLooked: false, declared: DECLARED })} />));
    expect(container.querySelector(SEL_BLOCK)).toBeNull();
    const notes = container.querySelectorAll(SEL_NOTE);
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(OPERATOR_STRINGS.notMeetingReadyOwnWords);
    expect(notes[0].textContent).toBe("Not meeting-ready — own-words not run");
  });

  it("(c) run exists → the block renders with its rows; the operator line is absent even with the toggle on", () => {
    const off = render(<ActWhatYouSay read={base({ ownWordsRun: true, ownWordsLooked: true, declared: DECLARED })} />).container;
    expect(off.querySelector(SEL_BLOCK)).not.toBeNull();
    expect(off.textContent).toContain("Your channels, as we read them");
    expect(off.textContent).toContain("Just add hot water.");
    expect(off.querySelectorAll(SEL_OP)).toHaveLength(0);
    const on = render(withOperator(<ActWhatYouSay read={base({ ownWordsRun: true, ownWordsLooked: true, declared: DECLARED })} />)).container;
    expect(on.querySelector(SEL_BLOCK)).not.toBeNull();
    expect(on.querySelectorAll(SEL_NOTE)).toHaveLength(0);
  });

  it("(d) a planned-only integrity record is NOT a run: run=false with looked=true → no block, no operator note off, note on", () => {
    const off = render(<ActWhatYouSay read={base({ ownWordsRun: false, ownWordsLooked: true, declared: DECLARED })} />).container;
    expect(off.querySelector(SEL_BLOCK)).toBeNull();
    expect(off.querySelectorAll(SEL_OP)).toHaveLength(0);
    const on = render(withOperator(<ActWhatYouSay read={base({ ownWordsRun: false, ownWordsLooked: true, declared: DECLARED })} />)).container;
    expect(on.querySelectorAll(SEL_NOTE)).toHaveLength(1);
  });
});
