// GATE (2026-08-22): (a) the status-vs-gap coherence note shows ONLY when a company has a rung-1
// status conflict AND zero contradicted beat-4 statements (CB2 branch); it is hidden when
// contradicted statements exist (Edgewood branch). (b) Every beat carries its signed "why this beat"
// rationale line, verbatim.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  ColdOpen, ActWhatYouSay, ActGap, ActWhoYouServe, ActFindings, ScoreReveal,
  ActWhereYouStand, BaseGate, ActQuestions, ActNext,
} from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData, type FRStatusConflict } from "./types";

const conflict: FRStatusConflict = {
  location: "The Shop (123 Main)", matchKey: "the shop", question: "Is The Shop open?",
  closed: [{ host: "yelp.com", date: "2026-01-01" } as never], open: [{ host: "google.com", date: null } as never],
};
const COHERENCE = "is a disagreement between outside sources — not between your words and the record";

describe("beat-4 status-vs-gap coherence note", () => {
  it("CB2 branch — conflict present + 0 contradicted → the note shows", () => {
    const read: FirstReadPreviewData = { ...EMPTY_FIRST_READ, statusConflicts: [conflict], gapCounts: { contradicted: 0, unechoed: 3, confirmed: 2 } };
    expect((render(<ActGap read={read} />).container.textContent ?? "")).toContain(COHERENCE);
  });

  it("Edgewood branch — contradicted statements exist → the note is hidden", () => {
    const read: FirstReadPreviewData = { ...EMPTY_FIRST_READ, statusConflicts: [conflict], gapCounts: { contradicted: 9, unechoed: 6, confirmed: 16 } };
    expect((render(<ActGap read={read} />).container.textContent ?? "")).not.toContain(COHERENCE);
  });

  it("no conflict + 0 contradicted → note hidden (it requires a rung-1 conflict)", () => {
    const read: FirstReadPreviewData = { ...EMPTY_FIRST_READ, statusConflicts: [], gapCounts: { contradicted: 0, unechoed: 1, confirmed: 0 } };
    expect((render(<ActGap read={read} />).container.textContent ?? "")).not.toContain(COHERENCE);
  });
});

describe("signed per-beat rationale lines — present and exact", () => {
  const E = EMPTY_FIRST_READ;
  const cases: Array<[string, JSX.Element]> = [
    ["Before we open anything up, here's the single thing the outside record makes impossible to ignore.", <ColdOpen read={E} onContinue={() => {}} />],
    ["Your own public words, exactly as they appear. This is the claim the rest of the read tests.", <ActWhatYouSay read={E} />],
    ["Where your words and the record agree, disagree, or don't yet meet. The disagreements are the most useful part.", <ActGap read={E} />],
    ["The groups the public record suggests you're for. A hypothesis to confirm or correct, not a finding.", <ActWhoYouServe read={E} />],
    ["What stands out in the record on its own, before we weigh it against your direction.", <ActFindings read={E} />],
    ["One number for the likelihood your strategy succeeds, read only from public signals at this stage. It moves on evidence, not opinion.", <ScoreReveal read={E} />],
    ["The pieces behind that number, so it's inspectable rather than taken on trust.", <ActWhereYouStand read={E} />],
    ["The four commitments everything else stands on. Aligning them comes first.", <BaseGate />],
    ["The threads the record leaves open — worth taking a position on together.", <ActQuestions read={E} />],
    ["Where we'd go from here, and how the method carries forward.", <ActNext />],
  ];
  it.each(cases)("carries: %s", (text, el) => {
    expect((render(el).container.textContent ?? "")).toContain(text);
  });

  it("every rationale beat shows the 'Why this beat' label", () => {
    expect((render(<ActGap read={E} />).container.textContent ?? "")).toContain("Why this beat");
  });
});
