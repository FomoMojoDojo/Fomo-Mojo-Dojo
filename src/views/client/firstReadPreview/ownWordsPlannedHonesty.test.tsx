// GATE B (2026-09-09) — DISPLAY HONESTY on beat 4 ("What you say").
//
// THE BREACH: `OWN_WORDS_NONE_NOTE` ("We read your channels but found no verbatim self-descriptions
// to quote yet.") was gated on `ownWordsLooked`, a bare existence check over every
// `first_read_own_words` integrity status. The extractor's PLAN phase writes a 'planned' row and
// nothing to claims, so a planned-not-written company satisfied the flag and the client was told we
// found nothing — on Riverlane, a company whose plan had frozen SEVEN quotable candidates and simply
// never persisted them because the gateway cut the caller before mode:"write" was issued.
//
// THE GATE: the note now requires `ownWordsWriteCompleted` — a COMPLETED WRITE record. Planned-only
// shows no client copy at all; the operator toggle carries the one honest line.
//
// Each proof is RED on the pre-gate code: with `emptyNote = read.ownWordsLooked ? … : null`, the
// first test finds the note text and fails.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ActWhatYouSay } from "./acts";
import { OperatorControlsContext } from "./operatorControls";
import { OPERATOR_STRINGS } from "./operatorStrings";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "./types";
import {
  ownWordsLookedFrom,
  ownWordsRunFrom,
  ownWordsWriteCompletedFrom,
  type OwnWordsIntegrityRow,
} from "@/lib/firstRead/ownWordsIntegrity";

// The PLANTED ROW — Riverlane's actual record: the plan froze 7 admissible quotes, wrote nothing.
const PLANNED_ROW: OwnWordsIntegrityRow = {
  status: "planned",
  admitted: 7,
  excluded_by_rule: { mode: "plan" },
};
const WRITE_COMPLETED_EMPTY: OwnWordsIntegrityRow = {
  status: "completed",
  admitted: 0,
  excluded_by_rule: { mode: "write" },
};

const base = (over: Partial<FirstReadPreviewData>): FirstReadPreviewData => ({
  ...EMPTY_FIRST_READ, company: { name: "Riverlane", website: "https://riverlane.com" }, ...over,
});
const withOperator = (ui: React.ReactElement) => (
  <OperatorControlsContext.Provider value={{ decide: async () => {} }}>{ui}</OperatorControlsContext.Provider>
);
const NOTE_TEXT = "found no verbatim self-descriptions";
const SEL_OP = "[data-fr-operator]";
const SEL_NOTE = '[data-fr-operator="not-meeting-ready"]';

describe("Gate B — a planted 'planned' row (admitted=7) earns NO client note", () => {
  it("the flags derived from the planted row: looked=true, writeCompleted=FALSE, run=false", () => {
    const rows = [PLANNED_ROW];
    expect(ownWordsLookedFrom(rows)).toBe(true);       // it did look
    expect(ownWordsWriteCompletedFrom(rows)).toBe(false); // but it never wrote — this is the gate
    expect(ownWordsRunFrom(rows)).toBe(false);
  });

  it("client render: ZERO notes — no client-visible note text of any kind", () => {
    const read = base({
      ownWordsLooked: ownWordsLookedFrom([PLANNED_ROW]),
      ownWordsWriteCompleted: ownWordsWriteCompletedFrom([PLANNED_ROW]),
      ownWordsRun: ownWordsRunFrom([PLANNED_ROW]),
    });
    const { container } = render(<ActWhatYouSay read={read} />);
    expect(container.textContent).not.toContain(NOTE_TEXT);
    expect(container.textContent).not.toContain(OPERATOR_STRINGS.notMeetingReadyOwnWords);
    expect(container.querySelectorAll(SEL_OP)).toHaveLength(0);
  });

  it("operator toggle: EXACTLY ONE note, and it is the signed operator string", () => {
    const read = base({
      ownWordsLooked: ownWordsLookedFrom([PLANNED_ROW]),
      ownWordsWriteCompleted: ownWordsWriteCompletedFrom([PLANNED_ROW]),
      ownWordsRun: ownWordsRunFrom([PLANNED_ROW]),
    });
    const { container } = render(withOperator(<ActWhatYouSay read={read} />));
    const notes = container.querySelectorAll(SEL_NOTE);
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe("Not meeting-ready — own-words not run");
    expect(notes[0].textContent).toBe(OPERATOR_STRINGS.notMeetingReadyOwnWords);
    // exactly one operator node in total, and still no client note
    expect(container.querySelectorAll(SEL_OP)).toHaveLength(1);
    expect(container.textContent).not.toContain(NOTE_TEXT);
  });
});

describe("Gate B — the note is still EARNED by a completed write that admitted nothing", () => {
  it("a completed WRITE run with zero admitted renders the client note (the honest empty)", () => {
    const rows = [WRITE_COMPLETED_EMPTY];
    expect(ownWordsWriteCompletedFrom(rows)).toBe(true);
    const read = base({
      ownWordsLooked: true,
      ownWordsWriteCompleted: ownWordsWriteCompletedFrom(rows),
      ownWordsRun: ownWordsRunFrom(rows),
    });
    const { container } = render(<ActWhatYouSay read={read} />);
    expect(container.textContent).toContain(NOTE_TEXT);
  });

  it("a plan followed by a completed write earns it too (the resume case)", () => {
    const rows = [PLANNED_ROW, { status: "completed", admitted: 0, excluded_by_rule: { mode: "write" } }];
    expect(ownWordsWriteCompletedFrom(rows)).toBe(true);
  });

  it("a legacy completed row with no recorded mode still counts (no behaviour change)", () => {
    expect(ownWordsWriteCompletedFrom([{ status: "completed", admitted: 0, excluded_by_rule: null }])).toBe(true);
  });

  it("own words present → no note at all, whatever the flags say", () => {
    const read = base({
      ownWordsLooked: true, ownWordsWriteCompleted: true, ownWordsRun: true,
      ownWords: [{ id: "w1", quote: "We correct quantum errors as they occur.", fidelity: "verbatim", pageHost: "riverlane.com", pageUrl: "https://riverlane.com/", sourceTag: { label: "riverlane.com · read September 9, 2026" } }],
    } as Partial<FirstReadPreviewData>);
    const { container } = render(<ActWhatYouSay read={read} />);
    expect(container.textContent).not.toContain(NOTE_TEXT);
  });
});
