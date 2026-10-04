// IR6 Finding 1 (signed 2026-10-03) — the coverage note on the preview read's four
// looked-and-found-nothing lines.
//
// Each of those four says "we read / we compared … and found nothing". That was honest only while
// nothing could read an image: the outside read strips every tag with its attributes, fetches no
// image bytes, and sends a text-only prompt to the search lane. So the note renders beside them.
//
// THE LOAD-BEARING PROOF is the same shape the beats' own integrity tests use: the SAME empty data
// renders the note on the looked-none branch and NOT on the other two. A note that appeared on all
// three would be qualifying "we couldn't check" and "not run yet", where nothing was read at all and
// "text only" is not the limitation.
//
// Neither fixture company can reach these states (every region has data, and no company in the stack
// has a completed run over an empty region), so this file — not a screenshot — is the behavioural
// evidence that the four notes render.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ActQuestions, ActGap, ActFindings, ActWhatYouSay } from "./acts";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";
import { TEXT_ONLY_NOTE } from "@/lib/firstRead/sayVsSee";

const NOTE_SEL = "[data-text-only-note]";

const base = (over: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ,
  statusConflicts: [],
  ...over,
});

describe("the signed note is the one constant", () => {
  it("is exactly the signed sentence", () => {
    expect(TEXT_ONLY_NOTE).toBe("We read text only. Words inside images, such as flyers, aren't read yet.");
  });
});

describe("Questions — QUESTIONS_LOOKED_NONE", () => {
  const q = (state: FirstReadPreviewData["openQuestionsIntegrity"]) =>
    render(<ActQuestions read={base({ questions: [], openQuestionsIntegrity: state })} />).container;

  it("looked-none → the note renders exactly once", () => {
    const c = q("looked_none");
    expect(c.querySelectorAll(NOTE_SEL).length).toBe(1);
    expect(c.textContent).toContain(TEXT_ONLY_NOTE);
  });
  it("couldn't-check → NO note (nothing was read, so text-only is not the limit)", () => {
    expect(q("couldnt_check").querySelectorAll(NOTE_SEL).length).toBe(0);
  });
  it("not-yet → NO note", () => {
    expect(q("not_yet").querySelectorAll(NOTE_SEL).length).toBe(0);
  });
});

describe("The gap — GAP_LOOKED_NONE_NOTE", () => {
  const g = (state: FirstReadPreviewData["gapIntegrity"]) =>
    render(<ActGap read={base({ gapStatements: [], gapIntegrity: state })} />).container;

  it("looked-none → the note renders exactly once", () => {
    const c = g("looked_none");
    expect(c.querySelectorAll(NOTE_SEL).length).toBe(1);
    expect(c.textContent).toContain(TEXT_ONLY_NOTE);
  });
  it("couldn't-check → NO note", () => {
    expect(g("couldnt_check").querySelectorAll(NOTE_SEL).length).toBe(0);
  });
  it("not-yet → NO note", () => {
    expect(g("not_yet").querySelectorAll(NOTE_SEL).length).toBe(0);
  });
});

describe("What stands out — FINDINGS_LOOKED_NONE", () => {
  const f = (state: FirstReadPreviewData["findingsIntegrity"]) =>
    render(<ActFindings read={base({ findings: [], findingsIntegrity: state })} />).container;

  it("looked-none → the note renders exactly once", () => {
    const c = f("looked_none");
    expect(c.querySelectorAll(NOTE_SEL).length).toBe(1);
    expect(c.textContent).toContain(TEXT_ONLY_NOTE);
  });
  it("couldn't-check → NO note", () => {
    expect(f("couldnt_check").querySelectorAll(NOTE_SEL).length).toBe(0);
  });
  it("not-yet → NO note", () => {
    expect(f("not_yet").querySelectorAll(NOTE_SEL).length).toBe(0);
  });
});

describe("What you say — OWN_WORDS_NONE_NOTE", () => {
  // This one is gated on the WRITE-COMPLETED record, not a three-state integrity field: the line
  // only exists once a completed own-words write has looked.
  const w = (writeCompleted: boolean) =>
    render(<ActWhatYouSay read={base({ ownWords: [], declared: [], ownWordsWriteCompleted: writeCompleted })} />).container;

  it("write completed (looked, found none) → the note renders exactly once", () => {
    const c = w(true);
    expect(c.querySelectorAll(NOTE_SEL).length).toBe(1);
    expect(c.textContent).toContain(TEXT_ONLY_NOTE);
  });
  it("no completed write → no line and NO note", () => {
    expect(w(false).querySelectorAll(NOTE_SEL).length).toBe(0);
  });

  // The note lives INSIDE the `!hasOwn && emptyNote` branch, so own words present means no empty
  // box and therefore no note — even though the write did complete. Asserted rather than inferred:
  // this gate is the one that reads a completion flag instead of a three-state integrity field.
  it("own words present → no empty box and NO note, even with the write completed", () => {
    const c = render(
      <ActWhatYouSay
        read={base({
          ownWordsWriteCompleted: true,
          ownWords: [{ id: "w1", quote: "a quoted self-description", fidelity: "verbatim" } as never],
        })}
      />,
    ).container;
    expect(c.querySelectorAll(NOTE_SEL).length).toBe(0);
    expect(c.textContent).not.toContain(TEXT_ONLY_NOTE);
  });
});

describe("the note is not markable (FM15) and carries no control", () => {
  it("carries no mark anchor and no button", () => {
    const c = render(<ActGap read={base({ gapStatements: [], gapIntegrity: "looked_none" })} />).container;
    const note = c.querySelector(NOTE_SEL)!;
    expect(note).toBeTruthy();
    expect(note.hasAttribute("data-fr-mark-kind")).toBe(false);
    expect(note.hasAttribute("data-fr-mark-key")).toBe(false);
    expect(note.classList.contains("fr-mark-target")).toBe(false);
    expect(note.querySelector("button")).toBeNull();
  });
});
