// currentAnchors (FM12 revised, 2026-09-22): the rows on the page WITH their text. Two things are pinned —
//   (1) it agrees with presentAnchorIds on KEYS exactly (the client reader and the operator reader can never
//       disagree about which rows are present), and
//   (2) every markable kind carries the text the MarkTarget on that row passes, so the prompt can show
//       "Now reads" — except the kinds whose words are not read data (section / group / offering_question),
//       which carry null by design and therefore never fire.
// Plants: (1) a kind dropped from currentAnchors → the parity assertion names it; (2) a text taken from the
// wrong field → that kind's text assertion is red.
import { describe, it, expect } from "vitest";
import { currentAnchors } from "./currentAnchors";
import { presentAnchorIds } from "./presentAnchors";
import { anchorId } from "./useFirstReadMarks";
import { EMPTY_FIRST_READ, type FirstReadPreviewData } from "@/views/client/firstReadPreview/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const any = (v: unknown) => v as any;
const READ: FirstReadPreviewData = {
  ...EMPTY_FIRST_READ,
  coldOpen: any({ text: "Cold open words", rung: "signal", anchorKey: "s-cold" }),
  signals: [any({ id: "s-1", text: "Signal words" })],
  ownWords: [any({ id: "w-1", quote: "Own words" })],
  declared: [any({ id: "c-1", statement: "Channel statement" })],
  gapStatements: [any({ statementId: "gs-1", declared: "Declared statement", evidence: [any({ contentIdentity: "ci-1", record: "Record side words" })] })],
  reverseRows: [any({ id: "rr-1", statement: "Reverse statement" })],
  findings: [any({ id: "f-1", body: "Finding body", quotes: [any({ signalId: "s-9", text: "Quote words" })] })],
  observedMarkets: [any({ id: "md-1", journeyKey: "jk-1", who: "Market who" })],
  unstatedGroups: [any({ id: "ug-1", originalIdentity: "oi-1", who: "Candidate who" })],
  questionAnchors: [{ identity: "qi-1", text: "Question words" }],
  offeringQuestionKeys: ["offering:abc"],
  statusConflicts: [any({ questionIdentity: "sc-1", question: "Conflict question" })],
  promise: any({ text: "Promise words" }),
  positioning: any({ category: "Category words", value: "Value words", differentiators: ["Diff one", "Diff two"] }),
  strategy: any({ aspiration: "Aspiration words", whereToPlay: "Where words", howToWin: "How words", capabilities: ["Cap one"], managementSystems: ["Mgmt one"] }),
  offering: any({ items: [any({ label: "Item label", statement: "Item statement" })] }),
  score: any({ value: 63, computedAt: "2026-09-22", methodologyVersion: "1" }),
} as FirstReadPreviewData;

const textOf = (kind: string, key: string) => currentAnchors(READ).find((r) => r.anchor_kind === kind && r.anchor_key === key)?.text;

describe("currentAnchors", () => {
  it("agrees with presentAnchorIds on keys, exactly — no row present to one reader and absent to the other", () => {
    const mine = new Set(currentAnchors(READ).map((r) => anchorId(r.anchor_kind, r.anchor_key)));
    const theirs = presentAnchorIds(READ);
    expect([...mine].sort()).toEqual([...theirs].sort());
  });
  it("an empty read yields the same keys on both sides too", () => {
    const mine = new Set(currentAnchors(EMPTY_FIRST_READ).map((r) => anchorId(r.anchor_kind, r.anchor_key)));
    expect([...mine].sort()).toEqual([...presentAnchorIds(EMPTY_FIRST_READ)].sort());
  });
  it("every markable kind appears", () => {
    const kinds = new Set(currentAnchors(READ).map((r) => r.anchor_kind));
    for (const k of ["signal", "own_words", "channel_claim", "gap_statement", "gap_pair", "reverse_row", "finding",
      "finding_quote", "market", "candidate_group", "question", "offering_question", "status_conflict",
      "read_field", "score_value", "section", "group"]) expect([...kinds]).toContain(k);
  });
  it("each row carries the words its MarkTarget passes", () => {
    expect(textOf("signal", "s-cold")).toBe("Cold open words"); // the cold open's own rung
    expect(textOf("signal", "s-1")).toBe("Signal words");
    expect(textOf("own_words", "w-1")).toBe("Own words");
    expect(textOf("channel_claim", "c-1")).toBe("Channel statement");
    expect(textOf("gap_statement", "gs-1")).toBe("Declared statement");
    expect(textOf("gap_pair", "ci-1")).toBe("Record side words");
    expect(textOf("reverse_row", "rr-1")).toBe("Reverse statement");
    expect(textOf("finding", "f-1")).toBe("Finding body");
    expect(textOf("finding_quote", "f-1:s-9")).toBe("Quote words");
    expect(textOf("market", "jk-1")).toBe("Market who");
    expect(textOf("candidate_group", "oi-1")).toBe("Candidate who");
    expect(textOf("question", "qi-1")).toBe("Question words");
    expect(textOf("status_conflict", "sc-1")).toBe("Conflict question");
  });
  it("read_field carries each read's field, indexed items included", () => {
    expect(textOf("read_field", "promise:promise")).toBe("Promise words");
    expect(textOf("read_field", "positioning:category")).toBe("Category words");
    expect(textOf("read_field", "positioning:value")).toBe("Value words");
    expect(textOf("read_field", "positioning:differentiators:0")).toBe("Diff one");
    expect(textOf("read_field", "positioning:differentiators:1")).toBe("Diff two");
    expect(textOf("read_field", "strategy:aspiration")).toBe("Aspiration words");
    expect(textOf("read_field", "strategy:where_to_play")).toBe("Where words");
    expect(textOf("read_field", "strategy:how_to_win")).toBe("How words");
    expect(textOf("read_field", "strategy:capabilities:0")).toBe("Cap one");
    expect(textOf("read_field", "strategy:management_systems:0")).toBe("Mgmt one");
    expect(textOf("read_field", "offering:items:0")).toBe("Item label — Item statement"); // label and statement, as rendered
  });
  it("R6: the score value is in scope and carries the value as rendered", () => {
    expect(textOf("score_value", "score")).toBe("63");
  });
  it("the kinds whose words are not read data carry null — they can never raise the prompt", () => {
    expect(textOf("section", "yousay")).toBeNull();
    expect(textOf("group", "yousay:channels")).toBeNull();
    expect(textOf("group", "gap:reverse")).toBeNull();
    expect(textOf("group", "serve:unstated")).toBeNull();
    expect(textOf("offering_question", "offering:abc")).toBeNull();
  });
});
