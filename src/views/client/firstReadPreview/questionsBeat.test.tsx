// Questions beat — the empty state is INTEGRITY-DERIVED, never array emptiness alone (STEP 1c,
// operator ruling 2026-09-02). Same three-state shape as the offering/gap beats: not-yet / looked-and-
// none / couldn't-check, from first_read_open_questions integrity (open-questions-step finalize). DOM
// structure + byte-exact string identity, not loose regex. The load-bearing proof: the SAME empty
// questions array renders THREE DIFFERENT lines by integrity state — so it cannot be reading emptiness.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActQuestions } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";

const S = {
  notYet: "No open questions generated yet.",
  lookedNone: "We compared what you say with what's out there and found nothing left open yet.",
  couldnt: "We couldn't run that comparison this time.",
} as const;

const empty = (state: FirstReadPreviewData["openQuestionsIntegrity"]): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  questions: [],
  statusConflicts: [],
  openQuestionsIntegrity: state,
});

const renderQ = (read: FirstReadPreviewData) => render(<ActQuestions read={read} />).container;

describe("Questions beat empty state — integrity, not emptiness", () => {
  it("not-yet (no integrity row) → the not-yet line, no question list", () => {
    const c = renderQ(empty("not_yet"));
    expect(c.textContent).toContain(S.notYet);
    expect(c.querySelectorAll("ol li").length).toBe(0);
  });

  it("looked-and-none (integrity completed) → the looked line, no list", () => {
    const c = renderQ(empty("looked_none"));
    expect(c.textContent).toContain(S.lookedNone);
    expect(c.textContent).not.toContain(S.notYet);
    expect(c.querySelectorAll("ol li").length).toBe(0);
  });

  it("couldn't-check (integrity failed) → the failed-read line, no list", () => {
    const c = renderQ(empty("couldnt_check"));
    expect(c.textContent).toContain(S.couldnt);
    expect(c.querySelectorAll("ol li").length).toBe(0);
  });

  it("INTEGRITY-NOT-EMPTINESS: the same empty array renders three DISTINCT lines by state", () => {
    const t = (s: FirstReadPreviewData["openQuestionsIntegrity"]) => renderQ(empty(s)).textContent ?? "";
    const lines = new Set([t("not_yet"), t("looked_none"), t("couldnt_check")]);
    expect(lines.size).toBe(3); // if it read array emptiness, all three would be identical
  });

  it("with questions present, the list renders and no empty line shows", () => {
    const q = "Does the public record recognize the boutique-hospitality positioning outside your own site?";
    const c = renderQ({ ...EMPTY_FIRST_READ, questions: [q], openQuestionsIntegrity: "not_yet" });
    expect(c.querySelectorAll("ol li").length).toBe(1);
    expect(c.textContent).toContain(q);
    expect(c.textContent).not.toContain(S.notYet);
  });
});
